import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { buildFa3Xml } from '../packages/fa3-xml/src/builder.js';
import { canonicalFa3Fixture } from '../packages/fa3-xml/src/canonical-fixture.js';
import { validateFa3XmlAgainstXsd } from '../packages/fa3-xml/src/validator.js';

import type { ValidationResult } from '../packages/fa3-xml/src/contracts.js';
import type { KsefClient } from '../packages/ksef-client/src/types.js';
import type { KsefInvoiceStatusResult } from '../packages/types/src/ksef.js';

type CanonicalFixtureName = 'canonical';

export type InvoiceSourceCli =
  | {
      readonly kind: 'file';
      readonly invoicePath: string;
    }
  | {
      readonly kind: 'fixture';
      readonly fixtureName: CanonicalFixtureName;
    };

export interface CliOptions {
  readonly source: InvoiceSourceCli;
  readonly production: boolean;
  readonly dryRun: boolean;
  readonly poll: boolean;
  readonly pollAttempts: number;
  readonly pollDelayMs: number;
}

export interface LoadedInvoiceXml {
  readonly xml: string;
  readonly sourceLabel: string;
  readonly invoiceAbsolutePath?: string;
}

export interface InvoicePreflightResult {
  readonly validation: ValidationResult;
  readonly sendable: boolean;
}

export interface SessionTokenPlan {
  readonly source: 'environment' | 'initialize';
  readonly message: string;
}

export interface PollReferenceNumberResult {
  readonly outcome: 'completed' | 'timeout';
  readonly attemptsPerformed: number;
  readonly totalWaitMs: number;
  readonly lastStatus?: KsefInvoiceStatusResult;
}

type KsefPollClient = Pick<KsefClient, 'pollInvoiceStatus'>;

const DEFAULT_POLL_ATTEMPTS = 2;
const DEFAULT_POLL_DELAY_MS = 5_000;

const parseBooleanFlag = (argv: readonly string[], flag: string): boolean => argv.includes(flag);

const parseStringFlag = (argv: readonly string[], flag: string): string | undefined => {
  const index = argv.findIndex((argument) => argument === flag);

  if (index < 0) {
    return undefined;
  }

  const value = argv[index + 1];

  if (value === undefined || value.startsWith('--')) {
    throw new Error(`Missing value for ${flag}.`);
  }

  return value;
};

const parsePollAttempts = (value: string | undefined): number => {
  if (value === undefined) {
    return DEFAULT_POLL_ATTEMPTS;
  }

  const parsed = Number.parseInt(value, 10);

  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new Error('Invalid --poll-attempts value. Use a positive integer.');
  }

  return parsed;
};

const parsePollDelayMs = (value: string | undefined): number => {
  if (value === undefined) {
    return DEFAULT_POLL_DELAY_MS;
  }

  const parsed = Number.parseInt(value, 10);

  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new Error('Invalid --poll-delay-ms value. Use a non-negative integer.');
  }

  return parsed;
};

const parseSource = (argv: readonly string[]): InvoiceSourceCli => {
  const invoicePath = parseStringFlag(argv, '--invoice');
  const fixtureName = parseStringFlag(argv, '--fixture');

  if ((invoicePath === undefined && fixtureName === undefined) || (invoicePath !== undefined && fixtureName !== undefined)) {
    throw new Error('Choose exactly one XML source: --invoice <path> or --fixture canonical.');
  }

  if (fixtureName !== undefined) {
    if (fixtureName !== 'canonical') {
      throw new Error('Unsupported --fixture value. The only supported fixture is: canonical');
    }

    return {
      kind: 'fixture',
      fixtureName
    };
  }

  return {
    kind: 'file',
    invoicePath: invoicePath ?? ''
  };
};

export const parseArgs = (argv: readonly string[]): CliOptions => {
  const dryRun = !parseBooleanFlag(argv, '--send');
  const poll = parseBooleanFlag(argv, '--poll');

  return {
    source: parseSource(argv),
    production: parseBooleanFlag(argv, '--production'),
    dryRun,
    poll,
    pollAttempts: poll ? parsePollAttempts(parseStringFlag(argv, '--poll-attempts')) : 0,
    pollDelayMs: poll ? parsePollDelayMs(parseStringFlag(argv, '--poll-delay-ms')) : 0
  };
};

