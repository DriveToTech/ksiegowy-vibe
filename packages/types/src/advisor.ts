export type AdvisorProvider = 'OPENROUTER' | 'OPENAI' | 'ANTHROPIC' | 'OLLAMA';
export type AdvisorEnvironment = 'TEST' | 'PRODUCTION';
export type AdvisorConnectorClient = 'CHATGPT' | 'CLAUDE';

export interface AdvisorScope {
  questionKind: 'records' | 'tax';
  period: string;
  includeRecords: boolean;
  documentId?: string | undefined;
  documentKind?: 'outgoing' | 'incoming' | undefined;
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
  invoiceCount: number;
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
  reviewedBy: string;
  excerpt: string;
}

export interface AdvisorAnswer {
  status: 'answered' | 'needs_clarification' | 'insufficient_evidence';
  shortAnswer: string;
  explanation: string;
  assumptions: string[];
  questions: string[];
  evidence: AdvisorEvidence[];
  calculations: AdvisorCalculation[];
  sources: AdvisorTaxSource[];
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
  allowedProviders: AdvisorProvider[];
  allowedConnectors: AdvisorConnectorClient[];
  retentionDays: number;
  connections: AdvisorConnectionSummary[];
  ollamaAvailable: boolean;
  reviewedSourceCount: number;
}

export interface AdvisorConnectorSettings {
  endpoint: string | null;
  clients: AdvisorConnectorClient[];
  grants: Array<{ client: AdvisorConnectorClient; environment: AdvisorEnvironment; expiresAt: string }>;
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
  createdAt: string;
}

export interface AdvisorConversationDetail extends AdvisorConversationSummary {
  turns: AdvisorTurn[];
}
