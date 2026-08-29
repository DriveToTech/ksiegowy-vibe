import { cookies } from 'next/headers';
import { API_BASE } from './api-base';
import { getActiveKsefEnvironment } from './auth';
import { ACTIVE_KSEF_ENVIRONMENT_COOKIE_NAME, KSEF_ENVIRONMENT_HEADER_NAME } from './ksef-environment';
import { householdGoalErrorMessage } from './household-goal-errors';
import { householdInvestmentErrorMessage, householdReportErrorMessage } from './household-financial-errors';
import type {
  AuthUser,
  BackupRunStatus,
  BudgetEnvelope,
  Commitment,
  Company,
  CompanyKsefSettings,
  CompanyBackupStatusReadModel,
  CompanyBackupSettings,
  Contractor,
  ContractorServiceRate,
  HouseholdAccount,
  HouseholdCategory,
  HouseholdDashboard,
  HouseholdMember,
  HouseholdGoal,
  HouseholdGoalAutomationRule,
  HouseholdGoalDetail,
  HouseholdGoalMovement,
  HouseholdGoalsOverview,
  HouseholdInvestmentContributions,
  HouseholdInvestmentPortfolio,
  HouseholdInvestmentTransaction,
  HouseholdInvestmentValueHistory,
  HouseholdReportSummary,
  HouseholdTaxReturnReport,
  HouseholdTransaction,
  IncomingInvoiceDetail,
  IncomingInvoiceSummary,
  Invite,
  InvoiceDetail,
  InvoiceSummary,
  Member,
  ServiceTemplate, ReportDetails,
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
  const activeKsefEnvironment = cookieStore.get(ACTIVE_KSEF_ENVIRONMENT_COOKIE_NAME)?.value;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options?.headers as Record<string, string> | undefined),
  };

  const cookieHeader = [
    authToken ? `auth_token=${authToken}` : null,
    refreshToken ? `refresh_token=${refreshToken}` : null,
    activeKsefEnvironment ? `${ACTIVE_KSEF_ENVIRONMENT_COOKIE_NAME}=${activeKsefEnvironment}` : null,
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
    let code: string | undefined;
    try {
      const parsed: unknown = JSON.parse(body);
      if (typeof parsed === 'object' && parsed !== null && 'code' in parsed && typeof parsed.code === 'string') {
        code = parsed.code;
      }
    } catch {
      // Safe household error messages below intentionally hide non-JSON bodies.
    }
    if (path.includes('/goals')) {
      throw new Error(householdGoalErrorMessage(response.status, code));
    }
    if (path.startsWith('/households/') && path.includes('/investments')) {
      throw new Error(householdInvestmentErrorMessage(response.status, code));
    }
    if (path.startsWith('/households/') && path.includes('/reports')) {
      throw new Error(householdReportErrorMessage(response.status, code));
    }
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
  params?: { status?: 'active' | 'inactive' | 'all'; year?: number },
): Promise<Contractor[]> {
  const query = params
    ? '?' + new URLSearchParams({
      ...(params.status ? { status: params.status } : {}),
      ...(params.year !== undefined ? { year: String(params.year) } : {}),
    }).toString()
    : '';
  return apiFetch<Contractor[]>(`/companies/${companyId}/contractors${query}`);
}

export async function getContractor(companyId: string, contractorId: string): Promise<Contractor> {
  return apiFetch<Contractor>(`/companies/${companyId}/contractors/${contractorId}`);
}

export async function getInvoices(
  companyId: string,
  params?: Record<string, string>,
): Promise<{ data: InvoiceSummary[]; total: number; page: number; limit: number }> {
  const qs = params ? '?' + new URLSearchParams(params).toString() : '';
  const activeKsefEnvironment = await getActiveKsefEnvironment();
  return apiFetch(`/companies/${companyId}/invoices${qs}`, {
    headers: { [KSEF_ENVIRONMENT_HEADER_NAME]: activeKsefEnvironment },
  });
}

export async function getInvoice(companyId: string, invoiceId: string): Promise<InvoiceDetail> {
  const activeKsefEnvironment = await getActiveKsefEnvironment();

  return apiFetch<InvoiceDetail>(`/companies/${companyId}/invoices/${invoiceId}`, {
    headers: { [KSEF_ENVIRONMENT_HEADER_NAME]: activeKsefEnvironment },
  });
}

