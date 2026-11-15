import type { FastifyRequest } from 'fastify';
import { decrypt } from '@ksiegowy/shared-utils';
import type { AdvisorProvider } from '@ksiegowy/types';
import { AdvisorError, advisorModelPreviewDailyLimitPerCompany, advisorModelPreviewDailyLimitPerUser } from './advisor-contract.js';

export async function requireAdvisorMembership(request: FastifyRequest, companyId: string) {
  const membership = await request.server.prisma.companyMembership.findUnique({
    where: { companyId_userId: { companyId, userId: request.user.sub } },
    include: { company: { select: { advisorPolicy: true } } },
  });
  if (!membership) throw new AdvisorError(403, 'ACCESS_DENIED', 'Current company membership is required');
  return membership;
}

export function requireAdvisorConnectionManager(membership: Awaited<ReturnType<typeof requireAdvisorMembership>>) {
  if (membership.role === 'VIEWER') throw new AdvisorError(403, 'CONNECTION_ROLE_REQUIRED', 'Administrator or accountant role is required to connect providers and grant connectors');
}

export function requireAdvisorEnabled() {
  if (process.env['ADVISOR_ENABLED'] !== 'true') throw new AdvisorError(503, 'ADVISOR_DISABLED', 'Advisor is disabled by the operator');
}

export function requireAdvisorOrigin(request: FastifyRequest) {
  if (request.method === 'GET') return;
  const allowedOrigin = process.env['CORS_ORIGIN'] ?? 'http://localhost:3000';
  if (request.headers.origin !== allowedOrigin) throw new AdvisorError(403, 'INVALID_ORIGIN', 'Request origin is not allowed');
}

export function requireAdvisorPolicy(membership: Awaited<ReturnType<typeof requireAdvisorMembership>>, provider: AdvisorProvider) {
  requireAdvisorEnabled();
  const policy = membership.company.advisorPolicy;
  if (!policy?.enabled || !policy.allowedProviders.includes(provider)) {
    throw new AdvisorError(403, 'POLICY_DENIED', 'This provider is not enabled for the company');
  }
  return policy;
}

export async function readAdvisorConnection(request: FastifyRequest, membershipId: string, provider: AdvisorProvider) {
  const connection = await request.server.prisma.advisorConnection.findUnique({ where: { membershipId_provider: { membershipId, provider } } });
  if (!connection) throw new AdvisorError(409, 'CONNECTION_REQUIRED', 'Configure a provider connection first');
  const credential = connection.credentialEncrypted && connection.credentialNonce
    ? decrypt(connection.credentialEncrypted, connection.credentialNonce, process.env['ENCRYPTION_KEY'] ?? '') : '';
  return { ...connection, credential };
}

export async function reserveAdvisorProviderRequest(request: FastifyRequest, connectionId: string) {
  const now = new Date();
  const result = await request.server.prisma.advisorConnection.updateMany({
    where: { id: connectionId, OR: [{ lastRequestedAt: null }, { lastRequestedAt: { lt: new Date(now.getTime() - 10_000) } }] },
    data: { lastRequestedAt: now },
  });
  if (!result.count) throw new AdvisorError(429, 'RATE_LIMITED', 'Please wait before starting another provider request', 10);
}

// ponytail: per-process throttle, move to a shared store if the API is scaled beyond one instance.
const lastModelPreviewByUser = new Map<string, number>();

export async function reserveAdvisorModelPreview(request: FastifyRequest, companyId: string, provider: AdvisorProvider) {
  const userId = request.user.sub;
  const now = Date.now();
  const auditContext = { operation: 'advisor.modelPreview', userId, companyId, provider };
  for (const [key, requestedAt] of lastModelPreviewByUser) if (now - requestedAt >= 10_000) lastModelPreviewByUser.delete(key);
  if (lastModelPreviewByUser.has(userId)) {
    request.log.warn({ ...auditContext, outcome: 'rate_limited' }, 'Advisor model preview rejected');
    throw new AdvisorError(429, 'RATE_LIMITED', 'Please wait before starting another provider request');
  }
  lastModelPreviewByUser.set(userId, now);

  // Every accepted attempt is counted before the upstream call, so failed (invalid key) attempts consume the cap too.
  // Rejected attempts are rolled back so a blocked user cannot exhaust the company cap.
  const day = new Date(now).toISOString().slice(0, 10);
  const usage = request.server.prisma.advisorModelPreviewUsage;
  const userUsage = await usage.upsert({ where: { userId_companyId_day: { userId, companyId, day } },
    create: { userId, companyId, day, count: 1 }, update: { count: { increment: 1 } }, select: { count: true } });
  const companyUsage = userUsage.count > advisorModelPreviewDailyLimitPerUser ? null
    : await usage.aggregate({ where: { companyId, day }, _sum: { count: true } });
  if (companyUsage && (companyUsage._sum.count ?? 0) <= advisorModelPreviewDailyLimitPerCompany) {
    request.log.info({ ...auditContext, outcome: 'allowed' }, 'Advisor model preview accepted');
    return;
  }
  await usage.update({ where: { userId_companyId_day: { userId, companyId, day } }, data: { count: { decrement: 1 } } });
  const nextUtcMidnight = Date.UTC(new Date(now).getUTCFullYear(), new Date(now).getUTCMonth(), new Date(now).getUTCDate() + 1);
  request.log.warn({ ...auditContext, outcome: 'daily_limit' }, 'Advisor model preview daily limit reached');
  throw new AdvisorError(429, 'DAILY_LIMIT_REACHED', 'Daily model discovery limit reached. Try again tomorrow', Math.ceil((nextUtcMidnight - now) / 1000));
}
