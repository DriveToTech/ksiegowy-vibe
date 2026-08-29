import puppeteer from 'puppeteer';
import type { Browser, Page } from 'puppeteer';
import { buildHouseholdReportHtml, type HouseholdReportPdfData } from './household-report-template.js';

export type HouseholdReportPdfErrorCode = 'VALIDATION_ERROR' | 'WORKLOAD_LIMIT_EXCEEDED';

export class HouseholdReportPdfError extends Error {
  public readonly code: HouseholdReportPdfErrorCode;

  public constructor(code: HouseholdReportPdfErrorCode, message: string) {
    super(message);
    this.name = 'HouseholdReportPdfError';
    this.code = code;
  }
}

const MAX_ACTIVE_PDF_RENDERS = 1;
const MAX_QUEUED_PDF_RENDERS = 8;
const PDF_QUEUE_TIMEOUT_MILLISECONDS = 5_000;
const PDF_OPERATION_TIMEOUT_MILLISECONDS = 30_000;
const PDF_CLEANUP_TIMEOUT_MILLISECONDS = 5_000;
const MAX_PDF_OUTPUT_BYTES = 5 * 1024 * 1024;
const MAX_PDF_PAGES = 50;
const MAX_PDF_DATA_ROWS = 500;
const MAX_PDF_TEXT_LENGTH = 160;

// ponytail: one process-wide slot bounds Chromium memory; shard the semaphore per worker if PDF throughput requires more.
let activePdfRenderCount = 0;
const queuedPdfRenders: Array<{ resolve: () => void; reject: (error: HouseholdReportPdfError) => void; timeout: ReturnType<typeof setTimeout> }> = [];

const acquirePdfRenderSlot = async (): Promise<void> => {
  if (activePdfRenderCount < MAX_ACTIVE_PDF_RENDERS) {
    activePdfRenderCount += 1;
    return;
  }
  if (queuedPdfRenders.length >= MAX_QUEUED_PDF_RENDERS) {
    throw new HouseholdReportPdfError('WORKLOAD_LIMIT_EXCEEDED', 'PDF export queue is full');
  }

  await new Promise<void>((resolve, reject) => {
    const queuedRender = {
      resolve,
      reject,
      timeout: setTimeout(() => {
        const queuedRenderIndex = queuedPdfRenders.indexOf(queuedRender);
        if (queuedRenderIndex >= 0) queuedPdfRenders.splice(queuedRenderIndex, 1);
        reject(new HouseholdReportPdfError('WORKLOAD_LIMIT_EXCEEDED', 'PDF export queue wait exceeded the supported limit'));
      }, PDF_QUEUE_TIMEOUT_MILLISECONDS)
    };
    queuedPdfRenders.push(queuedRender);
  });
};

const releasePdfRenderSlot = (): void => {
  activePdfRenderCount -= 1;
  const queuedRender = queuedPdfRenders.shift();
  if (!queuedRender) return;
  clearTimeout(queuedRender.timeout);
  activePdfRenderCount += 1;
  queuedRender.resolve();
};

const withTimeout = async <Result>(operation: Promise<Result>, timeoutMilliseconds: number, message: string, cleanupLateResult?: (result: Result) => Promise<void>): Promise<Result> => {
  let timedOut = false;
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const trackedOperation = operation.then((result) => {
    if (timedOut && cleanupLateResult) void cleanupLateResult(result).catch(() => undefined);
    return result;
  });
  const timeoutResult = new Promise<never>((_, reject) => {
    timeout = setTimeout(() => {
      timedOut = true;
      reject(new HouseholdReportPdfError('WORKLOAD_LIMIT_EXCEEDED', message));
    }, timeoutMilliseconds);
  });
  return Promise.race([trackedOperation, timeoutResult]).finally(() => {
    if (timeout !== undefined) clearTimeout(timeout);
  });
};

const countPdfPages = (pdf: Buffer): number => (pdf.toString('latin1').match(/\/Type\s*\/Page\b/g) ?? []).length;

