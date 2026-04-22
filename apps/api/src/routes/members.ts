import crypto from 'node:crypto';
import type { FastifyPluginAsync } from 'fastify';
import type { AccessTokenPayload } from '../lib/auth-config.js';

// ── JSON Schema ──────────────────────────────────────────────────────────────

const companyParamsSchema = {
  type: 'object',
  properties: { companyId: { type: 'string', minLength: 1 } },
  required: ['companyId']
} as const;

const memberParamsSchema = {
  type: 'object',
  properties: {
    companyId: { type: 'string', minLength: 1 },
    userId: { type: 'string', minLength: 1 }
  },
  required: ['companyId', 'userId']
} as const;

const patchMemberBodySchema = {
  type: 'object',
  additionalProperties: false,
  required: ['role'],
  properties: {
    role: { type: 'string', enum: ['ADMIN', 'ACCOUNTANT', 'VIEWER'] }
  }
} as const;

const createInviteBodySchema = {
  type: 'object',
  additionalProperties: false,
  required: ['email'],
  properties: {
    email: { type: 'string', format: 'email' },
    role: { type: 'string', enum: ['ADMIN', 'ACCOUNTANT', 'VIEWER'] }
  }
} as const;

const inviteTokenParamsSchema = {
  type: 'object',
  properties: { token: { type: 'string', minLength: 1 } },
  required: ['token']
} as const;

// ── Types ────────────────────────────────────────────────────────────────────

interface CompanyParams { companyId: string }
interface MemberParams { companyId: string; userId: string }
interface PatchMemberBody { role: 'ADMIN' | 'ACCOUNTANT' | 'VIEWER' }
interface CreateInviteBody { email: string; role?: 'ADMIN' | 'ACCOUNTANT' | 'VIEWER' }
interface InviteTokenParams { token: string }

// ── Plugin ───────────────────────────────────────────────────────────────────

