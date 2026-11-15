import { Builder } from 'builder-pattern';
import { mkdtemp, readFile, readdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import OpenAI from 'openai';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AdvisorError } from './advisor-contract.js';
import { requestStructuredModelOutput } from './advisor-provider.js';
import type { AdvisorEvaluationCase } from './advisor-source-evaluation.js';
import { AdvisorSourceReviewConfigurationError, reviewAdvisorSourceCorpus } from './advisor-source-review.js';
import { parseAdvisorSourceCorpus } from './advisor-sources.js';

vi.mock('./advisor-provider.js', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  requestStructuredModelOutput: vi.fn(),
}));

interface DraftSource { id: string; title: string; url: string; section: string; effectiveFrom: string; effectiveUntil: string; excerpt: string; topics: string[]; officialText: string[] }

const officialDocument = '<html><style>p {}</style><body><p>Art. 1 Faktura zawiera numer kolejny.</p></body></html>';
const now = new Date('2026-10-15T00:00:00Z');
const environment = {
  ADVISOR_REVIEW_MODELS: 'ANTHROPIC:claude-reviewer-1,OPENAI:gpt-reviewer-1',
  ADVISOR_REVIEW_ANSWER_MODELS: 'OPENROUTER:vendor/answer-1', ADVISOR_REVIEW_CALL_DELAY_MILLISECONDS: '0',
  ADVISOR_REVIEW_ANTHROPIC_API_KEY: 'secret-anthropic', ADVISOR_REVIEW_OPENAI_API_KEY: 'secret-openai', ADVISOR_REVIEW_OPENROUTER_API_KEY: 'secret-openrouter',
};

const buildDraftSource = (id: string) => Builder<DraftSource>().id(id).title(`Title ${id}`).url('https://eli.gov.pl/act.html').section('art. 1')
  .effectiveFrom('2026-01-01').effectiveUntil('2026-12-31').excerpt('Faktura zawiera numer kolejny.').topics(['invoice-content'])
  .officialText(['Art. 1 Faktura zawiera numer kolejny.']);

const buildAnswerCase = () => Builder<AdvisorEvaluationCase>().id('Q1').expectedBehavior('answer').expectedStatus('answered').questionKind('tax').period('2026-10')
  .question('Co musi zawierać faktura VAT?').companyFacts({}).requiredSourceIds(['law']).mustInclude(['numer kolejny']).mustAskAbout([]).forbiddenClaims(['lista jest wyczerpująca']);
const buildDeclineCase = () => Builder<AdvisorEvaluationCase>().id('Q2').expectedBehavior('decline').expectedStatus('declined').questionKind('tax').period('2026-10')
  .question('Czy opłaca mi się PIT liniowy?').companyFacts({}).requiredSourceIds([]).mustInclude([]).mustAskAbout([]).forbiddenClaims([]);
const buildInsufficientCase = () => Builder<AdvisorEvaluationCase>().id('Q3').expectedBehavior('insufficient_evidence').expectedStatus('insufficient_evidence').questionKind('tax').period('2026-10')
  .question('Jaka jest stawka VAT?').companyFacts({}).requiredSourceIds([]).mustInclude([]).mustAskAbout([]).forbiddenClaims([]);

const approve = { verdict: 'approve', issues: [], checks: { excerptFaithful: 'pass', notBroaderThanSource: 'pass', conditionsAndExceptionsStated: 'pass', effectiveDatesSupported: 'pass', guidanceLabelled: 'pass', noPersonalData: 'pass' } };
const answer = { status: 'answered', shortAnswer: 'Faktura zawiera numer kolejny.', explanation: '', assumptions: [], questions: [], evidenceIds: [], sourceIds: ['law'], containsTaxGuidance: true };
const cleanJudgement = { forbiddenClaimsPresent: [], missingMustInclude: [], missingMustAskAbout: [] };

