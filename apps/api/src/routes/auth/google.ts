import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import type { FastifyInstance, FastifyPluginAsync, FastifyReply } from 'fastify';
import type { AccessTokenPayload, AuthCompanyClaim, RefreshTokenPayload } from '../../lib/auth-config.js';

type AppPrisma = FastifyInstance['prisma'];
type MembershipRole = AuthCompanyClaim['role'];

const desktopAuthRequestCookieName = 'desktop_auth_request';
const desktopAuthRequestCookiePath = '/auth/google';
const desktopAuthRequestMaxAgeSeconds = 10 * 60;
const desktopAuthHandoffLifetimeMilliseconds = 60 * 1000;
const desktopAuthCallbackMissingEnv = ['DESKTOP_AUTH_CALLBACK_URL'] as const;

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

const googleAuthStartQuerySchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    desktopTransactionId: { type: 'string' },
    desktopCodeChallenge: { type: 'string' }
  }
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
    }
  },
  required: ['authenticated', 'user', 'companies']
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

const desktopAuthExchangeBodySchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    handoffCode: { type: 'string' },
    desktopTransactionId: { type: 'string' },
    desktopCodeVerifier: { type: 'string' }
  },
  required: ['handoffCode', 'desktopTransactionId', 'desktopCodeVerifier']
} as const;

const googleProfileSchema = z.object({
  sub: z.string().trim().min(1),
  email: z.string().email(),
  email_verified: z.boolean().optional(),
  name: z.string().trim().min(1).optional(),
  picture: z.string().trim().min(1).optional()
});

const desktopTransactionIdSchema = z.string().trim().min(1).max(200).regex(/^[A-Za-z0-9._-]+$/);
const desktopCodeChallengeSchema = z.string().trim().min(43).max(128).regex(/^[A-Za-z0-9_-]+$/);
const desktopCodeVerifierSchema = z.string().trim().min(43).max(128).regex(/^[A-Za-z0-9._~-]+$/);
const handoffCodeSchema = z.string().trim().min(32).max(256).regex(/^[A-Za-z0-9_-]+$/);

const desktopAuthStartQueryValueSchema = z
  .object({
    desktopTransactionId: desktopTransactionIdSchema.optional(),
    desktopCodeChallenge: desktopCodeChallengeSchema.optional()
  })
  .superRefine((value, context) => {
    const hasTransactionId = value.desktopTransactionId !== undefined;
    const hasCodeChallenge = value.desktopCodeChallenge !== undefined;

    if (hasTransactionId === hasCodeChallenge) {
      return;
    }

    context.addIssue({
      code: 'custom',
      message: 'desktopTransactionId and desktopCodeChallenge must be provided together'
    });
  });

const desktopAuthRequestStateSchema = z.object({
  desktopTransactionId: desktopTransactionIdSchema,
  desktopCodeChallenge: desktopCodeChallengeSchema
});

const desktopAuthExchangeValueSchema = z.object({
  handoffCode: handoffCodeSchema,
  desktopTransactionId: desktopTransactionIdSchema,
  desktopCodeVerifier: desktopCodeVerifierSchema
});

interface GoogleAuthStartQuery {
  desktopTransactionId?: string;
  desktopCodeChallenge?: string;
}

interface GoogleCallbackQuery {
  code?: string;
  state?: string;
  error?: string;
  error_description?: string;
}

interface DesktopAuthExchangeBody {
  handoffCode: string;
  desktopTransactionId: string;
  desktopCodeVerifier: string;
}

interface DesktopAuthRequestState {
  desktopTransactionId: string;
  desktopCodeChallenge: string;
}

interface DesktopAuthHandoffRecord {
  userId: string;
  desktopTransactionId: string;
  desktopCodeChallenge: string;
  expiresAt: number;
}

const desktopAuthHandoffStore = new Map<string, DesktopAuthHandoffRecord>();

const buildGoogleUnavailablePayload = (missingEnv: readonly string[]) => ({
  error: 'google_oauth_not_configured',
  message: 'Google OAuth is not configured for this environment.',
  missingEnv: [...missingEnv]
});

const buildDesktopAuthUnavailablePayload = () => ({
  error: 'desktop_auth_not_configured',
  message: 'Desktop OAuth handoff is not configured for this environment.',
  missingEnv: [...desktopAuthCallbackMissingEnv]
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

const createDesktopCodeChallenge = (desktopCodeVerifier: string): string => {
  return createHash('sha256').update(desktopCodeVerifier).digest('base64url');
};

const createHandoffCodeHash = (handoffCode: string): string => {
  return createHash('sha256').update(handoffCode).digest('hex');
};

const compareValuesSafely = (left: string, right: string): boolean => {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);

  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }

  return timingSafeEqual(leftBuffer, rightBuffer);
};

