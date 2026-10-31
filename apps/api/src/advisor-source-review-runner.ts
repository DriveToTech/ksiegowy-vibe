import path from 'node:path';
import { parseArgs } from 'node:util';
import Fastify from 'fastify';
import { reviewAdvisorSourceCorpus } from './services/advisor/advisor-source-review.js';

const defaultDraftPath = path.resolve(__dirname, '../../../docs/specs/tax-advisor-corpus/sources.draft.json');
const defaultEvaluationSetPath = path.resolve(__dirname, '../../../docs/specs/tax-advisor-corpus/eval-set.json');

const runAdvisorSourceReview = async (): Promise<void> => {
  const app = Fastify({ logger: true });
  const { values } = parseArgs({ options: {
    draft: { type: 'string', default: defaultDraftPath }, eval: { type: 'string', default: defaultEvaluationSetPath },
    output: { type: 'string' }, 'report-dir': { type: 'string' },
  } });

  if (!values.output || !values['report-dir']) {
    app.log.error('Usage: advisor:review-sources --output <corpus.json outside the repository> --report-dir <directory> [--draft <file>] [--eval <file>]');
    process.exitCode = 1;
  } else {
    app.log.info('Starting one-shot advisor source review');
    const report = await reviewAdvisorSourceCorpus({
      draftPath: values.draft, evaluationSetPath: values.eval, outputPath: values.output, reportDirectory: values['report-dir'], environment: process.env,
    }).catch((error: Error) => {
      app.log.error({ error: error.message }, 'Advisor source review could not start');
      return null;
    });
    if (report) {
      app.log.info({ reportId: report.reportId, passed: report.passed, callCount: report.callCount, corpusWritten: report.corpus.written, failure: report.failure },
        'Finished one-shot advisor source review');
    }
    if (!report?.passed) process.exitCode = 1;
  }

  await app.close().catch((error: unknown) => {
    app.log.error({ error }, 'Failed to close logger app in advisor source review runner');
    process.exitCode = 1;
  });
};

void runAdvisorSourceReview();