async function prepareInputs(options: { sources: DraftSource[]; cases: AdvisorEvaluationCase[]; draftedBy?: string }) {
  const directory = await mkdtemp(join(tmpdir(), 'advisor-review-'));
  const draftPath = join(directory, 'draft.json');
  const evaluationSetPath = join(directory, 'eval.json');
  await writeFile(draftPath, JSON.stringify({ _comment: 'draft', draftedBy: options.draftedBy ?? 'ai:OLLAMA/drafter-1', sources: options.sources }));
  await writeFile(evaluationSetPath, JSON.stringify({ version: 'test-1', cases: options.cases }));
  return { draftPath, evaluationSetPath, outputPath: join(directory, 'out', 'corpus.json'), reportDirectory: join(directory, 'reports'), directory };
}

/** Answers every model request by schema name; overrides may replace a response per reviewer provider or schema. */
function stubModels(overrides: { review?: (input: string, provider: string) => object; judgement?: object } = {}) {
  vi.mocked(requestStructuredModelOutput).mockImplementation(async (connection, request, input) => {
    if (request.schemaName === 'advisor_source_review') return JSON.stringify(overrides.review?.(input, connection.provider) ?? approve);
    if (request.schemaName === 'advisor_answer') return JSON.stringify(answer);
    return JSON.stringify(overrides.judgement ?? cleanJudgement);
  });
}

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(async () => new Response(officialDocument, { headers: { 'content-type': 'text/html; charset=utf-8' } })));
  stubModels();
});
afterEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks(); vi.useRealTimers(); });

/** Runs a review that sleeps between retries: advances the fake clock while real file I/O settles. */
async function completeWithFakeTimers<Result>(pending: Promise<Result>): Promise<Result> {
  let isSettled = false;
  void pending.finally(() => { isSettled = true; }).catch(() => undefined);
  while (!isSettled) {
    await vi.advanceTimersByTimeAsync(1000);
    await new Promise((resolve) => { setImmediate(resolve); });
  }
  return pending;
}

