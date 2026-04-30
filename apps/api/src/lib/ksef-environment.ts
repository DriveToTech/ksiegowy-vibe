import type { KsefEnvironment, PrismaClient } from '@prisma/client';
import type { FastifyRequest } from 'fastify';

export const KSEF_ENVIRONMENT_HEADER = 'x-ksef-environment';

declare module 'fastify' {
  interface FastifyRequest {
    ksefEnvironment?: KsefEnvironment;
  }
}

const KSEF_ENVIRONMENTS: readonly KsefEnvironment[] = ['TEST', 'PRODUCTION'];

const isKsefEnvironment = (value: string): value is KsefEnvironment => {
  return KSEF_ENVIRONMENTS.includes(value as KsefEnvironment);
};

const readHeaderValue = (headerValue: string | string[] | undefined): string | null => {
  if (headerValue === undefined) {
    return null;
  }

  return Array.isArray(headerValue) ? headerValue[0] ?? null : headerValue;
};

export const readRequestedKsefEnvironment = (request: FastifyRequest): KsefEnvironment | null => {
  if (request.ksefEnvironment) {
    return request.ksefEnvironment;
  }

  const headerValue = readHeaderValue(request.headers[KSEF_ENVIRONMENT_HEADER]);

  if (headerValue === null) {
    return null;
  }

  if (!isKsefEnvironment(headerValue)) {
    throw request.server.httpErrors.badRequest(
      `Invalid ${KSEF_ENVIRONMENT_HEADER} header. Expected TEST or PRODUCTION.`
    );
  }

  request.ksefEnvironment = headerValue;
  return headerValue;
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
