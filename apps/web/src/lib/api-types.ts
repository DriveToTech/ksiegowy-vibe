export type InvoiceStatus =
  | 'DRAFT'
  | 'ISSUED'
  | 'CANCELLED';

export type CompanyKsefEnvironment = 'TEST' | 'PRODUCTION';

export type KsefStatus = 'not_submitted' | 'pending' | 'accepted' | 'rejected';

export type InvoiceCorrectionMode = 'CANCELLATION' | 'FORMAL';

export type PaymentMethod = 'BANK_TRANSFER' | 'CASH' | 'CARD' | 'OTHER';

export type VatRate = '23' | '8' | '5' | '0' | 'zw' | 'np' | 'oo';

export interface Company {
  id: string;
  name: string;
  nip: string;
  addressLine1: string;
  addressLine2: string | null;
  email: string | null;
  phone: string | null;
  bankName: string | null;
  bankAccount: string | null;
  vatStatus: string;
  ksefEnv: string;
  invoiceNumberPattern: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AuthUser {
  id: string;
  email: string;
  name: string | null;
  avatarUrl: string | null;
}

export interface CompanyLookupResult {
  name: string;
  nip: string;
  addressLine1: string;
  addressLine2: string | null;
  vatStatus: 'ACTIVE' | 'EXEMPT' | 'NO_VAT';
}

export interface Contractor {
  id: string;
  companyId: string;
  name: string;
  nip: string | null;
  pesel: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  countryCode: string;
  email: string | null;
  phone: string | null;
  bankAccount: string | null;
  notes: string | null;
  isActive: boolean;
  turnover: string;
  turnoverYear: number;
  createdAt: string;
  updatedAt: string;
}

export interface ContractorSummaryDocument {
  id: string;
  invoiceNumber: string | null;
  invoiceType: 'VAT' | 'KOR' | 'ZAL' | 'ROZ' | 'UPR';
  issueDate: string;
  totalGross: string;
}

export interface ContractorSummary {
  contractorId: string;
  year: number;
  turnover: string;
  paidThisYear: string;
  outstanding: string;
  recentDocuments: ContractorSummaryDocument[];
}

export interface InvoiceLine {
  id: string;
  position: number;
  name: string;
  unit: string | null;
  quantity: string;
  unitNetPrice: string;
  vatRate: VatRate;
  netValue: string;
  vatValue: string;
  grossValue: string;
}

export interface VatBreakdownEntry {
  id: string;
  vatRate: string;
  netAmount: string;
  vatAmount: string;
}

export interface InvoiceSummary {
  id: string;
  companyId: string;
  environment: CompanyKsefEnvironment;
  contractorId: string | null;
  invoiceNumber: string | null;
  status: InvoiceStatus;
  invoiceType: string;
  issueDate: string;
  totalNet: string;
  totalVat: string;
  totalGross: string;
  currency: string;
  ksefStatus: KsefStatus;
  issuedAt: string | null;
  createdAt: string;
  updatedAt: string;
  contractor?: { id: string; name: string; nip: string | null } | null;
}

export interface InvoiceDetail {
  id: string;
  companyId: string;
  environment: CompanyKsefEnvironment;
  contractorId: string | null;
  invoiceNumber: string | null;
  status: InvoiceStatus;
  invoiceType: string;
  issueDate: string;
  saleDate: string | null;
  placeOfIssue: string;
  sellerName: string | null;
  sellerNip: string | null;
  buyerName: string | null;
  buyerNip: string | null;
  totalNet: string;
  totalVat: string;
  totalGross: string;
  paymentReceived: string;
  paymentMethod: PaymentMethod;
  paymentDueDate: string | null;
  currency: string;
  notes: string | null;
  correctedInvoiceNumber: string | null;
  correctionMode: InvoiceCorrectionMode | null;
  correctionReason: string | null;
  correctionImpactType: string | null;
  correctedInvoice: { id: string; invoiceNumber: string | null; issueDate: string; ksefReference: string | null } | null;
  ksefStatus: KsefStatus;
  ksefReference: string | null;
  issuedAt: string | null;
  createdAt: string;
  updatedAt: string;
  lines: InvoiceLine[];
  vatBreakdown: VatBreakdownEntry[];
}

export interface CreateDraftBody {
  contractorId?: string;
  issueDate: string;
  saleDate?: string;
  paymentDueDate?: string;
  paymentMethod?: PaymentMethod;
  currency?: string;
  notes?: string;
  lines: Array<{
    position?: number;
    name: string;
    unit?: string;
    quantity: string;
    unitNetPrice: string;
    vatRate: VatRate;
  }>;
}

export interface KsefSubmitResponse {
  referenceNumber: string;
  submissionId: string;
  ksefReference?: string;
}

export interface CreateCompanyBody {
  name: string;
  nip: string;
  addressLine1: string;
  addressLine2?: string;
  email?: string;
  phone?: string;
  bankName?: string;
  bankAccount?: string;
  vatStatus?: 'ACTIVE' | 'EXEMPT' | 'NO_VAT';
  ksefEnv?: CompanyKsefEnvironment;
}

export interface CompanyKsefCredentialStatus {
  environment: CompanyKsefEnvironment;
  hasToken: boolean;
}

export interface CompanyKsefSettings {
  defaultEnvironment: CompanyKsefEnvironment;
  credentials: CompanyKsefCredentialStatus[];
}

export type IncomingInvoiceStatus =
  | 'UPLOADED'
  | 'OCR_PROCESSING'
  | 'OCR_DONE'
  | 'OCR_FAILED'
  | 'CONFIRMED'
  | 'REJECTED'
  | 'KSEF_SYNCED';

export interface KsefIncomingSyncResult {
  syncId: string;
  created: number;
  linked: number;
  skipped: number;
}

export interface IncomingInvoiceSummary {
  id: string;
  companyId: string;
  environment: CompanyKsefEnvironment;
  contractorId: string | null;
  status: IncomingInvoiceStatus;
  sellerName: string | null;
  sellerNip: string | null;
  invoiceNumber: string | null;
  issueDate: string | null;
  totalGross: string | null;
  currency: string | null;
  ocrError: string | null;
  ksefReference: string | null;
  ksefEnvironment: CompanyKsefEnvironment | null;
  createdAt: string;
  updatedAt: string;
  contractor: { id: string; name: string; nip: string | null } | null;
}

export interface IncomingInvoiceDetail extends Omit<IncomingInvoiceSummary, 'totalGross'> {
  sellerAddress: string | null;
  buyerName: string | null;
  buyerNip: string | null;
  saleDate: string | null;
  totalNet: string | null;
  totalVat: string | null;
  totalGross: string | null;
  paymentMethod: string | null;
  dueDate: string | null;
  bankAccount: string | null;
  notes: string | null;
  ocrConfidence: number | null;
  ocrModel: string | null;
  ksefReference: string | null;
  confirmedAt: string | null;
  fileRecords: Array<{
    id: string;
    type: string;
    mimeType: string;
    sizeBytes: number;
    createdAt: string;
  }>;
}

export interface ServiceTemplate {
  id: string;
  companyId: string;
  name: string;
  unit: string;
  vatRate: string;
  description: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ContractorServiceRate {
  id: string;
  contractorId: string;
  serviceTemplateId: string;
  unitNetPrice: string;
  currency: string;
  createdAt: string;
  updatedAt: string;
  serviceTemplate: {
    id: string;
    name: string;
    unit: string;
    vatRate: string;
    description: string | null;
  };
}

export interface BackupRunStatus {
  provider: string;
  status: string;
  filesCount: number;
  bytesTotal: string;
  errorMessage: string | null;
  startedAt: string;
  finishedAt: string | null;
}

export type CompanyBackupScheduleMode = 'MANUAL' | 'DAILY' | 'WEEKLY';

export interface CompanyGoogleDriveBackupConnection {
  isConnected: boolean;
  requiresReauthorization: boolean;
  expiresAt: string | null;
  lastBackupAt: string | null;
}

export interface CompanyGoogleDriveBackupPolicy {
  provider: 'GOOGLE_DRIVE';
  automaticOnInvoiceIssued: boolean;
  scheduleMode: CompanyBackupScheduleMode;
  scheduleHour: number | null;
  scheduleMinute: number | null;
  scheduleDayOfWeek: number | null;
  scheduleTimezone: string;
  updatedAt: string;
}

export type PlatformPostgresqlBackupFreshnessStatus = 'FRESH' | 'STALE' | 'MISSING' | 'INCOMPLETE';

export type CompanyBackupOverallStatus = 'HEALTHY' | 'DEGRADED' | 'CRITICAL' | 'UNKNOWN';

export type CompanyBackupSeverity = 'INFO' | 'WARNING' | 'ERROR' | 'UNKNOWN';

export type PlatformPostgresqlBackupStatus = 'FRESH' | 'STALE' | 'MISSING' | 'INCOMPLETE' | 'UNAVAILABLE';

export type PlatformPostgresqlBackupReasonCode =
  | 'OK'
  | 'ARTIFACT_TOO_OLD'
  | 'ARTIFACT_NOT_FOUND'
  | 'ARTIFACT_SET_INCOMPLETE'
  | 'SOURCE_UNAVAILABLE';

export interface PlatformPostgresqlBackupFreshness {
  status: PlatformPostgresqlBackupFreshnessStatus;
  latestArtifactTimestamp: string | null;
  latestArtifactCreatedAt: string | null;
  latestArtifactAgeHours: number | null;
  maxAllowedAgeHours: number;
  checkedAt: string;
}

export interface CompanyBackupSettings {
  companyId: string;
  provider: 'GOOGLE_DRIVE';
  googleDrive: CompanyGoogleDriveBackupConnection;
  policy: CompanyGoogleDriveBackupPolicy;
  platformPostgresqlBackupFreshness: PlatformPostgresqlBackupFreshness;
}

export interface CompanyBackupRunResult {
  backupRunId: string;
  filesCount: number;
  bytesTotal: number;
  startedAt: string;
  finishedAt: string;
  triggerSource: string;
}

export type GoogleDriveConnectionStatus = 'CONNECTED' | 'DISCONNECTED' | 'REAUTHORIZATION_REQUIRED';

export type BackupErrorCode = 'REAUTHORIZATION_REQUIRED';

export interface CompanyBackupStatusReadModel {
  companyId: string;
  evaluatedAt: string;
  overallStatus: CompanyBackupOverallStatus;
  platformPostgresql: {
    status: PlatformPostgresqlBackupStatus;
    severity: CompanyBackupSeverity;
    isPlatformManaged: true;
    summary: string;
    latestArtifactTimestamp: string | null;
    latestArtifactCreatedAt: string | null;
    latestArtifactAgeHours: number | null;
    maxAllowedAgeHours: number;
    checkedAt: string;
    reasonCode: PlatformPostgresqlBackupReasonCode;
  };
  companyGoogleDrive: {
    connectionStatus: GoogleDriveConnectionStatus;
    lastBackupAt: string | null;
    isPolicyAutomationEnabled: boolean;
    summary: string;
  };
}

export type MemberRole = 'ADMIN' | 'ACCOUNTANT' | 'VIEWER';

export interface Member {
  userId: string;
  role: MemberRole;
  createdAt: string;
  user: { id: string; email: string; name: string | null; avatarUrl: string | null };
}

export interface Invite {
  id: string;
  email: string;
  role: MemberRole;
  expiresAt: string;
  createdAt: string;
}

// ── Household (personal mode) ────────────────────────────────────────────────
// Shapes mirror services/household's Phase 1 API responses, per the personal-mode
// implementation plan's Domain Model section. Backend routes are being built in
// parallel — confirm these against the actual /households/* responses once live.

export type HouseholdRole = 'OWNER' | 'MEMBER';

export interface HouseholdSummary {
  id: string;
  role: HouseholdRole;
  name: string;
}

export type HouseholdAccountType = 'CURRENT' | 'SAVINGS' | 'CREDIT_CARD' | 'CASH';
export type HouseholdAccountVisibility = 'SHARED' | 'PRIVATE';

export interface HouseholdAccount {
  id: string;
  householdId: string;
  name: string;
  type: HouseholdAccountType;
  accountNumberMask: string | null;
  visibility: HouseholdAccountVisibility;
  ownerUserId: string | null;
  openingBalance: string;
  balance: string;
  creditLimit: string | null;
  statementDay: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface HouseholdCategory {
  id: string;
  householdId: string;
  name: string;
  parentCategoryId: string | null;
}

export type HouseholdTransactionCategorizationSource = 'MANUAL' | 'RULE' | 'IMPORT';

export interface HouseholdTransaction {
  id: string;
  householdId: string;
  accountId: string;
  categoryId: string | null;
  payee: string;
  payerUserId: string | null;
  bankDescription: string | null;
  amount: string;
  date: string;
  tag: string | null;
  note: string | null;
  isRecurring: boolean;
  commitmentId: string | null;
  categorizationSource: HouseholdTransactionCategorizationSource;
  importBatchId: string | null;
  transferGroupId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateHouseholdTransactionBody {
  accountId: string;
  categoryId?: string;
  payee: string;
  payerUserId?: string;
  amount: string;
  date: string;
  tag?: string;
  note?: string;
  isRecurring?: boolean;
  applyRuleToFuturePayments?: boolean;
}

export interface CreateHouseholdTransferBody {
  fromAccountId: string;
  toAccountId: string;
  amount: string;
  date: string;
  payee?: string;
  note?: string;
}

export type CommitmentType = 'INSURANCE' | 'LOAN' | 'SUBSCRIPTION' | 'UTILITY' | 'OTHER';
export type CommitmentBillingFrequency = 'MONTHLY' | 'QUARTERLY' | 'YEARLY';
export type CommitmentStatus = 'ACTIVE' | 'PAUSED' | 'CANCELLED';

export interface CommitmentCoverBreakdownEntry {
  label: string;
  amount: string;
}

export interface Commitment {
  id: string;
  householdId: string;
  accountId: string;
  type: CommitmentType;
  name: string;
  amount: string;
  billingFrequency: CommitmentBillingFrequency;
  nextDueDate: string;
  status: CommitmentStatus;
  provider: string | null;
  policyNumber: string | null;
  insuredObject: string | null;
  sumInsured: string | null;
  coverBreakdown: CommitmentCoverBreakdownEntry[] | null;
  principal: string | null;
  outstandingBalance: string | null;
  interestRate: string | null;
  termMonths: number | null;
  isAutomatic: boolean;
  lastUsedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateCommitmentBody {
  accountId: string;
  type: CommitmentType;
  name: string;
  amount: string;
  billingFrequency: CommitmentBillingFrequency;
  nextDueDate: string;
  provider?: string;
  policyNumber?: string;
  insuredObject?: string;
  sumInsured?: string;
  principal?: string;
  outstandingBalance?: string;
  interestRate?: string;
  termMonths?: number;
  isAutomatic?: boolean;
}

export interface UpdateCommitmentBody {
  name?: string;
  amount?: string;
  billingFrequency?: CommitmentBillingFrequency;
  nextDueDate?: string;
  status?: CommitmentStatus;
  outstandingBalance?: string;
  isAutomatic?: boolean;
}

export interface BudgetEnvelope {
  id: string;
  householdId: string;
  categoryId: string;
  categoryName: string;
  monthlyLimit: string;
  spent: string;
  remaining: string;
  createdAt: string;
  updatedAt: string;
}

export interface HouseholdDashboard {
  safeToSpend: string;
  moneyIn: string;
  moneyOut: string;
  netWorth: string;
  netWorthChangePercent: string;
  savingsRatePercent: string;
  savingsAmountThisMonth: string;
  accounts: HouseholdAccount[];
  envelopes: BudgetEnvelope[];
  upcomingCommitments: Array<{ id: string; name: string; type: string; amount: string; nextDueDate: string; daysUntilDue: number }>;
  monthlyInOut: Array<{ month: string; income: string; expense: string }>;
}

export interface HouseholdMember {
  userId: string;
  role: HouseholdRole;
  displayName: string | null;
  userEmail: string;
}

export interface ReportDetails {
  id: string;
  companyId: string;
  environment: CompanyKsefEnvironment;
  createdAt: string;
}
