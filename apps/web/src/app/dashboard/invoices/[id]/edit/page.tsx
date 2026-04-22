import Link from 'next/link';
import { getActiveCompany, getInvoice, getContractors, getServiceTemplates, getContractorServiceRates } from '../../../../../lib/api';
import type { ContractorServiceRate } from '../../../../../lib/api';
import { Button } from '../../../../../components/atoms/Button';
import { ErrorState } from '../../../../../components/molecules/ErrorState';
import { PageHeader } from '../../../../../components/molecules/PageHeader';
import { requireAuthSession } from '../../../../../lib/auth';
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
    errorMsg = e instanceof Error ? e.message : 'Błąd pobierania danych firmy';
  }

  if (errorMsg || !companyId) {
    return <ErrorState message={errorMsg ?? 'Nie znaleziono firmy.'} />;
  }

  let invoice;
  try {
    invoice = await getInvoice(companyId, id);
  } catch (e) {
    return (
      <div className="space-y-4">
        <ErrorState message={e instanceof Error ? e.message : 'Błąd pobierania faktury'} />
        <Link href={`/dashboard/invoices/${id}`}>
          <Button variant="secondary">← Powrót do faktury</Button>
        </Link>
      </div>
    );
  }

  if (invoice.status !== 'DRAFT') {
    return (
      <div className="space-y-4">
        <ErrorState message={`Edycja jest możliwa tylko dla szkiców (status faktury: ${invoice.status})`} />
        <Link href={`/dashboard/invoices/${id}`}>
          <Button variant="secondary">← Powrót do faktury</Button>
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
        eyebrow="Faktury"
        title="Edytuj szkic faktury"
        description="Wprowadź zmiany i zapisz szkic."
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
