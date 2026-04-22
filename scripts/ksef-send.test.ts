import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { buildFa3Xml, canonicalFa3Fixture } from '../packages/fa3-xml/src/index.js';
import {
  formatDurationMs,
  getSessionTokenPlan,
  loadInvoiceXml,
  parseArgs,
  pollForKsefReferenceNumber,
  preflightInvoiceXml
} from './ksef-send.lib.js';

import type { KsefInvoiceStatusResult } from '../packages/types/src/ksef.js';

describe('parseArgs', () => {
  it('supports the canonical fixture smoke-test flow with dry-run by default', () => {
    const parsed = parseArgs(['--fixture', 'canonical']);

    assert.deepEqual(parsed, {
      source: {
        kind: 'fixture',
        fixtureName: 'canonical'
      },
      production: false,
      dryRun: true,
      poll: false,
      pollAttempts: 0,
      pollDelayMs: 0
    });
  });

  it('parses polling defaults when --poll is enabled', () => {
    const parsed = parseArgs(['--fixture', 'canonical', '--send', '--poll']);

    assert.deepEqual(parsed, {
      source: {
        kind: 'fixture',
        fixtureName: 'canonical'
      },
      production: false,
      dryRun: false,
      poll: true,
      pollAttempts: 2,
      pollDelayMs: 5000
    });
  });

  it('parses explicit polling delay overrides', () => {
    const parsed = parseArgs(['--fixture', 'canonical', '--send', '--poll', '--poll-attempts', '4', '--poll-delay-ms', '1200']);

    assert.equal(parsed.poll, true);
    assert.equal(parsed.pollAttempts, 4);
    assert.equal(parsed.pollDelayMs, 1200);
  });

  it('rejects ambiguous XML source selection', () => {
    assert.throws(
      () => parseArgs(['--invoice', './invoice.xml', '--fixture', 'canonical']),
      /Choose exactly one XML source/
    );
  });

  it('rejects unsupported fixture names', () => {
    assert.throws(() => parseArgs(['--fixture', 'demo']), /Unsupported --fixture value/);
  });

  it('rejects invalid polling delay values', () => {
    assert.throws(() => parseArgs(['--fixture', 'canonical', '--poll', '--poll-delay-ms', '-1']), /Invalid --poll-delay-ms value/);
  });
});

describe('formatDurationMs', () => {
  it('formats milliseconds and seconds for operator-facing output', () => {
    assert.equal(formatDurationMs(250), '250ms');
    assert.equal(formatDurationMs(1000), '1s');
    assert.equal(formatDurationMs(1500), '1.5s');
  });
});

describe('preflightInvoiceXml', () => {
  it('accepts canonical FA(3) XML through the official validation path', () => {
    const xml = buildFa3Xml(canonicalFa3Fixture);
    const result = preflightInvoiceXml(xml);

    assert.equal(result.sendable, true);
    assert.equal(result.validation.valid, true);
    assert.equal(result.validation.validationMode, 'xsd');
  });

  it('fails fast for XML that does not pass the official validation path', () => {
    const result = preflightInvoiceXml('<invoice />');

    assert.equal(result.sendable, false);
    assert.equal(result.validation.valid, false);
    assert.equal(result.validation.validationMode, 'xsd');
    assert.match(result.validation.errors.join('\n'), /No matching global declaration|Faktura/i);
  });
});

describe('getSessionTokenPlan', () => {
  it('reports session token reuse when env token is present', () => {
    assert.deepEqual(getSessionTokenPlan(' session-token '), {
      source: 'environment',
      message: 'Session token plan: reuse KSEF_SESSION_TOKEN from environment.'
    });
  });

  it('reports session initialization when env token is absent', () => {
    assert.deepEqual(getSessionTokenPlan(undefined), {
      source: 'initialize',
      message: 'Session token plan: initialize a new KSeF session from KSEF_AUTH_TOKEN + KSEF_NIP.'
    });
  });
});

describe('loadInvoiceXml', () => {
  it('builds canonical fixture XML in-memory with a clear source label', async () => {
    const loaded = await loadInvoiceXml({
      kind: 'fixture',
      fixtureName: 'canonical'
    });

    assert.match(loaded.sourceLabel, /canonical fixture FV 1\/2\/2026/);
    assert.equal(loaded.invoiceAbsolutePath, undefined);
    assert.match(loaded.xml, /<P_2>FV 1\/2\/2026<\/P_2>/);
    assert.match(loaded.xml, /<RodzajFaktury>VAT<\/RodzajFaktury>/);
  });

  it('loads XML from an explicit file path', async () => {
    const tempDirectory = await mkdtemp(join(tmpdir(), 'ksef-send-'));
    const invoicePath = join(tempDirectory, 'invoice.xml');
    await writeFile(invoicePath, '<invoice />', 'utf8');

    const loaded = await loadInvoiceXml({
      kind: 'file',
      invoicePath
    });

    assert.equal(loaded.invoiceAbsolutePath, invoicePath);
    assert.equal(loaded.sourceLabel, `invoice file ${invoicePath}`);
    assert.equal(loaded.xml, '<invoice />');
  });
});

