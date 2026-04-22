import { KsefClientError, createKsefClient } from '../packages/ksef-client/src/index.js';
import {
  formatDurationMs,
  formatValidationLines,
  getSessionTokenPlan,
  loadInvoiceXml,
  parseArgs,
  pollForKsefReferenceNumber,
  preflightInvoiceXml,
  printUsage
} from './ksef-send.lib.js';
import type { CliOptions } from './ksef-send.lib.js';

type KsefEnvironmentCli = 'test' | 'production';

const resolveEnvironment = (options: CliOptions): KsefEnvironmentCli => {
  return options.production ? 'production' : 'test';
};

const getRequiredEnv = (name: 'KSEF_AUTH_TOKEN' | 'KSEF_NIP'): string => {
  const value = process.env[name];

  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value.trim();
};

const acquireSessionToken = async (input: {
  readonly client: ReturnType<typeof createKsefClient>;
  readonly environment: KsefEnvironmentCli;
}): Promise<string> => {
  const existingToken = process.env.KSEF_SESSION_TOKEN?.trim();

  if (existingToken && existingToken.length > 0) {
    console.info('Session token reused from KSEF_SESSION_TOKEN environment variable.');
    return existingToken;
  }

  const apiToken = getRequiredEnv('KSEF_AUTH_TOKEN');
  const nip = getRequiredEnv('KSEF_NIP');

  console.info(`Initializing KSeF session for NIP ${nip} in ${input.environment} environment...`);

  const session = await input.client.initSession({
    apiToken,
    nip
  });

  console.info(`Session initialized. Challenge timestamp: ${session.timestamp}`);

  if (session.referenceNumber) {
    console.info(`Session reference number: ${session.referenceNumber}`);
  }

  return session.sessionToken;
};

const main = async (): Promise<void> => {
  let options;

  try {
    options = parseArgs(process.argv.slice(2));
  } catch (error: unknown) {
    if (error instanceof Error) {
      console.error(error.message);
    }

    printUsage();
    process.exit(1);
  }

  const invoice = await loadInvoiceXml(options.source);
  const environment = resolveEnvironment(options);
  const client = createKsefClient({ environment });
  const environmentDetails = client.getEnvironmentDetails();
  const payload = client.buildInvoicePayload({ xml: invoice.xml });
  const preflight = preflightInvoiceXml(invoice.xml);
  const sessionTokenPlan = getSessionTokenPlan(process.env.KSEF_SESSION_TOKEN);

  console.info(`XML source: ${invoice.sourceLabel}`);

  if (invoice.invoiceAbsolutePath) {
    console.info(`Invoice file: ${invoice.invoiceAbsolutePath}`);
  }

  console.info(`Environment: ${environmentDetails.environment}`);
  console.info(`Base URL: ${environmentDetails.baseUrl}`);
  console.info(`XML size (bytes): ${payload.fileSize}`);
  console.info(`SHA-256 (base64): ${payload.hashBase64}`);
  console.info(sessionTokenPlan.message);

  for (const line of formatValidationLines(preflight)) {
    console.info(line);
  }

  if (!preflight.sendable) {
    console.error('Preflight failed. XML did not pass the official FA(3) validation path, so send is blocked.');

    for (const error of preflight.validation.errors) {
      console.error(`Validation error: ${error}`);
    }

    process.exit(1);
  }

  if (options.dryRun) {
    console.info('Dry-run complete. XML passed preflight and was not sent. Use --send to initialize or reuse a session and submit to KSeF.');

    if (options.poll) {
      console.info('Polling was requested, but dry-run mode skips all network activity. Re-run with --send to submit and poll.');
    }

    return;
  }

  const sessionToken = await acquireSessionToken({
    client,
    environment
  });

  const result = await client.sendInvoice({
    xml: invoice.xml,
    sessionToken
  });

  console.info(`Submitted. Reference number: ${result.referenceNumber}`);
  console.info(`Processing code: ${result.processingCode}`);
  console.info(`Endpoint: ${result.endpointUrl}`);

  if (!options.poll) {
    return;
  }

  console.info(
    `Polling enabled: up to ${options.pollAttempts} attempt(s) with ${formatDurationMs(options.pollDelayMs)} between attempts.`
  );

  const pollResult = await pollForKsefReferenceNumber({
    client,
    referenceNumber: result.referenceNumber,
    sessionToken,
    pollAttempts: options.pollAttempts,
    pollDelayMs: options.pollDelayMs,
    onAttempt: ({ attempt, status }) => {
      console.info(`Poll attempt ${attempt}/${options.pollAttempts}: invoiceStatus=${status.invoiceStatus}`);

      if (status.timestamp) {
        console.info(`Status timestamp: ${status.timestamp}`);
      }

      if (status.ksefReferenceNumber) {
        console.info(`KSeF reference number: ${status.ksefReferenceNumber}`);
      }
    },
    onWait: ({ attempt, nextAttempt, delayMs }) => {
      console.info(
        `Poll attempt ${attempt}/${options.pollAttempts} returned no KSeF reference number yet. Waiting ${formatDurationMs(delayMs)} before attempt ${nextAttempt}/${options.pollAttempts}...`
      );
    }
  });

  if (pollResult.outcome === 'completed') {
    console.info(
      `Polling completed after ${pollResult.attemptsPerformed} attempt(s) with ${formatDurationMs(pollResult.totalWaitMs)} total wait time.`
    );
    return;
  }

  console.warn(
    `Polling timed out after ${pollResult.attemptsPerformed} attempt(s) and ${formatDurationMs(pollResult.totalWaitMs)} total wait time. No KSeF reference number was returned yet for submission reference ${result.referenceNumber}.`
  );
};

void main().catch((error: unknown) => {
  if (error instanceof KsefClientError) {
    console.error(error.message);
    process.exit(1);
  }

  if (error instanceof Error) {
    console.error(error.message);
    process.exit(1);
  }

  console.error('Unknown CLI failure while preparing or sending the KSeF invoice.');
  process.exit(1);
});
