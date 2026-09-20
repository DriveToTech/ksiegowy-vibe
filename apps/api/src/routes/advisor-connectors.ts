import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { requireExplicitKsefEnvironment } from '../lib/ksef-environment.js';
import { requireAdvisorMembership } from '../services/advisor/advisor-access.js';
import { AdvisorError } from '../services/advisor/advisor-contract.js';
import { advisorConnectorConfiguration } from '../services/advisor/advisor-connector.js';

export const advisorConnectorRoutes: FastifyPluginAsync = async (server) => {
  server.get<{ Params: { companyId: string } }>('/connectors', async (request) => {
    const membership = await requireAdvisorMembership(request, request.params.companyId);
    const configuration = advisorConnectorConfiguration();
    const grants = await server.prisma.advisorConnectorGrant.findMany({ where: { membershipId: membership.id, expiresAt: { gt: new Date() },
      issuer: configuration?.issuer ?? '', OR: Object.entries(configuration?.clients ?? {}).map(([client, clientIdentifier]) => ({ client: z.enum(['CHATGPT', 'CLAUDE']).parse(client), clientIdentifier })) },
      select: { client: true, environment: true, expiresAt: true } });
    return { endpoint: configuration?.resource ?? null, clients: Object.keys(configuration?.clients ?? {}), grants };
  });
  server.put<{ Params: { companyId: string; client: string } }>('/connectors/:client', async (request) => {
    const membership = await requireAdvisorMembership(request, request.params.companyId);
    const environment = requireExplicitKsefEnvironment(request);
    const client = z.enum(['CHATGPT', 'CLAUDE']).parse(request.params.client);
    const { days } = z.object({ days: z.number().int().min(1).max(30) }).strict().parse(request.body);
    const configuration = advisorConnectorConfiguration();
    const clientIdentifier = configuration?.clients[client];
    if (!configuration || !clientIdentifier) throw new AdvisorError(503, 'CONNECTOR_UNAVAILABLE', 'The operator must configure OAuth first');
    const policy = membership.company.advisorPolicy;
    if (!policy?.enabled || !policy.allowedConnectors.includes(client)) throw new AdvisorError(403, 'POLICY_DENIED', 'This connector is not enabled for the company');
    const data = { issuer: configuration.issuer, clientIdentifier, expiresAt: new Date(Date.now() + days * 86_400_000) };
    await server.prisma.advisorConnectorGrant.upsert({ where: { membershipId_environment_client: { membershipId: membership.id, environment, client } },
      create: { membershipId: membership.id, environment, client, ...data }, update: data });
    return { expiresAt: data.expiresAt };
  });
  server.delete<{ Params: { companyId: string; client: string } }>('/connectors/:client', async (request) => {
    const membership = await requireAdvisorMembership(request, request.params.companyId);
    const environment = requireExplicitKsefEnvironment(request);
    const client = z.enum(['CHATGPT', 'CLAUDE']).parse(request.params.client);
    await server.prisma.advisorConnectorGrant.deleteMany({ where: { membershipId: membership.id, environment, client } });
    return { deleted: true };
  });
};
