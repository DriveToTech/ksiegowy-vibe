import { hashAdvisorSourceReview } from '../services/advisor/advisor-sources.js';
import { Builder } from 'builder-pattern';
import type { PrismaClient } from '@prisma/client';
import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildApp } from '../app.js';
import { loadAuthConfig } from '../lib/auth-config.js';
import { encrypt } from '@ksiegowy/shared-utils';
import { AdvisorError } from '../services/advisor/advisor-contract.js';
import type * as AdvisorService from '../services/advisor/advisor.service.js';

const { answerAdvisorQuestion } = vi.hoisted(() => ({ answerAdvisorQuestion: vi.fn() }));
vi.mock('../services/advisor/advisor.service.js', async (importOriginal) => ({ ...await importOriginal<typeof AdvisorService>(), answerAdvisorQuestion }));

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
    expect(response.json()).toEqual({ enabled: true, canManagePolicy: true, canManageConnections: true, operatorEnabled: true, allowedProviders: ['OPENAI'], allowedConnectors: [], retentionDays: 30,
      ollamaAvailable: false, reviewedSourceCount: 0, connections: [{ provider: 'OPENAI', model: 'configured-model', hasCredential: true, testedAt: null }] });
    expect(database.companyMembership.findUnique).toHaveBeenCalledWith({ where: { companyId_userId: { companyId: 'company', userId: 'user' } }, include: { company: { select: { advisorPolicy: true } } } });
  });
  describe('GET /settings tax source coverage', () => {
    const coveringSource = { id: 'source', title: 'Title', url: 'https://www.podatki.gov.pl/source', section: 'Section', effectiveFrom: '2026-01-01',
      effectiveUntil: '2026-12-31', reviewedAt: '2026-01-02', reviewExpiresAt: '2099-01-01', reviewedBy: 'ai:ANTHROPIC/claude-model+ai:OPENAI/gpt-model', reviewMethod: 'ai' as const,
      reviewReportId: '0b9a5e0e-7a0c-4d5b-8f1e-3c2d1a4b5c6d', excerpt: 'Excerpt text' };
    const requestCoverage = (period: string) => application.inject({ method: 'GET', url: `/companies/company/advisor/settings?period=${period}`, cookies: { auth_token: token } });

    it('reports no coverage without a corpus', async () => {
      const response = await requestCoverage('2026-03');
      expect(response.json().taxSourceCoverage).toEqual({ period: '2026-03', covered: false, sourceVersion: 'unreviewed' });
    });
    it('reports coverage by version only, never source text', async () => {
      const sourcePath = join(mkdtempSync(join(tmpdir(), 'advisor-sources-')), 'sources.json');
      writeFileSync(sourcePath, JSON.stringify([{ ...coveringSource, reviewHash: hashAdvisorSourceReview(coveringSource) }]));
      vi.stubEnv('ADVISOR_TAX_SOURCES_PATH', sourcePath);
      const covered = await requestCoverage('2026-03');
      expect(covered.json().taxSourceCoverage).toEqual({ period: '2026-03', covered: true, sourceVersion: expect.stringMatching(/^[0-9a-f]{64}$/) });
      expect(covered.body).not.toContain('Excerpt text');
      expect((await requestCoverage('2027-03')).json().taxSourceCoverage.covered).toBe(false);
    });
    it('rejects an invalid period', async () => {
      expect((await requestCoverage('2026-13')).statusCode).toBe(400);
    });
    it('denies non-members', async () => {
      vi.mocked(database.companyMembership.findUnique).mockResolvedValue(null);
      expect((await requestCoverage('2026-03')).statusCode).toBe(403);
    });
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
    const differentReply = await application.inject({ ...request, payload: { ...request.payload, replyToTurnId: 'clh1234567890abcdefghijkl' } });
    expect(differentReply.statusCode).toBe(409);
    expect(differentReply.json()).toEqual({ code: 'REQUEST_CONFLICT', message: 'Request identifier was already used for different input' });
    const malformedReply = await application.inject({ ...request, payload: { ...request.payload, replyToTurnId: 'not-a-cuid' } });
    expect(malformedReply.statusCode).toBe(400);
  });

  describe('POST /connections/:provider/model-preview', () => {
    const signToken = (subject: string) => (application.jwt as unknown as { access: { sign: (payload: object) => string } }).access.sign({ sub: subject, email: 'user@example.com', companies: [] });
    const previewRequest = (provider: string, subject: string, payload: object) => ({ method: 'POST' as const, url: `/companies/company/advisor/connections/${provider}/model-preview`,
      cookies: { auth_token: signToken(subject) }, headers: { origin: 'http://localhost:3000' }, payload });
    const stubUsage = (userCount: number, companyCount = userCount) => {
      const usage = { upsert: vi.fn().mockResolvedValue({ count: userCount }), aggregate: vi.fn().mockResolvedValue({ _sum: { count: companyCount } }), update: vi.fn() };
      Object.assign(database, { advisorModelPreviewUsage: usage });
      return usage;
    };
    const stubModels = () => vi.stubGlobal('fetch', vi.fn().mockImplementation(async () => new Response(JSON.stringify({ data: [{ id: 'model' }] }))));
    afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

    it('discovers models with a transient key, never touching stored connections, and throttles repeated requests', async () => {
      const request = vi.fn().mockImplementation(async () => new Response(JSON.stringify({ data: [{ id: 'b-model' }, { id: 'a-model' }] })));
      vi.stubGlobal('fetch', request);
      const usage = stubUsage(1);
      const first = await application.inject(previewRequest('OPENAI', 'preview-user', { credential: 'transient-key' }));
      expect(first.statusCode).toBe(200);
      expect(first.json()).toEqual({ models: ['a-model', 'b-model'] });
      expect(request.mock.calls[0]?.[0]).toBe('https://api.openai.com/v1/models');
      expect((request.mock.calls[0]?.[1] as RequestInit).headers).toEqual({ authorization: 'Bearer transient-key' });
      expect(database.advisorConnection.findMany).not.toHaveBeenCalled();
      const second = await application.inject(previewRequest('OPENAI', 'preview-user', { credential: 'transient-key' }));
      expect(second.statusCode).toBe(429);
      expect(second.json()).toEqual({ code: 'RATE_LIMITED', message: 'Please wait before starting another provider request' });
      expect(usage.upsert).toHaveBeenCalledTimes(1);
      expect(request).toHaveBeenCalledTimes(1);
    });

    it('counts an accepted attempt in the daily usage of the user and company', async () => {
      stubModels();
      const usage = stubUsage(1);
      vi.useFakeTimers({ toFake: ['Date'] });
      vi.setSystemTime(new Date('2026-10-01T10:00:00.000Z'));
      const response = await application.inject(previewRequest('OPENAI', 'under-cap-user', { credential: 'key' }));
      expect(response.statusCode).toBe(200);
      expect(usage.upsert).toHaveBeenCalledWith({ where: { userId_companyId_day: { userId: 'under-cap-user', companyId: 'company', day: '2026-10-01' } },
        create: { userId: 'under-cap-user', companyId: 'company', day: '2026-10-01', count: 1 }, update: { count: { increment: 1 } }, select: { count: true } });
      expect(usage.aggregate).toHaveBeenCalledWith({ where: { companyId: 'company', day: '2026-10-01' }, _sum: { count: true } });
    });

    it('rejects over the per-user daily cap with Retry-After until UTC midnight and rolls the counter back', async () => {
      const request = vi.fn();
      vi.stubGlobal('fetch', request);
      const usage = stubUsage(31, 31);
      vi.useFakeTimers({ toFake: ['Date'] });
      vi.setSystemTime(new Date('2026-10-01T23:00:00.000Z'));
      const response = await application.inject(previewRequest('OPENAI', 'user-cap-user', { credential: 'key' }));
      expect(response.statusCode).toBe(429);
      expect(response.headers['retry-after']).toBe('3600');
      expect(response.json()).toEqual({ code: 'DAILY_LIMIT_REACHED', message: 'Daily model discovery limit reached. Try again tomorrow' });
      expect(usage.update).toHaveBeenCalledWith({ where: { userId_companyId_day: { userId: 'user-cap-user', companyId: 'company', day: '2026-10-01' } }, data: { count: { decrement: 1 } } });
      expect(request).not.toHaveBeenCalled();
    });

    it('rejects over the per-company daily cap even when the user is under theirs', async () => {
      const request = vi.fn();
      vi.stubGlobal('fetch', request);
      const usage = stubUsage(1, 101);
      const response = await application.inject(previewRequest('OPENAI', 'company-cap-user', { credential: 'key' }));
      expect(response.statusCode).toBe(429);
      expect(response.json().code).toBe('DAILY_LIMIT_REACHED');
      expect(usage.update).toHaveBeenCalledTimes(1);
      expect(request).not.toHaveBeenCalled();
    });

    it('starts a new counter on the next UTC day', async () => {
      stubModels();
      const usage = stubUsage(1);
      vi.useFakeTimers({ toFake: ['Date'] });
      vi.setSystemTime(new Date('2026-10-01T23:59:59.000Z'));
      await application.inject(previewRequest('OPENAI', 'rollover-a', { credential: 'key' }));
      vi.setSystemTime(new Date('2026-10-02T00:00:01.000Z'));
      await application.inject(previewRequest('OPENAI', 'rollover-b', { credential: 'key' }));
      expect(usage.upsert.mock.calls.map((call) => call[0].where.userId_companyId_day.day)).toEqual(['2026-10-01', '2026-10-02']);
    });

    it('logs one audit entry per attempt without the credential', async () => {
      stubModels();
      stubUsage(1);
      const lines: string[] = [];
      const stream = { write: (line: string) => { lines.push(line); } };
      const auditedApplication = await buildApp({ logger: { level: 'info', stream } as never, prismaClient: database,
        authConfig: loadAuthConfig({ NODE_ENV: 'test', JWT_SECRET: 'access-test-secret', JWT_REFRESH_SECRET: 'refresh-test-secret' }) });
      await auditedApplication.ready();
      const auditedToken = (auditedApplication.jwt as unknown as { access: { sign: (payload: object) => string } }).access.sign({ sub: 'audit-user', email: 'user@example.com', companies: [] });
      await auditedApplication.inject({ ...previewRequest('OPENAI', 'audit-user', { credential: 'super-secret-key' }), cookies: { auth_token: auditedToken } });
      await auditedApplication.close();
      const audit = lines.map((line) => JSON.parse(line) as Record<string, unknown>).filter((entry) => entry['operation'] === 'advisor.modelPreview');
      expect(audit).toHaveLength(1);
      expect(audit[0]).toMatchObject({ operation: 'advisor.modelPreview', userId: 'audit-user', companyId: 'company', provider: 'OPENAI', outcome: 'allowed' });
      expect(lines.join('')).not.toContain('super-secret-key');
    });

    it('requires a credential for hosted providers and rejects submitted addresses', async () => {
      const missing = await application.inject(previewRequest('OPENAI', 'missing-key-user', {}));
      expect(missing.json()).toEqual({ code: 'CREDENTIAL_REQUIRED', message: 'API credential is required' });
      const address = await application.inject(previewRequest('OPENAI', 'address-user', { credential: 'key', url: 'http://internal.example' }));
      expect(address.statusCode).toBe(400);
    });

    it('reports an unconfigured Ollama endpoint without requiring a saved connection', async () => {
      vi.mocked(database.companyMembership.findUnique).mockResolvedValue({ id: 'membership', companyId: 'company', role: 'ADMIN',
        company: { advisorPolicy: { enabled: true, allowedProviders: ['OLLAMA'], retentionDays: 30 } } } as never);
      const usage = stubUsage(1);
      const response = await application.inject(previewRequest('OLLAMA', 'ollama-user', {}));
      expect(usage.upsert).toHaveBeenCalledTimes(1);
      expect(response.statusCode).toBe(503);
      expect(response.json()).toEqual({ code: 'OLLAMA_NOT_CONFIGURED', message: 'Ollama is not configured by the operator' });
    });
  });

  describe('PUT and DELETE /connections/:provider', () => {
    const connectionRequest = (method: 'PUT' | 'DELETE', provider: string) => ({ method, url: `/companies/company/advisor/connections/${provider}`,
      cookies: { auth_token: token }, headers: { origin: 'http://localhost:3000' }, ...(method === 'PUT' ? { payload: { model: 'configured-model' } } : {}) });

    it('refuses to save a connection for a provider the company policy denies, but still allows removing it', async () => {
      Object.assign(database.advisorConnection, { upsert: vi.fn(), deleteMany: vi.fn().mockResolvedValue({ count: 1 }) });
      const saved = await application.inject(connectionRequest('PUT', 'OPENROUTER'));
      expect(saved.statusCode).toBe(403);
      expect(saved.json()).toEqual({ code: 'POLICY_DENIED', message: 'This provider is not enabled for the company' });
      expect(database.advisorConnection.upsert).not.toHaveBeenCalled();
      const removed = await application.inject(connectionRequest('DELETE', 'OPENROUTER'));
      expect(removed.json()).toEqual({ deleted: true });
    });

    it('denies saving to a VIEWER, allows an ACCOUNTANT, and lets the VIEWER still remove their connection', async () => {
      Object.assign(database.advisorConnection, { findUnique: vi.fn().mockResolvedValue(null), upsert: vi.fn().mockResolvedValue({}), deleteMany: vi.fn().mockResolvedValue({ count: 1 }) });
      const membershipWithRole = (role: string) => ({ id: 'membership', companyId: 'company', role,
        company: { advisorPolicy: { enabled: true, allowedProviders: ['OLLAMA'], retentionDays: 30 } } });
      vi.stubEnv('ADVISOR_OLLAMA_URL', 'https://ollama.example');
      vi.mocked(database.companyMembership.findUnique).mockResolvedValue(membershipWithRole('VIEWER') as never);
      const denied = await application.inject(connectionRequest('PUT', 'OLLAMA'));
      expect(denied.statusCode).toBe(403);
      expect(denied.json()).toEqual({ code: 'CONNECTION_ROLE_REQUIRED', message: 'Administrator or accountant role is required to connect providers and grant connectors' });
      expect(database.advisorConnection.upsert).not.toHaveBeenCalled();
      expect((await application.inject(connectionRequest('DELETE', 'OLLAMA'))).json()).toEqual({ deleted: true });
      const settings = await application.inject({ method: 'GET', url: '/companies/company/advisor/settings', cookies: { auth_token: token } });
      expect(settings.json().canManageConnections).toBe(false);
      vi.mocked(database.companyMembership.findUnique).mockResolvedValue(membershipWithRole('ACCOUNTANT') as never);
      expect((await application.inject(connectionRequest('PUT', 'OLLAMA'))).json()).toEqual({ saved: true });
    });
  });

  it('streams a classified provider failure as an SSE error event without a provider message', async () => {
    const scope = { questionKind: 'records', period: '2026-09', includeRecords: false };
    const requestId = 'bb4d11b1-b939-49a7-95bb-800dd590b4f1';
    const turn = { id: 'turn', conversationId: 'conversation', requestId, question: 'Question', scope, status: 'PENDING', answer: null, createdAt: new Date(), startedAt: null };
    vi.mocked(database.advisorConversation.findFirst).mockResolvedValue({ id: 'conversation', provider: 'OPENAI', model: 'configured-model' } as never);
    const transaction = Builder<PrismaClient>().$queryRaw(vi.fn().mockResolvedValue([]) as never)
      .advisorTurn({ findUnique: vi.fn().mockResolvedValue(turn), updateMany: vi.fn().mockResolvedValue({ count: 1 }) } as never).build();
    database.$transaction = vi.fn().mockImplementation((operation: (connection: PrismaClient) => Promise<unknown>) => operation(transaction));
    Object.assign(database, { advisorTurn: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) } });
    answerAdvisorQuestion.mockRejectedValue(new AdvisorError(502, 'PROVIDER_QUOTA_EXCEEDED', 'Provider quota or billing limit reached', undefined, 429));
    const response = await application.inject({ method: 'POST', url: '/companies/company/advisor/conversations/conversation/messages', cookies: { auth_token: token },
      headers: { origin: 'http://localhost:3000', 'x-ksef-environment': 'TEST' }, payload: { requestId, question: 'Question', scope } });
    expect(response.body).toContain('event: error\ndata: {"code":"PROVIDER_QUOTA_EXCEEDED","message":"Provider quota or billing limit reached"}');
  });

  it('streams the upstream retry delay in the SSE error event', async () => {
    const scope = { questionKind: 'records', period: '2026-09', includeRecords: false };
    const requestId = 'bb4d11b1-b939-49a7-95bb-800dd590b4f1';
    const turn = { id: 'turn', conversationId: 'conversation', requestId, question: 'Question', scope, status: 'PENDING', answer: null, createdAt: new Date(), startedAt: null };
    vi.mocked(database.advisorConversation.findFirst).mockResolvedValue({ id: 'conversation', provider: 'OPENAI', model: 'configured-model' } as never);
    const transaction = Builder<PrismaClient>().$queryRaw(vi.fn().mockResolvedValue([]) as never)
      .advisorTurn({ findUnique: vi.fn().mockResolvedValue(turn), updateMany: vi.fn().mockResolvedValue({ count: 1 }) } as never).build();
    database.$transaction = vi.fn().mockImplementation((operation: (connection: PrismaClient) => Promise<unknown>) => operation(transaction));
    Object.assign(database, { advisorTurn: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) } });
    const send = () => application.inject({ method: 'POST', url: '/companies/company/advisor/conversations/conversation/messages', cookies: { auth_token: token },
      headers: { origin: 'http://localhost:3000', 'x-ksef-environment': 'TEST' }, payload: { requestId, question: 'Question', scope } });
    answerAdvisorQuestion.mockRejectedValue(new AdvisorError(503, 'PROVIDER_UNAVAILABLE', 'Provider is temporarily unavailable', 7, 429));
    expect((await send()).body).toContain('event: error\ndata: {"code":"PROVIDER_UNAVAILABLE","message":"Provider is temporarily unavailable","retryAfterSeconds":7}');
    answerAdvisorQuestion.mockRejectedValue(new Error('database down'));
    expect((await send()).body).toContain('event: error\ndata: {"code":"ADVISOR_ERROR","message":"Advisor generation failed"}');
  });

  it('rejects a reply to a turn that is not a clarification of this conversation before creating a turn', async () => {
    vi.mocked(database.advisorConversation.findFirst).mockResolvedValue({ id: 'conversation', provider: 'OPENAI', model: 'configured-model' } as never);
    const create = vi.fn();
    const transaction = Builder<PrismaClient>().$queryRaw(vi.fn().mockResolvedValue([]) as never)
      .advisorTurn({ findUnique: vi.fn().mockResolvedValue(null), findFirst: vi.fn().mockResolvedValue(null), create } as never).build();
    database.$transaction = vi.fn().mockImplementation((operation: (connection: PrismaClient) => Promise<unknown>) => operation(transaction));
    const response = await application.inject({ method: 'POST', url: '/companies/company/advisor/conversations/conversation/messages', cookies: { auth_token: token },
      headers: { origin: 'http://localhost:3000', 'x-ksef-environment': 'TEST' },
      payload: { requestId: 'bb4d11b1-b939-49a7-95bb-800dd590b4f1', question: 'Question', replyToTurnId: 'clh1234567890abcdefghijkl', scope: { questionKind: 'records', period: '2026-09', includeRecords: false } } });
    expect(response.statusCode).toBe(409);
    expect(response.json()).toEqual({ code: 'INVALID_REPLY', message: 'The reply target is not a clarification request in this conversation' });
    expect(transaction.advisorTurn.findFirst).toHaveBeenCalledWith({ where: { id: 'clh1234567890abcdefghijkl', conversationId: 'conversation', status: 'COMPLETED' }, select: { question: true, answer: true } });
    expect(create).not.toHaveBeenCalled();
  });

  describe('viewer access to model discovery', () => {
    const viewerMembership = { id: 'membership', companyId: 'company', role: 'VIEWER', company: { advisorPolicy: { enabled: true, allowedProviders: ['OPENAI'], retentionDays: 30 } } };

    it('denies a VIEWER model-preview before the daily limit is reserved, and denies GET models', async () => {
      vi.mocked(database.companyMembership.findUnique).mockResolvedValue(viewerMembership as never);
      const usage = { upsert: vi.fn(), aggregate: vi.fn(), update: vi.fn() };
      Object.assign(database, { advisorModelPreviewUsage: usage });
      const headers = { origin: 'http://localhost:3000' };
      const preview = await application.inject({ method: 'POST', url: '/companies/company/advisor/connections/OPENAI/model-preview', cookies: { auth_token: token }, headers, payload: { credential: 'key' } });
      expect(preview.statusCode).toBe(403);
      expect(preview.json().code).toBe('CONNECTION_ROLE_REQUIRED');
      expect(usage.upsert).not.toHaveBeenCalled();
      const models = await application.inject({ method: 'GET', url: '/companies/company/advisor/connections/OPENAI/models', cookies: { auth_token: token } });
      expect(models.json().code).toBe('CONNECTION_ROLE_REQUIRED');
    });
  });

  describe('POST /connections/:provider/test', () => {
    afterEach(() => vi.unstubAllGlobals());

    it('returns 502 PROVIDER_INVALID_CREDENTIALS when OpenAI rejects the key instead of a generic 500', async () => {
      vi.stubEnv('ENCRYPTION_KEY', 'a'.repeat(64));
      const encrypted = encrypt('private-key', 'a'.repeat(64));
      Object.assign(database.advisorConnection, {
        findUnique: vi.fn().mockResolvedValue({ id: 'connection', provider: 'OPENAI', model: 'configured-model', credentialEncrypted: encrypted.enc, credentialNonce: encrypted.iv }),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }) });
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: { message: 'provider-secret-message', code: 'invalid_api_key' } }), { status: 401 })));
      const response = await application.inject({ method: 'POST', url: '/companies/company/advisor/connections/OPENAI/test', cookies: { auth_token: token }, headers: { origin: 'http://localhost:3000' } });
      expect(response.statusCode).toBe(502);
      expect(response.json()).toEqual({ code: 'PROVIDER_INVALID_CREDENTIALS', message: 'Provider rejected the credential' });
      expect(database.advisorConnection.updateMany).toHaveBeenCalledTimes(1);
    });
  });
});
