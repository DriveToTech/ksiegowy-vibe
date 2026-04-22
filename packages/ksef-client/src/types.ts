import type {
  KsefEnvironment,
  KsefEnvironmentDetails,
  KsefInvoiceStatusResult,
  KsefInvoiceQueryResult,
  KsefQueryIncomingInvoicesInput,
  KsefSessionInitResult,
  KsefSubmitResult
} from '@ksiegowy/types';

export interface KsefClientConfig {
  readonly environment: KsefEnvironment;
  readonly fetchImplementation?: typeof fetch;
}

export interface KsefTokenAuthInput {
  readonly ksefToken: string;
  readonly nip: string;
}

export class KsefClientError extends Error {
  readonly code: string;
  readonly environment: KsefEnvironment;
  readonly endpointUrl: string | undefined;
  readonly statusCode: number | undefined;
  readonly details: string | undefined;

  public constructor(input: {
    readonly message: string;
    readonly code: string;
    readonly environment: KsefEnvironment;
    readonly endpointUrl?: string;
    readonly statusCode?: number;
    readonly details?: string;
    readonly cause?: unknown;
  }) {
    super(input.message, input.cause === undefined ? undefined : { cause: input.cause });
    this.name = 'KsefClientError';
    this.code = input.code;
    this.environment = input.environment;
    this.endpointUrl = input.endpointUrl;
    this.statusCode = input.statusCode;
    this.details = input.details;
  }
}

export interface KsefClient {
  getEnvironmentDetails(): KsefEnvironmentDetails;
  initAuthSession(input: KsefTokenAuthInput): Promise<KsefSessionInitResult>;
  refreshAuthSession(refreshToken: string): Promise<string>; // returns accessToken
  submitInvoice(input: { accessToken: string; xml: string }): Promise<KsefSubmitResult>;
  pollInvoiceStatus(input: { accessToken: string; sessionRef: string; invoiceRef: string }): Promise<KsefInvoiceStatusResult>;
  queryIncomingInvoices(input: KsefQueryIncomingInvoicesInput): Promise<KsefInvoiceQueryResult>;
  fetchInvoiceXml(input: { accessToken: string; ksefReferenceNumber: string }): Promise<string>;
}