describe('pollForKsefReferenceNumber', () => {
  it('completes once a KSeF reference number appears', async () => {
    const attempts: number[] = [];
    const waits: Array<{ attempt: number; nextAttempt: number; delayMs: number }> = [];
    const sleepCalls: number[] = [];
    let pollCalls = 0;

    const client = {
      async pollInvoiceStatus(): Promise<KsefInvoiceStatusResult> {
        pollCalls += 1;

        if (pollCalls === 2) {
          return {
            referenceNumber: 'REF-001',
            invoiceStatus: 200,
            ksefReferenceNumber: 'KSEF-001',
            environment: 'test',
            endpointUrl: 'https://ksef-test.mf.gov.pl/api/online/Invoice/Status/REF-001',
            timestamp: '2026-04-01T10:05:00.000Z'
          };
        }

        return {
          referenceNumber: 'REF-001',
          invoiceStatus: 100,
          environment: 'test',
          endpointUrl: 'https://ksef-test.mf.gov.pl/api/online/Invoice/Status/REF-001'
        };
      }
    };

    const result = await pollForKsefReferenceNumber({
      client,
      referenceNumber: 'REF-001',
      sessionToken: 'session-token',
      pollAttempts: 3,
      pollDelayMs: 1500,
      onAttempt: ({ attempt }) => {
        attempts.push(attempt);
      },
      onWait: (context) => {
        waits.push(context);
      },
      sleep: async (delayMs) => {
        sleepCalls.push(delayMs);
      }
    });

    assert.equal(result.outcome, 'completed');
    assert.equal(result.attemptsPerformed, 2);
    assert.equal(result.totalWaitMs, 1500);
    assert.deepEqual(attempts, [1, 2]);
    assert.deepEqual(waits, [{ attempt: 1, nextAttempt: 2, delayMs: 1500 }]);
    assert.deepEqual(sleepCalls, [1500]);
    assert.equal(result.lastStatus?.ksefReferenceNumber, 'KSEF-001');
  });

  it('returns timeout when no KSeF reference number appears', async () => {
    let pollCalls = 0;
    const waits: number[] = [];

    const client = {
      async pollInvoiceStatus() {
        pollCalls += 1;

        return {
          referenceNumber: 'REF-002',
          invoiceStatus: 100,
          environment: 'test' as const,
          endpointUrl: 'https://ksef-test.mf.gov.pl/api/online/Invoice/Status/REF-002'
        };
      }
    };

    const result = await pollForKsefReferenceNumber({
      client,
      referenceNumber: 'REF-002',
      sessionToken: 'session-token',
      pollAttempts: 2,
      pollDelayMs: 2000,
      onWait: ({ delayMs }) => {
        waits.push(delayMs);
      },
      sleep: async () => {}
    });

    assert.equal(result.outcome, 'timeout');
    assert.equal(result.attemptsPerformed, 2);
    assert.equal(result.totalWaitMs, 2000);
    assert.equal(pollCalls, 2);
    assert.deepEqual(waits, [2000]);
    assert.equal(result.lastStatus?.referenceNumber, 'REF-002');
    assert.equal(result.lastStatus?.ksefReferenceNumber, undefined);
  });

  it('does not wait between attempts when polling delay is zero', async () => {
    const sleepCalls: number[] = [];

    const client = {
      async pollInvoiceStatus() {
        return {
          referenceNumber: 'REF-003',
          invoiceStatus: 100,
          environment: 'test' as const,
          endpointUrl: 'https://ksef-test.mf.gov.pl/api/online/Invoice/Status/REF-003'
        };
      }
    };

    const result = await pollForKsefReferenceNumber({
      client,
      referenceNumber: 'REF-003',
      sessionToken: 'session-token',
      pollAttempts: 2,
      pollDelayMs: 0,
      sleep: async (delayMs) => {
        sleepCalls.push(delayMs);
      }
    });

    assert.equal(result.outcome, 'timeout');
    assert.equal(result.totalWaitMs, 0);
    assert.deepEqual(sleepCalls, []);
  });
});
