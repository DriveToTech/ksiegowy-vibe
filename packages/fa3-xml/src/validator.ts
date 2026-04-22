import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { basename, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  FA3_VALIDATION_LIMITATIONS,
  OFFICIAL_FA3_XSD_VALIDATION_LIMITATIONS,
  type ValidationResult
} from './contracts.js';

// FA(3) P_12 codes differ from FA(2): '0 KR' (domestic 0%), 'np I' (non-taxable)
const SUPPORTED_P_12_VALUES = new Set(['23', '8', '5', '0 KR', 'zw', 'np I', 'oo']);
const NIP_PATTERN = /^\d{10}$/;
const AMOUNT_PATTERN = /^-?\d+(?:\.\d{1,2})?$/;
const MODULE_DIRECTORY = dirname(fileURLToPath(import.meta.url));

const OFFICIAL_MF_FA3_XSD_PATH = resolve(MODULE_DIRECTORY, 'schema/mf/FA-3_v1-0E.xsd');

const hasOfficialRoot = (xml: string): boolean => {
  return /^\s*<\?xml[^>]*\?>\s*(?:<!--[\s\S]*?-->\s*)?<Faktura\b/.test(xml);
};

const extractTagValues = (xml: string, tagName: string): string[] => {
  const expression = new RegExp(`<${tagName}(?:\\s[^>]*)?>([\\s\\S]*?)</${tagName}>`, 'g');

  return Array.from(xml.matchAll(expression), (match) => {
    const value = match[1];

    return value === undefined ? '' : value.trim();
  });
};

const normalizeXmllintMessage = (message: string): string => {
  const normalized = message.trim();

  if (normalized.length === 0) {
    return 'Unknown xmllint validation error';
  }

  return normalized.replace(/^.*?:\d+:\s*/u, '');
};

const getContractValidationErrors = (xml: string): string[] => {
  const errors: string[] = [];

  if (xml.trim().length === 0) {
    errors.push('XML payload cannot be empty');
    return errors;
  }

  if (!hasOfficialRoot(xml)) {
    errors.push('Expected <Faktura> root with XML declaration');
  }

  for (const section of ['Naglowek', 'Podmiot1', 'Podmiot2', 'Fa', 'Adnotacje']) {
    if (!xml.includes(`<${section}`) && !xml.includes(`<${section}>`)) {
      errors.push(`Missing required section <${section}>`);
    }
  }

  const requiredPairs: ReadonlyArray<readonly [string, string]> = [
    ['P_16', '2'],
    ['P_17', '2'],
    ['P_18', '2'],
    ['P_18A', '2'],
    ['P_23', '2'],
    ['P_19N', '1'],
    ['P_22N', '1'],
    ['P_PMarzyN', '1']
  ];

  for (const [tag, expected] of requiredPairs) {
    const values = extractTagValues(xml, tag);

    if (values.length === 0) {
      errors.push(`Missing Adnotacje field <${tag}>`);
      continue;
    }

    if (values.some((value) => value !== expected)) {
      errors.push(`Adnotacje field <${tag}> must equal ${expected} for the current standard invoice contract`);
    }
  }

  for (const [index, value] of extractTagValues(xml, 'NIP').entries()) {
    if (!NIP_PATTERN.test(value)) {
      errors.push(`Invalid NIP format at NIP[${index + 1}]: ${value}`);
    }
  }

  for (const value of extractTagValues(xml, 'P_12')) {
    if (!SUPPORTED_P_12_VALUES.has(value)) {
      errors.push(`Unsupported P_12 VAT rate value: ${value}`);
    }
  }

  for (const [index, value] of extractTagValues(xml, 'P_15').entries()) {
    if (!AMOUNT_PATTERN.test(value)) {
      errors.push(`Invalid monetary amount in P_15[${index + 1}]: ${value}`);
    }
  }

  if (!xml.includes('<RodzajFaktury>VAT</RodzajFaktury>') && !xml.includes('<RodzajFaktury>KOR</RodzajFaktury>')) {
    errors.push('Expected <RodzajFaktury> VAT or KOR for the current builder scope');
  }

  return errors;
};

const validateXmlAgainstXsdWithXmllint = (
  xml: string,
  schemaPath: string
): { valid: boolean; errors: string[] } => {
  const tempDirectoryPath = mkdtempSync(resolve(tmpdir(), 'fa3-xml-validate-'));
  const xmlPath = resolve(tempDirectoryPath, 'document.xml');

  writeFileSync(xmlPath, xml, 'utf8');

  try {
    const result = spawnSync('xmllint', ['--noout', '--schema', schemaPath, xmlPath], {
      encoding: 'utf8'
    });

    if (result.error !== undefined) {
      return {
        valid: false,
        errors: [`Failed to execute xmllint: ${result.error.message}`]
      };
    }

    if (result.status === 0) {
      return { valid: true, errors: [] };
    }

    const combinedOutput = `${result.stdout}\n${result.stderr}`;
    const lines = combinedOutput
      .split(/\r?\n/u)
      .map((line) => line.trim())
      .filter((line) => line.length > 0)
      .filter((line) => line !== `${basename(xmlPath)} validates`)
      .map(normalizeXmllintMessage);

    return {
      valid: false,
      errors: lines.length > 0 ? lines : ['XSD validation failed with no detailed xmllint output']
    };
  } finally {
    rmSync(tempDirectoryPath, { recursive: true, force: true });
  }
};

export const validateFa3Xml = (xml: string): ValidationResult => {
  const errors = getContractValidationErrors(xml);

  return {
    valid: errors.length === 0,
    errors,
    warnings: [
      'Validated against package-level standard-invoice contract assertions. Run official XSD validation separately for schema proof.'
    ],
    limitations: [...FA3_VALIDATION_LIMITATIONS],
    validationMode: 'contract-only'
  };
};

export const validateFa3XmlAgainstXsd = (xml: string, schemaPath?: string): ValidationResult => {
  const resolvedSchemaPath = schemaPath ?? OFFICIAL_MF_FA3_XSD_PATH;

  if (xml.trim().length === 0) {
    return {
      valid: false,
      errors: ['XML payload cannot be empty'],
      warnings: ['Validated against the committed official MF FA(3) XSD bundle.'],
      limitations: [...OFFICIAL_FA3_XSD_VALIDATION_LIMITATIONS],
      validationMode: 'xsd',
      schemaPath: resolvedSchemaPath
    };
  }

  const xsdResult = validateXmlAgainstXsdWithXmllint(xml, resolvedSchemaPath);

  return {
    valid: xsdResult.valid,
    errors: xsdResult.errors,
    warnings: ['Validated against the committed official MF FA(3) XSD bundle.'],
    limitations: [...OFFICIAL_FA3_XSD_VALIDATION_LIMITATIONS],
    validationMode: 'xsd',
    schemaPath: resolvedSchemaPath
  };
};

export const getOfficialMfFa3XsdPath = (): string => OFFICIAL_MF_FA3_XSD_PATH;
