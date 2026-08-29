import { API_BASE } from './api-base';
import { householdGoalErrorMessage } from './household-goal-errors';
import { householdInvestmentErrorMessage, householdReportErrorMessage } from './household-financial-errors';
import { buildHouseholdReportExportQuery } from './household-report-period';
import { householdTransactionErrorMessage } from './household-transaction-errors';
import {
  getActiveKsefEnvironmentFromBrowser,
  KSEF_ENVIRONMENT_HEADER_NAME,
} from './ksef-environment';
import type {
  Commitment,
  CompanyBackupRunResult,
  CompanyBackupScheduleMode,
  CompanyBackupSettings,
  Company,
  CompanyLookupResult,
  Contractor,
  ContractorServiceRate,
  ContractorSummary,
  CreateCommitmentBody,
  CreateCompanyBody,
  CreateDraftBody,
  CreateHouseholdTransactionBody,
  CreateHouseholdTransferBody,
  CreateHouseholdGoalAutomationRuleBody,
  CreateHouseholdGoalBody,
  CreateHouseholdGoalMovementBody,
  HouseholdGoal,
  HouseholdGoalAutomationRule,
  HouseholdGoalDetail,
  HouseholdGoalMovementResult,
  HouseholdInvestmentPosition,
  HouseholdInvestmentTransactionResult,
  CreateHouseholdInvestmentPositionBody,
  CreateHouseholdInvestmentTransactionBody,
  UpdateHouseholdInvestmentPositionBody,
  HouseholdAccount,
  HouseholdAccountType,
  HouseholdAccountVisibility,
  HouseholdSummary,
  HouseholdTransaction,
  InvoiceDetail,
  KsefIncomingSyncResult,
  KsefSubmitResponse,
  Member,
  MemberRole,
  ServiceTemplate,
  UpdateCommitmentBody,
  UpdateHouseholdTransactionBody,
  UpdateHouseholdGoalAutomationRuleBody,
  UpdateHouseholdGoalBody,
} from './api-types';

export class ApiClientError extends Error {
  statusCode: number;
  code?: string;

  constructor(message: string, statusCode: number, code?: string) {
    super(message);
    this.name = 'ApiClientError';
    this.statusCode = statusCode;
    this.code = code;
  }
}

interface ApiClientErrorResponseBody {
  message?: unknown;
  code?: unknown;
}

export type {
  BackupErrorCode,
  BudgetEnvelope,
  Commitment,
  CommitmentBillingFrequency,
  CommitmentCoverBreakdownEntry,
  CommitmentStatus,
  CommitmentType,
  CompanyBackupRunResult,
  CompanyBackupScheduleMode,
  CompanyBackupSettings,
  Company,
  CompanyKsefEnvironment,
  CompanyKsefSettings,
  Contractor,
  ContractorServiceRate,
  ContractorSummary,
  CreateCommitmentBody,
  CreateCompanyBody,
  CreateDraftBody,
  CreateHouseholdTransactionBody,
  CreateHouseholdTransferBody,
  HouseholdAccount,
  HouseholdAccountType,
  HouseholdAccountVisibility,
  HouseholdCategory,
  HouseholdDashboard,
  HouseholdMember,
  HouseholdRole,
  HouseholdSummary,
  HouseholdTransaction,
  HouseholdTransactionCategorizationSource,
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
  UpdateCommitmentBody,
  UpdateHouseholdTransactionBody,
  VatRate,
} from './api-types';

export async function clientFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const hasBody = options?.body !== undefined;
  const requestHeaders = options?.headers as Record<string, string> | undefined;
  const response = await fetch(`${API_BASE}${path}`, {
    credentials: 'include',
    ...options,
    headers: {
      ...(hasBody ? { 'Content-Type': 'application/json' } : {}),
      ...requestHeaders,
    },
  });

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    let message = body;
    let code: string | undefined;

    try {
      const parsed = JSON.parse(body) as ApiClientErrorResponseBody;
      if (typeof parsed.message === 'string' && parsed.message.length > 0) {
        message = parsed.message;
      }
      if (typeof parsed.code === 'string' && parsed.code.length > 0) {
        code = parsed.code;
      }
    } catch {
      // not JSON — use raw body
    }

    if (path.includes('/goals')) {
      throw new ApiClientError(householdGoalErrorMessage(response.status, code), response.status, code);
    }

    if (path.startsWith('/households/') && path.includes('/investments')) {
      throw new ApiClientError(householdInvestmentErrorMessage(response.status, code), response.status, code);
    }

    if (path.includes('/households/') && path.includes('/transactions')) {
      throw new ApiClientError(householdTransactionErrorMessage(response.status, code), response.status, code);
    }

    if (path.startsWith('/households/') && path.includes('/reports')) {
      throw new ApiClientError(householdReportErrorMessage(response.status, code), response.status, code);
    }

    throw new ApiClientError(message || `Request failed with status ${response.status}`, response.status, code);
  }

  if (response.status === 204) return undefined as T;

  return response.json() as Promise<T>;
}

