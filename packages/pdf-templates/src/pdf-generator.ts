import puppeteer from 'puppeteer';
import type { InvoiceData } from '@ksiegowy/types';
import { buildInvoiceHtml } from './invoice-template.js';

/**
 * Generates an A4 invoice PDF as a Buffer.
 * Launches headless Chromium via Puppeteer.
 *
 * @param invoice - The invoice data to render
 * @returns PDF Buffer
 */
export const generateInvoicePdf = async (invoice: InvoiceData): Promise<Buffer> => {
  const html = buildInvoiceHtml(invoice);

  const executablePath = process.env['PUPPETEER_EXECUTABLE_PATH'];

  const browser = await puppeteer.launch({
    headless: true,
    ...(executablePath ? { executablePath } : {}),
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--font-render-hinting=none'
    ]
  });

  try {
    const page = await browser.newPage();

    // Set content and wait for fonts to load
    await page.setContent(html, { waitUntil: 'networkidle0', timeout: 30_000 });

    const pdfBuffer = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: {
        top: '15mm',
        right: '15mm',
        bottom: '15mm',
        left: '15mm'
      }
    });

    return Buffer.from(pdfBuffer);
  } finally {
    await browser.close();
  }
};
