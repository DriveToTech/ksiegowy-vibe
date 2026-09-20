import { Builder } from 'builder-pattern';
import type { PrismaClient } from '@prisma/client';
import { exportJWK, generateKeyPair, SignJWT } from 'jose';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildApp } from '../app.js';
import { loadAuthConfig } from '../lib/auth-config.js';

afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe('advisorMcpRoutes()', () => {
  it('serves discovery and authorised MCP tools, then denies the next call after revocation', async () => {
    vi.stubEnv('ADVISOR_ENABLED', 'true');
    vi.stubEnv('ADVISOR_MCP_PUBLIC_URL', 'https://accounting.example/advisor/mcp');
    vi.stubEnv('ADVISOR_OAUTH_ISSUER', 'https://identity.example/realm');
    vi.stubEnv('ADVISOR_OAUTH_JWKS_URL', 'https://identity.example/keys');
    vi.stubEnv('ADVISOR_OAUTH_CHATGPT_CLIENT_ID', 'chatgpt-client');
    vi.stubEnv('ADVISOR_OAUTH_CLAUDE_CLIENT_ID', '');
    const { privateKey, publicKey } = await generateKeyPair('RS256');
    const key = await exportJWK(publicKey);
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async () => new Response(JSON.stringify({ keys: [key] }), { headers: { 'content-type': 'application/json' } })));
    const database = Builder<PrismaClient>()
      .advisorConnectorGrant({ findFirst: vi.fn().mockResolvedValue({ id: 'grant' }) } as never)
      .invoice({ groupBy: vi.fn().mockResolvedValue([]), findMany: vi.fn().mockResolvedValue([]) } as never)
      .incomingInvoice({ findMany: vi.fn().mockResolvedValue([]) } as never).build();
    const application = await buildApp({ logger: false, prismaClient: database,
      authConfig: loadAuthConfig({ NODE_ENV: 'test', JWT_SECRET: 'access-test-secret', JWT_REFRESH_SECRET: 'refresh-test-secret' }) });
    try {
      const metadata = await application.inject('/.well-known/oauth-protected-resource/advisor/mcp');
      expect(metadata.json()).toEqual({ resource: 'https://accounting.example/advisor/mcp', authorization_servers: ['https://identity.example/realm'], scopes_supported: ['advisor:read'], bearer_methods_supported: ['header'] });
      const unsigned = await application.inject({ method: 'POST', url: '/advisor/mcp', payload: {} });
      expect(unsigned.statusCode).toBe(401);
      expect(unsigned.headers['www-authenticate']).toBe('Bearer resource_metadata="https://accounting.example/.well-known/oauth-protected-resource/advisor/mcp", scope="advisor:read"');
      const token = await new SignJWT({ sub: 'external-user', ksiegowy_user_id: 'user', scope: 'advisor:read', azp: 'chatgpt-client' })
        .setProtectedHeader({ alg: 'RS256' }).setIssuer('https://identity.example/realm').setAudience('https://accounting.example/advisor/mcp').setIssuedAt().setExpirationTime('5m').sign(privateKey);
      const call = { method: 'POST' as const, url: '/advisor/mcp', headers: { authorization: `Bearer ${token}`, accept: 'application/json, text/event-stream' },
        payload: { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'get_period_summary', arguments: { companyId: 'company', environment: 'TEST', period: '2026-09' } } } };
      const response = await application.inject(call);
      expect(response.statusCode).toBe(200);
      expect(response.json().result.isError).toBe(false);
      expect(JSON.parse(response.json().result.content[0].text)).toEqual({ companyId: 'company', environment: 'TEST', period: '2026-09', generatedAt: expect.any(String), facts: { calculations: [] } });
      expect(database.invoice.groupBy).toHaveBeenCalledTimes(2);
      expect(database.invoice.findMany).not.toHaveBeenCalled();
      expect(database.incomingInvoice.findMany).not.toHaveBeenCalled();
      vi.mocked(database.advisorConnectorGrant.findFirst).mockResolvedValue(null);
      const revoked = await application.inject(call);
      expect(revoked.json().result).toEqual({ content: [{ type: 'text', text: '{"error":"CONNECTOR_CONSENT_REQUIRED"}' }], isError: true });
      expect(database.invoice.groupBy).toHaveBeenCalledTimes(2);
    } finally { await application.close(); }
  });
});
