import { describe, expect, it } from 'vitest';
import { generateHouseholdReportPdf } from './household-report-pdf-generator.js';
import type { HouseholdReportPdfData } from './household-report-template.js';
import type { HouseholdReportPdfError as HouseholdReportPdfErrorType } from './household-report-pdf-generator.js';

const buildReport = (): HouseholdReportPdfData => ({
  from: '2026-01-01',
  to: '2026-12-31',
  cashFlow: { income: '0.00', spending: '0.00', surplus: '0.00', categories: [] },
  netWorth: { total: '0.00', accounts: [], investments: [] },
  dataQuality: { status: 'COMPLETE', notes: [] }
});

describe('generateHouseholdReportPdf()', () => {
  it('rejects oversized report data before launching Chromium', async () => {
    const report = buildReport();
    report.cashFlow.categories = Array.from({ length: 501 }, (_, index) => ({ categoryName: `Category ${index}`, income: '0.00', spending: '0.00' }));

    await expect(generateHouseholdReportPdf(report)).rejects.toEqual(expect.objectContaining({
      name: 'HouseholdReportPdfError',
      code: 'WORKLOAD_LIMIT_EXCEEDED'
    } satisfies Partial<HouseholdReportPdfErrorType>));
  });
});
