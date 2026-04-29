import { createHash, randomBytes } from 'node:crypto';
import { z } from 'zod';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

type AppPrisma = FastifyInstance['prisma'];

const authRequestCookieName = 'desktop_auth_request';
const authRequestCookiePath = '/auth/google';
const authRequestMaxAgeSeconds = 10 * 60;
const clientAuthHandoffLifetimeMilliseconds = 60 * 1000;
const clientAuthCallbackMissingEnv = ['DESKTOP_AUTH_CALLBACK_URL'] as const;

const transactionIdSchema = z.string().trim().min(1).max(200).regex(/^[A-Za-z0-9._-]+$/);
const codeChallengeSchema = z.string().trim().min(43).max(128).regex(/^[A-Za-z0-9_-]+$/);
const codeVerifierSchema = z.string().trim().min(43).max(128).regex(/^[A-Za-z0-9._~-]+$/);
const handoffCodeSchema = z.string().trim().min(32).max(256).regex(/^[A-Za-z0-9_-]+$/);

export const googleAuthStartQuerySchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    clientTransactionId: { type: 'string' },
    clientCodeChallenge: { type: 'string' }
  }
} as const;

export const clientAuthExchangeBodySchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    handoffCode: { type: 'string' },
    clientTransactionId: { type: 'string' },
    clientCodeVerifier: { type: 'string' }
  },
  required: ['handoffCode']
} as const;

export interface GoogleAuthStartQuery {
  clientTransactionId?: string;
  clientCodeChallenge?: string;
}

export interface ClientAuthExchangeBody {
  handoffCode: string;
  clientTransactionId?: string;
  clientCodeVerifier?: string;
}

export interface ClientAuthRequestState {
  transactionId: string;
  codeChallenge: string;
}

export interface ClientAuthExchangeRequest {
  handoffCode: string;
  transactionId: string;
  codeVerifier: string;
}

const clientAuthStartQueryValueSchema = z
  .object({
    clientTransactionId: transactionIdSchema.optional(),
    clientCodeChallenge: codeChallengeSchema.optional()
  })
  .strict()
  .superRefine((value, context) => {
    const transactionId = value.clientTransactionId;
    const codeChallenge = value.clientCodeChallenge;

    if ((transactionId === undefined) !== (codeChallenge === undefined)) {
      context.addIssue({
        code: 'custom',
        message: 'clientTransactionId and clientCodeChallenge must be provided together'
      });
    }
  })
  .transform((value): ClientAuthRequestState | null => {
    const transactionId = value.clientTransactionId;
    const codeChallenge = value.clientCodeChallenge;

    if (!transactionId || !codeChallenge) {
      return null;
    }

    return {
      transactionId,
      codeChallenge
    };
  });

const clientAuthExchangeValueSchema = z
  .object({
    handoffCode: handoffCodeSchema,
    clientTransactionId: transactionIdSchema.optional(),
    clientCodeVerifier: codeVerifierSchema.optional()
  })
  .strict()
  .superRefine((value, context) => {
    const transactionId = value.clientTransactionId;
    const codeVerifier = value.clientCodeVerifier;

    if (transactionId === undefined || codeVerifier === undefined) {
      context.addIssue({
        code: 'custom',
        message: 'clientTransactionId and clientCodeVerifier are required'
      });
    }
  })
  .transform((value): ClientAuthExchangeRequest => {
    return {
      handoffCode: value.handoffCode,
      transactionId: value.clientTransactionId ?? '',
      codeVerifier: value.clientCodeVerifier ?? ''
    };
  });

const clientAuthRequestStateSchema = z.object({
  transactionId: transactionIdSchema,
  codeChallenge: codeChallengeSchema
});

const createClientCodeChallenge = (codeVerifier: string): string => {
  return createHash('sha256').update(codeVerifier).digest('base64url');
};

const createHandoffCodeHash = (handoffCode: string): string => {
  return createHash('sha256').update(handoffCode).digest('hex');
};

const encodeClientAuthRequestCookie = (value: ClientAuthRequestState): string => {
  return Buffer.from(JSON.stringify(value), 'utf8').toString('base64url');
};

const decodeClientAuthRequestCookie = (value: string): ClientAuthRequestState => {
  const parsed = JSON.parse(Buffer.from(value, 'base64url').toString('utf8')) as unknown;
  return clientAuthRequestStateSchema.parse(parsed);
};

export const parseGoogleAuthStartQuery = (value: unknown) => {
  return clientAuthStartQueryValueSchema.safeParse(value);
};

export const parseClientAuthExchangeBody = (value: unknown) => {
  return clientAuthExchangeValueSchema.safeParse(value);
};

