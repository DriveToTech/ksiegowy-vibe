import { Builder } from 'builder-pattern';
import type { PrismaClient } from '@prisma/client';
import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildApp } from '../app.js';
import { loadAuthConfig } from '../lib/auth-config.js';

describe('advisorRoutes()', () => {
  let application: FastifyInstance;
  let token: string;
  let database: PrismaClient;
  beforeEach(async () => {
    vi.stubEnv('ADVISOR_ENABLED', 'true');
    vi.stubEnv('ADVISOR_TAX_SOURCES_PATH', '');
    vi.stubEnv('ADVISOR_OLLAMA_URL', '');
    vi.stubEnv('CORS_ORIGIN', 'http://localhost:3000');
    database = Builder<PrismaClient>()
      .companyMembership({ findUnique: vi.fn().mockResolvedValue({ id: 'membership', companyId: 'company', role: 'ADMIN',
        company: { advisorPolicy: { enabled: true, allowedProviders: ['OPENAI'], retentionDays: 30 } } }) } as never)
      .advisorConnection({ findMany: vi.fn().mockResolvedValue([{ provider: 'OPENAI', model: 'configured-model', credentialEncrypted: 'secret', credentialNonce: 'nonce', testedAt: null }]) } as never)
      .advisorConversation({ findFirst: vi.fn().mockResolvedValue(null) } as never)
      .build();
    application = await buildApp({ logger: false, prismaClient: database,
      authConfig: loadAuthConfig({ NODE_ENV: 'test', JWT_SECRET: 'access-test-secret', JWT_REFRESH_SECRET: 'refresh-test-secret' }) });
    await application.ready();
    token = (application.jwt as unknown as { access: { sign: (payload: object) => string } }).access.sign({ sub: 'user', email: 'user@example.com', companies: [] });
  });
  afterEach(async () => { await application.close(); vi.unstubAllEnvs(); vi.restoreAllMocks(); });

  it('returns masked settings using current membership instead of token company claims', async () => {
    const response = await application.inject({ method: 'GET', url: '/companies/company/advisor/settings', cookies: { auth_token: token } });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ enabled: true, canManagePolicy: true, operatorEnabled: true, allowedProviders: ['OPENAI'], allowedConnectors: [], retentionDays: 30,
      ollamaAvailable: false, reviewedSourceCount: 0, connections: [{ provider: 'OPENAI', model: 'configured-model', hasCredential: true, testedAt: null }] });
    expect(database.companyMembership.findUnique).toHaveBeenCalledWith({ where: { companyId_userId: { companyId: 'company', userId: 'user' } }, include: { company: { select: { advisorPolicy: true } } } });
  });
  it('denies revoked membership without loading credentials', async () => {
    vi.mocked(database.companyMembership.findUnique).mockResolvedValue(null);
    const response = await application.inject({ method: 'GET', url: '/companies/company/advisor/settings', cookies: { auth_token: token } });
    expect(response.statusCode).toBe(403);
    expect(response.json()).toEqual({ code: 'ACCESS_DENIED', message: 'Current company membership is required' });
    expect(database.advisorConnection.findMany).not.toHaveBeenCalled();
  });
  it('requires an explicit environment and scopes history to its owner', async () => {
    const missing = await application.inject({ method: 'GET', url: '/companies/company/advisor/conversations/foreign', cookies: { auth_token: token } });
    expect(missing.statusCode).toBe(400);
    const response = await application.inject({ method: 'GET', url: '/companies/company/advisor/conversations/foreign', cookies: { auth_token: token }, headers: { 'x-ksef-environment': 'TEST' } });
    expect(response.statusCode).toBe(404);
    expect(vi.mocked(database.advisorConversation.findFirst).mock.calls[0]?.[0]?.where).toEqual({ id: 'foreign', membershipId: 'membership', environment: 'TEST', expiresAt: { gt: expect.any(Date) } });
  });
  it('rejects cross-origin mutations and viewer policy changes', async () => {
    const crossOrigin = await application.inject({ method: 'PATCH', url: '/companies/company/advisor/policy', cookies: { auth_token: token }, headers: { origin: 'https://attacker.example' }, payload: {} });
    expect(crossOrigin.statusCode).toBe(403);
    vi.mocked(database.companyMembership.findUnique).mockResolvedValue({ id: 'membership', role: 'VIEWER' } as never);
    const viewer = await application.inject({ method: 'PATCH', url: '/companies/company/advisor/policy', cookies: { auth_token: token }, headers: { origin: 'http://localhost:3000' }, payload: {} });
    expect(viewer.statusCode).toBe(403);
    expect(viewer.json()).toEqual({ code: 'ACCESS_DENIED', message: 'Administrator role is required' });
  });

  it('returns a completed duplicate without claiming another provider call, and rejects changed input', async () => {
    const scope = { questionKind: 'records', period: '2026-09', includeRecords: false };
    const requestId = 'bb4d11b1-b939-49a7-95bb-800dd590b4f1';
    const turn = { id: 'turn', conversationId: 'conversation', requestId, question: 'Question', scope, status: 'COMPLETED', answer: { shortAnswer: 'Stored answer' }, createdAt: new Date() };
    vi.mocked(database.advisorConversation.findFirst).mockResolvedValue({ id: 'conversation', provider: 'OPENAI' } as never);
    const transaction = Builder<PrismaClient>().$queryRaw(vi.fn().mockResolvedValue([]) as never)
      .advisorTurn({ findUnique: vi.fn().mockResolvedValue(turn) } as never).build();
    database.$transaction = vi.fn().mockImplementation((operation: (connection: PrismaClient) => Promise<unknown>) => operation(transaction));
    const request = { method: 'POST' as const, url: '/companies/company/advisor/conversations/conversation/messages', cookies: { auth_token: token },
      headers: { origin: 'http://localhost:3000', 'x-ksef-environment': 'TEST' }, payload: { requestId, question: 'Question', scope } };
    const duplicate = await application.inject(request);
    expect(duplicate.statusCode).toBe(200);
    expect(duplicate.json()).toEqual({ status: 'COMPLETED', answer: turn.answer });
    const changed = await application.inject({ ...request, payload: { ...request.payload, question: 'Different question' } });
    expect(changed.statusCode).toBe(409);
    expect(changed.json()).toEqual({ code: 'REQUEST_CONFLICT', message: 'Request identifier was already used for different input' });
  });
});
