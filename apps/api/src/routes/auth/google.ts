import { z } from 'zod';
import type { FastifyPluginAsync, FastifyReply } from 'fastify';
import type { AccessTokenPayload } from '../../lib/auth-config.js';
import {
  buildAuthenticatedResponse,
  googleProfileSchema,
  loadUserSession,
  setAuthenticatedSessionCookies,
  upsertUserFromGoogleProfile
} from '../../services/auth/google-auth-session.service.js';
import {
  buildClientAuthErrorCallbackUrl,
  buildClientAuthSuccessCallbackUrl,
  buildClientAuthUnavailablePayload,
  clearClientAuthRequestCookie,
  clientAuthExchangeBodySchema,
  createClientAuthHandoff,
  exchangeClientAuthHandoff,
  getClientAuthRequestState,
  googleAuthStartQuerySchema,
  parseClientAuthExchangeBody,
  parseGoogleAuthStartQuery,
  setClientAuthRequestCookie,
  type ClientAuthExchangeBody,
  type GoogleAuthStartQuery
} from '../../services/auth/google-client-handoff.service.js';

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

const buildPostLoginRedirectUrl = (appUrl: string): string => {
  return new URL('/dashboard', appUrl).toString();
};

const hasLegacyClientAuthStartQueryParameters = (rawUrl: string | undefined): boolean => {
  if (!rawUrl) {
    return false;
  }

  const searchParams = new URL(rawUrl, 'http://localhost').searchParams;

  return searchParams.has('desktopTransactionId') || searchParams.has('desktopCodeChallenge');
};

