import type { FastifyPluginAsync } from 'fastify';
import type { CompanyBackupScheduleMode } from '@prisma/client';
import type { AccessTokenPayload } from '../../lib/auth-config.js';
import {
  getCompanyGoogleDriveBackupSettings,
  runCompanyGoogleDriveBackup,
  updateCompanyGoogleDriveBackupPolicy,
} from '../../services/backup/company-backup-policy.js';

interface CompanyIdParams {
  companyId: string;
}

interface UpdateCompanyBackupPolicyBody {
  automaticOnInvoiceIssued?: boolean;
  scheduleMode?: CompanyBackupScheduleMode;
  scheduleHour?: number | null;
  scheduleMinute?: number | null;
  scheduleDayOfWeek?: number | null;
  scheduleTimezone?: string;
}

const companyIdParamsSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    companyId: { type: 'string', minLength: 1 },
  },
  required: ['companyId'],
} as const;

const backupPolicySchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    provider: { type: 'string', enum: ['GOOGLE_DRIVE'] },
    automaticOnInvoiceIssued: { type: 'boolean' },
    scheduleMode: { type: 'string', enum: ['MANUAL', 'DAILY', 'WEEKLY'] },
    scheduleHour: { type: ['integer', 'null'], minimum: 0, maximum: 23 },
    scheduleMinute: { type: ['integer', 'null'], minimum: 0, maximum: 59 },
    scheduleDayOfWeek: { type: ['integer', 'null'], minimum: 1, maximum: 7 },
    scheduleTimezone: { type: 'string' },
    updatedAt: { type: 'string', format: 'date-time' },
  },
  required: [
    'provider',
    'automaticOnInvoiceIssued',
    'scheduleMode',
    'scheduleHour',
    'scheduleMinute',
    'scheduleDayOfWeek',
    'scheduleTimezone',
    'updatedAt',
  ],
} as const;

const platformPostgresqlBackupFreshnessSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    status: { type: 'string', enum: ['FRESH', 'STALE', 'MISSING', 'INCOMPLETE'] },
    latestArtifactTimestamp: { type: ['string', 'null'] },
    latestArtifactCreatedAt: { type: ['string', 'null'], format: 'date-time' },
    latestArtifactAgeHours: { type: ['integer', 'null'] },
    maxAllowedAgeHours: { type: 'integer' },
    checkedAt: { type: 'string', format: 'date-time' },
  },
  required: [
    'status',
    'latestArtifactTimestamp',
    'latestArtifactCreatedAt',
    'latestArtifactAgeHours',
    'maxAllowedAgeHours',
    'checkedAt',
  ],
} as const;

const companyBackupSettingsSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    companyId: { type: 'string' },
    provider: { type: 'string', enum: ['GOOGLE_DRIVE'] },
    googleDrive: {
      type: 'object',
      additionalProperties: false,
      properties: {
        isConnected: { type: 'boolean' },
        expiresAt: { type: ['string', 'null'], format: 'date-time' },
        lastBackupAt: { type: ['string', 'null'], format: 'date-time' },
      },
      required: ['isConnected', 'expiresAt', 'lastBackupAt'],
    },
    policy: backupPolicySchema,
    platformPostgresqlBackupFreshness: platformPostgresqlBackupFreshnessSchema,
  },
  required: ['companyId', 'provider', 'googleDrive', 'policy', 'platformPostgresqlBackupFreshness'],
} as const;

const updateCompanyBackupPolicyBodySchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    automaticOnInvoiceIssued: { type: 'boolean' },
    scheduleMode: { type: 'string', enum: ['MANUAL', 'DAILY', 'WEEKLY'] },
    scheduleHour: { type: ['integer', 'null'], minimum: 0, maximum: 23 },
    scheduleMinute: { type: ['integer', 'null'], minimum: 0, maximum: 59 },
    scheduleDayOfWeek: { type: ['integer', 'null'], minimum: 1, maximum: 7 },
    scheduleTimezone: { type: 'string', minLength: 1 },
  },
} as const;

const companyBackupRunResponseSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    backupRunId: { type: 'string' },
    filesCount: { type: 'integer' },
    bytesTotal: { type: 'integer' },
    startedAt: { type: 'string', format: 'date-time' },
    finishedAt: { type: 'string', format: 'date-time' },
    triggerSource: { type: 'string' },
  },
  required: ['backupRunId', 'filesCount', 'bytesTotal', 'startedAt', 'finishedAt', 'triggerSource'],
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

export const companyBackupPolicyRoutes: FastifyPluginAsync = async (fastify): Promise<void> => {
  const storageBase = process.env['STORAGE_BASE_PATH'] ?? './storage';

  fastify.get<{ Params: CompanyIdParams }>(
    '/companies/:companyId/backup-policy',
    {
      onRequest: [fastify.authenticate],
      schema: {
        params: companyIdParamsSchema,
        response: {
          200: companyBackupSettingsSchema,
        },
      },
    },
    async (request) => {
      const user = request.user as AccessTokenPayload;
      const { companyId } = request.params;
      assertCompanyAdministrator(user, companyId, fastify);
      return getCompanyGoogleDriveBackupSettings(fastify.prisma, companyId);
    }
  );

  fastify.patch<{ Params: CompanyIdParams; Body: UpdateCompanyBackupPolicyBody }>(
    '/companies/:companyId/backup-policy',
    {
      onRequest: [fastify.authenticate],
      schema: {
        params: companyIdParamsSchema,
        body: updateCompanyBackupPolicyBodySchema,
        response: {
          200: companyBackupSettingsSchema,
        },
      },
    },
    async (request) => {
      const user = request.user as AccessTokenPayload;
      const { companyId } = request.params;
      assertCompanyAdministrator(user, companyId, fastify);

      return updateCompanyGoogleDriveBackupPolicy(fastify.prisma, companyId, request.body).catch((error: unknown) => {
        const errorMessage = error instanceof Error ? error.message : String(error);
        throw fastify.httpErrors.badRequest(errorMessage);
      });
    }
  );

  fastify.post<{ Params: CompanyIdParams }>(
    '/companies/:companyId/backup-policy/run',
    {
      onRequest: [fastify.authenticate],
      schema: {
        params: companyIdParamsSchema,
        response: {
          200: companyBackupRunResponseSchema,
        },
      },
    },
    async (request) => {
      const user = request.user as AccessTokenPayload;
      const { companyId } = request.params;
      assertCompanyAdministrator(user, companyId, fastify);

      return runCompanyGoogleDriveBackup(
        fastify.prisma,
        fastify.log,
        storageBase,
        companyId,
        'manual_admin'
      ).catch((error: unknown) => {
        const errorMessage = error instanceof Error ? error.message : String(error);
        if (errorMessage.includes('No Google Drive credentials found')) {
          throw fastify.httpErrors.badRequest('Google Drive is not connected for this company');
        }
        throw fastify.httpErrors.badGateway(errorMessage);
      });
    }
  );
};
