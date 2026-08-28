import type { FastifyInstance, FastifyRequest } from 'fastify';
import { findHouseholdMembership, refreshMembershipIdentitySnapshot, type HouseholdMembership } from '@ksiegowy/household-service';
import type { AccessTokenPayload } from '../../lib/auth-config.js';

/**
 * The live-lookup membership guard every household route uses before
 * touching data — no JWT `households` claim (see plan's Cross-Cutting
 * section): a removed member must lose access immediately, not after the
 * access-token TTL expires. Also refreshes the caller's own identity
 * snapshot (email, display name) on each authenticated request, so
 * HouseholdMembership never needs a cross-database sync mechanism.
 */
export const requireHouseholdMembership = async (
  fastify: FastifyInstance,
  request: FastifyRequest,
  householdId: string
): Promise<HouseholdMembership> => {
  const user = request.user as AccessTokenPayload;

  const membership = await findHouseholdMembership(fastify.householdDatabase, householdId, user.sub);
  if (!membership) {
    throw fastify.httpErrors.forbidden('Access denied');
  }

  refreshMembershipIdentitySnapshot(fastify.householdDatabase, householdId, user.sub, {
    userEmail: user.email,
    displayName: user.name ?? null
  }).catch((error: unknown) => {
    fastify.log.error({ err: error, householdId, userId: user.sub }, 'Failed to refresh household membership identity snapshot');
  });

  return membership;
};
