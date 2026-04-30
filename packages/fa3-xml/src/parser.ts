export interface ParsedFa3LineItem {
  readonly position: number;
  readonly name: string;
  readonly unit: string | null;
  readonly quantity: string;
  readonly unitNetPrice: string;
  readonly vatRate: string;
  readonly netValue: string;
  readonly vatValue: string;
}

export interface ParsedFa3Invoice {
  readonly invoiceNumber: string;
  readonly issueDate: string;           // YYYY-MM-DD
  readonly saleDate: string | null;
  readonly currency: string;
  readonly sellerNip: string;
  readonly sellerName: string;
  readonly sellerAddress: string | null;
  readonly buyerNip: string | null;
  readonly buyerName: string | null;
  readonly totalNet: string;
  readonly totalVat: string;
  readonly totalGross: string;
  readonly dueDate: string | null;
  readonly bankAccount: string | null;
  readonly paymentMethod: string | null; // '1' | '6' | null
  readonly lineItems: readonly ParsedFa3LineItem[];
}

export interface ParseFa3XmlOptions {
  readonly fallbackInvoiceNumber?: string;
  readonly fallbackIssueDate?: string;
  readonly fallbackSellerNip?: string;
  readonly fallbackSellerName?: string;
  readonly fallbackTotalGross?: string;
}

/**
 * Extracts the text content of the first occurrence of a given XML tag.
 * Handles tags with or without attributes: <Tag>, <Tag attr="x">.
 */
const extractTagValue = (xml: string, tagName: string): string | null => {
  const match = new RegExp(`<${tagName}(?:\\s[^>]*)?>([^<]*)<\\/${tagName}>`).exec(xml);
  if (match === null) return null;
  const value = match[1]?.trim() ?? '';
  return value.length > 0 ? value : null;
};

/**
 * Extracts all matches of a tag, returning an array of text values.
 */
const extractAllTagValues = (xml: string, tagName: string): string[] => {
  const pattern = new RegExp(`<${tagName}(?:\\s[^>]*)?>([^<]*)<\\/${tagName}>`, 'g');
  const results: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(xml)) !== null) {
    const value = match[1]?.trim() ?? '';
    if (value.length > 0) results.push(value);
  }
  return results;
};

/**
 * Extracts a block of XML between an opening and closing tag pair.
 */
const extractBlock = (xml: string, tagName: string): string | null => {
  const match = new RegExp(`<${tagName}(?:\\s[^>]*)?>[\\s\\S]*?<\\/${tagName}>`).exec(xml);
  return match?.[0] ?? null;
};

/**
 * Extracts all blocks of XML for a repeated tag (e.g. FaWiersz line items).
 */
const extractAllBlocks = (xml: string, tagName: string): string[] => {
  const pattern = new RegExp(`<${tagName}(?:\\s[^>]*)?>[\\s\\S]*?<\\/${tagName}>`, 'g');
  const results: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(xml)) !== null) {
    results.push(match[0]);
  }
  return results;
};

/**
 * Sums all P_14_X VAT amount fields found in the invoice XML.
 * FA(3) stores VAT totals per rate band (P_14_1 = 23%, P_14_2 = 8%, etc.)
 * and there is no single total-VAT field — it must be computed.
 */
const sumVatAmounts = (xml: string): string => {
  // Match P_14_1 through P_14_9, P_14_N, P_14_Wsp
  const pattern = /<P_14_[^>]+>([^<]+)<\/P_14_[^>]+>/g;
  let total = 0;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(xml)) !== null) {
    const value = parseFloat(match[1]?.trim() ?? '0');
    if (!Number.isNaN(value)) total += value;
  }
  return total.toFixed(2);
};

const sumGrossAmounts = (netAmount: string, vatAmount: string): string | null => {
  const parsedNetAmount = Number.parseFloat(netAmount);
  const parsedVatAmount = Number.parseFloat(vatAmount);

  if (Number.isNaN(parsedNetAmount) || Number.isNaN(parsedVatAmount)) {
    return null;
  }

  return (parsedNetAmount + parsedVatAmount).toFixed(2);
};

const parseLineItems = (xml: string): ParsedFa3LineItem[] => {
  const blocks = extractAllBlocks(xml, 'FaWiersz');
  return blocks.map((block) => ({
    position: parseInt(extractTagValue(block, 'NrWierszaFa') ?? '0', 10),
    name: extractTagValue(block, 'P_7') ?? '',
    unit: extractTagValue(block, 'P_8A'),
    quantity: extractTagValue(block, 'P_8B') ?? '0',
    unitNetPrice: extractTagValue(block, 'P_9A') ?? '0',
    vatRate: extractTagValue(block, 'P_12') ?? '',
    netValue: extractTagValue(block, 'P_11') ?? '0',
    vatValue: extractTagValue(block, 'P_11Vat') ?? '0'
  }));
};

