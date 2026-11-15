import { Builder } from 'builder-pattern';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { PrismaClient } from '@prisma/client';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { answerAdvisorQuestion, composeAdvisorModelInput, requireAdvisorReplyTarget } from './advisor.service.js';
import { generateAdvisorResponse } from './advisor-provider.js';
import { advisorTaxDisclaimer } from './advisor-contract.js';
import { hashAdvisorSourceReview } from './advisor-sources.js';

vi.mock('./advisor-provider.js', () => ({ generateAdvisorResponse: vi.fn() }));
afterEach(() => { vi.unstubAllEnvs(); vi.resetAllMocks(); });

describe('answerAdvisorQuestion()', () => {
  it('rejects fabricated citations, then stores only a validated answer with server provenance', async () => {
    vi.stubEnv('ADVISOR_ENABLED', 'true'); vi.stubEnv('ADVISOR_TAX_SOURCES_PATH', '');
    const connection = { id: 'connection', provider: 'OPENAI', model: 'configured-model', credentialEncrypted: null, credentialNonce: null };
    const database = Builder<PrismaClient>()
      .companyMembership({ findUnique: vi.fn().mockResolvedValue({ id: 'membership', company: { advisorPolicy: { enabled: true, allowedProviders: ['OPENAI'] } } }) } as never)
      .advisorConversation({ findFirst: vi.fn().mockResolvedValue({ id: 'conversation', provider: 'OPENAI', model: 'configured-model', environment: 'TEST' }) } as never)
      .advisorConnection({ findUnique: vi.fn().mockResolvedValue(connection), updateMany: vi.fn().mockResolvedValue({ count: 1 }) } as never)
      .advisorTurn({ findMany: vi.fn().mockResolvedValue([]), updateMany: vi.fn().mockResolvedValue({ count: 1 }) } as never).build();
    const request = Builder<FastifyRequest>().server(Builder<FastifyInstance>().prisma(database).build()).user({ sub: 'user' } as never).accessJwtVerify(vi.fn().mockResolvedValue({ sub: 'user' }) as never).build();
    const options = { companyId: 'company', conversationId: 'conversation', turnId: 'turn', question: 'What information is needed?',
      scope: { questionKind: 'records' as const, period: '2026-09', includeRecords: false }, signal: new AbortController().signal };
    const output = { status: 'needs_clarification' as const, shortAnswer: 'Provide a period', explanation: '', assumptions: [], questions: ['Which records?'], evidenceIds: [], sourceIds: [], containsTaxGuidance: false };
    vi.mocked(generateAdvisorResponse).mockResolvedValueOnce({ ...output, evidenceIds: ['foreign-invoice'] });
    await expect(answerAdvisorQuestion(request, options)).rejects.toThrow('Provider referenced evidence outside the supplied context');
    expect(database.advisorTurn.updateMany).not.toHaveBeenCalled();
    vi.mocked(generateAdvisorResponse).mockResolvedValue(output);
    const answer = await answerAdvisorQuestion(request, options);
    expect(answer).toEqual({ status: output.status, shortAnswer: output.shortAnswer, explanation: '', assumptions: [], questions: output.questions,
      calculations: [], evidence: [], sources: [], provenance: { companyId: 'company', environment: 'TEST', period: '2026-09', provider: 'OPENAI', model: 'configured-model', generatedAt: expect.any(String), recordsIncluded: false, evidenceTruncated: false, sourceVersion: 'unreviewed', sourceReviewMethod: 'not-applicable' } });
    expect(database.advisorTurn.updateMany).toHaveBeenCalledWith({ where: { id: 'turn', status: 'PENDING' }, data: { status: 'COMPLETED', finishedAt: expect.any(Date), answer } });
    vi.mocked(generateAdvisorResponse).mockClear();
    await expect(answerAdvisorQuestion(request, { ...options, scope: { ...options.scope, questionKind: 'tax' } })).rejects.toThrow('No AI-reviewed tax sources cover this period');
    expect(generateAdvisorResponse).not.toHaveBeenCalled();
  });

  it('declines an out-of-scope question without loading context or calling the provider, and stores the answer', async () => {
    vi.stubEnv('ADVISOR_ENABLED', 'true');
    const connection = { id: 'connection', provider: 'OPENAI', model: 'configured-model', credentialEncrypted: null, credentialNonce: null };
    const database = Builder<PrismaClient>()
      .companyMembership({ findUnique: vi.fn().mockResolvedValue({ id: 'membership', company: { advisorPolicy: { enabled: true, allowedProviders: ['OPENAI'] } } }) } as never)
      .advisorConversation({ findFirst: vi.fn().mockResolvedValue({ id: 'conversation', provider: 'OPENAI', model: 'configured-model', environment: 'TEST' }) } as never)
      .advisorConnection({ findUnique: vi.fn().mockResolvedValue(connection), updateMany: vi.fn() } as never)
      .advisorTurn({ findMany: vi.fn(), updateMany: vi.fn().mockResolvedValue({ count: 1 }) } as never).build();
    const request = Builder<FastifyRequest>().server(Builder<FastifyInstance>().prisma(database).build()).user({ sub: 'user' } as never).accessJwtVerify(vi.fn().mockResolvedValue({ sub: 'user' }) as never).build();
    const answer = await answerAdvisorQuestion(request, { companyId: 'company', conversationId: 'conversation', turnId: 'turn', question: 'Czy estoński CIT mi się opłaca?',
      scope: { questionKind: 'tax', period: '2026-09', includeRecords: true }, signal: new AbortController().signal });
    expect(answer).toMatchObject({ status: 'declined', assumptions: [], questions: [], evidence: [], calculations: [], sources: [],
      provenance: { provider: 'OPENAI', model: 'configured-model', recordsIncluded: false, sourceVersion: 'not-applicable', sourceReviewMethod: 'not-applicable' }, disclaimer: advisorTaxDisclaimer });
    expect(generateAdvisorResponse).not.toHaveBeenCalled();
    expect(database.advisorConnection.updateMany).not.toHaveBeenCalled();
    expect(database.advisorTurn.findMany).not.toHaveBeenCalled();
    expect(database.advisorTurn.updateMany).toHaveBeenCalledWith({ where: { id: 'turn', status: 'PENDING' }, data: { status: 'COMPLETED', finishedAt: expect.any(Date), answer } });
  });

  it('attaches the AI-review disclaimer to a tax answer that cites sources, and none to a records answer without sources', async () => {
    vi.stubEnv('ADVISOR_ENABLED', 'true');
    const unsigned = { id: 'rates', title: 'Rates', url: 'https://eli.gov.pl/act', section: 'art. 41', effectiveFrom: '2026-01-01', effectiveUntil: '2026-12-31',
      reviewedAt: '2020-01-01', reviewExpiresAt: '2999-01-01', reviewedBy: 'ai:ANTHROPIC/claude-model+ai:OPENAI/gpt-model', reviewMethod: 'ai' as const,
      reviewReportId: '0b9a5e0e-7a0c-4d5b-8f1e-3c2d1a4b5c6d', excerpt: 'Excerpt' };
    const directory = await mkdtemp(join(tmpdir(), 'advisor-service-'));
    const sourcePath = join(directory, 'sources.json');
    await writeFile(sourcePath, JSON.stringify([{ ...unsigned, reviewHash: hashAdvisorSourceReview(unsigned) }]));
    vi.stubEnv('ADVISOR_TAX_SOURCES_PATH', sourcePath);
    const connection = { id: 'connection', provider: 'OPENAI', model: 'configured-model', credentialEncrypted: null, credentialNonce: null };
    const database = Builder<PrismaClient>()
      .companyMembership({ findUnique: vi.fn().mockResolvedValue({ id: 'membership', company: { advisorPolicy: { enabled: true, allowedProviders: ['OPENAI'] } } }) } as never)
      .advisorConversation({ findFirst: vi.fn().mockResolvedValue({ id: 'conversation', provider: 'OPENAI', model: 'configured-model', environment: 'TEST' }) } as never)
      .advisorConnection({ findUnique: vi.fn().mockResolvedValue(connection), updateMany: vi.fn().mockResolvedValue({ count: 1 }) } as never)
      .advisorTurn({ findMany: vi.fn().mockResolvedValue([]), updateMany: vi.fn().mockResolvedValue({ count: 1 }) } as never).build();
    const request = Builder<FastifyRequest>().server(Builder<FastifyInstance>().prisma(database).build()).user({ sub: 'user' } as never).accessJwtVerify(vi.fn().mockResolvedValue({ sub: 'user' }) as never).build();
    const output = { status: 'answered' as const, shortAnswer: 'Answer', explanation: '', assumptions: [], questions: [], evidenceIds: [], sourceIds: ['rates'], containsTaxGuidance: true };
    vi.mocked(generateAdvisorResponse).mockResolvedValueOnce(output);
    const taxAnswer = await answerAdvisorQuestion(request, { companyId: 'company', conversationId: 'conversation', turnId: 'turn', question: 'Jaka jest stawka VAT?',
      scope: { questionKind: 'tax', period: '2026-09', includeRecords: false }, signal: new AbortController().signal });
    expect(taxAnswer.disclaimer).toBe(advisorTaxDisclaimer);
    expect(taxAnswer.sources.map((source) => source.id)).toEqual(['rates']);
    expect(taxAnswer.provenance.sourceReviewMethod).toBe('ai');
    vi.mocked(generateAdvisorResponse).mockResolvedValueOnce({ ...output, sourceIds: [], containsTaxGuidance: false });
    const recordsAnswer = await answerAdvisorQuestion(request, { companyId: 'company', conversationId: 'conversation', turnId: 'turn', question: 'Podsumuj fakturę',
      scope: { questionKind: 'records', period: '2026-09', includeRecords: false }, signal: new AbortController().signal });
    expect(recordsAnswer).not.toHaveProperty('disclaimer');
    expect(recordsAnswer.provenance.sourceReviewMethod).toBe('not-applicable');
  });

  describe('records without data', () => {
    const arrange = () => {
      vi.stubEnv('ADVISOR_ENABLED', 'true'); vi.stubEnv('ADVISOR_TAX_SOURCES_PATH', '');
      const connection = { id: 'connection', provider: 'OPENAI', model: 'configured-model', credentialEncrypted: null, credentialNonce: null };
      const database = Builder<PrismaClient>()
        .companyMembership({ findUnique: vi.fn().mockResolvedValue({ id: 'membership', company: { advisorPolicy: { enabled: true, allowedProviders: ['OPENAI'] } } }) } as never)
        .advisorConversation({ findFirst: vi.fn().mockResolvedValue({ id: 'conversation', provider: 'OPENAI', model: 'configured-model', environment: 'TEST' }) } as never)
        .advisorConnection({ findUnique: vi.fn().mockResolvedValue(connection), updateMany: vi.fn().mockResolvedValue({ count: 1 }) } as never)
        .advisorTurn({ findMany: vi.fn().mockResolvedValue([]), updateMany: vi.fn().mockResolvedValue({ count: 1 }) } as never)
        .invoice({ groupBy: vi.fn().mockResolvedValue([]), findMany: vi.fn().mockResolvedValue([]) } as never)
        .incomingInvoice({ findMany: vi.fn().mockResolvedValue([]) } as never).build();
      const request = Builder<FastifyRequest>().server(Builder<FastifyInstance>().prisma(database).build()).user({ sub: 'user' } as never).accessJwtVerify(vi.fn().mockResolvedValue({ sub: 'user' }) as never).build();
      return { database, request };
    };
    const options = { companyId: 'company', conversationId: 'conversation', turnId: 'turn', question: 'Podsumuj fakturę', signal: new AbortController().signal };

    it('fails a records question over an empty month before reserving or calling the provider', async () => {
      const { database, request } = arrange();
      await expect(answerAdvisorQuestion(request, { ...options, scope: { questionKind: 'records', period: '2026-09', includeRecords: true } }))
        .rejects.toMatchObject({ code: 'RECORDS_UNAVAILABLE', statusCode: 422 });
      expect(database.advisorConnection.updateMany).not.toHaveBeenCalled();
      expect(generateAdvisorResponse).not.toHaveBeenCalled();
    });

    it('still calls the provider for a tax question over an empty month', async () => {
      const { request } = arrange();
      const unsigned = { id: 'rates', title: 'Rates', url: 'https://eli.gov.pl/act', section: 'art. 41', effectiveFrom: '2026-01-01', effectiveUntil: '2026-12-31',
        reviewedAt: '2020-01-01', reviewExpiresAt: '2999-01-01', reviewedBy: 'ai:ANTHROPIC/claude-model+ai:OPENAI/gpt-model', reviewMethod: 'ai' as const,
        reviewReportId: '0b9a5e0e-7a0c-4d5b-8f1e-3c2d1a4b5c6d', excerpt: 'Excerpt' };
      const directory = await mkdtemp(join(tmpdir(), 'advisor-service-'));
      await writeFile(join(directory, 'sources.json'), JSON.stringify([{ ...unsigned, reviewHash: hashAdvisorSourceReview(unsigned) }]));
      vi.stubEnv('ADVISOR_TAX_SOURCES_PATH', join(directory, 'sources.json'));
      vi.mocked(generateAdvisorResponse).mockResolvedValue({ status: 'answered', shortAnswer: 'Answer', explanation: '', assumptions: [], questions: [], evidenceIds: [], sourceIds: ['rates'], containsTaxGuidance: true });
      const answer = await answerAdvisorQuestion(request, { ...options, question: 'Jaka jest stawka VAT?', scope: { questionKind: 'tax', period: '2026-09', includeRecords: true } });
      expect(answer.status).toBe('answered');
      expect(generateAdvisorResponse).toHaveBeenCalledTimes(1);
    });
  });

  describe('requireAdvisorReplyTarget()', () => {
    const arrange = (turn: unknown) => Builder<PrismaClient>().advisorTurn({ findFirst: vi.fn().mockResolvedValue(turn) } as never).build();

    it('returns the original question and clarification questions of a completed clarification', async () => {
      const database = arrange({ question: 'Original question', answer: { status: 'needs_clarification', questions: ['Which month?'] } });
      await expect(requireAdvisorReplyTarget(database, 'conversation', 'turn')).resolves.toEqual({ question: 'Original question', questions: ['Which month?'] });
      expect(database.advisorTurn.findFirst).toHaveBeenCalledWith({ where: { id: 'turn', conversationId: 'conversation', status: 'COMPLETED' }, select: { question: true, answer: true } });
    });

    it('rejects a missing target and a target that is not a clarification with INVALID_REPLY', async () => {
      await expect(requireAdvisorReplyTarget(arrange(null), 'conversation', 'turn')).rejects.toMatchObject({ code: 'INVALID_REPLY', statusCode: 409 });
      await expect(requireAdvisorReplyTarget(arrange({ question: 'Q', answer: { status: 'answered', questions: [] } }), 'conversation', 'turn')).rejects.toMatchObject({ code: 'INVALID_REPLY', statusCode: 409 });
    });
  });

  describe('composeAdvisorModelInput()', () => {
    it('keeps the clarification inside the untrusted data envelope and the original question with a reply without records', () => {
      const input = JSON.parse(composeAdvisorModelInput({ question: 'September', scope: { questionKind: 'records', period: '2026-09', includeRecords: false },
        previousQuestions: [], context: { calculations: [], evidence: [], evidenceTruncated: false }, sources: [],
        clarification: { question: 'Original question', questions: ['Which month?'] } })) as Record<string, unknown>;
      expect(input['untrustedAccountingData']).toEqual({ calculations: [], evidence: [], evidenceTruncated: false, clarification: { question: 'Original question', questions: ['Which month?'] } });
      expect(input).not.toHaveProperty('clarification');
    });
  });

  describe('rejected generations', () => {
    const connection = { id: 'connection', provider: 'OPENAI', model: 'configured-model', credentialEncrypted: null, credentialNonce: null };
    const options = { companyId: 'company', conversationId: 'conversation', turnId: 'turn', question: 'What information is needed?',
      scope: { questionKind: 'records' as const, period: '2026-09', includeRecords: false }, signal: new AbortController().signal };
    const output = { status: 'answered' as const, shortAnswer: 'Answer', explanation: '', assumptions: [], questions: [], evidenceIds: [], sourceIds: [], containsTaxGuidance: false };
    const arrange = (overrides: { conversationModel?: string; connectionReads?: unknown[] } = {}) => {
      vi.stubEnv('ADVISOR_ENABLED', 'true'); vi.stubEnv('ADVISOR_TAX_SOURCES_PATH', '');
      const findUnique = vi.fn();
      for (const read of overrides.connectionReads ?? [connection, connection]) findUnique.mockResolvedValueOnce(read);
      const database = Builder<PrismaClient>()
        .companyMembership({ findUnique: vi.fn().mockResolvedValue({ id: 'membership', company: { advisorPolicy: { enabled: true, allowedProviders: ['OPENAI'] } } }) } as never)
        .advisorConversation({ findFirst: vi.fn().mockResolvedValue({ id: 'conversation', provider: 'OPENAI', model: overrides.conversationModel ?? 'configured-model', environment: 'TEST' }) } as never)
        .advisorConnection({ findUnique, updateMany: vi.fn().mockResolvedValue({ count: 1 }) } as never)
        .advisorTurn({ findMany: vi.fn().mockResolvedValue([]), updateMany: vi.fn().mockResolvedValue({ count: 1 }) } as never).build();
      const request = Builder<FastifyRequest>().server(Builder<FastifyInstance>().prisma(database).build()).user({ sub: 'user' } as never).accessJwtVerify(vi.fn().mockResolvedValue({ sub: 'user' }) as never).build();
      return { database, request };
    };

    it('rejects fabricated source identifiers as INVALID_CITATION without storing the turn', async () => {
      const { database, request } = arrange();
      vi.mocked(generateAdvisorResponse).mockResolvedValue({ ...output, sourceIds: ['invented-law'] });
      await expect(answerAdvisorQuestion(request, options)).rejects.toMatchObject({ code: 'INVALID_CITATION', statusCode: 502 });
      expect(database.advisorTurn.updateMany).not.toHaveBeenCalled();
    });

    it('rejects fabricated evidence identifiers with the INVALID_CITATION code', async () => {
      const { request } = arrange();
      vi.mocked(generateAdvisorResponse).mockResolvedValue({ ...output, evidenceIds: ['foreign-invoice'] });
      await expect(answerAdvisorQuestion(request, options)).rejects.toMatchObject({ code: 'INVALID_CITATION', statusCode: 502 });
    });

    it('rejects tax guidance that cites no reviewed source', async () => {
      const { database, request } = arrange();
      vi.mocked(generateAdvisorResponse).mockResolvedValue({ ...output, containsTaxGuidance: true });
      await expect(answerAdvisorQuestion(request, options)).rejects.toMatchObject({ code: 'TAX_SOURCES_UNAVAILABLE', statusCode: 422 });
      expect(database.advisorTurn.updateMany).not.toHaveBeenCalled();
    });

    it('rejects a conversation whose model differs from the connection before calling the provider', async () => {
      const { database, request } = arrange({ conversationModel: 'previous-model', connectionReads: [connection] });
      await expect(answerAdvisorQuestion(request, options)).rejects.toMatchObject({ code: 'MODEL_CHANGED', statusCode: 409 });
      expect(generateAdvisorResponse).not.toHaveBeenCalled();
      expect(database.advisorTurn.updateMany).not.toHaveBeenCalled();
    });

    it('rejects the answer when the connection was changed or removed during generation', async () => {
      vi.mocked(generateAdvisorResponse).mockResolvedValue(output);
      const rotated = arrange({ connectionReads: [connection, { ...connection, credentialEncrypted: Buffer.from('rotated') }] });
      await expect(answerAdvisorQuestion(rotated.request, options)).rejects.toMatchObject({ code: 'CONNECTION_CHANGED', statusCode: 409 });
      expect(rotated.database.advisorTurn.updateMany).not.toHaveBeenCalled();
      const removed = arrange({ connectionReads: [connection, null] });
      await expect(answerAdvisorQuestion(removed.request, options)).rejects.toMatchObject({ code: 'CONNECTION_CHANGED', statusCode: 409 });
      const remodeled = arrange({ connectionReads: [connection, { ...connection, model: 'other-model' }] });
      await expect(answerAdvisorQuestion(remodeled.request, options)).rejects.toMatchObject({ code: 'CONNECTION_CHANGED', statusCode: 409 });
    });
  });
});
