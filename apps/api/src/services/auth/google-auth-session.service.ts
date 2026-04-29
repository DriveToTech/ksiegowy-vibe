import { z } from 'zod';
import type { FastifyInstance, FastifyReply } from 'fastify';
import type { AccessTokenPayload, AuthCompanyClaim, RefreshTokenPayload } from '../../lib/auth-config.js';

type AppPrisma = FastifyInstance['prisma'];
type MembershipRole = AuthCompanyClaim['role'];

export interface AuthenticatedSession {
  user: {
    id: string;
    email: string;
    name: string | null;
    avatarUrl: string | null;
  };
  companies: AuthCompanyClaim[];
}

export const googleProfileSchema = z.object({
  sub: z.string().trim().min(1),
  email: z.string().email(),
  email_verified: z.boolean().optional(),
  name: z.string().trim().min(1).optional(),
  picture: z.string().trim().min(1).optional()
});

const toAuthCompanyClaims = (
  memberships: Array<{ companyId: string; role: MembershipRole }>
): AuthCompanyClaim[] => {
  return memberships.map((membership) => ({
    id: membership.companyId,
    role: membership.role
  }));
};

const toAccessTokenPayload = (session: AuthenticatedSession): AccessTokenPayload => {
  return {
    sub: session.user.id,
    email: session.user.email,
    ...(session.user.name ? { name: session.user.name } : {}),
    companies: session.companies
  };
};

const toRefreshTokenPayload = (payload: AccessTokenPayload): RefreshTokenPayload => {
  return {
    ...payload,
    tokenType: 'refresh'
  };
};

export const loadUserSession = async (prisma: AppPrisma, userId: string): Promise<AuthenticatedSession> => {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      memberships: {
        select: {
          companyId: true,
          role: true
        }
      }
    }
  });

  if (!user) {
    throw new Error(`User ${userId} not found`);
  }

  return {
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      avatarUrl: user.avatarUrl
    },
    companies: toAuthCompanyClaims(user.memberships)
  };
};

export const upsertUserFromGoogleProfile = async (
  prisma: AppPrisma,
  profile: z.infer<typeof googleProfileSchema>
): Promise<AuthenticatedSession> => {
  const userData = {
    email: profile.email,
    googleId: profile.sub,
    ...(profile.name !== undefined ? { name: profile.name } : {}),
    ...(profile.picture !== undefined ? { avatarUrl: profile.picture } : {}),
    lastLoginAt: new Date()
  };

  const existingByGoogleId = await prisma.user.findUnique({
    where: { googleId: profile.sub },
    include: {
      memberships: {
        select: {
          companyId: true,
          role: true
        }
      }
    }
  });

  const existingByEmail = await prisma.user.findUnique({
    where: { email: profile.email },
    include: {
      memberships: {
        select: {
          companyId: true,
          role: true
        }
      }
    }
  });

  if (
    existingByGoogleId !== null &&
    existingByEmail !== null &&
    existingByGoogleId.id !== existingByEmail.id
  ) {
    throw new Error('Google account conflicts with an existing user record');
  }

  const targetUserId = existingByGoogleId?.id ?? existingByEmail?.id;

  const user = targetUserId
    ? await prisma.user.update({
        where: { id: targetUserId },
        data: userData
      })
    : await prisma.user.create({
        data: userData
      });

  const memberships = await prisma.companyMembership.findMany({
    where: { userId: user.id },
    select: {
      companyId: true,
      role: true
    }
  });

  return {
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      avatarUrl: user.avatarUrl
    },
    companies: toAuthCompanyClaims(memberships)
  };
};

export const setAuthenticatedSessionCookies = async (
  fastify: FastifyInstance,
  reply: FastifyReply,
  session: AuthenticatedSession
): Promise<void> => {
  const accessPayload = toAccessTokenPayload(session);
  const refreshPayload = toRefreshTokenPayload(accessPayload);
  const accessToken = await reply.accessJwtSign(accessPayload);
  const refreshToken = await reply.refreshJwtSign(refreshPayload);

  fastify.setAuthCookies(reply, { accessToken, refreshToken });
};

export const buildAuthenticatedResponse = (session: AuthenticatedSession) => {
  return {
    status: 'authenticated',
    user: session.user,
    companies: session.companies,
    redirectTo: null
  };
};
