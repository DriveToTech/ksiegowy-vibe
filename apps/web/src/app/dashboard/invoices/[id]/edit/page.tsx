import Link from 'next/link';
import { getActiveCompany, getInvoice, getContractors, getServiceTemplates, getContractorServiceRates } from '../../../../../lib/api';
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

  let companyId: string | null = null;
  let errorMsg: string | null = null;

  try {
    const { activeCompanyId } = await getActiveCompany();
    companyId = activeCompanyId;
  } catch (e) {
    errorMsg = e instanceof Error ? e.message : t.invoiceDetail.errors.companyLoadFailed;
  }

  if (errorMsg || !companyId) {
    return <ErrorState message={errorMsg ?? t.invoiceDetail.errors.companyNotFound} />;
  }

  let invoice;
  try {
    invoice = await getInvoice(companyId, id);
  } catch (e) {
    return (
      <div className="space-y-4">
        <ErrorState message={e instanceof Error ? e.message : t.invoiceDetail.errors.invoiceLoadFailed} />
        <Link href={`/dashboard/invoices/${id}`}>
          <Button variant="secondary">{t.newInvoice.backToInvoiceButton}</Button>
        </Link>
      </div>
    );
  }

  if (invoice.status !== 'DRAFT') {
    return (
      <div className="space-y-4">
        <ErrorState message={t.newInvoice.editNotDraftError(invoice.status)} />
        <Link href={`/dashboard/invoices/${id}`}>
          <Button variant="secondary">{t.newInvoice.backToInvoiceButton}</Button>
        </Link>
      </div>
    );
  }

  const [contractors, serviceTemplates] = await Promise.all([
    getContractors(companyId),
    getServiceTemplates(companyId).catch(() => []),
  ]);

  const allRates = await Promise.all(
    contractors.map((contractor) =>
      getContractorServiceRates(companyId!, contractor.id).catch(() => [] as ContractorServiceRate[]),
    ),
  ).then((results) => results.flat());

  void session;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={t.newInvoice.editPageEyebrow}
        title={t.newInvoice.editPageTitle}
        description={t.newInvoice.editPageDescription}
      />
      <EditInvoiceForm
        companyId={companyId}
        invoice={invoice}
        contractors={contractors}
        serviceTemplates={serviceTemplates}
        contractorRates={allRates}
      />
    </div>
  );
}
