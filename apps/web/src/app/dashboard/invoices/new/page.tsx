import Link from 'next/link';
import { getContractors, getServiceTemplates, getContractorServiceRates } from '../../../../lib/api';
import type { ContractorServiceRate } from '../../../../lib/api';
import { Button } from '../../../../components/atoms/Button';
import { EmptyState } from '../../../../components/molecules/EmptyState';
import { PageHeader } from '../../../../components/molecules/PageHeader';
import { emptyLine } from '../../../../lib/invoice-line-calculation';
import { requireAuthSession } from '../../../../lib/auth';
import { t } from '../../../../lib/translations';
import InvoiceDraftForm from '../InvoiceDraftForm';

const backLinkClassName = 'hidden min-h-11 items-center text-[13px] text-muted transition hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary lg:inline-flex';

export default async function NewInvoicePage() {
  const session = await requireAuthSession('/dashboard/invoices/new');
  const companyId = session.activeCompanyId;

  if (!companyId) {
    return (
      <div className="space-y-6">
        <PageHeader
          eyebrow={t.newInvoice.pageEyebrow}
          title={t.newInvoice.pageTitle}
          description={t.newInvoice.pageDescription}
        />
        <EmptyState
          title={t.newInvoice.noCompanyTitle}
          description={t.newInvoice.noCompanyDescription}
          action={
            <Button href="/dashboard/settings">{t.settings.goToSettings}</Button>
          }
        />
      </div>
    );
  }

  const activeEnvironment = session.activeKsefEnvironment;
  if (!activeEnvironment) {
    return <EmptyState title={t.newInvoice.noCompanyTitle} description={t.newInvoice.noCompanyDescription} />;
  }

  const today = new Date();
  const dueDay = new Date(today);
  dueDay.setUTCDate(dueDay.getUTCDate() + 14);
  const initialDate = today.toISOString().slice(0, 10);
  const dueDate = dueDay.toISOString().slice(0, 10);

  const [contractors, serviceTemplates] = await Promise.all([
    getContractors(companyId, activeEnvironment),
    getServiceTemplates(companyId).catch(() => []),
  ]);

  // Load rates for all contractors so the form can pre-fill prices per contractor
  const allRates = await Promise.all(
    contractors.map((contractor) =>
      getContractorServiceRates(companyId, contractor.id).catch(() => [] as ContractorServiceRate[]),
    ),
  ).then((results) => results.flat());

  if (contractors.length === 0) {
    return (
      <div className="space-y-6">
        <PageHeader
          eyebrow={t.newInvoice.pageEyebrow}
          title={t.newInvoice.pageTitle}
          description={t.newInvoice.pageDescription}
        />
        <EmptyState
          title={t.newInvoice.noContractorsTitle}
          description={t.newInvoice.noContractorsDescription}
          action={
            <Button href="/dashboard/contractors">{t.newInvoice.addContractor}</Button>
          }
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <Link href="/dashboard/invoices" className={backLinkClassName}>{t.newInvoice.backToInvoicesLink}</Link>
        <PageHeader
          eyebrow={t.newInvoice.pageEyebrow}
          title={t.newInvoice.pageTitle}
          description={t.newInvoice.pageDescription}
          descriptionClassName="text-[13px] sm:text-[13px]"
        />
      </div>
      <InvoiceDraftForm
        companyId={companyId}
        activeEnvironment={activeEnvironment}
        initialDraft={{
          contractorId: contractors[0].id,
          issueDate: initialDate,
          saleDate: '',
          paymentDueDate: dueDate,
          paymentMethod: 'BANK_TRANSFER',
          lines: [emptyLine()],
          notes: '',
        }}
        contractors={contractors}
        serviceTemplates={serviceTemplates}
        contractorRates={allRates}
      />
    </div>
  );
}
