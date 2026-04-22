export type KsefEnvironment = 'test' | 'production';

export interface KsefEnvironmentDetails {
  readonly environment: KsefEnvironment;
  readonly baseUrl: string;
}

export interface KsefContextIdentifier {
  readonly type: 'nip' | 'internalId' | 'nipVatEu';
  readonly value: string;
}

// v2 challenge response
export interface KsefChallengeResponse {
  readonly challenge: string;
  readonly timestamp: string;
  readonly timestampMs: number;
  readonly clientIp: string;
}

// v2 public key certificate
export interface KsefPublicKeyCertificate {
  readonly certificate: string; // Base64 DER-encoded X.509 certificate
  readonly validFrom: string;
  readonly validTo: string;
  readonly usage: string[];
}

// v2 auth token response (from POST /auth/ksef-token)
export interface KsefAuthTokenResponse {
  readonly referenceNumber: string;
  readonly authenticationToken: KsefTokenInfo;
}

// v2 auth status (from GET /auth/{referenceNumber})
export interface KsefAuthStatusResponse {
  readonly status: {
    readonly code: number;
    readonly description?: string;
  };
}

// v2 token info (used in redeem + refresh responses)
export interface KsefTokenInfo {
  readonly token: string;
  readonly validUntil: string;
}

// v2 auth redeem response (from POST /auth/token/redeem)
export interface KsefAuthRedeemResponse {
  readonly accessToken: KsefTokenInfo;
  readonly refreshToken: KsefTokenInfo;
}

// v2 auth refresh response (from POST /auth/token/refresh)
export interface KsefAuthRefreshResponse {
  readonly accessToken: KsefTokenInfo;
}

// v2 online session response (from POST /sessions/online)
export interface KsefOpenSessionResponse {
  readonly referenceNumber: string;
  readonly validUntil: string;
}

// v2 send invoice response (from POST /sessions/online/{ref}/invoices)
export interface KsefSendInvoiceResponse {
  readonly referenceNumber: string;
}

// v2 invoice status response (from GET /sessions/online/{sessionRef}/invoices/{invoiceRef})
export interface KsefInvoiceStatusResponse {
  readonly status: {
    readonly code: number;
    readonly description?: string;
  };
  readonly ksefReferenceNumber?: string;
}

// Result types returned by the client

export interface KsefSessionInitResult {
  readonly accessToken: string;
  readonly refreshToken: string;
  readonly refreshTokenValidUntil: string;
}

export interface KsefSubmitResult {
  readonly sessionRef: string;
  readonly invoiceRef: string;
  readonly ksefReferenceNumber?: string;
}

export interface KsefInvoiceStatusResult {
  readonly sessionRef: string;
  readonly invoiceRef: string;
  readonly statusCode: number;
  readonly ksefReferenceNumber?: string;
  readonly environment: KsefEnvironment;
}

// Header entry returned by POST /query/invoice/sync → invoiceHeaderList[]
// KSeF v2 invoice metadata header (POST /invoices/query/metadata response item)
export interface KsefIncomingInvoiceHeader {
  // KSeF reference number — field name differs by API version
  readonly ksefReferenceNumber?: string;
  readonly ksefNumber?: string;
  // Invoice number (may be absent from metadata, available in full XML)
  readonly invoiceNumber?: string;
  // Dates
  readonly invoicingDate?: string;
  readonly issueDate?: string;
  // v2 seller fields
  readonly seller?: {
    readonly nip?: string;
    readonly name?: string;
    readonly identifier?: { readonly type: string; readonly value: string };
  };
  // v2 buyer fields
  readonly invoiceMetadataBuyer?: {
    readonly identifier?: { readonly type: string; readonly value: string };
    readonly name?: string;
  };
  // v2 authorized subject
  readonly authorizedSubject?: {
    readonly nip?: string;
    readonly role?: string;
  };
  // Amounts
  readonly net?: string;
  readonly vat?: string;
  readonly gross?: string;
  readonly currency?: string;
  readonly invoiceType?: string;
}

// Full response from POST /invoices/query/metadata
export interface KsefInvoiceQueryResult {
  readonly pageOffset: number;
  readonly pageSize: number;
  readonly numberOfElements: number;
  readonly hasMore: boolean;
  readonly invoiceHeaderList: readonly KsefIncomingInvoiceHeader[];
}

// Input for client.queryIncomingInvoices()
export interface KsefQueryIncomingInvoicesInput {
  readonly accessToken: string;
  readonly dateFrom: string; // YYYY-MM-DD
  readonly dateTo: string;   // YYYY-MM-DD
  readonly pageOffset?: number;
  readonly pageSize?: number;
}
