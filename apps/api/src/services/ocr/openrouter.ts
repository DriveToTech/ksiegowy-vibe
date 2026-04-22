import OpenAI from 'openai';
import type { ExtractedInvoice } from '@ksiegowy/types';
import { ExtractedInvoiceSchema } from './invoice-schema.js';

// Models to try in cascade — first available free/cheap vision model wins
const MODELS = [
  // 'google/gemini-flash-1.5',
  'openai/gpt-4o-mini',
] as const;

const SYSTEM_PROMPT = `You are an OCR assistant specializing in Polish VAT invoices (faktury VAT).
Extract all fields from the invoice image and return ONLY a valid JSON object with no extra text.

Required JSON structure:
{
  "invoiceNumber": "string or null",
  "issueDate": "YYYY-MM-DD or null",
  "saleDate": "YYYY-MM-DD or null",
  "sellerName": "string or null",
  "sellerNip": "10 digit string no dashes or null",
  "sellerAddress": "string or null",
  "buyerName": "string or null",
  "buyerNip": "10 digit string no dashes or null",
  "totalNet": "decimal string e.g. 1234.56 or null",
  "totalVat": "decimal string or null",
  "totalGross": "decimal string or null",
  "currency": "PLN or other or null",
  "paymentMethod": "string or null",
  "dueDate": "YYYY-MM-DD or null",
  "bankAccount": "string or null",
  "ksefReference": "string or null",
  "notes": "string or null",
  "lines": [{"description":"","quantity":"","unit":"","unitNetPrice":"","vatRate":"","netValue":"","vatValue":"","grossValue":""}],
  "confidence": 0.0-1.0,
  "warnings": ["string"]
}`;

export async function extractInvoiceFromImages(imageBuffers: Buffer[], mimeType = 'image/jpeg'): Promise<ExtractedInvoice & { model: string }> {
  const apiKey = process.env['OPENROUTER_API_KEY'];
  if (!apiKey) throw new Error('OPENROUTER_API_KEY is not configured');

  const client = new OpenAI({
    baseURL: 'https://openrouter.ai/api/v1',
    apiKey,
  });

  const imageContents = imageBuffers.map((buf) => ({
    type: 'image_url' as const,
    image_url: { url: `data:${mimeType};base64,${buf.toString('base64')}` },
  }));

  let lastError: Error | null = null;

  for (const model of MODELS) {
    const response = await client.chat.completions.create({
      model,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        {
          role: 'user',
          content: [
            { type: 'text', text: 'Extract all fields from this invoice image.' },
            ...imageContents,
          ],
        },
      ],
      temperature: 0,
      max_tokens: 2000,
    }).catch((err: unknown) => {
      const status = (err as { status?: number }).status;
      if (status === 429) {
        lastError = err instanceof Error ? err : new Error(String(err));
        return null;
      }
      throw err;
    });

    if (!response) continue;

    const text = response.choices[0]?.message?.content ?? '';
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      lastError = new Error(`Model ${model} returned no JSON`);
      continue;
    }

    const parsed = JSON.parse(jsonMatch[0]) as unknown;
    const validated = ExtractedInvoiceSchema.parse(parsed);

    return {
      ...(validated as ExtractedInvoice),
      model,
    };
  }

  throw lastError ?? new Error('All OCR models failed');
}
