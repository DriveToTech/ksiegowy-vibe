import { API_BASE } from './api-base';
import {
  getActiveKsefEnvironmentFromBrowser,
  KSEF_ENVIRONMENT_HEADER_NAME,
} from './ksef-environment';
import type {
  CompanyBackupRunResult,
  CompanyBackupScheduleMode,
  CompanyBackupSettings,
  Company,
  CompanyLookupResult,
  Contractor,
  ContractorServiceRate,
  CreateCompanyBody,
  CreateDraftBody,
  InvoiceDetail,
  KsefIncomingSyncResult,
  KsefSubmitResponse,
  Member,
  MemberRole,
  ServiceTemplate,
} from './api-types';

export type {
  CompanyBackupRunResult,
  CompanyBackupScheduleMode,
  CompanyBackupSettings,
  Company,
  CompanyKsefEnvironment,
  CompanyKsefSettings,
  Contractor,
  ContractorServiceRate,
  CreateCompanyBody,
  CreateDraftBody,
  IncomingInvoiceDetail,
  IncomingInvoiceStatus,
  IncomingInvoiceSummary,
  Invite,
  InvoiceDetail,
  InvoiceStatus,
  KsefIncomingSyncResult,
  KsefStatus,
  Member,
  MemberRole,
  PaymentMethod,
  ServiceTemplate,
  VatRate,
} from './api-types';

export async function clientFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const hasBody = options?.body !== undefined;
  const response = await fetch(`${API_BASE}${path}`, {
    credentials: 'include',
    headers: {
      ...(hasBody ? { 'Content-Type': 'application/json' } : {}),
      ...(options?.headers as Record<string, string> | undefined),
    },
    ...options,
  });

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    let message = body;
    try {
      const parsed = JSON.parse(body) as { message?: unknown };
      if (typeof parsed.message === 'string' && parsed.message.length > 0) {
        message = parsed.message;
      }
    } catch {
      // not JSON — use raw body
    }
    throw new Error(message || `Request failed with status ${response.status}`);
  }

  if (response.status === 204) return undefined as T;

  return response.json() as Promise<T>;
}

function getKsefEnvironmentHeaders(): Record<string, string> {
  return {
    [KSEF_ENVIRONMENT_HEADER_NAME]: getActiveKsefEnvironmentFromBrowser(),
  };
}

export async function refreshBrowserSession(nextPath = '/dashboard'): Promise<void> {
  window.location.assign(`/api/session/refresh?next=${encodeURIComponent(nextPath)}`);
}

