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
});
