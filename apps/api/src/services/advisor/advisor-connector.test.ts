import { Builder } from 'builder-pattern';
import type { PrismaClient } from '@prisma/client';
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT } from 'jose';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { requireAdvisorConnectorGrant, verifyAdvisorConnectorToken } from './advisor-connector.js';

afterEach(() => vi.unstubAllEnvs());

describe('verifyAdvisorConnectorToken()', () => {
  it('verifies the issuer, audience, scope, client and immutable user mapping', async () => {
    const { publicKey, privateKey } = await generateKeyPair('RS256');
    const configuration = { resource: 'https://accounting.example/advisor/mcp', issuer: 'https://identity.example/realm',
      keySet: 'https://identity.example/keys', metadata: 'https://accounting.example/.well-known/oauth-protected-resource/advisor/mcp', clients: { CHATGPT: 'chatgpt-client' } };
    const keys = createLocalJWKSet({ keys: [await exportJWK(publicKey)] });
    const claims = { sub: 'external-user', ksiegowy_user_id: 'local-user', scope: 'advisor:read', azp: 'chatgpt-client' };
    const token = await new SignJWT(claims).setProtectedHeader({ alg: 'RS256' }).setIssuer(configuration.issuer).setAudience(configuration.resource).setIssuedAt().setExpirationTime('5m').sign(privateKey);
    expect(await verifyAdvisorConnectorToken(token, configuration, keys)).toEqual({ userId: 'local-user', client: 'CHATGPT', clientIdentifier: 'chatgpt-client', issuer: configuration.issuer });
    await expect(verifyAdvisorConnectorToken(token, { ...configuration, resource: 'https://different.example/advisor/mcp' }, keys)).rejects.toThrow();
    await expect(verifyAdvisorConnectorToken(token, { ...configuration, clients: { CLAUDE: 'claude-client' } }, keys)).rejects.toThrow('OAuth client is not allowed');
    const noScope = await new SignJWT({ ...claims, scope: 'profile' }).setProtectedHeader({ alg: 'RS256' }).setIssuer(configuration.issuer).setAudience(configuration.resource).setIssuedAt().setExpirationTime('5m').sign(privateKey);
    await expect(verifyAdvisorConnectorToken(noScope, configuration, keys)).rejects.toThrow('Read-only advisor scope is required');
    const expired = await new SignJWT(claims).setProtectedHeader({ alg: 'RS256' }).setIssuer(configuration.issuer).setAudience(configuration.resource).setIssuedAt().setExpirationTime(Math.floor(Date.now() / 1000) - 60).sign(privateKey);
    await expect(verifyAdvisorConnectorToken(expired, configuration, keys)).rejects.toThrow();
  });
});

describe('requireAdvisorConnectorGrant()', () => {
  it('requires an unexpired grant and current membership and policy for the exact company and environment', async () => {
    vi.stubEnv('ADVISOR_ENABLED', 'true');
    const database = Builder<PrismaClient>().advisorConnectorGrant({ findFirst: vi.fn().mockResolvedValue({ id: 'grant' }) } as never).build();
    const identity = { userId: 'user', client: 'CHATGPT' as const, clientIdentifier: 'client', issuer: 'https://identity.example' };
    await requireAdvisorConnectorGrant(database, identity, 'company', 'TEST');
    expect(database.advisorConnectorGrant.findFirst).toHaveBeenCalledWith({ where: { environment: 'TEST', client: 'CHATGPT', issuer: identity.issuer,
      clientIdentifier: 'client', expiresAt: { gt: expect.any(Date) }, membership: { companyId: 'company', userId: 'user', company: { advisorPolicy: { enabled: true, allowedConnectors: { has: 'CHATGPT' } } } } }, select: { id: true } });
    vi.mocked(database.advisorConnectorGrant.findFirst).mockResolvedValue(null);
    await expect(requireAdvisorConnectorGrant(database, identity, 'company', 'PRODUCTION')).rejects.toThrow('An active company and environment grant is required');
  });
});