describe('reviewAdvisorSourceCorpus()', () => {
  it('writes a loader-valid AI-reviewed corpus and a passing report when review and evaluation pass', async () => {
    const inputs = await prepareInputs({ sources: [buildDraftSource('law').build()], cases: [buildAnswerCase().build(), buildDeclineCase().build(), buildInsufficientCase().build()] });

    const report = await reviewAdvisorSourceCorpus({ ...inputs, environment, now });

    expect(report.passed).toBe(true);
    expect(report.sources).toEqual([expect.objectContaining({ id: 'law', decision: 'approved', officialTextFound: true, fetchedUrl: 'https://eli.gov.pl/act.html' })]);
    expect(report.callCount).toBe(11);
    const corpus = parseAdvisorSourceCorpus(JSON.parse(await readFile(inputs.outputPath, 'utf8')));
    expect(corpus).toEqual([expect.objectContaining({
      id: 'law', reviewMethod: 'ai', reviewedBy: 'ai:ANTHROPIC/claude-reviewer-1+ai:OPENAI/gpt-reviewer-1',
      reviewedAt: '2026-10-15', reviewExpiresAt: '2026-11-14', reviewReportId: report.reportId,
    })]);
    const savedReport = await readFile(join(inputs.reportDirectory, `${report.reportId}.json`), 'utf8');
    expect(JSON.parse(savedReport).passed).toBe(true);
    expect(savedReport).not.toMatch(/secret-/);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('rejects a source without any model call when an official text span is not found', async () => {
    const source = buildDraftSource('law').officialText(['Art. 2 Tekst, którego nie ma w dokumencie.']).build();
    const inputs = await prepareInputs({ sources: [source], cases: [buildAnswerCase().build()] });

    const report = await reviewAdvisorSourceCorpus({ ...inputs, environment, now });

    expect(requestStructuredModelOutput).not.toHaveBeenCalled();
    expect(report.passed).toBe(false);
    expect(report.sources[0]).toMatchObject({ id: 'law', decision: 'rejected', officialTextFound: false });
    await expect(readFile(inputs.outputPath)).rejects.toThrow();
  });

  it('fails the dependent case, writes no corpus and keeps the existing output when one reviewer rejects a source', async () => {
    const inputs = await prepareInputs({ sources: [buildDraftSource('law').build(), buildDraftSource('other').build()],
      cases: [buildAnswerCase().requiredSourceIds(['other']).build(), buildDeclineCase().build()] });
    await writeFile(join(inputs.directory, 'previous.json'), 'previous corpus');
    const previousOutputPath = join(inputs.directory, 'previous.json');
    stubModels({ review: (input, provider) => provider === 'OPENAI' && input.includes('"id":"other"') ? { ...approve, verdict: 'reject', issues: ['Too broad'] } : approve });

    const report = await reviewAdvisorSourceCorpus({ ...inputs, outputPath: previousOutputPath, environment, now });

    expect(report.passed).toBe(false);
    expect(report.sources.map((record) => [record.id, record.decision])).toEqual([['law', 'approved'], ['other', 'rejected']]);
    expect(report.evaluation[0]?.runs[0]?.cases[0]?.failures).toEqual(['Required sources are not supplied to the model: other']);
    expect(await readFile(previousOutputPath, 'utf8')).toBe('previous corpus');
    expect(await readdir(inputs.directory)).not.toContain('previous.json.tmp');
  });

  it('fails the gate and writes no corpus when a judge flags a forbidden claim', async () => {
    const inputs = await prepareInputs({ sources: [buildDraftSource('law').build()], cases: [buildAnswerCase().build()] });
    stubModels({ judgement: { ...cleanJudgement, forbiddenClaimsPresent: ['lista jest wyczerpująca'] } });

    const report = await reviewAdvisorSourceCorpus({ ...inputs, environment, now });

    expect(report.passed).toBe(false);
    expect(report.evaluation[0]?.runs[0]?.totals).toMatchObject({ forbiddenClaimCases: 1, passed: 0 });
    expect(report.corpus.written).toBe(false);
    await expect(readFile(inputs.outputPath)).rejects.toThrow();
  });

  it('stops with no corpus when the model call limit is exceeded', async () => {
    const inputs = await prepareInputs({ sources: [buildDraftSource('law').build()], cases: [buildAnswerCase().build()] });

    const report = await reviewAdvisorSourceCorpus({ ...inputs, environment: { ...environment, ADVISOR_REVIEW_MAX_CALLS: '3' }, now });

    expect(report.passed).toBe(false);
    expect(report.callCount).toBe(3);
    expect(report.failure).toBe('Model call limit of 3 reached');
    await expect(readFile(inputs.outputPath)).rejects.toThrow();
  });

  it('retries a timed out model call once and counts both attempts', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout'] });
    const inputs = await prepareInputs({ sources: [buildDraftSource('law').build()], cases: [buildDeclineCase().build()] });
    const timeout = Object.assign(new Error('The operation was aborted due to timeout'), { name: 'TimeoutError' });
    const normalResponse = vi.mocked(requestStructuredModelOutput).getMockImplementation() as never as typeof requestStructuredModelOutput;
    vi.mocked(requestStructuredModelOutput).mockRejectedValueOnce(timeout);
    vi.mocked(requestStructuredModelOutput).mockImplementation(normalResponse);

    const report = await completeWithFakeTimers(reviewAdvisorSourceCorpus({ ...inputs, environment, now }));

    expect(report.failure).toBeUndefined();
    expect(report.passed).toBe(true);
    expect(report.callCount).toBe(3);
  });

  it('marks the source reviewFailed, not rejected, after six rate limited attempts and says so in the summary', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout'] });
    const inputs = await prepareInputs({ sources: [buildDraftSource('law').build()], cases: [buildAnswerCase().build()] });
    vi.mocked(requestStructuredModelOutput).mockRejectedValue(OpenAI.APIError.generate(429, {}, 'Provider returned error', new Headers()));

    const report = await completeWithFakeTimers(reviewAdvisorSourceCorpus({ ...inputs, environment, now }));

    expect(report.passed).toBe(false);
    expect(report.callCount).toBe(6);
    expect(report.sources[0]).toMatchObject({ id: 'law', decision: 'reviewFailed', reason: 'Review by ai:ANTHROPIC/claude-reviewer-1 failed: 429 Provider returned error' });
    expect(report.summary).toEqual({ approved: 0, rejected: 0, reviewFailed: 1 });
    expect(report.failure).toBe('No source was approved');
  });

  it('waits for the Retry-After header before retrying a rate limited call', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout'] });
    const inputs = await prepareInputs({ sources: [buildDraftSource('law').build()], cases: [buildDeclineCase().build()] });
    const normalResponse = vi.mocked(requestStructuredModelOutput).getMockImplementation() as never as typeof requestStructuredModelOutput;
    vi.mocked(requestStructuredModelOutput).mockRejectedValueOnce(OpenAI.APIError.generate(429, {}, 'Provider returned error', new Headers({ 'retry-after': '45' })));
    vi.mocked(requestStructuredModelOutput).mockImplementation(normalResponse);
    const pending = reviewAdvisorSourceCorpus({ ...inputs, environment, now });

    await vi.waitFor(() => expect(requestStructuredModelOutput).toHaveBeenCalledTimes(1));
    await vi.advanceTimersByTimeAsync(44_000);
    expect(requestStructuredModelOutput).toHaveBeenCalledTimes(1);
    const report = await completeWithFakeTimers(pending);

    expect(report.passed).toBe(true);
    expect(report.callCount).toBe(3);
  });

  it('retries an incomplete answer once with a higher token limit', async () => {
    const inputs = await prepareInputs({ sources: [buildDraftSource('law').build()], cases: [buildDeclineCase().build()] });
    const normalResponse = vi.mocked(requestStructuredModelOutput).getMockImplementation() as never as typeof requestStructuredModelOutput;
    vi.mocked(requestStructuredModelOutput).mockRejectedValueOnce(new AdvisorError(502, 'INVALID_ANSWER', 'Provider returned an incomplete answer'));
    vi.mocked(requestStructuredModelOutput).mockImplementation(normalResponse);

    const report = await reviewAdvisorSourceCorpus({ ...inputs, environment, now });

    expect(report.passed).toBe(true);
    expect(vi.mocked(requestStructuredModelOutput).mock.calls.map(([, request]) => request.maximumTokens).slice(0, 2)).toEqual([8000, 16_000]);
  });

  it('reuses approvals from a previous report with identical draft, document, reviewers and prompt, and reviews the rest', async () => {
    const inputs = await prepareInputs({ sources: [buildDraftSource('law').build(), buildDraftSource('other').build()], cases: [buildDeclineCase().build()] });
    stubModels({ review: (input, provider) => provider === 'OPENAI' && input.includes('"id":"other"') ? { ...approve, verdict: 'reject', issues: ['Too broad'] } : approve });
    const firstReport = await reviewAdvisorSourceCorpus({ ...inputs, environment, now });
    stubModels();
    vi.mocked(requestStructuredModelOutput).mockClear();

    const resumedReport = await reviewAdvisorSourceCorpus({ ...inputs, environment, now, resumeReportId: firstReport.reportId });

    expect(resumedReport.sources.map((record) => [record.id, record.decision, record.reusedFromReportId])).toEqual([['law', 'approved', firstReport.reportId], ['other', 'approved', undefined]]);
    const reviewCalls = vi.mocked(requestStructuredModelOutput).mock.calls.filter(([, request]) => request.schemaName === 'advisor_source_review');
    expect(reviewCalls.map(([connection]) => connection.provider)).toEqual(['ANTHROPIC', 'OPENAI']);
  });

  it('records the unmet checks and issues as the rejection reason, and accepts an effectiveFrom before the official text start', async () => {
    const inputs = await prepareInputs({ sources: [buildDraftSource('law').build()], cases: [buildAnswerCase().build()] });
    stubModels({ review: () => ({ ...approve, verdict: 'reject', checks: { ...approve.checks, effectiveDatesSupported: 'fail' }, issues: ['Provision starts later than effectiveFrom'] }) });

    const report = await reviewAdvisorSourceCorpus({ ...inputs, environment, now });

    expect(report.sources[0]?.reason).toBe('Rejected by ai:ANTHROPIC/claude-reviewer-1: effectiveDatesSupported=fail; Provision starts later than effectiveFrom');
    const reviewRequest = vi.mocked(requestStructuredModelOutput).mock.calls.find(([, request]) => request.schemaName === 'advisor_source_review')?.[1];
    expect(reviewRequest?.instruction).toContain('fail it only when the official text shows the provision starts later than effectiveFrom or is not yet in force');
  });

  it.each([
    ['a reviewer is also an answering model', { ADVISOR_REVIEW_ANSWER_MODELS: 'OPENAI:gpt-reviewer-1' }, 'ai:OLLAMA/drafter-1'],
    ['a reviewer drafted the corpus', {}, 'ai:ANTHROPIC/claude-reviewer-1'],
    ['both reviewers use the same provider', { ADVISOR_REVIEW_MODELS: 'OPENAI:gpt-reviewer-1,OPENAI:gpt-reviewer-2' }, 'human'],
    ['two OpenRouter reviewers share a model vendor', { ADVISOR_REVIEW_MODELS: 'OPENROUTER:google/gemma-a:free,OPENROUTER:google/gemini-b' }, 'human'],
    ['a reviewer shares the vendor of the drafting model', {}, 'ai:ANTHROPIC/claude-drafter-1'],
    ['a reviewer model is not pinned', { ADVISOR_REVIEW_MODELS: 'ANTHROPIC:claude-latest,OPENAI:gpt-reviewer-1' }, 'human'],
  ])('refuses before any fetch or model call when %s', async (_name, environmentOverrides, draftedBy) => {
    const inputs = await prepareInputs({ sources: [buildDraftSource('law').build()], cases: [buildAnswerCase().build()], draftedBy });

    await expect(reviewAdvisorSourceCorpus({ ...inputs, environment: { ...environment, ...environmentOverrides }, now })).rejects.toThrow(AdvisorSourceReviewConfigurationError);
    expect(fetch).not.toHaveBeenCalled();
    expect(requestStructuredModelOutput).not.toHaveBeenCalled();
  });

  it('accepts two OpenRouter reviewers from different model vendors', async () => {
    const inputs = await prepareInputs({ sources: [buildDraftSource('law').build()], cases: [buildAnswerCase().build(), buildDeclineCase().build(), buildInsufficientCase().build()], draftedBy: 'human' });

    const report = await reviewAdvisorSourceCorpus({ ...inputs, environment: { ...environment, ADVISOR_REVIEW_MODELS: 'OPENROUTER:google/gemma-a:free,OPENROUTER:nvidia/nemotron-b:free' }, now });

    expect(report.reviewers).toEqual(['ai:OPENROUTER/google/gemma-a:free', 'ai:OPENROUTER/nvidia/nemotron-b:free']);
  });

  it('refuses an output path inside the repository', async () => {
    const inputs = await prepareInputs({ sources: [buildDraftSource('law').build()], cases: [buildAnswerCase().build()] });

    await expect(reviewAdvisorSourceCorpus({ ...inputs, outputPath: join(inputs.directory, 'out', 'corpus.json'), repositoryRoot: inputs.directory, environment, now }))
      .rejects.toThrow('The output path must be outside the repository');
    expect(fetch).not.toHaveBeenCalled();
  });
});