export const membersRoutes: FastifyPluginAsync = async (fastify): Promise<void> => {
  /**
   * GET /companies/:companyId/members
   * Lists all members of the company with their user info and role.
   */
  fastify.get<{ Params: CompanyParams }>(
    '/companies/:companyId/members',
    { onRequest: [fastify.authenticate] },
    async (request) => {
      const user = request.user as AccessTokenPayload;
      const { companyId } = request.params;

      if (!user.companies.find((c) => c.id === companyId)) {
        throw fastify.httpErrors.forbidden('Access denied');
      }

      const memberships = await fastify.prisma.companyMembership.findMany({
        where: { companyId },
        include: { user: { select: { id: true, email: true, name: true, avatarUrl: true } } },
        orderBy: { createdAt: 'asc' }
      });

      return memberships.map((m: (typeof memberships)[number]) => ({
        userId: m.userId,
        role: m.role,
        createdAt: m.createdAt.toISOString(),
        user: { id: m.user.id, email: m.user.email, name: m.user.name, avatarUrl: m.user.avatarUrl }
      }));
    }
  );

  /**
   * PATCH /companies/:companyId/members/:userId
   * Changes a member's role. Requires ADMIN.
   */
  fastify.patch<{ Params: MemberParams; Body: PatchMemberBody }>(
    '/companies/:companyId/members/:userId',
    {
      onRequest: [fastify.authenticate],
      schema: { params: memberParamsSchema, body: patchMemberBodySchema }
    },
    async (request) => {
      const user = request.user as AccessTokenPayload;
      const { companyId, userId } = request.params;

      const myMembership = user.companies.find((c) => c.id === companyId);
      if (!myMembership) throw fastify.httpErrors.forbidden('Access denied');
      if (myMembership.role !== 'ADMIN') throw fastify.httpErrors.forbidden('Only ADMINs can change roles');
      if (userId === user.sub) throw fastify.httpErrors.badRequest('Cannot change your own role');

      const membership = await fastify.prisma.companyMembership.findUnique({
        where: { companyId_userId: { companyId, userId } }
      });
      if (!membership) throw fastify.httpErrors.notFound('Member not found');

      const updated = await fastify.prisma.companyMembership.update({
        where: { companyId_userId: { companyId, userId } },
        data: { role: request.body.role },
        include: { user: { select: { id: true, email: true, name: true, avatarUrl: true } } }
      });

      return {
        userId: updated.userId,
        role: updated.role,
        createdAt: updated.createdAt.toISOString(),
        user: { id: updated.user.id, email: updated.user.email, name: updated.user.name, avatarUrl: updated.user.avatarUrl }
      };
    }
  );

  /**
   * DELETE /companies/:companyId/members/:userId
   * Removes a member from the company. Requires ADMIN. Cannot remove self.
   */
  fastify.delete<{ Params: MemberParams }>(
    '/companies/:companyId/members/:userId',
    {
      onRequest: [fastify.authenticate],
      schema: { params: memberParamsSchema }
    },
    async (request, reply) => {
      const user = request.user as AccessTokenPayload;
      const { companyId, userId } = request.params;

      const myMembership = user.companies.find((c) => c.id === companyId);
      if (!myMembership) throw fastify.httpErrors.forbidden('Access denied');
      if (myMembership.role !== 'ADMIN') throw fastify.httpErrors.forbidden('Only ADMINs can remove members');
      if (userId === user.sub) throw fastify.httpErrors.badRequest('Cannot remove yourself from the company');

      const membership = await fastify.prisma.companyMembership.findUnique({
        where: { companyId_userId: { companyId, userId } }
      });
      if (!membership) throw fastify.httpErrors.notFound('Member not found');

      await fastify.prisma.companyMembership.delete({
        where: { companyId_userId: { companyId, userId } }
      });

      return reply.code(204).send();
    }
  );

  /**
   * POST /companies/:companyId/invites
   * Creates an invite token for a given email + role. Requires ADMIN.
   * The token is returned in the response (email sending is handled externally or via Resend if configured).
   */
  fastify.post<{ Params: CompanyParams; Body: CreateInviteBody }>(
    '/companies/:companyId/invites',
    {
      onRequest: [fastify.authenticate],
      schema: { params: companyParamsSchema, body: createInviteBodySchema }
    },
    async (request, reply) => {
      const user = request.user as AccessTokenPayload;
      const { companyId } = request.params;
      const { email, role = 'VIEWER' } = request.body;

      const myMembership = user.companies.find((c) => c.id === companyId);
      if (!myMembership) throw fastify.httpErrors.forbidden('Access denied');
      if (myMembership.role !== 'ADMIN') throw fastify.httpErrors.forbidden('Only ADMINs can invite members');

      // Prevent inviting existing members
      const existingUser = await fastify.prisma.user.findUnique({ where: { email } });
      if (existingUser) {
        const alreadyMember = await fastify.prisma.companyMembership.findUnique({
          where: { companyId_userId: { companyId, userId: existingUser.id } }
        });
        if (alreadyMember) {
          throw fastify.httpErrors.conflict('User is already a member of this company');
        }
      }

      const token = crypto.randomBytes(32).toString('hex');
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

      const invite = await fastify.prisma.userInvite.create({
        data: { companyId, email, role, token, expiresAt }
      });

      fastify.log.info({ companyId, email, role }, 'Invite created');

      return reply.code(201).send({
        id: invite.id,
        email: invite.email,
        role: invite.role,
        token: invite.token,
        expiresAt: invite.expiresAt.toISOString()
      });
    }
  );

  /**
   * POST /invites/:token/accept
   * Authenticated user accepts the invite — adds them as a CompanyMembership.
   */
  fastify.post<{ Params: InviteTokenParams }>(
    '/invites/:token/accept',
    {
      onRequest: [fastify.authenticate],
      schema: { params: inviteTokenParamsSchema }
    },
    async (request, reply) => {
      const user = request.user as AccessTokenPayload;
      const { token } = request.params;

      const invite = await fastify.prisma.userInvite.findUnique({ where: { token } });

      if (!invite) throw fastify.httpErrors.notFound('Invite not found or already used');
      if (invite.acceptedAt) throw fastify.httpErrors.conflict('Invite already accepted');
      if (invite.expiresAt < new Date()) throw fastify.httpErrors.gone('Invite has expired');

      // Verify the logged-in user's email matches the invite
      const dbUser = await fastify.prisma.user.findUnique({ where: { id: user.sub } });
      if (!dbUser) throw fastify.httpErrors.unauthorized('User not found');
      if (dbUser.email !== invite.email) {
        throw fastify.httpErrors.forbidden('This invite was sent to a different email address');
      }

      // Check not already a member
      const existing = await fastify.prisma.companyMembership.findUnique({
        where: { companyId_userId: { companyId: invite.companyId, userId: user.sub } }
      });
      if (existing) throw fastify.httpErrors.conflict('Already a member of this company');

      await fastify.prisma.$transaction([
        fastify.prisma.companyMembership.create({
          data: { companyId: invite.companyId, userId: user.sub, role: invite.role }
        }),
        fastify.prisma.userInvite.update({
          where: { token },
          data: { acceptedAt: new Date() }
        })
      ]);

      fastify.log.info({ companyId: invite.companyId, userId: user.sub }, 'Invite accepted');

      return reply.code(200).send({ companyId: invite.companyId, role: invite.role });
    }
  );

  /**
   * GET /companies/:companyId/invites
   * Lists pending (not accepted, not expired) invites. Requires ADMIN.
   */
  fastify.get<{ Params: CompanyParams }>(
    '/companies/:companyId/invites',
    { onRequest: [fastify.authenticate] },
    async (request) => {
      const user = request.user as AccessTokenPayload;
      const { companyId } = request.params;

      const myMembership = user.companies.find((c) => c.id === companyId);
      if (!myMembership) throw fastify.httpErrors.forbidden('Access denied');
      if (myMembership.role !== 'ADMIN') throw fastify.httpErrors.forbidden('Only ADMINs can list invites');

      const invites = await fastify.prisma.userInvite.findMany({
        where: { companyId, acceptedAt: null, expiresAt: { gt: new Date() } },
        orderBy: { createdAt: 'desc' }
      });

      return invites.map((inv: (typeof invites)[number]) => ({
        id: inv.id,
        email: inv.email,
        role: inv.role,
        expiresAt: inv.expiresAt.toISOString(),
        createdAt: inv.createdAt.toISOString()
      }));
    }
  );
};
