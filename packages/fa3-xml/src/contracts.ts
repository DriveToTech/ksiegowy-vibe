export const FA3_PAYMENT_METHOD_CODES = {
  cash: '1',
  bank_transfer: '6'
} as const;

export type Fa3PaymentMethodCode =
  (typeof FA3_PAYMENT_METHOD_CODES)[keyof typeof FA3_PAYMENT_METHOD_CODES];

export const FA3_VALIDATION_LIMITATIONS = [
  'Contract-only validation does not use any XSD, including the committed official MF FA(3) bundle.',
  'Contract-only validation does not by itself prove official MF FA(3) schema conformity or KSeF submission readiness.'
] as const;

export const OFFICIAL_FA3_XSD_VALIDATION_LIMITATIONS = [
  'Official MF FA(3) XSD validation checks schema conformity only.',
  'Passing the official MF FA(3) XSD does not by itself prove full KSeF submission readiness, transport correctness, or legal completeness.',
  'The current builder slice is intentionally focused on standard VAT invoices and does not yet cover the full FA(3) surface area.'
] as const;

export type Fa3ValidationMode = 'contract-only' | 'xsd';

export interface ValidationResult {
  readonly valid: boolean;
  readonly errors: readonly string[];
  readonly warnings: readonly string[];
  readonly limitations: readonly string[];
  readonly validationMode: Fa3ValidationMode;
  readonly schemaPath?: string;
}

export type Fa3ContractErrorCode =
  | 'INVALID_INVOICE_DATA'
  | 'INVOICE_TOTALS_MISMATCH'
  | 'UNSUPPORTED_INVOICE_VARIANT';

export class Fa3ContractError extends Error {
  public readonly code: Fa3ContractErrorCode;

  public constructor(code: Fa3ContractErrorCode, message: string) {
    super(message);
    this.name = 'Fa3ContractError';
    this.code = code;
  }
}
