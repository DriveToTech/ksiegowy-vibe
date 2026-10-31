import { Writable } from 'node:stream';
import { Builder } from 'builder-pattern';
import type { PrismaClient } from '@prisma/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildApp } from '../app.js';
import { loadAuthConfig } from '../lib/auth-config.js';

afterEach(() => vi.unstubAllEnvs());

function stubConnectorEnvironment(enabled: boolean) {
  vi.stubEnv('ADVISOR_ENABLED', String(enabled));
  vi.stubEnv('CORS_ORIGIN', 'http://localhost:3000');
  vi.stubEnv('ADVISOR_MCP_PUBLIC_URL', 'https://accounting.example/advisor/mcp');
  vi.stubEnv('ADVISOR_OAUTH_ISSUER', 'https://identity.example/realm');
  vi.stubEnv('ADVISOR_OAUTH_JWKS_URL', 'https://identity.example/keys');
  vi.stubEnv('ADVISOR_OAUTH_CHATGPT_CLIENT_ID', 'chatgpt-client');
  vi.stubEnv('ADVISOR_OAUTH_CLAUDE_CLIENT_ID', '');
}

async function startApplication(database: PrismaClient) {
  const logLines: Array<Record<string, unknown>> = [];
  const stream = new Writable({ write(chunk, _encoding, done) { logLines.push(JSON.parse(String(chunk))); done(); } });
  const application = await buildApp({ logger: { level: 'info', stream }, prismaClient: database,
    authConfig: loadAuthConfig({ NODE_ENV: 'test', JWT_SECRET: 'access-test-secret', JWT_REFRESH_SECRET: 'refresh-test-secret' }) });
  await application.ready();
  const token = (application.jwt as unknown as { access: { sign: (payload: object) => string } }).access.sign({ sub: 'user', email: 'user@example.com', companies: [] });
  return { application, token, logLines };
}

const membership = (enabled = true, role = 'ADMIN') => ({ id: 'membership', companyId: 'company', role,
  company: { advisorPolicy: { enabled, allowedConnectors: ['CHATGPT'] } } });
const mutation = { origin: 'http://localhost:3000', 'x-ksef-environment': 'TEST' };

