import type { KsefEnvironment, PrismaClient } from '@prisma/client';
import type { FastifyRequest } from 'fastify';

export const KSEF_ENVIRONMENT_HEADER = 'x-ksef-environment';
const ACTIVE_KSEF_ENVIRONMENT_COOKIE = 'active_ksef_environment';

declare module 'fastify' {
  interface FastifyRequest {
    ksefEnvironment?: KsefEnvironment;
  }
}

export const KSEF_ENVIRONMENTS: readonly KsefEnvironment[] = ['TEST', 'PRODUCTION'];

export const KSEF_ENVIRONMENT_QUERY_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    environment: { type: 'string', enum: KSEF_ENVIRONMENTS },
  },
} as const;

export const KSEF_ENVIRONMENT_HEADER_SCHEMA = {
  type: 'object',
  required: [KSEF_ENVIRONMENT_HEADER],
  properties: {
    [KSEF_ENVIRONMENT_HEADER]: { type: 'string', enum: KSEF_ENVIRONMENTS },
  },
} as const;

/**
 * Rollout contract: every financial mutation must send one exact
 * x-ksef-environment header. Read-only routes may temporarily fall back to
 * the query parameter, active-environment cookie, and finally Company.ksefEnv
 * for backwards compatibility; this fallback must not be used by mutations.
 */

const isKsefEnvironment = (value: string): value is KsefEnvironment => {
  return KSEF_ENVIRONMENTS.includes(value as KsefEnvironment);
};

const readHeaderValue = (headerValue: string | string[] | undefined): string | null => {
  if (headerValue === undefined) {
    return null;
  }

  return Array.isArray(headerValue) ? headerValue[0] ?? null : headerValue;
};

const readCookieValue = (cookieHeader: string | string[] | undefined, cookieName: string): string | null => {
  const rawCookieHeader = readHeaderValue(cookieHeader);

  if (!rawCookieHeader) {
    return null;
  }

  const cookieEntry = rawCookieHeader
    .split(';')
    .map((entry) => entry.trim())
    .find((entry) => entry.startsWith(`${cookieName}=`));

  if (!cookieEntry) {
    return null;
  }

  return cookieEntry.slice(cookieName.length + 1);
};

export const readRequestedKsefEnvironment = (request: FastifyRequest): KsefEnvironment | null => {
  if (request.ksefEnvironment) {
    return request.ksefEnvironment;
  }

  const headerValue = readHeaderValue(request.headers[KSEF_ENVIRONMENT_HEADER]);

  if (headerValue === null) {
    const query = request.query as { environment?: unknown } | undefined;
    const queryValue = query?.environment;

    if (queryValue === undefined) {
      return null;
    }

    if (typeof queryValue !== 'string' || !isKsefEnvironment(queryValue)) {
      throw request.server.httpErrors.badRequest(
        'Invalid environment query parameter. Expected TEST or PRODUCTION.'
      );
    }

    request.ksefEnvironment = queryValue;
    return queryValue;
  }

  if (!isKsefEnvironment(headerValue)) {
    throw request.server.httpErrors.badRequest(
      `Invalid ${KSEF_ENVIRONMENT_HEADER} header. Expected TEST or PRODUCTION.`
    );
  }

  request.ksefEnvironment = headerValue;
  return headerValue;
};

/**
 * Resolves the environment for a mutation that can change or submit financial
 * data. These operations must never infer the environment from a cookie or a
 * company default: an absent, repeated, or non-exact header is rejected.
 */
export const requireExplicitKsefEnvironment = (request: FastifyRequest): KsefEnvironment => {
  const headerValue = request.headers[KSEF_ENVIRONMENT_HEADER];

  if (typeof headerValue !== 'string' || !isKsefEnvironment(headerValue)) {
    throw request.server.httpErrors.badRequest(
      `Invalid or missing ${KSEF_ENVIRONMENT_HEADER} header. Expected exactly TEST or PRODUCTION.`
    );
  }

  request.ksefEnvironment = headerValue;
  return headerValue;
};

const readCookieKsefEnvironment = (request: FastifyRequest): KsefEnvironment | null => {
  const cookieValue = readCookieValue(request.headers.cookie, ACTIVE_KSEF_ENVIRONMENT_COOKIE);

  if (cookieValue === null) {
    return null;
  }

  if (!isKsefEnvironment(cookieValue)) {
    return null;
  }

  request.ksefEnvironment = cookieValue;
  return cookieValue;
};

export const resolveEffectiveKsefEnvironment = async (
  request: FastifyRequest,
  prisma: PrismaClient,
  companyId: string,
): Promise<KsefEnvironment> => {
  const requestedEnvironment = readRequestedKsefEnvironment(request);

  if (requestedEnvironment) {
    return requestedEnvironment;
  }

  const cookieEnvironment = readCookieKsefEnvironment(request);

  if (cookieEnvironment) {
    return cookieEnvironment;
  }

  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: { ksefEnv: true },
  });

  if (!company) {
    throw request.server.httpErrors.notFound('Company not found');
  }

  request.ksefEnvironment = company.ksefEnv;
  return company.ksefEnv;
};