const encodeDesktopAuthRequestCookie = (value: DesktopAuthRequestState): string => {
  return Buffer.from(JSON.stringify(value), 'utf8').toString('base64url');
};

const decodeDesktopAuthRequestCookie = (value: string): DesktopAuthRequestState => {
  const parsed = JSON.parse(Buffer.from(value, 'base64url').toString('utf8')) as unknown;
  return desktopAuthRequestStateSchema.parse(parsed);
};

const setDesktopAuthRequestCookie = (
  fastify: FastifyInstance,
  reply: FastifyReply,
  value: DesktopAuthRequestState
): void => {
  reply.setCookie(desktopAuthRequestCookieName, encodeDesktopAuthRequestCookie(value), {
    path: desktopAuthRequestCookiePath,
    httpOnly: true,
    sameSite: fastify.authConfig.cookies.sameSite,
    secure: fastify.authConfig.cookies.secure,
    maxAge: desktopAuthRequestMaxAgeSeconds
  });
};

const clearDesktopAuthRequestCookie = (fastify: FastifyInstance, reply: FastifyReply): void => {
  reply.clearCookie(desktopAuthRequestCookieName, {
    path: desktopAuthRequestCookiePath,
    httpOnly: true,
    sameSite: fastify.authConfig.cookies.sameSite,
    secure: fastify.authConfig.cookies.secure
  });
};

const removeExpiredDesktopAuthHandoffs = (): void => {
  const currentTimestamp = Date.now();

  for (const [handoffCodeHash, record] of desktopAuthHandoffStore.entries()) {
    if (record.expiresAt <= currentTimestamp) {
      desktopAuthHandoffStore.delete(handoffCodeHash);
    }
  }
};

const createDesktopAuthHandoff = (userId: string, desktopAuthRequestState: DesktopAuthRequestState): string => {
  removeExpiredDesktopAuthHandoffs();

  const handoffCode = randomBytes(32).toString('base64url');
  const handoffCodeHash = createHandoffCodeHash(handoffCode);

  desktopAuthHandoffStore.set(handoffCodeHash, {
    userId,
    desktopTransactionId: desktopAuthRequestState.desktopTransactionId,
    desktopCodeChallenge: desktopAuthRequestState.desktopCodeChallenge,
    expiresAt: Date.now() + desktopAuthHandoffLifetimeMilliseconds
  });

  return handoffCode;
};

const buildDesktopAuthSuccessCallbackUrl = (
  desktopAuthCallbackUrl: string,
  handoffCode: string,
  desktopTransactionId: string
): string => {
  const callbackUrl = new URL(desktopAuthCallbackUrl);

  callbackUrl.searchParams.set('handoffCode', handoffCode);
  callbackUrl.searchParams.set('transactionId', desktopTransactionId);

  return callbackUrl.toString();
};

