import Link from 'next/link';
import { getActiveCompany, getIncomingInvoice } from '../../../../lib/api';
import { EmptyState } from '../../../../components/molecules/EmptyState';
import { ErrorState } from '../../../../components/molecules/ErrorState';
import { Button } from '../../../../components/atoms/Button';
import { PageHeader } from '../../../../components/molecules/PageHeader';
import { ReviewPanel } from './ReviewPanel';

interface Props {
  params: Promise<{ id: string }>;
}

export default async function IncomingReviewPage({ params }: Props) {
  const { id } = await params;
  const { activeCompanyId: companyId } = await getActiveCompany().catch(() => ({ activeCompanyId: null }));

  if (!companyId) {
    return <ErrorState message="Brak firmy." />;
  }

  const invoice = await getIncomingInvoice(companyId, id).catch(() => null);

  if (!invoice) {
    return (
      <div className="space-y-4">
        <EmptyState title="Faktura nie znaleziona" description="Nie udało się odnaleźć wskazanego dokumentu przychodzącego." />
        <Link href="/dashboard/incoming" className="text-sm font-medium text-primary-strong transition hover:text-primary">
          ← Wróć do listy
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="OCR review"
        title={invoice.invoiceNumber ?? 'Przegląd faktury przychodzącej'}
        description="Zweryfikuj dane odczytane z dokumentu i zatwierdź lub odrzuć wynik OCR."
      />

      <div>
        <Link href="/dashboard/incoming" className="text-sm font-medium text-muted transition hover:text-foreground">
          <Button variant="secondary">← Faktury przychodzące</Button>
        </Link>
      </div>

      <ReviewPanel invoice={invoice} companyId={companyId} />
    </div>
  );
}
