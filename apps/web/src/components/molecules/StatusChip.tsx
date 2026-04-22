import { Badge } from '../atoms/Badge';
import type { InvoiceStatus, IncomingInvoiceStatus, KsefStatus } from '../../lib/api-types';

const invoiceStatusMap: Record<InvoiceStatus, { label: string; tone: 'neutral' | 'primary' | 'success' | 'warning' | 'danger' }> = {
  DRAFT: { label: 'Szkic', tone: 'neutral' },
  ISSUED: { label: 'Wystawiona', tone: 'primary' },
  CANCELLED: { label: 'Anulowana', tone: 'neutral' },
};

const ksefStatusMap: Record<KsefStatus, { label: string; tone: 'neutral' | 'primary' | 'success' | 'warning' | 'danger' }> = {
  not_submitted: { label: 'Nie wysłano', tone: 'neutral' },
  pending: { label: 'Oczekuje', tone: 'warning' },
  accepted: { label: 'Przyjęta', tone: 'success' },
  rejected: { label: 'Odrzucona', tone: 'danger' },
};

const incomingStatusMap: Record<IncomingInvoiceStatus, { label: string; tone: 'neutral' | 'primary' | 'success' | 'warning' | 'danger' }> = {
  UPLOADED: { label: 'Przesłano', tone: 'neutral' },
  OCR_PROCESSING: { label: 'OCR w toku', tone: 'warning' },
  OCR_DONE: { label: 'OCR gotowy', tone: 'primary' },
  OCR_FAILED: { label: 'Błąd OCR', tone: 'danger' },
  CONFIRMED: { label: 'Potwierdzona', tone: 'success' },
  REJECTED: { label: 'Odrzucona', tone: 'danger' },
  KSEF_SYNCED: { label: 'Z KSeF', tone: 'primary' },
};

export function InvoiceStatusChip({ status }: { status: InvoiceStatus }) {
  const config = invoiceStatusMap[status] ?? invoiceStatusMap.DRAFT;
  return <Badge tone={config.tone}>{config.label}</Badge>;
}

export function KsefStatusChip({ status }: { status: KsefStatus }) {
  const config = ksefStatusMap[status] ?? ksefStatusMap.not_submitted;
  return <Badge tone={config.tone}>{config.label}</Badge>;
}

export function IncomingStatusChip({ status }: { status: IncomingInvoiceStatus }) {
  const config = incomingStatusMap[status] ?? incomingStatusMap.UPLOADED;
  return <Badge tone={config.tone}>{config.label}</Badge>;
}
