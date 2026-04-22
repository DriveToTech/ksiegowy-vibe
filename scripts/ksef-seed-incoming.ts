// ⚠️  TEST ONLY — This script submits invoices to KSeF TEST environment.
// Never run with --production unless you intend to create real, permanent invoices.
//
// Usage:
//   pnpm ksef:seed-incoming [-- --count <n>] [-- --dry-run] [-- --production] [-- --help]
//
// Environment variables:
//   KSEF_CONTRACTOR_TOKEN   KSeF API token of the contractor (submitter).
//                           If absent, falls back to KSEF_AUTH_TOKEN (self-invoice mode — Trysoft as both seller and buyer).
//   KSEF_CONTRACTOR_NIP     NIP of the contractor. Defaults to '9876543210'.
//   KSEF_AUTH_TOKEN         Trysoft's KSeF token (fallback self-invoice mode).
//   KSEF_NIP                Trysoft's NIP. Defaults to '1234563218'.

import { buildFa3Xml } from '../packages/fa3-xml/src/builder.js';
import { validateFa3Xml } from '../packages/fa3-xml/src/validator.js';
import { createKsefClient } from '../packages/ksef-client/src/client.js';
import type { InvoiceData } from '../packages/types/src/invoice.js';
import type { KsefEnvironment } from '../packages/types/src/ksef.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

const formatDate = (date: Date): string => date.toISOString().slice(0, 10);

const addDays = (date: Date, days: number): Date => {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
};

const buildIssueDate = (index: number, total: number): string => {
  const today = new Date();
  const intervalDays = Math.floor(90 / Math.max(total, 1));
  const daysAgo = 90 - index * intervalDays;
  return formatDate(addDays(today, -daysAgo));
};

const roundToTwo = (value: number): string => value.toFixed(2);

// ── Fixtures ──────────────────────────────────────────────────────────────────

const FIXTURE_CONTRACTORS = [
  { nip: '9876543210', name: 'Example Client sp. z o.o.',   addressLine1: 'ul. Przykładowa 2',    addressLine2: '00-002 Warszawa' },
  { nip: '1111111111', name: 'Dostawca Alfa sp. z o.o.',           addressLine1: 'ul. Przykładowa 10', addressLine2: '00-001 Warszawa' },
  { nip: '1234563218', name: 'Dostawca Beta S.A.',         addressLine1: 'ul. Przykładowa 20',     addressLine2: '00-002 Warszawa' },
] as const;

const SERVICES    = ['Usługi IT', 'Konsulting', 'Hosting', 'Licencje oprogramowania', 'Szkolenia'] as const;
const NET_AMOUNTS = ['500.00', '1200.00', '2500.00', '800.00', '4500.00'] as const;

