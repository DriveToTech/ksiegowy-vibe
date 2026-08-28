import { z } from 'zod';
import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { listHouseholdsForUser } from '@ksiegowy/household-service';
import type { AccessTokenPayload, AuthCompanyClaim, RefreshTokenPayload } from '../../lib/auth-config.js';

type AppPrisma = FastifyInstance['prisma'];
type MembershipRole = AuthCompanyClaim['role'];

const googleOAuthUnavailableSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    error: { type: 'string' },
    message: { type: 'string' },
    missingEnv: {
      type: 'array',
      items: { type: 'string' }
    }
  },
  required: ['error', 'message', 'missingEnv']
} as const;

const redirectResponseSchema = {
  type: 'null'
} as const;

const googleCallbackQuerySchema = {
  type: 'object',
  additionalProperties: true,
  properties: {
    code: { type: 'string' },
    state: { type: 'string' },
    error: { type: 'string' },
    error_description: { type: 'string' },
    scope: { type: 'string' },
    authuser: { type: 'string' },
    prompt: { type: 'string' }
  }
} as const;

const authMeResponseSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    authenticated: { type: 'boolean' },
    user: {
      type: 'object',
      additionalProperties: false,
      properties: {
        id: { type: 'string' },
        email: { type: 'string', format: 'email' },
        name: { type: ['string', 'null'] },
        avatarUrl: { type: ['string', 'null'] }
      },
      required: ['id', 'email', 'name', 'avatarUrl']
    },
    companies: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          id: { type: 'string' },
          role: { type: 'string', enum: ['ADMIN', 'ACCOUNTANT', 'VIEWER'] }
        },
        required: ['id', 'role']
      }
    },
    households: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          id: { type: 'string' },
          role: { type: 'string', enum: ['OWNER', 'MEMBER'] },
          name: { type: 'string' }
        },
        required: ['id', 'role', 'name']
      }
    }
  },
  required: ['authenticated', 'user', 'companies', 'households']
} as const;

const authRefreshResponseSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    status: { type: 'string' }
  },
  required: ['status']
} as const;

const authCallbackSuccessResponseSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    status: { type: 'string' },
    user: {
      type: 'object',
      additionalProperties: false,
      properties: {
        id: { type: 'string' },
        email: { type: 'string', format: 'email' },
        name: { type: ['string', 'null'] },
        avatarUrl: { type: ['string', 'null'] }
      },
      required: ['id', 'email', 'name', 'avatarUrl']
    },
    companies: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          id: { type: 'string' },
          role: { type: 'string', enum: ['ADMIN', 'ACCOUNTANT', 'VIEWER'] }
        },
        required: ['id', 'role']
      }
    },
    redirectTo: { type: 'null' }
  },
  required: ['status', 'user', 'companies', 'redirectTo']
} as const;

const googleProfileSchema = z.object({
  sub: z.string().trim().min(1),
  email: z.string().email(),
  email_verified: z.boolean().optional(),
  name: z.string().trim().min(1).optional(),
  picture: z.string().trim().min(1).optional()
});

interface GoogleCallbackQuery {
  code?: string;
  state?: string;
  error?: string;
  error_description?: string;
}

const buildGoogleUnavailablePayload = (missingEnv: readonly string[]) => ({
  error: 'google_oauth_not_configured',
  message: 'Google OAuth is not configured for this environment.',
  missingEnv: [...missingEnv]
});

const toAuthCompanyClaims = (
  memberships: Array<{ companyId: string; role: MembershipRole }>
): AuthCompanyClaim[] => {
  return memberships.map((membership) => ({
    id: membership.companyId,
    role: membership.role
  }));
};

