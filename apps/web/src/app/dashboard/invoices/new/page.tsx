import Link from 'next/link';
import { getContractors, getServiceTemplates, getContractorServiceRates } from '../../../../lib/api';
import type { ContractorServiceRate } from '../../../../lib/api';
import { Button } from '../../../../components/atoms/Button';
import { EmptyState } from '../../../../components/molecules/EmptyState';
import { PageHeader } from '../../../../components/molecules/PageHeader';
import { requireAuthSession } from '../../../../lib/auth';
import { t } from '../../../../lib/translations';
import NewInvoiceForm from './NewInvoiceForm';

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
            <Link href="/dashboard/settings">
              <Button>{t.settings.goToSettings}</Button>
            </Link>
          }
        />
      </div>
    );
  }

  const company = session.companies.find((candidateCompany) => candidateCompany.id === companyId);

  const [contractors, serviceTemplates] = await Promise.all([
    getContractors(companyId),
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
            <Link href="/dashboard/contractors">
              <Button>{t.newInvoice.addContractor}</Button>
            </Link>
          }
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={t.newInvoice.pageEyebrow}
        title={t.newInvoice.pageTitle}
        description={t.newInvoice.pageDescription}
      />
      <NewInvoiceForm
        companyId={companyId}
        defaultBankAccount={company?.bankAccount ?? null}
        contractors={contractors}
        serviceTemplates={serviceTemplates}
        contractorRates={allRates}
      />
    </div>
  );
}