function getKsefEnvironmentHeaders(): Record<string, string> {
  return {
    [KSEF_ENVIRONMENT_HEADER_NAME]: getActiveKsefEnvironmentFromBrowser(),
  };
}

// '/' rather than a hardcoded protected route: the home page resolves the
// mode-aware landing path via landingPathForSession() once a session exists.
export async function refreshBrowserSession(nextPath = '/'): Promise<void> {
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
    headers: getKsefEnvironmentHeaders(),
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
    headers: getKsefEnvironmentHeaders(),
    body: JSON.stringify(body),
  });
}

export async function issueInvoice(
  companyId: string,
  invoiceId: string,
): Promise<InvoiceDetail> {
  return clientFetch<InvoiceDetail>(
    `/companies/${companyId}/invoices/${invoiceId}/issue`,
    { method: 'POST', headers: getKsefEnvironmentHeaders() },
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
    { method: 'POST', headers: getKsefEnvironmentHeaders() },
  );
}

export async function createCorrection(
  companyId: string,
  invoiceId: string,
  body?: { reason?: string; impactType?: string; correctionMode?: 'cancellation' | 'formal'; correctedInvoiceNumber?: string },
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
    { method: 'POST', headers: getKsefEnvironmentHeaders() },
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
    {
      method: 'POST',
      headers: getKsefEnvironmentHeaders(),
      body: JSON.stringify({ amount, ...(receivedAt ? { receivedAt } : {}) })
    },
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

export async function getContractorSummary(
  companyId: string,
  contractorId: string,
  year?: number,
): Promise<ContractorSummary> {
  const params = year ? `?${new URLSearchParams({ year: String(year) }).toString()}` : '';
  return clientFetch<ContractorSummary>(`/companies/${companyId}/contractors/${contractorId}/summary${params}`);
}

// ─── Household (personal mode) mutations ────────────────────────────────────
// Routes live under apps/api/src/routes/household/* — see lib/api.ts for the
// matching note on the read-side helpers.

export async function createHousehold(body: { name: string }): Promise<HouseholdSummary> {
  return clientFetch<HouseholdSummary>('/households', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export async function createHouseholdAccount(
  householdId: string,
  body: {
    name: string;
    type: HouseholdAccountType;
    visibility: HouseholdAccountVisibility;
    accountNumberMask?: string;
    openingBalance?: string;
    creditLimit?: string;
    statementDay?: number;
  },
): Promise<HouseholdAccount> {
  return clientFetch<HouseholdAccount>(`/households/${householdId}/accounts`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export async function createHouseholdTransaction(
  householdId: string,
  body: CreateHouseholdTransactionBody,
): Promise<HouseholdTransaction> {
  return clientFetch<HouseholdTransaction>(`/households/${householdId}/transactions`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export async function updateHouseholdTransaction(
  householdId: string,
  transactionId: string,
  body: UpdateHouseholdTransactionBody,
): Promise<HouseholdTransaction> {
  return clientFetch<HouseholdTransaction>(`/households/${householdId}/transactions/${transactionId}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  });
}

export async function deleteHouseholdTransaction(householdId: string, transactionId: string): Promise<void> {
  await clientFetch(`/households/${householdId}/transactions/${transactionId}`, { method: 'DELETE' });
}

/**
 * Matches POST /households/:id/transfers' actual body (see
 * transactions.routes.ts's createTransferBodySchema) — returns the two
 * linked transaction rows the backend creates (source leg, destination leg).
 */
export async function createHouseholdTransfer(
  householdId: string,
  body: CreateHouseholdTransferBody,
): Promise<[HouseholdTransaction, HouseholdTransaction]> {
  return clientFetch<[HouseholdTransaction, HouseholdTransaction]>(`/households/${householdId}/transfers`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export async function createCommitment(householdId: string, body: CreateCommitmentBody): Promise<Commitment> {
  return clientFetch<Commitment>(`/households/${householdId}/commitments`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export async function updateCommitment(
  householdId: string,
  commitmentId: string,
  body: UpdateCommitmentBody,
): Promise<Commitment> {
  return clientFetch<Commitment>(`/households/${householdId}/commitments/${commitmentId}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  });
}

export async function createHouseholdGoal(householdId: string, body: CreateHouseholdGoalBody): Promise<HouseholdGoal> {
  return clientFetch<HouseholdGoal>(`/households/${householdId}/goals`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export async function updateHouseholdGoal(
  householdId: string,
  goalId: string,
  body: UpdateHouseholdGoalBody,
): Promise<HouseholdGoalDetail> {
  return clientFetch<HouseholdGoalDetail>(`/households/${householdId}/goals/${goalId}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  });
}

export async function createHouseholdGoalMovement(
  householdId: string,
  goalId: string,
  body: CreateHouseholdGoalMovementBody,
): Promise<HouseholdGoalMovementResult> {
  return clientFetch<HouseholdGoalMovementResult>(`/households/${householdId}/goals/${goalId}/transfers`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export async function createHouseholdGoalAutomationRule(
  householdId: string,
  goalId: string,
  body: CreateHouseholdGoalAutomationRuleBody,
): Promise<HouseholdGoalAutomationRule> {
  return clientFetch<HouseholdGoalAutomationRule>(`/households/${householdId}/goals/${goalId}/automation-rules`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export async function updateHouseholdGoalAutomationRule(
  householdId: string,
  goalId: string,
  ruleId: string,
  body: UpdateHouseholdGoalAutomationRuleBody,
): Promise<HouseholdGoalAutomationRule> {
  return clientFetch<HouseholdGoalAutomationRule>(`/households/${householdId}/goals/${goalId}/automation-rules/${ruleId}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  });
}

export async function createHouseholdInvestmentPosition(
  householdId: string,
  body: CreateHouseholdInvestmentPositionBody,
): Promise<HouseholdInvestmentPosition> {
  return clientFetch<HouseholdInvestmentPosition>(`/households/${householdId}/investments`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export async function updateHouseholdInvestmentPosition(
  householdId: string,
  positionId: string,
  body: UpdateHouseholdInvestmentPositionBody,
): Promise<HouseholdInvestmentPosition> {
  return clientFetch<HouseholdInvestmentPosition>(`/households/${householdId}/investments/${positionId}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  });
}

export async function createHouseholdInvestmentTransaction(
  householdId: string,
  positionId: string,
  body: CreateHouseholdInvestmentTransactionBody,
): Promise<HouseholdInvestmentTransactionResult> {
  return clientFetch<HouseholdInvestmentTransactionResult>(`/households/${householdId}/investments/${positionId}/transactions`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export async function voidHouseholdInvestmentTransaction(
  householdId: string,
  positionId: string,
  transactionId: string,
): Promise<HouseholdInvestmentTransactionResult> {
  return clientFetch<HouseholdInvestmentTransactionResult>(`/households/${householdId}/investments/${positionId}/transactions/${transactionId}/void`, {
    method: 'POST',
  });
}

export function buildHouseholdReportExportPath(
  householdId: string,
  from: string,
  to: string,
  format: 'csv' | 'pdf',
): string {
  return `/households/${encodeURIComponent(householdId)}/reports/export?${buildHouseholdReportExportQuery(from, to, format)}`;
}

export async function downloadHouseholdReport(
  householdId: string,
  from: string,
  to: string,
  format: 'csv' | 'pdf',
): Promise<Blob> {
  const path = buildHouseholdReportExportPath(householdId, from, to, format);
  const response = await fetch(`${API_BASE}${path}`, { credentials: 'include' });
  if (!response.ok) {
    const body = await response.text().catch(() => '');
    let code: string | undefined;
    try {
      const parsed: unknown = JSON.parse(body);
      if (typeof parsed === 'object' && parsed !== null && 'code' in parsed && typeof parsed.code === 'string') code = parsed.code;
    } catch {
      // Export errors are intentionally mapped to safe messages below.
    }
    throw new ApiClientError(householdReportErrorMessage(response.status, code), response.status, code);
  }
  return response.blob();
}

export async function deleteHouseholdGoalAutomationRule(householdId: string, goalId: string, ruleId: string): Promise<void> {
  await clientFetch<void>(`/households/${householdId}/goals/${goalId}/automation-rules/${ruleId}`, { method: 'DELETE' });
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