const toAccessTokenPayload = (session: {
  user: { id: string; email: string; name: string | null; avatarUrl: string | null };
  companies: AuthCompanyClaim[];
}): AccessTokenPayload => {
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

const buildPostLoginRedirectUrl = (appUrl: string): string => {
  return new URL('/dashboard', appUrl).toString();
};

const loadUserSession = async (
  prisma: AppPrisma,
  userId: string
): Promise<{
  user: { id: string; email: string; name: string | null; avatarUrl: string | null };
  companies: AuthCompanyClaim[];
}> => {
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

const upsertUserFromGoogleProfile = async (
  prisma: AppPrisma,
  profile: z.infer<typeof googleProfileSchema>
): Promise<{
  user: { id: string; email: string; name: string | null; avatarUrl: string | null };
  companies: AuthCompanyClaim[];
}> => {
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

export const authRoutes: FastifyPluginAsync = async (fastify): Promise<void> => {
  fastify.get('/auth/google', {
    schema: {
      response: {
        302: redirectResponseSchema,
        503: googleOAuthUnavailableSchema
      }
    }
  }, async (request, reply) => {
    if (!fastify.authConfig.google.enabled) {
      return reply.code(503).send(buildGoogleUnavailablePayload(fastify.authConfig.google.missingEnv));
    }

    const authorizationUri = await fastify.oauth2GoogleOAuth2!.generateAuthorizationUri(request, reply);
    reply.code(302);
    return reply.redirect(authorizationUri);
  });

  fastify.get<{ Querystring: GoogleCallbackQuery }>('/auth/google/callback', {
    schema: {
      querystring: googleCallbackQuerySchema,
      response: {
        302: redirectResponseSchema,
        200: authCallbackSuccessResponseSchema,
        503: googleOAuthUnavailableSchema
      }
    }
  }, async (request, reply) => {
    if (!fastify.authConfig.google.enabled) {
      return reply.code(503).send(buildGoogleUnavailablePayload(fastify.authConfig.google.missingEnv));
    }

    if (request.query.error) {
      throw fastify.httpErrors.badRequest(request.query.error_description ?? request.query.error);
    }

    const googleOAuth = fastify.oauth2GoogleOAuth2;

    if (!googleOAuth) {
      throw fastify.httpErrors.serviceUnavailable('Google OAuth is unavailable');
    }

    let session;

    try {
      const { token } = await googleOAuth.getAccessTokenFromAuthorizationCodeFlow(request, reply);
      const profile = googleProfileSchema.parse(await googleOAuth.userinfo(token));

      if (profile.email_verified === false) {
        throw fastify.httpErrors.forbidden('Google account email is not verified');
      }

      session = await upsertUserFromGoogleProfile(fastify.prisma, profile);
    } catch (error: unknown) {
      if (error instanceof z.ZodError) {
        throw fastify.httpErrors.badGateway('Google OAuth returned an invalid profile payload');
      }

      if (error instanceof Error && error.message === 'Google account conflicts with an existing user record') {
        throw fastify.httpErrors.conflict(error.message);
      }

      throw error;
    }

    const accessPayload = toAccessTokenPayload(session);
    const refreshPayload = toRefreshTokenPayload(accessPayload);
    const accessToken = await reply.accessJwtSign(accessPayload);
    const refreshToken = await reply.refreshJwtSign(refreshPayload);

    fastify.setAuthCookies(reply, { accessToken, refreshToken });

    if (fastify.authConfig.appUrl) {
      reply.code(302);
      return reply.redirect(buildPostLoginRedirectUrl(fastify.authConfig.appUrl));
    }

    return reply.code(200).send({
      status: 'authenticated',
      user: session.user,
      companies: session.companies,
      redirectTo: null
    });
  });

  fastify.post('/auth/refresh', {
    schema: {
      response: {
        200: authRefreshResponseSchema
      }
    }
  }, async (request, reply) => {
    try {
      await request.refreshJwtVerify();
    } catch {
      throw fastify.httpErrors.unauthorized('Refresh token required');
    }

    const refreshPayload = request.user;

    if (!('tokenType' in refreshPayload) || refreshPayload.tokenType !== 'refresh') {
      throw fastify.httpErrors.unauthorized('Invalid refresh token');
    }

    const session = await loadUserSession(fastify.prisma, refreshPayload.sub).catch((error: unknown) => {
      const message = error instanceof Error ? error.message : 'User session could not be loaded';
      throw fastify.httpErrors.unauthorized(message);
    });

    const accessPayload = toAccessTokenPayload(session);

    const nextRefreshPayload = toRefreshTokenPayload(accessPayload);
    const accessToken = await reply.accessJwtSign(accessPayload);
    const refreshToken = await reply.refreshJwtSign(nextRefreshPayload);

    fastify.setAuthCookies(reply, { accessToken, refreshToken });

    return {
      status: 'refreshed'
    };
  });

  fastify.post('/auth/logout', {
    schema: {
      response: {
        200: authRefreshResponseSchema
      }
    }
  }, async (_request, reply) => {
    fastify.clearAuthCookies(reply);

    return {
      status: 'logged_out'
    };
  });

  fastify.get('/auth/me', {
    onRequest: [fastify.authenticate],
    schema: {
      response: {
        200: authMeResponseSchema
      }
    }
  }, async (request) => {
    const user = request.user as AccessTokenPayload;
    const session = await loadUserSession(fastify.prisma, user.sub).catch((error: unknown) => {
      const message = error instanceof Error ? error.message : 'User session could not be loaded';
      throw fastify.httpErrors.unauthorized(message);
    });

    // Live query, not JWT-derived — see plan's Cross-Cutting section: a
    // households claim would let a removed member keep private-account
    // visibility for up to the access-token TTL. `name` is included directly
    // so the frontend session loader doesn't need a second round trip.
    const households = await listHouseholdsForUser(fastify.householdDatabase, user.sub);

    return {
      authenticated: true,
      user: session.user,
      companies: session.companies,
      households: households.map((membership) => ({ id: membership.householdId, role: membership.role, name: membership.name }))
    };
  });
};
