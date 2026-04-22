import { Prisma, type PrismaClient } from '@prisma/client';
import fs from 'node:fs/promises';
import type { FastifyBaseLogger } from 'fastify';
import { extractInvoiceFromImages } from './openrouter.js';
import { extractInvoiceFromText } from './openrouter-text.js';
import { pdfToImages } from './pdf-to-images.js';
import { extractNativePdfText, extractTextWithTesseract } from './ocr-text-extract.js';
import type { ExtractedInvoice } from '@ksiegowy/types';

const PDF_MIME = 'application/pdf';
const MAX_PAGES = 5;

/**
 * Starts the OCR pipeline for an IncomingInvoice in the background (fire-and-forget).
 * Updates the IncomingInvoice status and extracted fields when done.
 */
export function startOcrPipeline(
  prisma: PrismaClient,
  incomingInvoiceId: string,
  logger: FastifyBaseLogger,
): void {
  runOcr(prisma, incomingInvoiceId, logger).catch((err: unknown) => {
    const msg = err instanceof Error ? err.message : String(err);
    prisma.incomingInvoice
      .update({
        where: { id: incomingInvoiceId },
        data: { status: 'OCR_FAILED', ocrError: msg },
      })
      .catch(() => { /* ignore — DB might be unavailable */ });
  });
}

async function runOcr(prisma: PrismaClient, incomingInvoiceId: string, logger: FastifyBaseLogger): Promise<void> {
  await prisma.incomingInvoice.update({
    where: { id: incomingInvoiceId },
    data: { status: 'OCR_PROCESSING' },
  });

  const record = await prisma.incomingInvoice.findUnique({
    where: { id: incomingInvoiceId },
    include: { fileRecords: { orderBy: { createdAt: 'asc' }, take: 1 } },
  });

  if (!record || record.fileRecords.length === 0) {
    throw new Error('IncomingInvoice or its file record not found');
  }

  const fileRecord = record.fileRecords[0]!;
  const fileBuffer = await fs.readFile(fileRecord.path);
  const isPdf = fileRecord.mimeType === PDF_MIME;

  // For PDFs: convert to images once and reuse across stages that need it
  let imageBuffers: Buffer[] | null = null;
  const getImageBuffers = async (): Promise<Buffer[]> => {
    if (imageBuffers) return imageBuffers;
    const pages = await pdfToImages(fileBuffer);
    imageBuffers = pages.slice(0, MAX_PAGES);
    return imageBuffers;
  };

  let extracted: ExtractedInvoice & { model: string };
  let ocrMethod: string;

  if (isPdf) {
    // Stage 1a: native PDF text layer
    const nativeText = await extractNativePdfText(fileBuffer);
    if (nativeText) {
      extracted = await extractInvoiceFromText(nativeText);
      ocrMethod = 'pdf_native';
    } else {
      // Stage 1b: Tesseract OCR on rendered PDF pages
      const images = await getImageBuffers();
      const tesseractText = await extractTextWithTesseract(images);
      if (tesseractText) {
        extracted = await extractInvoiceFromText(tesseractText);
        ocrMethod = 'tesseract';
      } else {
        // Stage 2: Vision LLM fallback
        const fallbackImages = await getImageBuffers();
        extracted = await extractInvoiceFromImages(fallbackImages, 'image/jpeg');
        ocrMethod = 'vision_llm';
      }
    }
  } else {
    // Image file
    // Stage 1: Tesseract OCR on raw image buffer
    const tesseractText = await extractTextWithTesseract([fileBuffer]);
    if (tesseractText) {
      extracted = await extractInvoiceFromText(tesseractText);
      ocrMethod = 'tesseract';
    } else {
      // Stage 2: Vision LLM fallback
      extracted = await extractInvoiceFromImages([fileBuffer], fileRecord.mimeType as 'image/jpeg');
      ocrMethod = 'vision_llm';
    }
  }

  logger.info({ incomingInvoiceId, method: ocrMethod }, 'OCR extraction succeeded');

  await prisma.incomingInvoice.update({
    where: { id: incomingInvoiceId },
    data: {
      status: 'OCR_DONE',
      ocrMethod,
      ocrModel: extracted.model,
      ocrConfidence: extracted.confidence ?? null,
      ocrWarnings: extracted.warnings ? { warnings: extracted.warnings } : Prisma.DbNull,
      ocrError: null,
      invoiceNumber: extracted.invoiceNumber ?? null,
      issueDate: extracted.issueDate ? new Date(extracted.issueDate) : null,
      saleDate: extracted.saleDate ? new Date(extracted.saleDate) : null,
      sellerName: extracted.sellerName ?? null,
      sellerNip: extracted.sellerNip ?? null,
      sellerAddress: extracted.sellerAddress ?? null,
      buyerName: extracted.buyerName ?? null,
      buyerNip: extracted.buyerNip ?? null,
      totalNet: extracted.totalNet ?? null,
      totalVat: extracted.totalVat ?? null,
      totalGross: extracted.totalGross ?? null,
      currency: extracted.currency ?? 'PLN',
      paymentMethod: extracted.paymentMethod ?? null,
      dueDate: extracted.dueDate ? new Date(extracted.dueDate) : null,
      bankAccount: extracted.bankAccount ?? null,
      ksefReference: extracted.ksefReference ?? null,
      notes: extracted.notes ?? null,
      lineItemsJson: extracted.lines ? (extracted.lines as unknown as Prisma.InputJsonValue) : Prisma.DbNull,
    },
  });
}