const assertPdfInput = (report: HouseholdReportPdfData): void => {
  const renderedDataRows = report.cashFlow.categories.length + report.netWorth.accounts.length + report.netWorth.investments.length + report.dataQuality.notes.length;
  if (renderedDataRows > MAX_PDF_DATA_ROWS) {
    throw new HouseholdReportPdfError('WORKLOAD_LIMIT_EXCEEDED', `PDF export data exceeds the supported limit of ${MAX_PDF_DATA_ROWS} rows`);
  }
  for (const category of report.cashFlow.categories) if (category.categoryName.length > MAX_PDF_TEXT_LENGTH) throw new HouseholdReportPdfError('VALIDATION_ERROR', `Category name must be at most ${MAX_PDF_TEXT_LENGTH} characters`);
  for (const account of report.netWorth.accounts) if (account.name.length > MAX_PDF_TEXT_LENGTH) throw new HouseholdReportPdfError('VALIDATION_ERROR', `Account name must be at most ${MAX_PDF_TEXT_LENGTH} characters`);
  for (const investment of report.netWorth.investments) if (investment.instrument.length > MAX_PDF_TEXT_LENGTH) throw new HouseholdReportPdfError('VALIDATION_ERROR', `Investment instrument must be at most ${MAX_PDF_TEXT_LENGTH} characters`);
  for (const note of report.dataQuality.notes) if (note.length > MAX_PDF_TEXT_LENGTH) throw new HouseholdReportPdfError('VALIDATION_ERROR', `Report note must be at most ${MAX_PDF_TEXT_LENGTH} characters`);
};

export const generateHouseholdReportPdf = async (report: HouseholdReportPdfData): Promise<Buffer> => {
  assertPdfInput(report);
  const html = buildHouseholdReportHtml(report);
  await acquirePdfRenderSlot();
  let browser: Browser | undefined;
  let page: Page | undefined;

  try {
    browser = await withTimeout(puppeteer.launch({
      headless: true,
      timeout: PDF_OPERATION_TIMEOUT_MILLISECONDS,
      ...(process.env['PUPPETEER_EXECUTABLE_PATH'] ? { executablePath: process.env['PUPPETEER_EXECUTABLE_PATH'] } : {}),
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--font-render-hinting=none']
    }), PDF_OPERATION_TIMEOUT_MILLISECONDS, 'PDF browser launch exceeded the supported time limit', async (lateBrowser) => lateBrowser.close().catch(() => undefined));
    page = await withTimeout(browser.newPage(), PDF_OPERATION_TIMEOUT_MILLISECONDS, 'PDF page creation exceeded the supported time limit', async (latePage) => latePage.close().catch(() => undefined));
    await withTimeout(page.setContent(html, { waitUntil: 'networkidle0', timeout: PDF_OPERATION_TIMEOUT_MILLISECONDS }), PDF_OPERATION_TIMEOUT_MILLISECONDS, 'PDF page rendering exceeded the supported time limit');
    const pdf = Buffer.from(await withTimeout(page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: '15mm', right: '15mm', bottom: '15mm', left: '15mm' }
    }), PDF_OPERATION_TIMEOUT_MILLISECONDS, 'PDF generation exceeded the supported time limit'));
    if (pdf.length > MAX_PDF_OUTPUT_BYTES) throw new HouseholdReportPdfError('WORKLOAD_LIMIT_EXCEEDED', `PDF export exceeds the supported output size of ${MAX_PDF_OUTPUT_BYTES} bytes`);
    const pageCount = countPdfPages(pdf);
    if (pageCount === 0 || pageCount > MAX_PDF_PAGES) throw new HouseholdReportPdfError('WORKLOAD_LIMIT_EXCEEDED', `PDF export exceeds the supported page limit of ${MAX_PDF_PAGES} pages`);
    return pdf;
  } finally {
    if (page) await withTimeout(page.close(), PDF_CLEANUP_TIMEOUT_MILLISECONDS, 'PDF page cleanup exceeded the supported time limit').catch(() => undefined);
    if (browser) await withTimeout(browser.close(), PDF_CLEANUP_TIMEOUT_MILLISECONDS, 'PDF browser cleanup exceeded the supported time limit').catch(() => undefined);
    releasePdfRenderSlot();
  }
};