export const authRoutes: FastifyPluginAsync = async (fastify): Promise<void> => {
  fastify.get<{ Querystring: GoogleAuthStartQuery }>(
    '/auth/google',
    {
      schema: {
        querystring: googleAuthStartQuerySchema,
        response: {
          302: redirectResponseSchema,
          503: googleOAuthUnavailableSchema
        }
      }
    },
    async (request, reply) => {
      if (!fastify.authConfig.google.enabled) {
        return reply.code(503).send(buildGoogleUnavailablePayload(fastify.authConfig.google.missingEnv));
      }

      if (hasLegacyClientAuthStartQueryParameters(request.raw.url)) {
        throw fastify.httpErrors.badRequest('Client auth start query is invalid');
      }

      const googleAuthStartQuery = parseGoogleAuthStartQuery(request.query);

      if (!googleAuthStartQuery.success) {
        throw fastify.httpErrors.badRequest('Client auth start query is invalid');
      }

      if (googleAuthStartQuery.data) {
        if (!fastify.authConfig.desktop.authCallbackUrl) {
          return reply.code(503).send(buildClientAuthUnavailablePayload());
        }

        setClientAuthRequestCookie(fastify, reply, googleAuthStartQuery.data);
      } else {
        clearClientAuthRequestCookie(fastify, reply);
      }

    fastify.log.info({
      cookiesToBeSet: reply.getHeader('set-cookie'),
      host: request.headers.host,
      url: request.url
    }, '[OAuth Start] About to generate authorization URI');

    if (!fastify.oauth2GoogleOAuth2) {
      return reply.code(503).send(buildGoogleUnavailablePayload(fastify.authConfig.google.missingEnv));
    }

    const authorizationUri = await fastify.oauth2GoogleOAuth2.generateAuthorizationUri(request, reply);

      fastify.log.info({
        authorizationUri,
        cookiesAfterGeneration: reply.getHeader('set-cookie'),
        host: request.headers.host
      }, '[OAuth Start] Generated authorization URI with PKCE');

      reply.code(302);
      return reply.redirect(authorizationUri);
    }
  );

  fastify.get<{ Querystring: GoogleCallbackQuery }>(
    '/auth/google/callback',
    {
      schema: {
        querystring: googleCallbackQuerySchema,
        response: {
          302: redirectResponseSchema,
          200: authCallbackSuccessResponseSchema,
          503: googleOAuthUnavailableSchema
        }
      }
    },
    async (request, reply) => {
      // Enhanced debug logging to trace cookie issues
      fastify.log.info({
        cookies: Object.keys(request.cookies || {}),
        rawCookieHeader: request.headers.cookie,
        host: request.headers.host,
        forwardedHost: request.headers['x-forwarded-host'],
        url: request.url,
        query: request.query
      }, '[OAuth Callback] Incoming request');

      // Check for OAuth2 PKCE code_verifier cookie (named based on plugin name: googleOAuth2)
      const oauth2CookieNames = Object.keys(request.cookies || {}).filter(name => 
        name.includes('oauth') || name.includes('OAuth') || name.includes('verifier') || name.includes('state')
      );
      fastify.log.info({
        oauth2RelatedCookies: oauth2CookieNames,
        allCookies: request.cookies,
        codeVerifierCookie: request.cookies?.googleOAuth2CodeVerifier || request.cookies?.['googleOAuth2-code-verifier']
      }, '[OAuth Callback] OAuth2 related cookies');

      if (!fastify.authConfig.google.enabled) {
      return reply.code(503).send(buildGoogleUnavailablePayload(fastify.authConfig.google.missingEnv));
    }

    const clientAuthRequest = getClientAuthRequestState(request);
    const clientAuthRequestState = clientAuthRequest.clientAuthRequestState;

      if (clientAuthRequest.hasClientAuthRequestCookie && !clientAuthRequestState) {
        clearClientAuthRequestCookie(fastify, reply);
        throw fastify.httpErrors.unauthorized('Client auth request is invalid or expired');
      }

      if (request.query.error) {
        if (clientAuthRequestState && fastify.authConfig.desktop.authCallbackUrl) {
          clearClientAuthRequestCookie(fastify, reply);
          reply.code(302);

          return reply.redirect(
            buildClientAuthErrorCallbackUrl(
              fastify.authConfig.desktop.authCallbackUrl,
              clientAuthRequestState.transactionId,
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
        if (clientAuthRequestState && fastify.authConfig.desktop.authCallbackUrl) {
          clearClientAuthRequestCookie(fastify, reply);
          reply.code(302);

          return reply.redirect(
            buildClientAuthErrorCallbackUrl(
              fastify.authConfig.desktop.authCallbackUrl,
              clientAuthRequestState.transactionId,
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

      if (clientAuthRequestState) {
        clearClientAuthRequestCookie(fastify, reply);

        if (!fastify.authConfig.desktop.authCallbackUrl) {
          return reply.code(503).send(buildClientAuthUnavailablePayload());
        }

        const handoffCode = await createClientAuthHandoff(fastify.prisma, session.user.id, clientAuthRequestState);

        reply.code(302);
        return reply.redirect(
          buildClientAuthSuccessCallbackUrl(
            fastify.authConfig.desktop.authCallbackUrl,
            handoffCode,
            clientAuthRequestState.transactionId
          )
        );
      }

      await setAuthenticatedSessionCookies(fastify, reply, session);

      if (fastify.authConfig.appUrl) {
        reply.code(302);
        return reply.redirect(buildPostLoginRedirectUrl(fastify.authConfig.appUrl));
      }

      return reply.code(200).send(buildAuthenticatedResponse(session));
    }
  );

  const exchangeClientAuthSession = async (
    request: { body: ClientAuthExchangeBody },
    reply: FastifyReply
  ) => {
    const clientAuthExchangeBody = parseClientAuthExchangeBody(request.body);

    if (!clientAuthExchangeBody.success) {
      throw fastify.httpErrors.badRequest('Client auth exchange payload is invalid');
    }

    const userId = await exchangeClientAuthHandoff(fastify.prisma, clientAuthExchangeBody.data);

    if (!userId) {
      throw fastify.httpErrors.unauthorized('Client handoff code is invalid or expired');
    }

    const session = await loadUserSession(fastify.prisma, userId).catch((error: unknown) => {
      const message = error instanceof Error ? error.message : 'User session could not be loaded';
      throw fastify.httpErrors.unauthorized(message);
    });

    await setAuthenticatedSessionCookies(fastify, reply, session);

    return buildAuthenticatedResponse(session);
  };

  fastify.post<{ Body: ClientAuthExchangeBody }>(
    '/auth/client/exchange',
    {
      schema: {
        body: clientAuthExchangeBodySchema,
        response: {
          200: authCallbackSuccessResponseSchema
        }
      }
    },
    exchangeClientAuthSession
  );

  fastify.post(
    '/auth/refresh',
    {
      schema: {
        response: {
          200: authRefreshResponseSchema
        }
      }
    },
    async (request, reply) => {
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

      await setAuthenticatedSessionCookies(fastify, reply, session);

      return {
        status: 'refreshed'
      };
    }
  );

  fastify.post(
    '/auth/logout',
    {
      schema: {
        response: {
          200: authRefreshResponseSchema
        }
      }
    },
    async (_request, reply) => {
      fastify.clearAuthCookies(reply);

      return {
        status: 'logged_out'
      };
    }
  );

  fastify.get(
    '/auth/me',
    {
      onRequest: [fastify.authenticate],
      schema: {
        response: {
          200: authMeResponseSchema
        }
      }
    },
    async (request) => {
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
    }
  );
};
