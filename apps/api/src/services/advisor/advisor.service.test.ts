import { Builder } from 'builder-pattern';
import type { PrismaClient } from '@prisma/client';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { answerAdvisorQuestion } from './advisor.service.js';
import { generateAdvisorResponse } from './advisor-provider.js';

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
      calculations: [], evidence: [], sources: [], provenance: { companyId: 'company', environment: 'TEST', period: '2026-09', provider: 'OPENAI', model: 'configured-model', generatedAt: expect.any(String), recordsIncluded: false, evidenceTruncated: false, sourceVersion: 'unreviewed' } });
    expect(database.advisorTurn.updateMany).toHaveBeenCalledWith({ where: { id: 'turn', status: 'PENDING' }, data: { status: 'COMPLETED', finishedAt: expect.any(Date), answer } });
    vi.mocked(generateAdvisorResponse).mockClear();
    await expect(answerAdvisorQuestion(request, { ...options, scope: { ...options.scope, questionKind: 'tax' } })).rejects.toThrow('No reviewed tax sources cover this period');
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
      provenance: { provider: 'OPENAI', model: 'configured-model', recordsIncluded: false, sourceVersion: 'not-applicable' } });
    expect(generateAdvisorResponse).not.toHaveBeenCalled();
    expect(database.advisorConnection.updateMany).not.toHaveBeenCalled();
    expect(database.advisorTurn.findMany).not.toHaveBeenCalled();
    expect(database.advisorTurn.updateMany).toHaveBeenCalledWith({ where: { id: 'turn', status: 'PENDING' }, data: { status: 'COMPLETED', finishedAt: expect.any(Date), answer } });
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
