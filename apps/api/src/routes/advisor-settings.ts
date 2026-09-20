import type { FastifyPluginAsync } from 'fastify';
import { encrypt } from '@ksiegowy/shared-utils';
import { z } from 'zod';
import { AdvisorError, advisorProviderSchema } from '../services/advisor/advisor-contract.js';
import { readAdvisorConnection, requireAdvisorMembership, requireAdvisorPolicy, reserveAdvisorProviderRequest } from '../services/advisor/advisor-access.js';
import { discoverAdvisorModels, generateAdvisorResponse } from '../services/advisor/advisor-provider.js';
import { loadAdvisorSources } from '../services/advisor/advisor-sources.js';

const connectionBodySchema = z.object({ model: z.string().trim().min(1).max(200), credential: z.string().trim().min(1).max(4096).optional() }).strict();

export const advisorSettingsRoutes: FastifyPluginAsync = async (server) => {
  server.get<{ Params: { companyId: string } }>('/settings', async (request) => {
    const membership = await requireAdvisorMembership(request, request.params.companyId);
    const [connections, corpus] = await Promise.all([
      server.prisma.advisorConnection.findMany({ where: { membershipId: membership.id } }),
      loadAdvisorSources(),
    ]);
    const policy = membership.company.advisorPolicy;
    return { enabled: policy?.enabled ?? false, operatorEnabled: process.env['ADVISOR_ENABLED'] === 'true', canManagePolicy: membership.role === 'ADMIN',
      allowedProviders: policy?.allowedProviders ?? [], retentionDays: policy?.retentionDays ?? 30,
      allowedConnectors: policy?.allowedConnectors ?? [],
      ollamaAvailable: Boolean(process.env['ADVISOR_OLLAMA_URL']), reviewedSourceCount: corpus.sources.length,
      connections: connections.map((connection) => ({ provider: connection.provider, model: connection.model,
        hasCredential: Boolean(connection.credentialEncrypted), testedAt: connection.testedAt?.toISOString() ?? null })) };
  });

  server.patch<{ Params: { companyId: string } }>('/policy', async (request) => {
    const membership = await requireAdvisorMembership(request, request.params.companyId);
    if (membership.role !== 'ADMIN') throw new AdvisorError(403, 'ACCESS_DENIED', 'Administrator role is required');
    const body = z.object({ enabled: z.boolean(), allowedProviders: z.array(advisorProviderSchema).max(4), allowedConnectors: z.array(z.enum(['CHATGPT', 'CLAUDE'])).max(2).default([]), retentionDays: z.number().int().min(1).max(30) }).strict().parse(request.body);
    // Apply shorter retention to existing history too; extensions never restore deleted data.
    await server.prisma.$transaction([
      server.prisma.companyAdvisorPolicy.upsert({ where: { companyId: membership.companyId },
        create: { companyId: membership.companyId, ...body }, update: body }),
      server.prisma.$executeRaw`UPDATE "AdvisorConversation" AS conversation
      SET "expiresAt" = LEAST(conversation."expiresAt", conversation."createdAt" + ${body.retentionDays} * INTERVAL '1 day')
      FROM "CompanyMembership" AS membership
      WHERE conversation."membershipId" = membership."id" AND membership."companyId" = ${membership.companyId}`,
    ]);
    return { saved: true };
  });

  server.put<{ Params: { companyId: string; provider: string } }>('/connections/:provider', async (request) => {
    const membership = await requireAdvisorMembership(request, request.params.companyId);
    const provider = advisorProviderSchema.parse(request.params.provider);
    const body = connectionBodySchema.parse(request.body);
    const existing = await server.prisma.advisorConnection.findUnique({ where: { membershipId_provider: { membershipId: membership.id, provider } } });
    if (provider !== 'OLLAMA' && !body.credential && !existing?.credentialEncrypted) throw new AdvisorError(400, 'CREDENTIAL_REQUIRED', 'API credential is required');
    if (provider === 'OLLAMA' && !process.env['ADVISOR_OLLAMA_URL']) throw new AdvisorError(503, 'OLLAMA_UNAVAILABLE', 'Ollama is not configured by the operator');
    const encrypted = body.credential ? encrypt(body.credential, process.env['ENCRYPTION_KEY'] ?? '') : null;
    const data = { model: body.model, testedAt: null,
      ...(encrypted ? { credentialEncrypted: encrypted.enc, credentialNonce: encrypted.iv } : {}) };
    await server.prisma.advisorConnection.upsert({ where: { membershipId_provider: { membershipId: membership.id, provider } },
      create: { membershipId: membership.id, provider, ...data }, update: data });
    return { saved: true };
  });

  server.delete<{ Params: { companyId: string; provider: string } }>('/connections/:provider', async (request) => {
    const membership = await requireAdvisorMembership(request, request.params.companyId);
    const provider = advisorProviderSchema.parse(request.params.provider);
    await server.prisma.advisorConnection.deleteMany({ where: { membershipId: membership.id, provider } });
    return { deleted: true };
  });

  server.post<{ Params: { companyId: string; provider: string } }>('/connections/:provider/test', async (request) => {
    const membership = await requireAdvisorMembership(request, request.params.companyId);
    const provider = advisorProviderSchema.parse(request.params.provider);
    requireAdvisorPolicy(membership, provider);
    const connection = await readAdvisorConnection(request, membership.id, provider);
    await reserveAdvisorProviderRequest(request, connection.id);
    await generateAdvisorResponse(connection, 'Synthetic connectivity test. No records or legal sources. Return needs_clarification and ask for a question.', AbortSignal.timeout(30_000));
    const testedAt = new Date();
    requireAdvisorPolicy(await requireAdvisorMembership(request, request.params.companyId), provider);
    await server.prisma.advisorConnection.updateMany({ where: { id: connection.id, model: connection.model, credentialEncrypted: connection.credentialEncrypted }, data: { testedAt } });
    return { testedAt: testedAt.toISOString() };
  });

  server.get<{ Params: { companyId: string; provider: string } }>('/connections/:provider/models', async (request) => {
    const membership = await requireAdvisorMembership(request, request.params.companyId);
    const provider = advisorProviderSchema.parse(request.params.provider);
    requireAdvisorPolicy(membership, provider);
    const connection = await readAdvisorConnection(request, membership.id, provider);
    await reserveAdvisorProviderRequest(request, connection.id);
    return { models: await discoverAdvisorModels(connection) };
  });
};
