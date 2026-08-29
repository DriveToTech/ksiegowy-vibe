import fp from 'fastify-plugin';
import type { FastifyPluginAsync } from 'fastify';

const MUTATING_METHODS = new Set(['POST', 'PATCH', 'PUT', 'DELETE']);

export const getConfiguredOrigin = (): string => {
  const configuredOrigin = process.env['CORS_ORIGIN'] ?? 'http://localhost:3000';
  if (configuredOrigin === '*' || configuredOrigin.includes(',')) {
    throw new Error('CORS_ORIGIN must be one explicit HTTP(S) origin');
  }

  let parsedOrigin: URL;
  try {
    parsedOrigin = new URL(configuredOrigin);
  } catch {
    throw new Error('CORS_ORIGIN must be one explicit HTTP(S) origin');
  }

  if ((parsedOrigin.protocol !== 'http:' && parsedOrigin.protocol !== 'https:') || parsedOrigin.origin !== configuredOrigin) {
    throw new Error('CORS_ORIGIN must be one explicit HTTP(S) origin');
  }

  return configuredOrigin;
};

const originIsAllowed = (origin: string, configuredOrigin: string): boolean => {
  if (origin === 'null' || origin.includes(',')) return false;

  let parsedOrigin: URL;
  try {
    parsedOrigin = new URL(origin);
  } catch {
    return false;
  }

  if ((parsedOrigin.protocol !== 'http:' && parsedOrigin.protocol !== 'https:') || parsedOrigin.origin !== origin) return false;
  return origin === configuredOrigin;
};

const hasDuplicateOriginHeader = (rawHeaders: string[]): boolean => {
  let originHeaderCount = 0;
  for (let index = 0; index < rawHeaders.length; index += 2) {
    if (rawHeaders[index]?.toLowerCase() === 'origin') originHeaderCount += 1;
  }
  return originHeaderCount > 1;
};

const mutationOriginGuard: FastifyPluginAsync = async (fastify): Promise<void> => {
  const configuredOrigin = getConfiguredOrigin();

  fastify.addHook('onRequest', async (request, reply) => {
    if (!MUTATING_METHODS.has(request.method)) return;

    const cookies = request.cookies;
    const hasAuthenticationCookie = cookies[fastify.authConfig.cookies.accessTokenName] !== undefined || cookies[fastify.authConfig.cookies.refreshTokenName] !== undefined;
    if (!hasAuthenticationCookie) return;

    const rawHeaders = request.raw.rawHeaders;
    const originHeader = request.headers.origin;
    if (hasDuplicateOriginHeader(rawHeaders) || Array.isArray(originHeader) || originHeader === undefined || !originIsAllowed(originHeader, configuredOrigin)) {
      return reply.code(403).send({ statusCode: 403, error: 'Forbidden', message: 'Origin not allowed' });
    }
  });
};

export const mutationOriginGuardPlugin = fp(mutationOriginGuard, {
  name: 'mutationOriginGuard'
});