/**
 * Parses a FA(3) invoice XML string into a structured object.
 * Throws if any required structural field is missing.
 */
export const parseFa3Xml = (xml: string, options: ParseFa3XmlOptions = {}): ParsedFa3Invoice => {
  const podmiot1Block = extractBlock(xml, 'Podmiot1');
  const podmiot2Block = extractBlock(xml, 'Podmiot2');
  const faBlock = extractBlock(xml, 'Fa');
  const platnoscBlock = faBlock !== null ? extractBlock(faBlock, 'Platnosc') : null;
  const terminBlock = platnoscBlock !== null ? extractBlock(platnoscBlock, 'TerminPlatnosci') : null;

  const invoiceNumber = faBlock !== null ? extractTagValue(faBlock, 'P_2') : null;
  const resolvedInvoiceNumber = invoiceNumber ?? options.fallbackInvoiceNumber ?? null;
  const issueDate = faBlock !== null ? extractTagValue(faBlock, 'P_1') : null;
  const resolvedIssueDate = issueDate ?? options.fallbackIssueDate ?? null;
  const sellerNip = podmiot1Block !== null ? extractTagValue(podmiot1Block, 'NIP') : null;
  const resolvedSellerNip = sellerNip ?? options.fallbackSellerNip ?? null;
  const sellerName = podmiot1Block !== null ? extractTagValue(podmiot1Block, 'Nazwa') : null;
  const resolvedSellerName = sellerName ?? options.fallbackSellerName ?? null;
  const totalGross = faBlock !== null ? extractTagValue(faBlock, 'P_15') : null;
  const totalNet = faBlock !== null
    ? (extractAllTagValues(faBlock, 'P_13_1').concat(
        extractAllTagValues(faBlock, 'P_13_2'),
        extractAllTagValues(faBlock, 'P_13_3'),
        extractAllTagValues(faBlock, 'P_13_4'),
        extractAllTagValues(faBlock, 'P_13_5'),
        extractAllTagValues(faBlock, 'P_13_N')
      ).reduce((sum, value) => sum + parseFloat(value), 0).toFixed(2))
    : '0.00';
  const totalVat = faBlock !== null ? sumVatAmounts(faBlock) : '0.00';
  const resolvedTotalGross = totalGross ?? options.fallbackTotalGross ?? sumGrossAmounts(totalNet, totalVat);

  if (resolvedInvoiceNumber === null) throw new Error('parseFa3Xml: missing required field: invoiceNumber (Fa/P_2)');
  if (resolvedIssueDate === null) throw new Error('parseFa3Xml: missing required field: issueDate (P_1)');
  if (resolvedSellerNip === null) throw new Error('parseFa3Xml: missing required field: sellerNip (Podmiot1/NIP)');
  if (resolvedSellerName === null) throw new Error('parseFa3Xml: missing required field: sellerName (Podmiot1/Nazwa)');
  if (resolvedTotalGross === null) throw new Error('parseFa3Xml: missing required field: totalGross (P_15)');

  const sellerAddressLine1 = podmiot1Block !== null ? extractTagValue(podmiot1Block, 'AdresL1') : null;
  const sellerAddressLine2 = podmiot1Block !== null ? extractTagValue(podmiot1Block, 'AdresL2') : null;
  const sellerAddress = sellerAddressLine1 !== null
    ? (sellerAddressLine2 !== null ? `${sellerAddressLine1}, ${sellerAddressLine2}` : sellerAddressLine1)
    : null;

  return {
    invoiceNumber: resolvedInvoiceNumber,
    issueDate: resolvedIssueDate,
    saleDate: faBlock !== null ? extractTagValue(faBlock, 'P_6') : null,
    currency: (faBlock !== null ? extractTagValue(faBlock, 'KodWaluty') : null) ?? 'PLN',
    sellerNip: resolvedSellerNip,
    sellerName: resolvedSellerName,
    sellerAddress,
    buyerNip: podmiot2Block !== null ? extractTagValue(podmiot2Block, 'NIP') : null,
    buyerName: podmiot2Block !== null ? extractTagValue(podmiot2Block, 'Nazwa') : null,
    totalNet,
    totalVat,
    totalGross: resolvedTotalGross,
    dueDate: terminBlock !== null ? extractTagValue(terminBlock, 'Termin') : null,
    bankAccount: platnoscBlock !== null ? extractTagValue(platnoscBlock, 'NrRB') : null,
    paymentMethod: platnoscBlock !== null ? extractTagValue(platnoscBlock, 'FormaPlatnosci') : null,
    lineItems: faBlock !== null ? parseLineItems(faBlock) : []
  };
};
