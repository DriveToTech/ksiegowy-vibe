import { cookies } from 'next/headers';
import { API_BASE } from './api-base';
import type { KsefEnvironment } from './ksef-environment';
import { KSEF_ENVIRONMENT_HEADER_NAME } from './ksef-environment';
import type {
  AuthUser,
  BackupRunStatus,
  Company,
  CompanyKsefSettings,
  CompanyBackupStatusReadModel,
  CompanyBackupSettings,
  Contractor,
  ContractorServiceRate,
  IncomingInvoiceDetail,
  IncomingInvoiceSummary,
  Invite,
  InvoiceDetail,
  InvoiceSummary,
  Member,
  ServiceTemplate,
} from './api-types';

export type {
  AuthUser,
  BackupRunStatus,
  Company,
  CompanyKsefEnvironment,
  CompanyKsefSettings,
  CompanyBackupStatusReadModel,
  CompanyBackupRunResult,
  CompanyBackupScheduleMode,
  CompanyBackupSettings,
  CompanyGoogleDriveBackupConnection,
  CompanyGoogleDriveBackupPolicy,
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
  KsefStatus,
  KsefSubmitResponse,
  Member,
  MemberRole,
  PaymentMethod,
  PlatformPostgresqlBackupFreshness,
  PlatformPostgresqlBackupFreshnessStatus,
  ServiceTemplate,
  VatRate,
} from './api-types';

// ─── Core fetch helper ───────────────────────────────────────────────────────

async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const cookieStore = await cookies();
  const authToken = cookieStore.get('auth_token')?.value;
  const refreshToken = cookieStore.get('refresh_token')?.value;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options?.headers as Record<string, string> | undefined),
  };

  const cookieHeader = [
    authToken ? `auth_token=${authToken}` : null,
    refreshToken ? `refresh_token=${refreshToken}` : null,
  ].filter((value): value is string => value !== null).join('; ');

  if (cookieHeader) {
    headers['Cookie'] = cookieHeader;
  }

  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers,
    cache: 'no-store',
  });

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`API ${options?.method ?? 'GET'} ${path} failed ${response.status}: ${body}`);
  }

  return response.json() as Promise<T>;
}

// ─── API helpers (Server Components) ────────────────────────────────────────

export async function getCompanies(): Promise<Company[]> {
  return apiFetch<Company[]>('/companies');
}

export async function getCompany(id: string): Promise<Company> {
  return apiFetch<Company>(`/companies/${id}`);
}

export async function getCompanyKsefSettings(companyId: string): Promise<CompanyKsefSettings> {
  return apiFetch<CompanyKsefSettings>(`/companies/${companyId}/ksef-settings`);
}

export async function getActiveCompany(): Promise<{ companies: Company[]; activeCompanyId: string | null }> {
  const cookieStore = await cookies();
  const companies = await getCompanies().catch(() => [] as Company[]);
  const savedId = cookieStore.get('active_company')?.value;
  const activeCompanyId = companies.find((company) => company.id === savedId)?.id ?? companies[0]?.id ?? null;

  return { companies, activeCompanyId };
}

export async function getCurrentUser(): Promise<AuthUser> {
  const data = await apiFetch<{ authenticated: boolean; user: AuthUser }>('/auth/me');
  return data.user;
}

export async function getContractors(
  companyId: string,
  environment: KsefEnvironment,
  params?: { status?: 'active' | 'inactive' | 'all'; year?: number },
): Promise<Contractor[]> {
  const query = params
    ? '?' + new URLSearchParams({
      ...(params.status ? { status: params.status } : {}),
      ...(params.year !== undefined ? { year: String(params.year) } : {}),
    }).toString()
    : '';
  return apiFetch<Contractor[]>(`/companies/${companyId}/contractors${query}`, {
    headers: { [KSEF_ENVIRONMENT_HEADER_NAME]: environment },
  });
}

export async function getContractor(companyId: string, contractorId: string): Promise<Contractor> {
  return apiFetch<Contractor>(`/companies/${companyId}/contractors/${contractorId}`);
}

export async function getInvoices(
  companyId: string,
  environment: KsefEnvironment,
  params?: Record<string, string>,
): Promise<{ data: InvoiceSummary[]; total: number; page: number; limit: number }> {
  const qs = params ? '?' + new URLSearchParams(params).toString() : '';
  return apiFetch(`/companies/${companyId}/invoices${qs}`, {
    headers: { [KSEF_ENVIRONMENT_HEADER_NAME]: environment },
  });
}

export async function getInvoice(companyId: string, invoiceId: string, environment: KsefEnvironment): Promise<InvoiceDetail> {
  return apiFetch<InvoiceDetail>(`/companies/${companyId}/invoices/${invoiceId}`, {
    headers: { [KSEF_ENVIRONMENT_HEADER_NAME]: environment },
  });
}

export async function getKsefStatus(
  companyId: string,
  invoiceId: string,
  environment: KsefEnvironment,
): Promise<{ status: string; ksefReferenceNumber?: string }> {
  return apiFetch<{ status: string; ksefReferenceNumber?: string }>(
    `/companies/${companyId}/invoices/${invoiceId}/ksef-status`,
    { headers: { [KSEF_ENVIRONMENT_HEADER_NAME]: environment } },
  );
}

// ─── Incoming invoice API helpers ────────────────────────────────────────────

export async function getIncomingInvoices(
  companyId: string,
  environment: KsefEnvironment,
  params?: Record<string, string>,
): Promise<{ data: IncomingInvoiceSummary[]; total: number; page: number; limit: number }> {
  const qs = params ? '?' + new URLSearchParams(params).toString() : '';

  return apiFetch(`/companies/${companyId}/incoming${qs}`, {
    headers: { [KSEF_ENVIRONMENT_HEADER_NAME]: environment },
  });
}

export async function getIncomingInvoice(companyId: string, id: string, environment: KsefEnvironment): Promise<IncomingInvoiceDetail> {
  return apiFetch(`/companies/${companyId}/incoming/${id}`, {
    headers: { [KSEF_ENVIRONMENT_HEADER_NAME]: environment },
  });
}

export async function getBackupStatus(): Promise<{ gdrive: BackupRunStatus | null; icloud: BackupRunStatus | null }> {
  return apiFetch('/backup/status');
}

export async function getCompanyBackupPolicy(companyId: string): Promise<CompanyBackupSettings> {
  return apiFetch<CompanyBackupSettings>(`/companies/${companyId}/backup-policy`);
}

export async function getCompanyBackupStatus(companyId: string): Promise<CompanyBackupStatusReadModel> {
  return apiFetch<CompanyBackupStatusReadModel>(`/companies/${companyId}/backup-status`);
}

export async function getMembers(companyId: string): Promise<Member[]> {
  return apiFetch(`/companies/${companyId}/members`);
}

export async function getInvites(companyId: string): Promise<Invite[]> {
  return apiFetch(`/companies/${companyId}/invites`);
}

export async function getServiceTemplates(companyId: string, includeInactive = false): Promise<ServiceTemplate[]> {
  const qs = includeInactive ? '?includeInactive=true' : '';
  return apiFetch(`/companies/${companyId}/service-templates${qs}`);
}

export async function getContractorServiceRates(companyId: string, contractorId: string): Promise<ContractorServiceRate[]> {
  return apiFetch(`/companies/${companyId}/contractors/${contractorId}/service-rates`);
}