// ── Main ──────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  // pnpm prepends an extra '--' when forwarding args via sh -c; strip it so
  // flag parsing works the same whether the script is called directly or via pnpm.
  const args = process.argv.slice(2).filter((arg) => arg !== '--');

  if (args.includes('--help')) {
    console.log('Usage: pnpm ksef:seed-incoming [-- --count <n>] [-- --dry-run] [-- --production] [-- --help]');
    console.log('');
    console.log('Options:');
    console.log('  --count <n>     Number of invoices to submit (default: 5)');
    console.log('  --dry-run       Build and validate XML but skip KSeF submission');
    console.log('  --production    Use production KSeF (⚠️  creates real invoices)');
    console.log('  --help          Show this message');
    console.log('');
    console.log('Environment variables:');
    console.log('  KSEF_CONTRACTOR_TOKEN   KSeF token for the contractor (submitter)');
    console.log('  KSEF_CONTRACTOR_NIP     Contractor NIP (default: 9876543210)');
    console.log('  KSEF_AUTH_TOKEN         Trysoft token (fallback self-invoice mode)');
    console.log('  KSEF_NIP                Trysoft NIP (default: 1234563218)');
    return;
  }

  const isDryRun    = args.includes('--dry-run');
  const isProduction = args.includes('--production');

  const countIndex  = args.indexOf('--count');
  const invoiceCount = countIndex !== -1 && args[countIndex + 1]
    ? parseInt(args[countIndex + 1]!, 10)
    : 5;

  if (!Number.isInteger(invoiceCount) || invoiceCount < 1) {
    console.error('❌ --count must be a positive integer');
    process.exit(1);
  }

  if (isProduction) {
    console.warn('⚠️  WARNING: --production flag is set. This will submit REAL invoices to the production KSeF.');
    console.warn('⚠️  Press Ctrl+C within 5 seconds to abort.');
    await new Promise((resolve) => setTimeout(resolve, 5000));
  }

  const environment: KsefEnvironment = isProduction ? 'production' : 'test';

  const contractorToken = process.env['KSEF_CONTRACTOR_TOKEN'] ?? process.env['KSEF_AUTH_TOKEN'] ?? null;
  const contractorNip   = process.env['KSEF_CONTRACTOR_NIP'] ?? '9876543210';
  const buyerNip        = process.env['KSEF_NIP'] ?? '1234563218';

  if (!isDryRun && !contractorToken) {
    console.error('❌ Missing KSeF token. Set KSEF_CONTRACTOR_TOKEN or KSEF_AUTH_TOKEN.');
    process.exit(1);
  }

  const isSelfInvoiceMode = !process.env['KSEF_CONTRACTOR_TOKEN'];
  if (!isDryRun && isSelfInvoiceMode) {
    console.log('ℹ️  Self-invoice mode: using KSEF_AUTH_TOKEN (Trysoft as both seller and buyer).');
  }

  const BUYER = {
    nip: buyerNip,
    name: 'Acme Software sp. z o.o.',
    addressLine1: 'ul. Testowa 1',
    addressLine2: '00-001 Warszawa'
  } as const;

  const buildInvoiceData = (index: number): InvoiceData => {
    const contractor = FIXTURE_CONTRACTORS[index % FIXTURE_CONTRACTORS.length]!;
    const serviceName = SERVICES[index % SERVICES.length]!;
    const netAmount   = NET_AMOUNTS[index % NET_AMOUNTS.length]!;
    const issueDate   = buildIssueDate(index, invoiceCount);
    const dueDate     = formatDate(addDays(new Date(issueDate), 30));

    const net   = parseFloat(netAmount);
    const vat   = roundToTwo(net * 0.23);
    const gross = roundToTwo(net + parseFloat(vat));

    const sellerNip      = isSelfInvoiceMode ? buyerNip : contractor.nip;
    const sellerName     = isSelfInvoiceMode ? BUYER.name : contractor.name;
    const sellerAddress1 = isSelfInvoiceMode ? BUYER.addressLine1 : contractor.addressLine1;
    const sellerAddress2 = isSelfInvoiceMode ? BUYER.addressLine2 : contractor.addressLine2;

    const invoiceNumber = `TEST/${String(index + 1).padStart(3, '0')}/${issueDate.slice(0, 7).replace('-', '/')}`;

    return {
      invoiceNumber,
      issueDate,
      currency: 'PLN',
      invoiceType: 'VAT',
      seller: {
        nip: sellerNip,
        name: sellerName,
        addressLine1: sellerAddress1,
        ...(sellerAddress2 !== undefined ? { addressLine2: sellerAddress2 } : {})
      },
      buyer: {
        nip: BUYER.nip,
        name: BUYER.name,
        addressLine1: BUYER.addressLine1,
        addressLine2: BUYER.addressLine2
      },
      paymentMethod: 'bank_transfer',
      paymentDueDate: dueDate,
      lines: [
        {
          description: serviceName,
          quantity: '1.0000',
          unit: 'szt',
          unitNetPrice: netAmount,
          vatRate: '23'
        }
      ],
      totalNet: netAmount,
      totalVat: vat,
      totalGross: gross
    };
  };

  console.log(`\n🌱 KSeF incoming invoice seed — ${environment.toUpperCase()} environment`);
  console.log(`   Submitting ${invoiceCount} invoice(s)${isDryRun ? ' (dry-run, no network calls)' : ''}\n`);

  const client = createKsefClient({ environment });
  let accessToken: string | null = null;

  for (let index = 0; index < invoiceCount; index++) {
    const invoiceData = buildInvoiceData(index);
    const xml = buildFa3Xml(invoiceData);

    const validation = validateFa3Xml(xml);
    if (!validation.valid) {
      console.error(`❌ [${index + 1}/${invoiceCount}] XSD validation failed for invoice ${invoiceData.invoiceNumber}:`);
      for (const error of validation.errors) {
        console.error(`   ${error}`);
      }
      process.exit(1);
    }

    if (isDryRun) {
      console.log(`✅ [${index + 1}/${invoiceCount}] dry-run | invoice=${invoiceData.invoiceNumber} | seller=${invoiceData.seller.nip} | gross=${invoiceData.totalGross} PLN`);
      continue;
    }

    if (accessToken === null) {
      process.stdout.write('   Authenticating with KSeF...');
      const authNip = isSelfInvoiceMode ? buyerNip : contractorNip;
      const authResult = await client.initAuthSession({ ksefToken: contractorToken, nip: authNip });
      accessToken = authResult.accessToken;
      console.log(' done.');
    }

    const submitResult = await client.submitInvoice({ accessToken, xml });
    const ksefRef = submitResult.ksefReferenceNumber ?? '(pending)';
    console.log(`✅ [${index + 1}/${invoiceCount}] submitted | invoice=${invoiceData.invoiceNumber} | seller=${invoiceData.seller.nip} | gross=${invoiceData.totalGross} PLN | ksefRef=${ksefRef}`);
  }

  const today        = formatDate(new Date());
  const ninetyDaysAgo = formatDate(addDays(new Date(), -90));

  console.log(`\n✅ Done. ${isDryRun ? 'Dry-run complete — no invoices were submitted.' : `${invoiceCount} invoice(s) submitted to KSeF ${environment.toUpperCase()}.`}`);

  if (!isDryRun) {
    console.log('\n   To import them into the system, call:');
    console.log('   POST /companies/{companyId}/incoming/ksef-sync');
    console.log(`   Body: { "dateFrom": "${ninetyDaysAgo}", "dateTo": "${today}" }\n`);
  }
}

main().catch((error: unknown) => {
  console.error('❌ Seed failed:', error instanceof Error ? error.message : error);
  process.exit(1);
});