export const setClientAuthRequestCookie = (
  fastify: FastifyInstance,
  reply: FastifyReply,
  value: ClientAuthRequestState
): void => {
  reply.setCookie(authRequestCookieName, encodeClientAuthRequestCookie(value), {
    path: authRequestCookiePath,
    httpOnly: true,
    sameSite: fastify.authConfig.cookies.sameSite,
    secure: fastify.authConfig.cookies.secure,
    maxAge: authRequestMaxAgeSeconds
  });
};

export const clearClientAuthRequestCookie = (fastify: FastifyInstance, reply: FastifyReply): void => {
  reply.clearCookie(authRequestCookieName, {
    path: authRequestCookiePath,
    httpOnly: true,
    sameSite: fastify.authConfig.cookies.sameSite,
    secure: fastify.authConfig.cookies.secure
  });
};

export const getClientAuthRequestState = (
  request: FastifyRequest
): {
  hasClientAuthRequestCookie: boolean;
  clientAuthRequestState: ClientAuthRequestState | null;
} => {
  const authRequestCookie = request.cookies[authRequestCookieName];

  if (!authRequestCookie) {
    return {
      hasClientAuthRequestCookie: false,
      clientAuthRequestState: null
    };
  }

  try {
    return {
      hasClientAuthRequestCookie: true,
      clientAuthRequestState: decodeClientAuthRequestCookie(authRequestCookie)
    };
  } catch {
    return {
      hasClientAuthRequestCookie: true,
      clientAuthRequestState: null
    };
  }
};

export const createClientAuthHandoff = async (
  prisma: AppPrisma,
  userId: string,
  clientAuthRequestState: ClientAuthRequestState
): Promise<string> => {
  const currentTimestamp = new Date();

  await prisma.clientAuthHandoff.deleteMany({
    where: {
      expiresAt: {
        lte: currentTimestamp
      }
    }
  });

  const handoffCode = randomBytes(32).toString('base64url');
  const handoffCodeHash = createHandoffCodeHash(handoffCode);

  await prisma.clientAuthHandoff.create({
    data: {
      handoffCodeHash,
      userId,
      transactionId: clientAuthRequestState.transactionId,
      codeChallenge: clientAuthRequestState.codeChallenge,
      expiresAt: new Date(currentTimestamp.getTime() + clientAuthHandoffLifetimeMilliseconds)
    }
  });

  return handoffCode;
};

export const exchangeClientAuthHandoff = async (
  prisma: AppPrisma,
  exchangeRequest: ClientAuthExchangeRequest
): Promise<string | null> => {
  const currentTimestamp = new Date();

  const handoffCodeHash = createHandoffCodeHash(exchangeRequest.handoffCode);
  const expectedCodeChallenge = createClientCodeChallenge(exchangeRequest.codeVerifier);

  await prisma.clientAuthHandoff.deleteMany({
    where: {
      expiresAt: {
        lte: currentTimestamp
      }
    }
  });

  const handoffRecord = await prisma.$transaction(async (transactionPrisma) => {
    const consumeResult = await transactionPrisma.clientAuthHandoff.updateMany({
      where: {
        handoffCodeHash,
        transactionId: exchangeRequest.transactionId,
        codeChallenge: expectedCodeChallenge,
        expiresAt: {
          gt: currentTimestamp
        },
        consumedAt: null
      },
      data: {
        consumedAt: currentTimestamp
      }
    });

    if (consumeResult.count !== 1) {
      return null;
    }

    return transactionPrisma.clientAuthHandoff.findUnique({
      where: {
        handoffCodeHash
      },
      select: {
        userId: true
      }
    });
  });

  return handoffRecord?.userId ?? null;
};

export const buildClientAuthSuccessCallbackUrl = (
  clientAuthCallbackUrl: string,
  handoffCode: string,
  transactionId: string
): string => {
  const callbackUrl = new URL(clientAuthCallbackUrl);

  callbackUrl.searchParams.set('handoffCode', handoffCode);
  callbackUrl.searchParams.set('transactionId', transactionId);

  return callbackUrl.toString();
};

export const buildClientAuthErrorCallbackUrl = (
  clientAuthCallbackUrl: string,
  transactionId: string | null,
  error: string,
  errorDescription: string | null
): string => {
  const callbackUrl = new URL(clientAuthCallbackUrl);

  callbackUrl.searchParams.set('error', error);

  if (transactionId) {
    callbackUrl.searchParams.set('transactionId', transactionId);
  }

  if (errorDescription) {
    callbackUrl.searchParams.set('errorDescription', errorDescription);
  }

  return callbackUrl.toString();
};

export const buildClientAuthUnavailablePayload = () => ({
  error: 'desktop_auth_not_configured',
  message: 'Desktop OAuth handoff is not configured for this environment.',
  missingEnv: [...clientAuthCallbackMissingEnv]
});
