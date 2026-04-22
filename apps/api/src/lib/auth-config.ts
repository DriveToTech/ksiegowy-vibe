import { z } from 'zod';

const nonEmptyStringSchema = z.string().trim().min(1);
const urlSchema = z.string().trim().url();
const nodeEnvSchema = z.enum(['development', 'test', 'production']).catch('development');

const REQUIRED_GOOGLE_ENV_VARS = ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'GOOGLE_REDIRECT_URI'] as const;

export type RequiredGoogleEnvVar = (typeof REQUIRED_GOOGLE_ENV_VARS)[number];

export interface AuthCompanyClaim {
  id: string;
  role: 'ADMIN' | 'ACCOUNTANT' | 'VIEWER';
}

export interface AccessTokenPayload {
  sub: string;
  email: string;
  name?: string;
  companies: AuthCompanyClaim[];
}

export interface RefreshTokenPayload extends AccessTokenPayload {
  tokenType: 'refresh';
}

export interface AuthConfig {
  nodeEnv: 'development' | 'test' | 'production';
  appUrl?: string;
  jwt: {
    accessSecret: string;
    refreshSecret: string;
    accessTtl: string;
    refreshTtl: string;
  };
  cookies: {
    accessTokenName: 'auth_token';
    refreshTokenName: 'refresh_token';
    accessMaxAgeSeconds: number;
    refreshMaxAgeSeconds: number;
    secure: boolean;
    sameSite: 'lax';
    path: '/';
  };
  google: {
    enabled: boolean;
    missingEnv: RequiredGoogleEnvVar[];
    providedEnv: RequiredGoogleEnvVar[];
    clientId?: string | undefined;
    clientSecret?: string | undefined;
    redirectUri?: string | undefined;
  };
}

const ACCESS_TOKEN_TTL = '15m';
const REFRESH_TOKEN_TTL = '30d';
const ACCESS_TOKEN_MAX_AGE_SECONDS = 15 * 60;
const REFRESH_TOKEN_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;

const readOptionalEnv = (value: string | undefined): string | undefined => {
  const trimmed = value?.trim();

  return trimmed && trimmed.length > 0 ? trimmed : undefined;
};

const parseOptionalUrl = (name: string, value: string | undefined): string | undefined => {
  if (value === undefined) {
    return undefined;
  }

  return urlSchema.parse(value, {
    error: () => `Environment variable ${name} must be a valid URL`
  });
};

export const loadAuthConfig = (env: NodeJS.ProcessEnv): AuthConfig => {
  const nodeEnv = nodeEnvSchema.parse(env.NODE_ENV);

  const accessSecret = nonEmptyStringSchema.parse(readOptionalEnv(env.JWT_SECRET), {
    error: () => 'Environment variable JWT_SECRET is required for auth'
  });

  const refreshSecret = nonEmptyStringSchema.parse(readOptionalEnv(env.JWT_REFRESH_SECRET), {
    error: () => 'Environment variable JWT_REFRESH_SECRET is required for auth'
  });

  if (accessSecret === refreshSecret) {
    throw new Error('JWT_SECRET and JWT_REFRESH_SECRET must be different');
  }

  const googleValues = {
    GOOGLE_CLIENT_ID: readOptionalEnv(env.GOOGLE_CLIENT_ID),
    GOOGLE_CLIENT_SECRET: readOptionalEnv(env.GOOGLE_CLIENT_SECRET),
    GOOGLE_REDIRECT_URI: parseOptionalUrl('GOOGLE_REDIRECT_URI', readOptionalEnv(env.GOOGLE_REDIRECT_URI))
  };

  const missingEnv = REQUIRED_GOOGLE_ENV_VARS.filter((name) => googleValues[name] === undefined);
  const providedEnv = REQUIRED_GOOGLE_ENV_VARS.filter((name) => googleValues[name] !== undefined);
  const googleEnabled = missingEnv.length === 0;
  const appUrl = parseOptionalUrl('APP_URL', readOptionalEnv(env.APP_URL));

  const googleConfig: AuthConfig['google'] = googleEnabled
    ? {
        enabled: true,
        missingEnv,
        providedEnv,
        clientId: googleValues.GOOGLE_CLIENT_ID,
        clientSecret: googleValues.GOOGLE_CLIENT_SECRET,
        redirectUri: googleValues.GOOGLE_REDIRECT_URI
      }
    : {
        enabled: false,
        missingEnv,
        providedEnv
      };

  return {
    nodeEnv,
    ...(appUrl ? { appUrl } : {}),
    jwt: {
      accessSecret,
      refreshSecret,
      accessTtl: ACCESS_TOKEN_TTL,
      refreshTtl: REFRESH_TOKEN_TTL
    },
    cookies: {
      accessTokenName: 'auth_token',
      refreshTokenName: 'refresh_token',
      accessMaxAgeSeconds: ACCESS_TOKEN_MAX_AGE_SECONDS,
      refreshMaxAgeSeconds: REFRESH_TOKEN_MAX_AGE_SECONDS,
      secure: nodeEnv === 'production',
      sameSite: 'lax',
      path: '/'
    },
    google: googleConfig
  };
};