export async function getKsefStatus(
  companyId: string,
  invoiceId: string,
): Promise<{ status: string; ksefReferenceNumber?: string }> {
  const activeKsefEnvironment = await getActiveKsefEnvironment();

  return apiFetch<{ status: string; ksefReferenceNumber?: string }>(
    `/companies/${companyId}/invoices/${invoiceId}/ksef-status`,
    { headers: { [KSEF_ENVIRONMENT_HEADER_NAME]: activeKsefEnvironment } },
  );
}

// ─── Incoming invoice API helpers ────────────────────────────────────────────

export async function getIncomingInvoices(
  companyId: string,
  params?: Record<string, string>,
): Promise<{ data: IncomingInvoiceSummary[]; total: number; page: number; limit: number }> {
  const qs = params ? '?' + new URLSearchParams(params).toString() : '';
  const activeKsefEnvironment = await getActiveKsefEnvironment();

  return apiFetch(`/companies/${companyId}/incoming${qs}`, {
    headers: { [KSEF_ENVIRONMENT_HEADER_NAME]: activeKsefEnvironment },
  });
}

export async function getIncomingInvoice(companyId: string, id: string): Promise<IncomingInvoiceDetail> {
  const activeKsefEnvironment = await getActiveKsefEnvironment();

  return apiFetch(`/companies/${companyId}/incoming/${id}`, {
    headers: { [KSEF_ENVIRONMENT_HEADER_NAME]: activeKsefEnvironment },
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

export async function getReport(companyId: string, reportId: string): Promise<ReportDetails> {
  const activeKsefEnvironment = await getActiveKsefEnvironment();

  return apiFetch<ReportDetails>(`/compliance/${companyId}/reports/${reportId}`, {
    headers: { [KSEF_ENVIRONMENT_HEADER_NAME]: activeKsefEnvironment },
  });
}

// ─── Household (personal mode) API helpers ──────────────────────────────────
// Routes live under apps/api/src/routes/household/* — paths and response
// shapes here are confirmed against those route files, not guessed. Every
// call here is from a dynamic (cookies()-using) server component, so a
// missing endpoint fails at request time, not at build time.

export async function getHouseholdAccounts(householdId: string): Promise<HouseholdAccount[]> {
  return apiFetch<HouseholdAccount[]>(`/households/${householdId}/accounts`);
}

export async function getHouseholdDashboard(householdId: string): Promise<HouseholdDashboard> {
  return apiFetch<HouseholdDashboard>(`/households/${householdId}/dashboard`);
}

export async function getHouseholdTransactions(
  householdId: string,
  params?: Record<string, string>,
): Promise<{ data: HouseholdTransaction[]; total: number; page: number; limit: number; moneyIn: string; moneyOut: string }> {
  const qs = params ? '?' + new URLSearchParams(params).toString() : '';
  return apiFetch(`/households/${householdId}/transactions${qs}`);
}

export async function getHouseholdTransaction(householdId: string, transactionId: string): Promise<HouseholdTransaction> {
  return apiFetch<HouseholdTransaction>(`/households/${householdId}/transactions/${transactionId}`);
}

export async function getHouseholdCategories(householdId: string): Promise<HouseholdCategory[]> {
  return apiFetch<HouseholdCategory[]>(`/households/${householdId}/categories`);
}

export async function getHouseholdEnvelopes(householdId: string): Promise<BudgetEnvelope[]> {
  return apiFetch<BudgetEnvelope[]>(`/households/${householdId}/envelopes`);
}

export async function getHouseholdCommitments(householdId: string): Promise<Commitment[]> {
  return apiFetch<Commitment[]>(`/households/${householdId}/commitments`);
}

export async function getHouseholdCommitment(householdId: string, commitmentId: string): Promise<Commitment> {
  return apiFetch<Commitment>(`/households/${householdId}/commitments/${commitmentId}`);
}

export async function getHouseholdGoalsOverview(householdId: string, asOfDate?: string): Promise<HouseholdGoalsOverview> {
  const query = asOfDate ? `?${new URLSearchParams({ asOfDate }).toString()}` : '';
  return apiFetch<HouseholdGoalsOverview>(`/households/${householdId}/goals/overview${query}`);
}

export async function getHouseholdGoals(householdId: string): Promise<HouseholdGoal[]> {
  return apiFetch<HouseholdGoal[]>(`/households/${householdId}/goals`);
}

export async function getHouseholdGoal(householdId: string, goalId: string): Promise<HouseholdGoalDetail> {
  return apiFetch<HouseholdGoalDetail>(`/households/${householdId}/goals/${goalId}`);
}

export async function getHouseholdGoalMovements(
  householdId: string,
  goalId: string,
  params?: { cursor?: string; limit?: number },
): Promise<{ data: HouseholdGoalMovement[]; nextCursor: string | null }> {
  const query = params ? `?${new URLSearchParams({
    ...(params.cursor ? { cursor: params.cursor } : {}),
    ...(params.limit !== undefined ? { limit: String(params.limit) } : {}),
  }).toString()}` : '';
  return apiFetch(`/households/${householdId}/goals/${goalId}/movements${query}`);
}

export async function getHouseholdGoalAutomationRules(householdId: string, goalId: string): Promise<HouseholdGoalAutomationRule[]> {
  return apiFetch<HouseholdGoalAutomationRule[]>(`/households/${householdId}/goals/${goalId}/automation-rules`);
}

export interface CommitmentAmortizationScheduleEntry {
  month: number;
  payment: string;
  principalPortion: string;
  interestPortion: string;
  remainingBalance: string;
}

/** Loan-only. Only ever call this for a fully-specified LOAN commitment. */
export async function getHouseholdCommitmentAmortizationSchedule(
  householdId: string,
  commitmentId: string,
): Promise<CommitmentAmortizationScheduleEntry[]> {
  return apiFetch<CommitmentAmortizationScheduleEntry[]>(`/households/${householdId}/commitments/${commitmentId}/amortization-schedule`);
}

export async function getHouseholdMembers(householdId: string): Promise<HouseholdMember[]> {
  return apiFetch<HouseholdMember[]>(`/households/${householdId}/members`);
}

export async function getHouseholdInvestmentPortfolio(householdId: string): Promise<HouseholdInvestmentPortfolio> {
  return apiFetch<HouseholdInvestmentPortfolio>(`/households/${householdId}/investments`);
}

export async function getHouseholdInvestmentValueHistory(
  householdId: string,
  params?: { from?: string; to?: string },
): Promise<HouseholdInvestmentValueHistory> {
  const query = params && (params.from || params.to)
    ? `?${new URLSearchParams({ ...(params.from ? { from: params.from } : {}), ...(params.to ? { to: params.to } : {}) }).toString()}`
    : '';
  return apiFetch<HouseholdInvestmentValueHistory>(`/households/${householdId}/investments/value-history${query}`);
}

export async function getHouseholdInvestmentContributions(
  householdId: string,
  params?: { year?: number; annualLimit?: string; annualLimitSource?: string; annualLimitConfirmation?: 'USER_CONFIRMED' },
): Promise<HouseholdInvestmentContributions> {
  const query = params
    ? `?${new URLSearchParams({
      ...(params.year !== undefined ? { year: String(params.year) } : {}),
      ...(params.annualLimit ? { annualLimit: params.annualLimit } : {}),
      ...(params.annualLimitSource ? { annualLimitSource: params.annualLimitSource } : {}),
      ...(params.annualLimitConfirmation ? { annualLimitConfirmation: params.annualLimitConfirmation } : {}),
    }).toString()}`
    : '';
  return apiFetch<HouseholdInvestmentContributions>(`/households/${householdId}/investments/contributions${query}`);
}

export async function getHouseholdInvestmentTransactions(householdId: string, positionId: string): Promise<HouseholdInvestmentTransaction[]> {
  return apiFetch<HouseholdInvestmentTransaction[]>(`/households/${householdId}/investments/${positionId}/transactions`);
}

export async function getHouseholdReportSummary(householdId: string, from: string, to: string): Promise<HouseholdReportSummary> {
  const query = new URLSearchParams({ from, to }).toString();
  return apiFetch<HouseholdReportSummary>(`/households/${householdId}/reports/summary?${query}`);
}

export async function getHouseholdTaxReturnReport(householdId: string, from: string, to: string): Promise<HouseholdTaxReturnReport> {
  const query = new URLSearchParams({ from, to }).toString();
  return apiFetch<HouseholdTaxReturnReport>(`/households/${householdId}/reports/tax-return?${query}`);
}
