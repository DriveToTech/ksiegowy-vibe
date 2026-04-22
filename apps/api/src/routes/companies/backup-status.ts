import type { FastifyPluginAsync } from 'fastify';
import type { AccessTokenPayload } from '../../lib/auth-config.js';
import { getCompanyBackupStatus } from '../../services/backup/company-backup-policy.js';

interface CompanyIdParams {
  companyId: string;
}

const companyIdParamsSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    companyId: { type: 'string', minLength: 1 },
  },
  required: ['companyId'],
} as const;

const backupStatusResponseSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    companyId: { type: 'string' },
    evaluatedAt: { type: 'string', format: 'date-time' },
    overallStatus: { type: 'string', enum: ['HEALTHY', 'DEGRADED', 'CRITICAL', 'UNKNOWN'] },
    platformPostgresql: {
      type: 'object',
      additionalProperties: false,
      properties: {
        status: { type: 'string', enum: ['FRESH', 'STALE', 'MISSING', 'INCOMPLETE', 'UNAVAILABLE'] },
        severity: { type: 'string', enum: ['INFO', 'WARNING', 'ERROR', 'UNKNOWN'] },
        isPlatformManaged: { type: 'boolean', const: true },
        summary: { type: 'string' },
        latestArtifactTimestamp: { type: ['string', 'null'] },
        latestArtifactCreatedAt: { type: ['string', 'null'], format: 'date-time' },
        latestArtifactAgeHours: { type: ['integer', 'null'] },
        maxAllowedAgeHours: { type: 'integer' },
        checkedAt: { type: 'string', format: 'date-time' },
        reasonCode: {
          type: 'string',
          enum: ['OK', 'ARTIFACT_TOO_OLD', 'ARTIFACT_NOT_FOUND', 'ARTIFACT_SET_INCOMPLETE', 'SOURCE_UNAVAILABLE'],
        },
      },
      required: [
        'status',
        'severity',
        'isPlatformManaged',
        'summary',
        'latestArtifactTimestamp',
        'latestArtifactCreatedAt',
        'latestArtifactAgeHours',
        'maxAllowedAgeHours',
        'checkedAt',
        'reasonCode',
      ],
    },
    companyGoogleDrive: {
      type: 'object',
      additionalProperties: false,
      properties: {
        connectionStatus: { type: 'string', enum: ['CONNECTED', 'DISCONNECTED'] },
        lastBackupAt: { type: ['string', 'null'], format: 'date-time' },
        isPolicyAutomationEnabled: { type: 'boolean' },
        summary: { type: 'string' },
      },
      required: ['connectionStatus', 'lastBackupAt', 'isPolicyAutomationEnabled', 'summary'],
    },
  },
  required: ['companyId', 'evaluatedAt', 'overallStatus', 'platformPostgresql', 'companyGoogleDrive'],
} as const;

const assertCompanyMembership = (
  user: AccessTokenPayload,
  companyId: string,
  fastify: { httpErrors: { forbidden: (message: string) => Error } }
) => {
  const membership = user.companies.find((company) => company.id === companyId);
  if (!membership) {
    throw fastify.httpErrors.forbidden('Access denied');
  }
  return membership;
};

const assertCompanyAdministrator = (
  user: AccessTokenPayload,
  companyId: string,
  fastify: { httpErrors: { forbidden: (message: string) => Error } }
) => {
  const membership = assertCompanyMembership(user, companyId, fastify);
  if (membership.role !== 'ADMIN') {
    throw fastify.httpErrors.forbidden('Only ADMIN can manage company backup settings');
  }
};

export const companyBackupStatusRoutes: FastifyPluginAsync = async (fastify): Promise<void> => {
  fastify.get<{ Params: CompanyIdParams }>(
    '/companies/:companyId/backup-status',
    {
      onRequest: [fastify.authenticate],
      schema: {
        params: companyIdParamsSchema,
        response: {
          200: backupStatusResponseSchema,
        },
      },
    },
    async (request) => {
      const user = request.user as AccessTokenPayload;
      const { companyId } = request.params;
      assertCompanyAdministrator(user, companyId, fastify);
      return getCompanyBackupStatus(fastify.prisma, companyId);
    }
  );
};