export async function createCompany(body: CreateCompanyBody): Promise<Company> {
  return clientFetch<Company>('/companies', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export async function lookupCompanyByNip(nip: string): Promise<CompanyLookupResult> {
  const params = new URLSearchParams({ nip });
  return clientFetch<CompanyLookupResult>(`/companies/lookup?${params.toString()}`);
}

export async function updateCompanyKsefSettings(
  companyId: string,
  body: { ksefToken: string; ksefEnv: 'TEST' | 'PRODUCTION' },
): Promise<void> {
  await clientFetch<void>(`/companies/${companyId}/ksef-settings`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  });
}

export async function updateCompanyKsefCredential(
  companyId: string,
  environment: 'TEST' | 'PRODUCTION',
  ksefToken: string,
): Promise<void> {
  await clientFetch<void>(`/companies/${companyId}/ksef-credentials/${environment}`, {
    method: 'PUT',
    body: JSON.stringify({ ksefToken }),
  });
}

export async function updateCompanyKsefDefaultEnvironment(
  companyId: string,
  defaultEnvironment: 'TEST' | 'PRODUCTION',
): Promise<void> {
  await clientFetch<void>(`/companies/${companyId}/ksef-default-environment`, {
    method: 'PATCH',
    body: JSON.stringify({ defaultEnvironment }),
  });
}

export async function updateCompany(
  companyId: string,
  body: Partial<Pick<CreateCompanyBody, 'name' | 'addressLine1' | 'addressLine2' | 'email' | 'phone' | 'bankName' | 'bankAccount'>> & { invoiceNumberPattern?: string | null },
): Promise<Company> {
  return clientFetch<Company>(`/companies/${companyId}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  });
}

export async function createDraft(
  companyId: string,
  body: CreateDraftBody,
): Promise<InvoiceDetail> {
  return clientFetch<InvoiceDetail>(`/companies/${companyId}/invoices`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export async function updateDraft(
  companyId: string,
  invoiceId: string,
  body: CreateDraftBody,
): Promise<InvoiceDetail> {
  return clientFetch<InvoiceDetail>(`/companies/${companyId}/invoices/${invoiceId}`, {
    method: 'PUT',
    body: JSON.stringify(body),
  });
}

export async function issueInvoice(
  companyId: string,
  invoiceId: string,
): Promise<InvoiceDetail> {
  return clientFetch<InvoiceDetail>(
    `/companies/${companyId}/invoices/${invoiceId}/issue`,
    { method: 'POST' },
  );
}

export async function submitKsef(
  companyId: string,
  invoiceId: string,
): Promise<KsefSubmitResponse> {
  return clientFetch<KsefSubmitResponse>(
    `/companies/${companyId}/invoices/${invoiceId}/submit-ksef`,
    { method: 'POST', headers: getKsefEnvironmentHeaders() },
  );
}

export async function sendInvoiceEmail(
  companyId: string,
  invoiceId: string,
): Promise<{ emailId: string }> {
  return clientFetch<{ emailId: string }>(
    `/companies/${companyId}/invoices/${invoiceId}/send-email`,
    { method: 'POST' },
  );
}

export async function createCorrection(
  companyId: string,
  invoiceId: string,
  body?: { reason?: string; impactType?: string },
): Promise<InvoiceDetail> {
  return clientFetch<InvoiceDetail>(
    `/companies/${companyId}/invoices/${invoiceId}/correct`,
    {
      method: 'POST',
      headers: getKsefEnvironmentHeaders(),
      body: body ? JSON.stringify(body) : undefined,
    },
  );
}

export async function revertToDraft(
  companyId: string,
  invoiceId: string,
): Promise<InvoiceDetail> {
  return clientFetch<InvoiceDetail>(
    `/companies/${companyId}/invoices/${invoiceId}/revert-to-draft`,
    { method: 'POST' },
  );
}

export async function recordPayment(
  companyId: string,
  invoiceId: string,
  amount: string,
  receivedAt?: string,
): Promise<InvoiceDetail> {
  return clientFetch<InvoiceDetail>(
    `/companies/${companyId}/invoices/${invoiceId}/payment`,
    { method: 'POST', body: JSON.stringify({ amount, ...(receivedAt ? { receivedAt } : {}) }) },
  );
}

export function pdfUrl(companyId: string, invoiceId: string): string {
  return `${API_BASE}/companies/${companyId}/invoices/${invoiceId}/pdf`;
}

export async function createInvite(
  companyId: string,
  body: { email: string; role?: MemberRole },
): Promise<{ id: string; email: string; role: MemberRole; token: string; expiresAt: string }> {
  return clientFetch(`/companies/${companyId}/invites`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export async function updateMemberRole(
  companyId: string,
  userId: string,
  role: MemberRole,
): Promise<Member> {
  return clientFetch(`/companies/${companyId}/members/${userId}`, {
    method: 'PATCH',
    body: JSON.stringify({ role }),
  });
}

export async function removeMember(companyId: string, userId: string): Promise<void> {
  await clientFetch(`/companies/${companyId}/members/${userId}`, { method: 'DELETE' });
}

export async function updateCompanyBackupPolicy(
  companyId: string,
  body: {
    automaticOnInvoiceIssued?: boolean;
    scheduleMode?: CompanyBackupScheduleMode;
    scheduleHour?: number | null;
    scheduleMinute?: number | null;
    scheduleDayOfWeek?: number | null;
    scheduleTimezone?: string;
  },
): Promise<CompanyBackupSettings> {
  return clientFetch<CompanyBackupSettings>(`/companies/${companyId}/backup-policy`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  });
}

export async function runCompanyBackupPolicy(companyId: string): Promise<CompanyBackupRunResult> {
  return clientFetch<CompanyBackupRunResult>(`/companies/${companyId}/backup-policy/run`, {
    method: 'POST',
  });
}

// ── Service templates ────────────────────────────────────────────────────────

export async function createServiceTemplate(
  companyId: string,
  body: { name: string; unit?: string; vatRate?: string; description?: string },
): Promise<ServiceTemplate> {
  return clientFetch<ServiceTemplate>(`/companies/${companyId}/service-templates`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export async function updateServiceTemplate(
  companyId: string,
  templateId: string,
  body: { name?: string; unit?: string; vatRate?: string; description?: string; isActive?: boolean },
): Promise<ServiceTemplate> {
  return clientFetch<ServiceTemplate>(`/companies/${companyId}/service-templates/${templateId}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  });
}

