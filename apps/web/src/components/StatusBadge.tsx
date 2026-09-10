import type { CSSProperties } from 'react';
import type { InvoiceStatus, KsefStatus } from '../lib/api-types';

// ─── Invoice status ───────────────────────────────────────────────────────────

const INVOICE_STATUS_LABELS: Record<InvoiceStatus, string> = {
  DRAFT: 'Szkic',
  ISSUING: 'Wystawianie',
  ISSUED: 'Wystawiona',
  CANCELLED: 'Anulowana',
};

const INVOICE_STATUS_COLORS: Record<
  InvoiceStatus,
  { bg: string; color: string }
> = {
  DRAFT: { bg: '#f3f4f6', color: '#374151' },
  ISSUING: { bg: '#fef9c3', color: '#854d0e' },
  ISSUED: { bg: '#dbeafe', color: '#1e40af' },
  CANCELLED: { bg: '#f3f4f6', color: '#6b7280' },
};

// ─── KSeF status ──────────────────────────────────────────────────────────────

const KSEF_STATUS_LABELS: Record<KsefStatus, string> = {
  not_submitted: '—',
  pending: 'Oczekuje',
  accepted: 'Przyjęta',
  rejected: 'Odrzucona',
};

const KSEF_STATUS_COLORS: Record<KsefStatus, { bg: string; color: string }> = {
  not_submitted: { bg: '#f3f4f6', color: '#6b7280' },
  pending: { bg: '#fef9c3', color: '#854d0e' },
  accepted: { bg: '#dcfce7', color: '#166534' },
  rejected: { bg: '#fee2e2', color: '#991b1b' },
};

const badgeBase: CSSProperties = {
  display: 'inline-block',
  padding: '0.2rem 0.55rem',
  borderRadius: '0.375rem',
  fontSize: '0.75rem',
  fontWeight: 600,
  whiteSpace: 'nowrap',
};

export function InvoiceStatusBadge({ status }: { status: InvoiceStatus }) {
  const colors = INVOICE_STATUS_COLORS[status] ?? INVOICE_STATUS_COLORS.DRAFT;
  return (
    <span style={{ ...badgeBase, background: colors.bg, color: colors.color }}>
      {INVOICE_STATUS_LABELS[status] ?? status}
    </span>
  );
}

export function KsefStatusBadge({ status }: { status: KsefStatus }) {
  const colors = KSEF_STATUS_COLORS[status] ?? KSEF_STATUS_COLORS.not_submitted;
  return (
    <span style={{ ...badgeBase, background: colors.bg, color: colors.color }}>
      {KSEF_STATUS_LABELS[status] ?? status}
    </span>
  );
}
