import { randomBytes } from 'node:crypto';
import cookie from '@fastify/cookie';
import jwt from '@fastify/jwt';
import oauth2 from '@fastify/oauth2';
import fp from 'fastify-plugin';
import type { FastifyPluginAsync } from 'fastify';
import type * as fastifyOauth2 from '@fastify/oauth2';
import type { AccessTokenPayload, AuthConfig, RefreshTokenPayload } from '../lib/auth-config.js';

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: AccessTokenPayload | RefreshTokenPayload;
    user: AccessTokenPayload | RefreshTokenPayload;
  }
}

declare module 'fastify' {
  interface FastifyInstance {
    authConfig: AuthConfig;
    authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
    setAuthCookies: (reply: FastifyReply, tokens: { accessToken: string; refreshToken: string }) => void;
    clearAuthCookies: (reply: FastifyReply) => void;
    oauth2GoogleOAuth2?: fastifyOauth2.OAuth2Namespace;
  }

  interface FastifyRequest {
    accessJwtVerify: () => Promise<AccessTokenPayload>;
    refreshJwtVerify: () => Promise<RefreshTokenPayload>;
  }

  interface FastifyReply {
    accessJwtSign: (payload: AccessTokenPayload, options?: { sign?: { expiresIn?: string } }) => Promise<string>;
    refreshJwtSign: (payload: RefreshTokenPayload, options?: { sign?: { expiresIn?: string } }) => Promise<string>;
  }
}

const oauth2Plugin = oauth2 as unknown as FastifyPluginAsync<fastifyOauth2.FastifyOAuth2Options>;
const googleOAuthStateLifetimeMilliseconds = 10 * 60 * 1000;

export interface AuthPluginOptions {
  config: AuthConfig;
}

const authPluginAsync: FastifyPluginAsync<AuthPluginOptions> = async (fastify, options): Promise<void> => {
  const { config } = options;

  await fastify.register(cookie);

  await fastify.register(jwt, {
    namespace: 'access',
    secret: config.jwt.accessSecret,
    cookie: {
      cookieName: config.cookies.accessTokenName,
      signed: false
    },
    sign: {
      expiresIn: config.jwt.accessTtl
    },
    decoratorName: 'user'
  });

  await fastify.register(jwt, {
    namespace: 'refresh',
    secret: config.jwt.refreshSecret,
    cookie: {
      cookieName: config.cookies.refreshTokenName,
      signed: false
    },
    sign: {
      expiresIn: config.jwt.refreshTtl
    },
    decoratorName: 'user'
  });

  fastify.decorate('authConfig', config);

  fastify.decorate('setAuthCookies', (reply, tokens) => {
    reply.setCookie(config.cookies.accessTokenName, tokens.accessToken, {
      path: config.cookies.path,
      httpOnly: true,
      sameSite: config.cookies.sameSite,
      secure: config.cookies.secure,
      maxAge: config.cookies.accessMaxAgeSeconds
    });

    reply.setCookie(config.cookies.refreshTokenName, tokens.refreshToken, {
      path: config.cookies.path,
      httpOnly: true,
      sameSite: config.cookies.sameSite,
      secure: config.cookies.secure,
      maxAge: config.cookies.refreshMaxAgeSeconds
    });
  });

  fastify.decorate('clearAuthCookies', (reply) => {
    reply.clearCookie(config.cookies.accessTokenName, {
      path: config.cookies.path,
      httpOnly: true,
      sameSite: config.cookies.sameSite,
      secure: config.cookies.secure
    });

    reply.clearCookie(config.cookies.refreshTokenName, {
      path: config.cookies.path,
      httpOnly: true,
      sameSite: config.cookies.sameSite,
      secure: config.cookies.secure
    });
  });

  fastify.decorate('authenticate', async (request): Promise<void> => {
    try {
      await request.accessJwtVerify();
    } catch {
      throw fastify.httpErrors.unauthorized('Authentication required');
    }
  });

  if (config.google.enabled) {
    const googleOAuthStateStore = new Map<string, number>();

    const removeExpiredGoogleOAuthStates = () => {
      const currentTimestamp = Date.now();

      for (const [state, expiresAt] of googleOAuthStateStore.entries()) {
        if (expiresAt <= currentTimestamp) {
          googleOAuthStateStore.delete(state);
        }
      }
    };

    await fastify.register(oauth2Plugin, {
      name: 'googleOAuth2',
      credentials: {
        client: {
          id: config.google.clientId!,
          secret: config.google.clientSecret!
        }
      },
      callbackUri: config.google.redirectUri!,
      scope: ['openid', 'email', 'profile'],
      discovery: {
        issuer: 'https://accounts.google.com'
      },
      generateStateFunction: () => {
        removeExpiredGoogleOAuthStates();

        const state = randomBytes(32).toString('base64url');
        googleOAuthStateStore.set(state, Date.now() + googleOAuthStateLifetimeMilliseconds);

        return state;
      },
      checkStateFunction: (request) => {
        removeExpiredGoogleOAuthStates();

        const state =
          typeof request.query === 'object' && request.query !== null
            ? Reflect.get(request.query, 'state')
            : undefined;

        if (typeof state !== 'string' || state.length === 0) {
          return false;
        }

        const expiresAt = googleOAuthStateStore.get(state);

        if (!expiresAt) {
          return false;
        }

        googleOAuthStateStore.delete(state);
        return expiresAt > Date.now();
      },
      cookie: {
        path: config.cookies.path,
        secure: config.cookies.secure,
        sameSite: config.cookies.sameSite,
        httpOnly: true
      }
    });
  } else if (config.google.providedEnv.length > 0) {
    fastify.log.warn(
      {
        missingEnv: config.google.missingEnv
      },
      'Google OAuth is partially configured and remains disabled'
    );
  }
};

export const authPlugin = fp(authPluginAsync, {
  name: 'auth'
});
