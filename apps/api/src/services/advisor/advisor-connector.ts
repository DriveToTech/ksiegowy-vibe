import { jwtVerify, type JWTVerifyGetKey } from 'jose';
import { z } from 'zod';
import type { PrismaClient, AdvisorConnectorClient, KsefEnvironment } from '@prisma/client';
import { AdvisorError } from './advisor-contract.js';

const secureAddress = z.url().refine((value) => {
  const address = new URL(value);
  return address.protocol === 'https:' && !address.username && !address.password && !address.search && !address.hash;
});

export function advisorConnectorConfiguration() {
  if (!process.env['ADVISOR_MCP_PUBLIC_URL']) return null;
  const resource = secureAddress.parse(process.env['ADVISOR_MCP_PUBLIC_URL']);
  if (!resource.endsWith('/advisor/mcp')) throw new Error('ADVISOR_MCP_PUBLIC_URL must end with /advisor/mcp');
  const issuer = secureAddress.parse(process.env['ADVISOR_OAUTH_ISSUER']);
  const keySet = secureAddress.parse(process.env['ADVISOR_OAUTH_JWKS_URL']);
  const clients: Partial<Record<AdvisorConnectorClient, string>> = {};
  for (const client of ['CHATGPT', 'CLAUDE'] as const) {
    const identifier = process.env[`ADVISOR_OAUTH_${client}_CLIENT_ID`];
    if (identifier) clients[client] = z.string().trim().min(1).max(200).parse(identifier);
  }
  if (clients.CHATGPT && clients.CHATGPT === clients.CLAUDE) throw new Error('Advisor OAuth clients must have distinct identifiers');
  return { resource, issuer, keySet, clients, metadata: `${resource.slice(0, -'/advisor/mcp'.length)}/.well-known/oauth-protected-resource/advisor/mcp` };
}

export async function verifyAdvisorConnectorToken(token: string, configuration: NonNullable<ReturnType<typeof advisorConnectorConfiguration>>, keys: JWTVerifyGetKey) {
  const { payload } = await jwtVerify(token, keys, { issuer: configuration.issuer, audience: configuration.resource,
    algorithms: ['RS256', 'ES256'], requiredClaims: ['sub', 'iat', 'exp', 'scope', 'ksiegowy_user_id'], maxTokenAge: '15m', clockTolerance: 5 });
  // This mapping is provisioned by the issuer administrator, never a user-editable profile claim.
  const claims = z.object({ sub: z.string().min(1), ksiegowy_user_id: z.string().min(1).max(200), scope: z.string(),
    azp: z.string().optional(), client_id: z.string().optional() }).parse(payload);
  if (!claims.scope.split(' ').includes('advisor:read')) throw new AdvisorError(403, 'INSUFFICIENT_SCOPE', 'Read-only advisor scope is required');
  if (claims.azp && claims.client_id && claims.azp !== claims.client_id) throw new AdvisorError(403, 'ACCESS_DENIED', 'OAuth client claims disagree');
  const identifier = claims.client_id ?? claims.azp;
  const client = (Object.keys(configuration.clients) as AdvisorConnectorClient[]).find((candidate) => configuration.clients[candidate] === identifier);
  if (!client || !identifier) throw new AdvisorError(403, 'ACCESS_DENIED', 'OAuth client is not allowed');
  return { userId: claims.ksiegowy_user_id, client, clientIdentifier: identifier, issuer: configuration.issuer };
}

export async function requireAdvisorConnectorGrant(database: PrismaClient, identity: Awaited<ReturnType<typeof verifyAdvisorConnectorToken>>, companyId: string, environment: KsefEnvironment) {
  if (process.env['ADVISOR_ENABLED'] !== 'true') throw new AdvisorError(503, 'ADVISOR_DISABLED', 'Advisor is disabled');
  const grant = await database.advisorConnectorGrant.findFirst({ where: { environment, client: identity.client,
    issuer: identity.issuer, clientIdentifier: identity.clientIdentifier, expiresAt: { gt: new Date() },
    membership: { companyId, userId: identity.userId, company: { advisorPolicy: { enabled: true, allowedConnectors: { has: identity.client } } } } },
    select: { id: true } });
  if (!grant) throw new AdvisorError(403, 'CONNECTOR_CONSENT_REQUIRED', 'An active company and environment grant is required');
}