export async function deleteServiceTemplate(companyId: string, templateId: string): Promise<void> {
  await clientFetch(`/companies/${companyId}/service-templates/${templateId}`, { method: 'DELETE' });
}

// ── Contractor service rates ──────────────────────────────────────────────────

export async function upsertContractorServiceRate(
  companyId: string,
  contractorId: string,
  body: { serviceTemplateId: string; unitNetPrice: string; currency?: string },
): Promise<ContractorServiceRate> {
  return clientFetch<ContractorServiceRate>(`/companies/${companyId}/contractors/${contractorId}/service-rates`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export async function updateContractorServiceRate(
  companyId: string,
  contractorId: string,
  rateId: string,
  body: { unitNetPrice?: string; currency?: string },
): Promise<ContractorServiceRate> {
  return clientFetch<ContractorServiceRate>(`/companies/${companyId}/contractors/${contractorId}/service-rates/${rateId}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  });
}

export async function deleteContractorServiceRate(
  companyId: string,
  contractorId: string,
  rateId: string,
): Promise<void> {
  await clientFetch(`/companies/${companyId}/contractors/${contractorId}/service-rates/${rateId}`, { method: 'DELETE' });
}

export async function createContractor(
  companyId: string,
  body: {
    name: string;
    nip?: string;
    addressLine1?: string;
    addressLine2?: string;
    email?: string;
    phone?: string;
  },
): Promise<Contractor> {
  return clientFetch(`/companies/${companyId}/contractors`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export async function checkKsefStatus(
  companyId: string,
  invoiceId: string,
): Promise<{ status: string; ksefReferenceNumber?: string }> {
  return clientFetch<{ status: string; ksefReferenceNumber?: string }>(
    `/companies/${companyId}/invoices/${invoiceId}/ksef-status`,
    { headers: getKsefEnvironmentHeaders() },
  );
}

export async function syncIncomingFromKsef(
  companyId: string,
  dateFrom: string,
  dateTo: string,
): Promise<KsefIncomingSyncResult> {
  return clientFetch<KsefIncomingSyncResult>(
    `/companies/${companyId}/incoming/ksef-sync`,
    {
      method: 'POST',
      headers: getKsefEnvironmentHeaders(),
      body: JSON.stringify({ dateFrom, dateTo }),
    },
  );
}

export async function updateContractor(
  companyId: string,
  contractorId: string,
  body: {
    name?: string;
    nip?: string;
    pesel?: string;
    addressLine1?: string;
    addressLine2?: string;
    countryCode?: string;
    email?: string;
    phone?: string;
    bankAccount?: string;
    notes?: string;
    isActive?: boolean;
  },
): Promise<Contractor> {
  return clientFetch(`/companies/${companyId}/contractors/${contractorId}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  });
}
