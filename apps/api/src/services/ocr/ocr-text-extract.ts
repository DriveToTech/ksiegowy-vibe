import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { recognize } from 'node-tesseract-ocr';
import { PDFParse } from 'pdf-parse';

const MIN_NATIVE_TEXT_LENGTH = 100;
const MIN_TESSERACT_TEXT_LENGTH = 150;
const MIN_TESSERACT_CONFIDENCE = 60;
const MIN_WORD_COUNT_FALLBACK = 30;

export async function extractNativePdfText(pdfBuffer: Buffer): Promise<string | null> {
  const parser = new PDFParse({ data: pdfBuffer });
  const result = await parser.getText();
  const trimmed = result.text.trim();
  if (trimmed.length < MIN_NATIVE_TEXT_LENGTH) return null;
  return trimmed;
}

export async function extractTextWithTesseract(imageBuffers: Buffer[]): Promise<string | null> {
  const pageTexts: string[] = [];
  let totalConfidenceSum = 0;
  let totalConfidenceCount = 0;
  let confidenceParsingSucceeded = false;

  for (const imageBuffer of imageBuffers) {
    const tempFilePath = path.join(os.tmpdir(), `${randomUUID()}.jpg`);

    try {
      await fs.writeFile(tempFilePath, imageBuffer);

      const tsvOutput = await recognize(tempFilePath, {
        lang: 'pol',
        oem: 1,
        psm: 6,
        presets: ['tsv'],
      });

      const lines = tsvOutput.split('\n');
      const header = lines[0];

      // If we got proper TSV with the expected Tesseract TSV header, parse confidence values
      if (header && header.startsWith('level\tpage_num')) {
        confidenceParsingSucceeded = true;
        const columns = header.split('\t');
        const confIndex = columns.indexOf('conf');
        const textIndex = columns.indexOf('text');

        const pageWords: string[] = [];

        for (let i = 1; i < lines.length; i++) {
          const line = lines[i];
          if (!line || !line.trim()) continue;

          const cells = line.split('\t');
          const confValue = cells[confIndex];
          const textValue = cells[textIndex];

          if (confValue === undefined || textValue === undefined) continue;
          // conf === -1 means whitespace / structural token — skip
          if (confValue === '-1') continue;

          const confidence = parseFloat(confValue);
          if (!isNaN(confidence)) {
            totalConfidenceSum += confidence;
            totalConfidenceCount++;
          }

          if (textValue.trim()) pageWords.push(textValue.trim());
        }

        pageTexts.push(pageWords.join(' '));
      } else {
        // Tesseract returned plain text — treat it as-is
        pageTexts.push(tsvOutput.trim());
      }
    } finally {
      await fs.unlink(tempFilePath).catch(() => undefined);
    }
  }

  const combinedText = pageTexts.join('\n').replace(/\s+/g, ' ').trim();

  if (confidenceParsingSucceeded) {
    const meanConfidence = totalConfidenceCount > 0 ? totalConfidenceSum / totalConfidenceCount : 0;
    if (combinedText.length < MIN_TESSERACT_TEXT_LENGTH || meanConfidence < MIN_TESSERACT_CONFIDENCE) return null;
  } else {
    // Fallback: no TSV — use word-count heuristic
    const wordCount = combinedText.split(/\s+/).filter(Boolean).length;
    if (wordCount < MIN_WORD_COUNT_FALLBACK) return null;
  }

  return combinedText;
}
