export type AdvisorProvider = 'OPENROUTER' | 'OPENAI' | 'ANTHROPIC' | 'OLLAMA';
export type AdvisorEnvironment = 'TEST' | 'PRODUCTION';
export type AdvisorConnectorClient = 'CHATGPT' | 'CLAUDE';

export interface AdvisorScope {
  questionKind: 'records' | 'tax';
  period: string;
  includeRecords: boolean;
  documentId?: string | undefined;
  documentKind?: 'outgoing' | 'incoming' | undefined;
  contractorId?: string | undefined;
}

export interface AdvisorEvidence {
  id: string;
  kind: 'outgoing' | 'incoming';
  title: string;
  status: string;
  currency: string;
  gross: string | null;
  vat: string | null;
  updatedAt: string;
}

export interface AdvisorCalculation {
  currency: string;
  issuedGross: string;
  issuedVat: string;
  acceptedGross: string;
  /** Gross of invoices rejected by KSeF and never accepted afterwards; not a tax figure. */
  rejectedGross: string;
  invoiceCount: number;
}

export interface AdvisorContractorBalance {
  contractorId: string;
  name: string;
  period: string;
  balances: { currency: string; currentOutstanding: string; recordedPayments: string }[];
}

export type AdvisorInsightView = 'dashboard' | 'invoices' | 'incoming' | 'contractors';
export interface AdvisorInsight {
  key: string;
  version: number;
  title: string;
  description: string;
  evidence: { kind: 'outgoing' | 'incoming'; id: string; title: string }[];
}

export interface AdvisorTaxSource {
  id: string;
  title: string;
  url: string;
  section: string;
  effectiveFrom: string;
  effectiveUntil: string;
  reviewedAt: string;
  reviewExpiresAt: string;
  /** AI models only; never a qualified human review. */
  reviewedBy: string;
  reviewMethod: 'ai';
  excerpt: string;
}

/**
 * `declined`: the question is outside the supported VAT/invoice scope. `shortAnswer` states why, `explanation` states what the advisor can help with;
 * assumptions, questions, evidence, sources and calculations are empty.
 */
export type AdvisorAnswerStatus = 'answered' | 'needs_clarification' | 'insufficient_evidence' | 'declined';

export interface AdvisorAnswer {
  status: AdvisorAnswerStatus;
  shortAnswer: string;
  explanation: string;
  assumptions: string[];
  questions: string[];
  evidence: AdvisorEvidence[];
  calculations: AdvisorCalculation[];
  contractorBalance?: AdvisorContractorBalance;
  sources: AdvisorTaxSource[];
  /** Present on tax answers and any answer that used sources: states the answer is AI-generated and AI-reviewed only. */
  disclaimer?: string;
  provenance: {
    companyId: string;
    environment: AdvisorEnvironment;
    period: string;
    provider: AdvisorProvider;
    model: string;
    generatedAt: string;
    recordsIncluded: boolean;
    evidenceTruncated: boolean;
    sourceVersion: string;
    sourceReviewMethod: 'ai' | 'not-applicable';
  };
}

export interface AdvisorConnectionSummary {
  provider: AdvisorProvider;
  model: string;
  hasCredential: boolean;
  testedAt: string | null;
}

export interface AdvisorSettings {
  enabled: boolean;
  operatorEnabled: boolean;
  canManagePolicy: boolean;
  /** ADMIN or ACCOUNTANT: may save provider connections and grant connectors. VIEWER may only disconnect or revoke. */
  canManageConnections: boolean;
  allowedProviders: AdvisorProvider[];
  allowedConnectors: AdvisorConnectorClient[];
  retentionDays: number;
  connections: AdvisorConnectionSummary[];
  ollamaAvailable: boolean;
  reviewedSourceCount: number;
  /** Present only when `GET /settings?period=YYYY-MM` is requested. Period-level only; topic fit is checked on Send. */
  taxSourceCoverage?: { period: string; covered: boolean; sourceVersion: string };
}

export type AdvisorConnectorGrantStatus = 'WAITING' | 'ACTIVE' | 'EXPIRED' | 'REVOKED';

export interface AdvisorConnectorGrant {
  client: AdvisorConnectorClient;
  environment: AdvisorEnvironment;
  status: AdvisorConnectorGrantStatus;
  expiresAt: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
}

export interface AdvisorModelPreview {
  models: string[];
}

/** Returned by `model-preview` (HTTP 429 with `Retry-After`) when the per-user or per-company UTC-day cap is reached. */
export type AdvisorModelPreviewLimitErrorCode = 'DAILY_LIMIT_REACHED';
/** Upstream provider failures: INVALID_CREDENTIALS and QUOTA_EXCEEDED are 502 (fix configuration), UNAVAILABLE is 503 (retry, optional `Retry-After`). */
/** Single answer deadline shared by the API route and the web timer. */
export const advisorAnswerTimeoutSeconds = 60;
/** Records question with records enabled, but nothing to analyse in the selected month or contractor scope (422). */
export type AdvisorRecordsErrorCode = 'RECORDS_UNAVAILABLE';
/** `replyToTurnId` does not point at a completed clarification in the same conversation (409). */
export type AdvisorReplyErrorCode = 'INVALID_REPLY';
export type AdvisorProviderErrorCode = 'PROVIDER_INVALID_CREDENTIALS' | 'PROVIDER_QUOTA_EXCEEDED' | 'PROVIDER_UNAVAILABLE' | 'PROVIDER_ERROR';
/** Payload of the SSE `status` event; a heartbeat only, elapsed time is measured by the client. */
export interface AdvisorStreamStatus { stage: 'preparing' | 'working' }
/** Payload of the SSE `error` event; headers cannot be set mid-stream, so the retry delay travels here. */
export interface AdvisorStreamError { code: string; message: string; retryAfterSeconds?: number }
export type AdvisorOllamaErrorCode = 'OLLAMA_NOT_CONFIGURED' | 'OLLAMA_UNREACHABLE' | 'OLLAMA_NO_MODELS';

export interface AdvisorConnectorSettings {
  endpoint: string | null;
  clients: AdvisorConnectorClient[];
  grants: AdvisorConnectorGrant[];
}

export interface AdvisorConversationSummary {
  id: string;
  title: string;
  provider: AdvisorProvider;
  model: string;
  createdAt: string;
}

export interface AdvisorTurn {
  id: string;
  question: string;
  status: 'PENDING' | 'COMPLETED' | 'FAILED' | 'CANCELLED';
  answer: AdvisorAnswer | null;
  /** Clarification turn this message answers, or null. */
  replyToTurnId: string | null;
  createdAt: string;
}

export interface AdvisorConversationDetail extends AdvisorConversationSummary {
  turns: AdvisorTurn[];
}
