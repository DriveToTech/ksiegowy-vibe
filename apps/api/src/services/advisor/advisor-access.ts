import type { FastifyRequest } from 'fastify';
import { decrypt } from '@ksiegowy/shared-utils';
import type { AdvisorProvider } from '@ksiegowy/types';
import { AdvisorError } from './advisor-contract.js';

export async function requireAdvisorMembership(request: FastifyRequest, companyId: string) {
  const membership = await request.server.prisma.companyMembership.findUnique({
    where: { companyId_userId: { companyId, userId: request.user.sub } },
    include: { company: { select: { advisorPolicy: true } } },
  });
  if (!membership) throw new AdvisorError(403, 'ACCESS_DENIED', 'Current company membership is required');
  return membership;
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
  if (!result.count) throw new AdvisorError(429, 'RATE_LIMITED', 'Please wait before starting another provider request');
}