describe('advisorConnectorRoutes()', () => {
  it('lists grant states within the retention window', async () => {
    stubConnectorEnvironment(true);
    const day = 86_400_000;
    const grants = [
      { client: 'CHATGPT', environment: 'TEST', expiresAt: new Date(Date.now() + day), lastUsedAt: null, revokedAt: null },
      { client: 'CHATGPT', environment: 'PRODUCTION', expiresAt: new Date(Date.now() + day), lastUsedAt: new Date(), revokedAt: null },
      { client: 'CHATGPT', environment: 'TEST', expiresAt: new Date(Date.now() - day), lastUsedAt: null, revokedAt: null },
      { client: 'CHATGPT', environment: 'PRODUCTION', expiresAt: new Date(Date.now() + day), lastUsedAt: null, revokedAt: new Date() },
    ];
    const database = Builder<PrismaClient>()
      .companyMembership({ findUnique: vi.fn().mockResolvedValue({ id: 'membership', companyId: 'company', role: 'ADMIN', company: { advisorPolicy: null } }) } as never)
      .advisorConnectorGrant({ findMany: vi.fn().mockResolvedValue(grants) } as never).build();
    const { application, token } = await startApplication(database);
    try {
      const listed = await application.inject({ method: 'GET', url: '/companies/company/advisor/connectors', cookies: { auth_token: token } });
      expect(listed.json().grants.map((grant: { status: string }) => grant.status)).toEqual(['WAITING', 'ACTIVE', 'EXPIRED', 'REVOKED']);
    } finally { await application.close(); }
  });

  it('logs a first grant and a re-grant with identifiers only', async () => {
    stubConnectorEnvironment(true);
    const database = Builder<PrismaClient>()
      .companyMembership({ findUnique: vi.fn().mockResolvedValue(membership()) } as never)
      .advisorConnectorGrant({ findUnique: vi.fn().mockResolvedValueOnce(null).mockResolvedValueOnce({ id: 'grant' }), upsert: vi.fn().mockResolvedValue({}) } as never).build();
    const { application, token, logLines } = await startApplication(database);
    try {
      const request = { method: 'PUT' as const, url: '/companies/company/advisor/connectors/CHATGPT', cookies: { auth_token: token }, headers: mutation, payload: { days: 7 } };
      expect((await application.inject(request)).statusCode).toBe(200);
      expect((await application.inject(request)).statusCode).toBe(200);
      expect(logLines.filter((line) => String(line['operation']).startsWith('advisor.connector.')).map((line) => ({ operation: line['operation'], membershipId: line['membershipId'],
        client: line['client'], environment: line['environment'], outcome: line['outcome'] }))).toEqual([
        { operation: 'advisor.connector.grant', membershipId: 'membership', client: 'CHATGPT', environment: 'TEST', outcome: 'granted' },
        { operation: 'advisor.connector.regrant', membershipId: 'membership', client: 'CHATGPT', environment: 'TEST', outcome: 'granted' },
      ]);
    } finally { await application.close(); }
  });

  it('refuses a grant while the operator has disabled the advisor', async () => {
    stubConnectorEnvironment(false);
    const database = Builder<PrismaClient>()
      .companyMembership({ findUnique: vi.fn().mockResolvedValue(membership()) } as never)
      .advisorConnectorGrant({ upsert: vi.fn() } as never).build();
    const { application, token } = await startApplication(database);
    try {
      const response = await application.inject({ method: 'PUT', url: '/companies/company/advisor/connectors/CHATGPT', cookies: { auth_token: token }, headers: mutation, payload: { days: 7 } });
      expect(response.statusCode).toBe(503);
      expect(response.json().code).toBe('ADVISOR_DISABLED');
      expect(database.advisorConnectorGrant.upsert).not.toHaveBeenCalled();
    } finally { await application.close(); }
  });

  it('revokes instead of deleting, stays available while disabled, and logs the outcome', async () => {
    stubConnectorEnvironment(false);
    const database = Builder<PrismaClient>()
      .companyMembership({ findUnique: vi.fn().mockResolvedValue(membership()) } as never)
      .advisorConnectorGrant({ updateMany: vi.fn().mockResolvedValue({ count: 1 }) } as never).build();
    const { application, token, logLines } = await startApplication(database);
    try {
      const revoked = await application.inject({ method: 'DELETE', url: '/companies/company/advisor/connectors/CHATGPT', cookies: { auth_token: token }, headers: mutation });
      expect(revoked.json()).toEqual({ revoked: true });
      expect(database.advisorConnectorGrant.updateMany).toHaveBeenCalledWith({ where: { membershipId: 'membership', environment: 'TEST', client: 'CHATGPT', revokedAt: null }, data: { revokedAt: expect.any(Date) } });
      expect(logLines.find((line) => line['operation'] === 'advisor.connector.revoke')).toMatchObject({ membershipId: 'membership', client: 'CHATGPT', environment: 'TEST', outcome: 'revoked' });
    } finally { await application.close(); }
  });

  it('denies a grant to a VIEWER, allows an ACCOUNTANT, and lets the VIEWER still revoke', async () => {
    stubConnectorEnvironment(true);
    const findUnique = vi.fn().mockResolvedValue(membership(true, 'VIEWER'));
    const database = Builder<PrismaClient>()
      .companyMembership({ findUnique } as never)
      .advisorConnectorGrant({ findUnique: vi.fn().mockResolvedValue(null), upsert: vi.fn().mockResolvedValue({}), updateMany: vi.fn().mockResolvedValue({ count: 1 }) } as never).build();
    const { application, token } = await startApplication(database);
    try {
      const grant = { method: 'PUT' as const, url: '/companies/company/advisor/connectors/CHATGPT', cookies: { auth_token: token }, headers: mutation, payload: { days: 7 } };
      const denied = await application.inject(grant);
      expect(denied.statusCode).toBe(403);
      expect(denied.json()).toEqual({ code: 'CONNECTION_ROLE_REQUIRED', message: 'Administrator or accountant role is required to connect providers and grant connectors' });
      expect(database.advisorConnectorGrant.upsert).not.toHaveBeenCalled();
      const revoked = await application.inject({ method: 'DELETE', url: grant.url, cookies: grant.cookies, headers: mutation });
      expect(revoked.json()).toEqual({ revoked: true });
      findUnique.mockResolvedValue(membership(true, 'ACCOUNTANT'));
      expect((await application.inject(grant)).statusCode).toBe(200);
    } finally { await application.close(); }
  });
});
