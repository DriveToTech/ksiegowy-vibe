import type { InvoiceData, InvoiceLineInput, VatRate } from '@ksiegowy/types';
import { slownie } from '@ksiegowy/shared-utils';

// ── Formatters ─────────────────────────────────────────────────────────────────

const formatPln = (value: string | number): string => {
  const n = typeof value === 'string' ? Number.parseFloat(value) : value;
  return n.toLocaleString('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

const formatNip = (nip: string): string => {
  const digits = nip.replace(/\D/g, '');
  if (digits.length !== 10) return nip;
  return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6, 8)}-${digits.slice(8)}`;
};

const formatBankAccount = (account: string): string => {
  const digits = account.replace(/\D/g, '');
  if (digits.length !== 26) return account;
  // PL format: PL XX XXXX XXXX XXXX XXXX XXXX XXXX
  return `${digits.slice(0, 2)} ${digits.slice(2, 6)} ${digits.slice(6, 10)} ${digits.slice(10, 14)} ${digits.slice(14, 18)} ${digits.slice(18, 22)} ${digits.slice(22)}`;
};

const formatDate = (isoDate: string): string => {
  const d = new Date(isoDate);
  const day = d.getUTCDate().toString().padStart(2, '0');
  const month = (d.getUTCMonth() + 1).toString().padStart(2, '0');
  const year = d.getUTCFullYear();
  return `${day}.${month}.${year}`;
};

const vatRateLabel = (rate: VatRate): string => {
  if (rate === 'zw') return 'zw.';
  if (rate === 'np') return 'n/p';
  if (rate === 'oo') return 'o.o.';
  return `${rate}%`;
};

const paymentMethodLabel = (method: string): string => {
  switch (method) {
    case 'bank_transfer': return 'Przelew bankowy';
    case 'cash': return 'Gotówka';
    default: return method;
  }
};

// ── VAT breakdown computation ──────────────────────────────────────────────────

interface VatGroup {
  rate: VatRate;
  netAmount: number;
  vatAmount: number;
}

const buildVatBreakdown = (lines: readonly InvoiceLineInput[]): VatGroup[] => {
  const groups = new Map<VatRate, VatGroup>();

  for (const line of lines) {
    const net = Number.parseFloat(line.unitNetPrice) * Number.parseFloat(line.quantity);
    const vatPct = (['zw', 'np', 'oo'] as VatRate[]).includes(line.vatRate)
      ? 0
      : Number.parseFloat(line.vatRate);
    const vat = Math.round(net * vatPct) / 100;

    const existing = groups.get(line.vatRate);
    if (existing) {
      existing.netAmount += net;
      existing.vatAmount += vat;
    } else {
      groups.set(line.vatRate, { rate: line.vatRate, netAmount: net, vatAmount: vat });
    }
  }

  return Array.from(groups.values());
};

// ── HTML template ──────────────────────────────────────────────────────────────

/**
 * Generates the full HTML for an A4 invoice PDF.
 *
 * Font: Uses DejaVu Sans via Google Fonts in development.
 * For production self-hosted deployments, replace the @import with an
 * embedded base64 @font-face block to avoid network dependency during PDF
 * generation. Example:
 *   @font-face { font-family: 'DejaVu Sans'; src: url('data:font/ttf;base64,...'); }
 */
export const buildInvoiceHtml = (invoice: InvoiceData): string => {
  const vatBreakdown = buildVatBreakdown(invoice.lines);
  const totalNet = Number.parseFloat(invoice.totalNet);
  const totalVat = Number.parseFloat(invoice.totalVat);
  const totalGross = Number.parseFloat(invoice.totalGross);
  const dueAmount = totalGross; // no partial payment tracking at this layer
  const slownieText = slownie(dueAmount);
  const saleDate = invoice.saleDate ?? invoice.issueDate;

  const linesHtml = invoice.lines
    .map(
      (line: InvoiceLineInput, i: number) => `
        <tr>
          <td class="center">${i + 1}</td>
          <td>${escHtml(line.description)}</td>
          <td class="center">${escHtml(line.unit)}</td>
          <td class="right">${formatPln(line.quantity)}</td>
          <td class="right">${formatPln(line.unitNetPrice)}</td>
          <td class="center">${vatRateLabel(line.vatRate)}</td>
          <td class="right">${formatPln(Number.parseFloat(line.unitNetPrice) * Number.parseFloat(line.quantity))}</td>
          <td class="right">${formatPln(Math.round(Number.parseFloat(line.unitNetPrice) * Number.parseFloat(line.quantity) * ((['zw', 'np', 'oo'] as VatRate[]).includes(line.vatRate) ? 0 : Number.parseFloat(line.vatRate))) / 100)}</td>
          <td class="right">${formatPln(Number.parseFloat(line.unitNetPrice) * Number.parseFloat(line.quantity) + Math.round(Number.parseFloat(line.unitNetPrice) * Number.parseFloat(line.quantity) * ((['zw', 'np', 'oo'] as VatRate[]).includes(line.vatRate) ? 0 : Number.parseFloat(line.vatRate))) / 100)}</td>
        </tr>`
    )
    .join('');

  const vatBreakdownHtml = vatBreakdown
    .map(
      (group) => `
        <tr>
          <td>${vatRateLabel(group.rate)}</td>
          <td class="right">${formatPln(group.netAmount)}</td>
          <td class="right">${formatPln(group.vatAmount)}</td>
          <td class="right">${formatPln(group.netAmount + group.vatAmount)}</td>
        </tr>`
    )
    .join('');

  return `<!DOCTYPE html>
<html lang="pl">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Faktura ${escHtml(invoice.invoiceNumber)}</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=DejaVu+Sans:wght@400;700&display=swap');

    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

    body {
      font-family: 'DejaVu Sans', 'Arial', 'Helvetica', sans-serif;
      font-size: 9pt;
      color: #1a1a1a;
      background: #fff;
      padding: 15mm;
    }

    @page { size: A4; margin: 15mm; }
    @media print { body { padding: 0; } }

    h1 { font-size: 16pt; font-weight: 700; text-transform: uppercase; text-align: center; margin-bottom: 4pt; }
    h2 { font-size: 11pt; font-weight: 700; margin-bottom: 4pt; }

    .header { text-align: center; margin-bottom: 8mm; }
    .invoice-meta { display: flex; justify-content: space-between; font-size: 8.5pt; margin-bottom: 6mm; }
    .invoice-meta-left { display: flex; flex-direction: column; gap: 2pt; }

    .parties { display: flex; gap: 8mm; margin-bottom: 6mm; }
    .party { flex: 1; border: 1px solid #ccc; padding: 4mm; border-radius: 2pt; }
    .party h2 { font-size: 9pt; color: #666; margin-bottom: 3pt; text-transform: uppercase; letter-spacing: 0.5pt; }
    .party .name { font-weight: 700; font-size: 10pt; margin-bottom: 2pt; }
    .party .detail { font-size: 8.5pt; color: #333; line-height: 1.5; }

    table { width: 100%; border-collapse: collapse; margin-bottom: 4mm; }
    th { background: #2c3e50; color: #fff; font-size: 7.5pt; font-weight: 700; padding: 3pt 4pt; text-align: center; }
    td { border: 1px solid #ddd; padding: 3pt 4pt; font-size: 8pt; vertical-align: middle; }
    tr:nth-child(even) td { background: #f9f9f9; }
    .total-row td { font-weight: 700; background: #ecf0f1 !important; }

    .right { text-align: right; }
    .center { text-align: center; }
    .left { text-align: left; }

    .section-title { font-size: 8pt; font-weight: 700; text-transform: uppercase; color: #666; margin-bottom: 3pt; letter-spacing: 0.5pt; }

    .two-col { display: flex; gap: 8mm; margin-bottom: 6mm; }
    .col { flex: 1; }

    .payment-box { border: 1px solid #ccc; padding: 4mm; border-radius: 2pt; }
    .payment-row { display: flex; justify-content: space-between; padding: 2pt 0; border-bottom: 1px solid #eee; font-size: 8.5pt; }
    .payment-row:last-child { border-bottom: none; }
    .payment-label { color: #555; }
    .payment-value { font-weight: 600; }

    .totals-box { border: 2px solid #2c3e50; padding: 4mm; border-radius: 2pt; }
    .total-line { display: flex; justify-content: space-between; padding: 2pt 0; font-size: 8.5pt; }
    .total-line.main { font-size: 11pt; font-weight: 700; color: #2c3e50; border-top: 1px solid #2c3e50; margin-top: 3pt; padding-top: 4pt; }
    .slownie { font-size: 8pt; color: #555; font-style: italic; margin-top: 4pt; border-top: 1px dashed #ccc; padding-top: 4pt; }

    .signatures { display: flex; gap: 8mm; margin-top: 16mm; }
    .sig { flex: 1; border-top: 1px solid #333; padding-top: 3pt; font-size: 7.5pt; color: #666; text-align: center; }

    .notes { margin-bottom: 6mm; font-size: 8pt; color: #333; }
  </style>
</head>
<body>

  <!-- HEADER -->
  <div class="header">
    <h1>Faktura VAT</h1>
    <div style="font-size: 12pt; font-weight: 700;">${escHtml(invoice.invoiceNumber)}</div>
  </div>

  <!-- META -->
  <div class="invoice-meta">
    <div class="invoice-meta-left">
      <div><strong>Data wystawienia:</strong> ${formatDate(invoice.issueDate)}</div>
      <div><strong>Data sprzedaży:</strong> ${formatDate(saleDate)}</div>
      <div><strong>Miejsce wystawienia:</strong> Wrocław</div>
    </div>
    <div>
      <div><strong>Waluta:</strong> ${escHtml(invoice.currency)}</div>
    </div>
  </div>

  <!-- PARTIES -->
  <div class="parties">
    <div class="party">
      <h2>Sprzedawca</h2>
      <div class="name">${escHtml(invoice.seller.name)}</div>
      <div class="detail">
        ${escHtml(invoice.seller.addressLine1)}<br />
        ${invoice.seller.addressLine2 ? `${escHtml(invoice.seller.addressLine2)}<br />` : ''}
        NIP: ${formatNip(invoice.seller.nip)}
      </div>
    </div>
    <div class="party">
      <h2>Nabywca</h2>
      <div class="name">${escHtml(invoice.buyer.name)}</div>
      <div class="detail">
        ${escHtml(invoice.buyer.addressLine1)}<br />
        ${invoice.buyer.addressLine2 ? `${escHtml(invoice.buyer.addressLine2)}<br />` : ''}
        NIP: ${formatNip(invoice.buyer.nip)}
      </div>
    </div>
  </div>

  <!-- LINE ITEMS -->
  <div class="section-title">Pozycje faktury</div>
  <table>
    <thead>
      <tr>
        <th style="width:4%">Lp.</th>
        <th style="width:30%">Nazwa towaru lub usługi</th>
        <th style="width:5%">Jm.</th>
        <th style="width:7%">Ilość</th>
        <th style="width:10%">Cena netto</th>
        <th style="width:6%">VAT%</th>
        <th style="width:11%">Wartość netto</th>
        <th style="width:11%">Wartość VAT</th>
        <th style="width:12%">Wartość brutto</th>
      </tr>
    </thead>
    <tbody>
      ${linesHtml}
      <tr class="total-row">
        <td colspan="6" class="right">Razem</td>
        <td class="right">${formatPln(totalNet)}</td>
        <td class="right">${formatPln(totalVat)}</td>
        <td class="right">${formatPln(totalGross)}</td>
      </tr>
    </tbody>
  </table>

  <div class="two-col">
    <!-- VAT SUMMARY -->
    <div class="col">
      <div class="section-title">Zestawienie VAT</div>
      <table>
        <thead>
          <tr>
            <th>Stawka VAT</th>
            <th>Wartość netto</th>
            <th>Kwota VAT</th>
            <th>Wartość brutto</th>
          </tr>
        </thead>
        <tbody>
          ${vatBreakdownHtml}
          <tr class="total-row">
            <td><strong>Razem</strong></td>
            <td class="right">${formatPln(totalNet)}</td>
            <td class="right">${formatPln(totalVat)}</td>
            <td class="right">${formatPln(totalGross)}</td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- PAYMENT -->
    <div class="col">
      <div class="section-title">Płatność</div>
      <div class="payment-box">
        <div class="payment-row">
          <span class="payment-label">Forma zapłaty</span>
          <span class="payment-value">${paymentMethodLabel(invoice.paymentMethod ?? 'bank_transfer')}</span>
        </div>
        ${invoice.paymentDueDate ? `
        <div class="payment-row">
          <span class="payment-label">Termin zapłaty</span>
          <span class="payment-value">${formatDate(invoice.paymentDueDate)}</span>
        </div>` : ''}
        ${invoice.paymentBankAccount ? `
        <div class="payment-row">
          <span class="payment-label">Nr konta</span>
          <span class="payment-value" style="font-size:7.5pt">${formatBankAccount(invoice.paymentBankAccount)}</span>
        </div>` : ''}
      </div>
    </div>
  </div>

  <!-- TOTALS -->
  <div class="section-title">Podsumowanie</div>
  <div class="totals-box" style="max-width: 280pt; margin-left: auto;">
    <div class="total-line">
      <span>Razem netto</span>
      <span>${formatPln(totalNet)} PLN</span>
    </div>
    <div class="total-line">
      <span>Wartość VAT</span>
      <span>${formatPln(totalVat)} PLN</span>
    </div>
    <div class="total-line">
      <span>Wartość brutto</span>
      <span>${formatPln(totalGross)} PLN</span>
    </div>
    <div class="total-line main">
      <span>Do zapłaty</span>
      <span>${formatPln(dueAmount)} PLN</span>
    </div>
    <div class="slownie">Słownie: ${escHtml(slownieText)}</div>
  </div>

  ${invoice.notes ? `
  <!-- NOTES -->
  <div class="section-title" style="margin-top: 6mm;">Uwagi</div>
  <div class="notes">${escHtml(invoice.notes).replace(/\n/g, '<br />')}</div>` : ''}

  <!-- SIGNATURES -->
  <div class="signatures">
    <div class="sig">Osoba upoważniona do wystawienia faktury</div>
    <div class="sig">Osoba upoważniona do odbioru faktury</div>
  </div>

</body>
</html>`;
};

const escHtml = (text: string): string =>
  text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
