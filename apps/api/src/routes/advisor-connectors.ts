import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { requireExplicitKsefEnvironment } from '../lib/ksef-environment.js';
import { requireAdvisorConnectionManager, requireAdvisorEnabled, requireAdvisorMembership } from '../services/advisor/advisor-access.js';
import { advisorGrantRetentionDays, AdvisorError } from '../services/advisor/advisor-contract.js';
import { advisorConnectorConfiguration } from '../services/advisor/advisor-connector.js';

export const advisorConnectorRoutes: FastifyPluginAsync = async (server) => {
  server.get<{ Params: { companyId: string } }>('/connectors', async (request) => {
    const membership = await requireAdvisorMembership(request, request.params.companyId);
    const configuration = advisorConnectorConfiguration();
    const now = new Date();
    const retentionStart = new Date(now.getTime() - advisorGrantRetentionDays * 86_400_000);
    // Revoked and expired grants stay visible until the retention window ends; cleanup deletes them afterwards.
    const grants = await server.prisma.advisorConnectorGrant.findMany({ where: { membershipId: membership.id, issuer: configuration?.issuer ?? '',
      AND: [
        { OR: Object.entries(configuration?.clients ?? {}).map(([client, clientIdentifier]) => ({ client: z.enum(['CHATGPT', 'CLAUDE']).parse(client), clientIdentifier })) },
        { OR: [{ revokedAt: null, expiresAt: { gt: retentionStart } }, { revokedAt: { gt: retentionStart } }] },
      ] },
      select: { client: true, environment: true, expiresAt: true, lastUsedAt: true, revokedAt: true } });
    return { endpoint: configuration?.resource ?? null, clients: Object.keys(configuration?.clients ?? {}),
      grants: grants.map((grant) => ({ client: grant.client, environment: grant.environment, expiresAt: grant.expiresAt, lastUsedAt: grant.lastUsedAt, revokedAt: grant.revokedAt,
        status: grant.revokedAt ? 'REVOKED' : grant.expiresAt <= now ? 'EXPIRED' : grant.lastUsedAt ? 'ACTIVE' : 'WAITING' })) };
  });
  server.put<{ Params: { companyId: string; client: string } }>('/connectors/:client', { bodyLimit: 8_000 }, async (request) => {
    requireAdvisorEnabled();
    const membership = await requireAdvisorMembership(request, request.params.companyId);
    requireAdvisorConnectionManager(membership);
    const environment = requireExplicitKsefEnvironment(request);
    const client = z.enum(['CHATGPT', 'CLAUDE']).parse(request.params.client);
    const { days } = z.object({ days: z.number().int().min(1).max(30) }).strict().parse(request.body);
    const configuration = advisorConnectorConfiguration();
    const clientIdentifier = configuration?.clients[client];
    if (!configuration || !clientIdentifier) throw new AdvisorError(503, 'CONNECTOR_UNAVAILABLE', 'The operator must configure OAuth first');
    const policy = membership.company.advisorPolicy;
    if (!policy?.enabled || !policy.allowedConnectors.includes(client)) throw new AdvisorError(403, 'POLICY_DENIED', 'This connector is not enabled for the company');
    const data = { issuer: configuration.issuer, clientIdentifier, expiresAt: new Date(Date.now() + days * 86_400_000), lastUsedAt: null, revokedAt: null };
    const identifier = { membershipId_environment_client: { membershipId: membership.id, environment, client } };
    const existing = await server.prisma.advisorConnectorGrant.findUnique({ where: identifier, select: { id: true } });
    await server.prisma.advisorConnectorGrant.upsert({ where: identifier, create: { membershipId: membership.id, environment, client, ...data }, update: data });
    request.log.info({ operation: existing ? 'advisor.connector.regrant' : 'advisor.connector.grant', membershipId: membership.id, client, environment, outcome: 'granted' }, 'Advisor connector grant saved');
    return { expiresAt: data.expiresAt };
  });
  server.delete<{ Params: { companyId: string; client: string } }>('/connectors/:client', async (request) => {
    const membership = await requireAdvisorMembership(request, request.params.companyId);
    const environment = requireExplicitKsefEnvironment(request);
    const client = z.enum(['CHATGPT', 'CLAUDE']).parse(request.params.client);
    const revocation = await server.prisma.advisorConnectorGrant.updateMany({ where: { membershipId: membership.id, environment, client, revokedAt: null }, data: { revokedAt: new Date() } });
    request.log.info({ operation: 'advisor.connector.revoke', membershipId: membership.id, client, environment, outcome: revocation.count ? 'revoked' : 'already_inactive' }, 'Advisor connector grant revoked');
    return { revoked: true };
  });
};