export const getUsageLines = (): readonly string[] => {
  return [
    'Usage: pnpm tsx scripts/ksef-send.ts (--invoice <path> | --fixture canonical) [--production] [--send] [--poll] [--poll-attempts <n>] [--poll-delay-ms <n>]',
    'Default mode is dry-run (no network call). The CLI still runs FA(3) preflight validation.',
    'If KSEF_SESSION_TOKEN is absent, the CLI initializes a session from KSEF_AUTH_TOKEN + KSEF_NIP.',
    'When --poll is enabled, the CLI waits 5000ms between attempts by default.',
    'Canonical smoke-test flow: pnpm tsx scripts/ksef-send.ts --fixture canonical --send --poll'
  ];
};

export const formatDurationMs = (durationMs: number): string => {
  if (durationMs < 1000) {
    return `${durationMs}ms`;
  }

  const seconds = durationMs / 1000;

  if (Number.isInteger(seconds)) {
    return `${seconds}s`;
  }

  return `${seconds.toFixed(1)}s`;
};

export const printUsage = (): void => {
  for (const line of getUsageLines()) {
    console.info(line);
  }
};

export const loadInvoiceXml = async (source: InvoiceSourceCli): Promise<LoadedInvoiceXml> => {
  if (source.kind === 'fixture') {
    return {
      xml: buildFa3Xml(canonicalFa3Fixture),
      sourceLabel: `canonical fixture ${canonicalFa3Fixture.invoiceNumber} (generated in-memory from @ksiegowy/fa3-xml)`
    };
  }

  const invoiceAbsolutePath = resolve(source.invoicePath);

  return {
    xml: await readFile(invoiceAbsolutePath, 'utf8'),
    sourceLabel: `invoice file ${invoiceAbsolutePath}`,
    invoiceAbsolutePath
  };
};

export const preflightInvoiceXml = (xml: string): InvoicePreflightResult => {
  const validation = validateFa3XmlAgainstXsd(xml);

  return {
    validation,
    sendable: validation.valid
  };
};

export const getSessionTokenPlan = (sessionToken: string | undefined): SessionTokenPlan => {
  if (typeof sessionToken === 'string' && sessionToken.trim().length > 0) {
    return {
      source: 'environment',
      message: 'Session token plan: reuse KSEF_SESSION_TOKEN from environment.'
    };
  }

  return {
    source: 'initialize',
    message: 'Session token plan: initialize a new KSeF session from KSEF_AUTH_TOKEN + KSEF_NIP.'
  };
};

export const formatValidationLines = (preflight: InvoicePreflightResult): readonly string[] => {
  const lines = [
    `Preflight validation: ${preflight.sendable ? 'PASS' : 'FAIL'}`,
    `Validation mode: ${preflight.validation.validationMode}`
  ];

  if (preflight.validation.schemaKind !== undefined) {
    lines.push(`Schema kind: ${preflight.validation.schemaKind}`);
  }

  if (preflight.validation.schemaPath !== undefined) {
    lines.push(`Schema path: ${preflight.validation.schemaPath}`);
  }

  return lines;
};

export const pollForKsefReferenceNumber = async (input: {
  readonly client: KsefPollClient;
  readonly referenceNumber: string;
  readonly sessionToken: string;
  readonly pollAttempts: number;
  readonly pollDelayMs: number;
  readonly onAttempt?: (context: { readonly attempt: number; readonly status: KsefInvoiceStatusResult }) => void;
  readonly onWait?: (context: { readonly attempt: number; readonly nextAttempt: number; readonly delayMs: number }) => void;
  readonly sleep?: (delayMs: number) => Promise<void>;
}): Promise<PollReferenceNumberResult> => {
  let lastStatus: KsefInvoiceStatusResult | undefined;
  let totalWaitMs = 0;
  const sleep = input.sleep ?? ((delayMs: number) => new Promise<void>((resolve) => setTimeout(resolve, delayMs)));

  for (let attempt = 1; attempt <= input.pollAttempts; attempt += 1) {
    const status = await input.client.pollInvoiceStatus({
      referenceNumber: input.referenceNumber,
      sessionToken: input.sessionToken
    });

    lastStatus = status;
    input.onAttempt?.({ attempt, status });

    if (status.ksefReferenceNumber !== undefined) {
      return {
        outcome: 'completed',
        attemptsPerformed: attempt,
        totalWaitMs,
        lastStatus: status
      };
    }

    if (attempt < input.pollAttempts && input.pollDelayMs > 0) {
      input.onWait?.({
        attempt,
        nextAttempt: attempt + 1,
        delayMs: input.pollDelayMs
      });
      await sleep(input.pollDelayMs);
      totalWaitMs += input.pollDelayMs;
    }
  }

  return {
    outcome: 'timeout',
    attemptsPerformed: input.pollAttempts,
    totalWaitMs,
    ...(lastStatus === undefined ? {} : { lastStatus })
  };
};
