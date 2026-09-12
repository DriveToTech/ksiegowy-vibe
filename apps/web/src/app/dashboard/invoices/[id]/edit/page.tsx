import { getInvoice, getContractors, getServiceTemplates, getContractorServiceRates } from '../../../../../lib/api';
import type { ContractorServiceRate } from '../../../../../lib/api';
import { Button } from '../../../../../components/atoms/Button';
import { ErrorState } from '../../../../../components/molecules/ErrorState';
import { PageHeader } from '../../../../../components/molecules/PageHeader';
import { requireAuthSession } from '../../../../../lib/auth';
import { t } from '../../../../../lib/translations';
import EditInvoiceForm from './EditInvoiceForm';

export default async function EditInvoicePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await requireAuthSession(`/dashboard/invoices/${id}/edit`);

  const companyId = session.activeCompanyId;
  const activeEnvironment = session.activeKsefEnvironment;

  if (!companyId || !activeEnvironment) {
    return <ErrorState message={t.invoiceDetail.errors.companyNotFound} />;
  }

  let invoice;
  try {
    invoice = await getInvoice(companyId, id, activeEnvironment);
  } catch (e) {
    return (
      <div className="space-y-4">
        <ErrorState message={e instanceof Error ? e.message : t.invoiceDetail.errors.invoiceLoadFailed} />
        <Button href={`/dashboard/invoices/${id}`} variant="secondary">{t.newInvoice.backToInvoiceButton}</Button>
      </div>
    );
  }

  if (invoice.status !== 'DRAFT') {
    return (
      <div className="space-y-4">
        <ErrorState message={t.newInvoice.editNotDraftError(invoice.status)} />
        <Button href={`/dashboard/invoices/${id}`} variant="secondary">{t.newInvoice.backToInvoiceButton}</Button>
      </div>
    );
  }

  const [contractors, serviceTemplates] = await Promise.all([
    getContractors(companyId, activeEnvironment),
    getServiceTemplates(companyId).catch(() => []),
  ]);

  const allRates = await Promise.all(
    contractors.map((contractor) =>
      getContractorServiceRates(companyId!, contractor.id).catch(() => [] as ContractorServiceRate[]),
    ),
  ).then((results) => results.flat());

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={t.newInvoice.editPageEyebrow}
        title={t.newInvoice.editPageTitle}
        description={t.newInvoice.editPageDescription}
      />
        <EditInvoiceForm
          companyId={companyId}
          activeEnvironment={activeEnvironment}
        invoice={invoice}
        contractors={contractors}
        serviceTemplates={serviceTemplates}
        contractorRates={allRates}
      />
    </div>
  );
}
