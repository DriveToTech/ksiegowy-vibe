export interface HouseholdReportPdfData {
  from: string;
  to: string;
  cashFlow: {
    income: string;
    spending: string;
    surplus: string;
    categories: Array<{ categoryName: string; income: string; spending: string }>;
  };
  netWorth: {
    total: string;
    accounts: Array<{ name: string; value: string }>;
    investments: Array<{ instrument: string; wrapper: string; value: string | null }>;
  };
  dataQuality: {
    status: string;
    notes: string[];
  };
}

const escapeHtml = (value: string): string => value
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;');

const tableRows = (rows: string[][]): string => rows.map((row) => `<tr>${row.map((cell) => `<td>${escapeHtml(cell)}</td>`).join('')}</tr>`).join('');

export const buildHouseholdReportHtml = (report: HouseholdReportPdfData): string => {
  const accountRows = report.netWorth.accounts.map((account) => [account.name, account.value]);
  const investmentRows = report.netWorth.investments.map((investment) => [investment.instrument, investment.wrapper, investment.value ?? 'Missing valuation']);
  const categoryRows = report.cashFlow.categories.map((category) => [category.categoryName, category.income, category.spending]);
  const notes = report.dataQuality.notes.map((note) => `<li>${escapeHtml(note)}</li>`).join('');

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <style>
    * { box-sizing: border-box; }
    body { color: #17211b; font-family: Arial, sans-serif; font-size: 11px; margin: 0; }
    h1 { color: #1c6b42; font-size: 24px; margin: 0 0 4px; }
    h2 { border-bottom: 1px solid #bdd5c5; color: #1c6b42; font-size: 14px; margin: 22px 0 8px; padding-bottom: 4px; }
    .muted { color: #5c6c61; }
    .metrics { display: flex; gap: 10px; margin: 18px 0; }
    .metric { background: #eef7f0; border-radius: 5px; flex: 1; padding: 10px; }
    .metric strong { display: block; font-size: 16px; margin-top: 4px; }
    table { border-collapse: collapse; width: 100%; }
    th, td { border-bottom: 1px solid #d9e4dc; padding: 6px; text-align: left; }
    th { background: #f3f8f4; color: #395242; }
    td:not(:first-child), th:not(:first-child) { text-align: right; }
    .quality { background: #fff7df; border: 1px solid #e6d38b; padding: 8px; }
    ul { margin: 6px 0 0; padding-left: 18px; }
  </style>
</head>
<body>
  <h1>Household report</h1>
  <div class="muted">${escapeHtml(report.from)} – ${escapeHtml(report.to)}</div>
  <div class="metrics">
    <div class="metric">Income<strong>${escapeHtml(report.cashFlow.income)}</strong></div>
    <div class="metric">Spending<strong>${escapeHtml(report.cashFlow.spending)}</strong></div>
    <div class="metric">Surplus<strong>${escapeHtml(report.cashFlow.surplus)}</strong></div>
    <div class="metric">Net worth<strong>${escapeHtml(report.netWorth.total)}</strong></div>
  </div>
  <h2>Cash flow by category</h2>
  <table><thead><tr><th>Category</th><th>Income</th><th>Spending</th></tr></thead><tbody>${tableRows(categoryRows)}</tbody></table>
  <h2>Net worth — accounts</h2>
  <table><thead><tr><th>Account</th><th>Value</th></tr></thead><tbody>${tableRows(accountRows)}</tbody></table>
  <h2>Net worth — investments</h2>
  <table><thead><tr><th>Instrument</th><th>Wrapper</th><th>Value</th></tr></thead><tbody>${tableRows(investmentRows)}</tbody></table>
  <h2>Data quality</h2>
  <div class="quality">Status: ${escapeHtml(report.dataQuality.status)}<ul>${notes}</ul></div>
</body>
</html>`;
};