const buildDesktopAuthErrorCallbackUrl = (
  desktopAuthCallbackUrl: string,
  desktopTransactionId: string | null,
  error: string,
  errorDescription: string | null
): string => {
  const callbackUrl = new URL(desktopAuthCallbackUrl);

  callbackUrl.searchParams.set('error', error);

  if (desktopTransactionId) {
    callbackUrl.searchParams.set('transactionId', desktopTransactionId);
  }

  if (errorDescription) {
    callbackUrl.searchParams.set('errorDescription', errorDescription);
  }

  return callbackUrl.toString();
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
  fastify.get<{ Querystring: GoogleAuthStartQuery }>('/auth/google', {
    schema: {
      querystring: googleAuthStartQuerySchema,
      response: {
        302: redirectResponseSchema,
        503: googleOAuthUnavailableSchema
      }
    }
  }, async (request, reply) => {
    if (!fastify.authConfig.google.enabled) {
      return reply.code(503).send(buildGoogleUnavailablePayload(fastify.authConfig.google.missingEnv));
    }

    const googleAuthStartQuery = desktopAuthStartQueryValueSchema.safeParse(request.query);

    if (!googleAuthStartQuery.success) {
      throw fastify.httpErrors.badRequest('Desktop auth start query is invalid');
    }

    if (googleAuthStartQuery.data.desktopTransactionId && googleAuthStartQuery.data.desktopCodeChallenge) {
      if (!fastify.authConfig.desktop.authCallbackUrl) {
        return reply.code(503).send(buildDesktopAuthUnavailablePayload());
      }

      setDesktopAuthRequestCookie(fastify, reply, {
        desktopTransactionId: googleAuthStartQuery.data.desktopTransactionId,
        desktopCodeChallenge: googleAuthStartQuery.data.desktopCodeChallenge
      });
    } else {
      clearDesktopAuthRequestCookie(fastify, reply);
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

    let desktopAuthRequestState: DesktopAuthRequestState | null = null;
    const desktopAuthRequestCookie = request.cookies[desktopAuthRequestCookieName];

    if (desktopAuthRequestCookie) {
      const parsedDesktopAuthRequestState = (() => {
        try {
          return decodeDesktopAuthRequestCookie(desktopAuthRequestCookie);
        } catch {
          return null;
        }
      })();

      if (!parsedDesktopAuthRequestState) {
        clearDesktopAuthRequestCookie(fastify, reply);
        throw fastify.httpErrors.unauthorized('Desktop auth request is invalid or expired');
      }

      desktopAuthRequestState = parsedDesktopAuthRequestState;
    }

    if (request.query.error) {
      if (desktopAuthRequestState && fastify.authConfig.desktop.authCallbackUrl) {
        clearDesktopAuthRequestCookie(fastify, reply);
        reply.code(302);

        return reply.redirect(
          buildDesktopAuthErrorCallbackUrl(
            fastify.authConfig.desktop.authCallbackUrl,
            desktopAuthRequestState.desktopTransactionId,
            request.query.error,
            request.query.error_description ?? null
          )
        );
      }

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
      if (desktopAuthRequestState && fastify.authConfig.desktop.authCallbackUrl) {
        clearDesktopAuthRequestCookie(fastify, reply);
        reply.code(302);

        return reply.redirect(
          buildDesktopAuthErrorCallbackUrl(
            fastify.authConfig.desktop.authCallbackUrl,
            desktopAuthRequestState.desktopTransactionId,
            'desktop_auth_callback_failed',
            error instanceof Error ? error.message : 'Desktop Google authentication failed'
          )
        );
      }

      if (error instanceof z.ZodError) {
        throw fastify.httpErrors.badGateway('Google OAuth returned an invalid profile payload');
      }

      if (error instanceof Error && error.message === 'Google account conflicts with an existing user record') {
        throw fastify.httpErrors.conflict(error.message);
      }

      throw error;
    }

    if (desktopAuthRequestState) {
      clearDesktopAuthRequestCookie(fastify, reply);

      if (!fastify.authConfig.desktop.authCallbackUrl) {
        return reply.code(503).send(buildDesktopAuthUnavailablePayload());
      }

      const handoffCode = createDesktopAuthHandoff(session.user.id, desktopAuthRequestState);

      reply.code(302);
      return reply.redirect(
        buildDesktopAuthSuccessCallbackUrl(
          fastify.authConfig.desktop.authCallbackUrl,
          handoffCode,
          desktopAuthRequestState.desktopTransactionId
        )
      );
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

  fastify.post<{ Body: DesktopAuthExchangeBody }>('/auth/desktop/exchange', {
    schema: {
      body: desktopAuthExchangeBodySchema,
      response: {
        200: authCallbackSuccessResponseSchema
      }
    }
  }, async (request, reply) => {
    const desktopAuthExchangeBody = desktopAuthExchangeValueSchema.safeParse(request.body);

    if (!desktopAuthExchangeBody.success) {
      throw fastify.httpErrors.badRequest('Desktop auth exchange payload is invalid');
    }

    removeExpiredDesktopAuthHandoffs();

    const handoffCodeHash = createHandoffCodeHash(desktopAuthExchangeBody.data.handoffCode);
    const handoffRecord = desktopAuthHandoffStore.get(handoffCodeHash);

    if (!handoffRecord) {
      throw fastify.httpErrors.unauthorized('Desktop handoff code is invalid or expired');
    }

    const expectedDesktopCodeChallenge = createDesktopCodeChallenge(desktopAuthExchangeBody.data.desktopCodeVerifier);

    if (
      handoffRecord.desktopTransactionId !== desktopAuthExchangeBody.data.desktopTransactionId ||
      !compareValuesSafely(handoffRecord.desktopCodeChallenge, expectedDesktopCodeChallenge)
    ) {
      throw fastify.httpErrors.unauthorized('Desktop handoff code is invalid or expired');
    }

    desktopAuthHandoffStore.delete(handoffCodeHash);

    const session = await loadUserSession(fastify.prisma, handoffRecord.userId).catch((error: unknown) => {
      const message = error instanceof Error ? error.message : 'User session could not be loaded';
      throw fastify.httpErrors.unauthorized(message);
    });

    const accessPayload = toAccessTokenPayload(session);
    const refreshPayload = toRefreshTokenPayload(accessPayload);
    const accessToken = await reply.accessJwtSign(accessPayload);
    const refreshToken = await reply.refreshJwtSign(refreshPayload);

    fastify.setAuthCookies(reply, { accessToken, refreshToken });

    return {
      status: 'authenticated',
      user: session.user,
      companies: session.companies,
      redirectTo: null
    };
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

    return {
      authenticated: true,
      user: session.user,
      companies: session.companies
    };
  });
};
