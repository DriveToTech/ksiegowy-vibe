import type { FastifyPluginAsync } from 'fastify';
import { createHmac, randomBytes } from 'node:crypto';
import type { AccessTokenPayload } from '../../lib/auth-config.js';
import {
  getAuthUrl,
  exchangeCodeAndStore,
  GDriveBackupProvider,
} from '../../services/backup/gdrive.js';
import { ICloudBackupProvider } from '../../services/backup/icloud.js';

interface CompanyIdQuery { companyId: string }
interface CallbackQuery { code: string; state: string }

const backupOAuthStateCookieName = 'backup_gdrive_oauth_state';
const backupOAuthStateMaxAgeSeconds = 10 * 60;

interface BackupOAuthStatePayload {
  companyId: string;
  nonce: string;
  issuedAt: number;
}

const signBackupOAuthStatePayload = (serializedPayload: string, secret: string): string => {
  return createHmac('sha256', secret).update(serializedPayload).digest('hex');
};

const createBackupOAuthState = (companyId: string, secret: string): string => {
  const payload: BackupOAuthStatePayload = {
    companyId,
    nonce: randomBytes(12).toString('hex'),
    issuedAt: Date.now(),
  };

  const serializedPayload = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  const signature = signBackupOAuthStatePayload(serializedPayload, secret);

  return `${serializedPayload}.${signature}`;
};

const verifyAndParseBackupOAuthState = (state: string, secret: string): BackupOAuthStatePayload => {
  const [serializedPayload, signature] = state.split('.');
  if (!serializedPayload || !signature) {
    throw new Error('Invalid OAuth state format');
  }

  const expectedSignature = signBackupOAuthStatePayload(serializedPayload, secret);
  if (signature !== expectedSignature) {
    throw new Error('Invalid OAuth state signature');
  }

  const parsedPayload = JSON.parse(Buffer.from(serializedPayload, 'base64url').toString('utf8')) as BackupOAuthStatePayload;
  if (!parsedPayload.companyId || !parsedPayload.nonce || !parsedPayload.issuedAt) {
    throw new Error('Invalid OAuth state payload');
  }

  const stateAgeMilliseconds = Date.now() - parsedPayload.issuedAt;
  if (stateAgeMilliseconds < 0 || stateAgeMilliseconds > backupOAuthStateMaxAgeSeconds * 1000) {
    throw new Error('OAuth state expired');
  }

  return parsedPayload;
};

const getBackupOAuthCookiePath = (): string => {
  const redirectUri = process.env['GDRIVE_REDIRECT_URI'] ?? 'http://localhost:3001/backup/gdrive/callback';
  return new URL(redirectUri).pathname || '/';
};

const assertAdmin = (
  user: AccessTokenPayload,
  companyId: string,
  fastify: { httpErrors: { forbidden: (msg: string) => Error } }
) => {
  const membership = user.companies.find((c) => c.id === companyId);
  if (!membership) throw fastify.httpErrors.forbidden('Access denied');
  if (membership.role !== 'ADMIN') throw fastify.httpErrors.forbidden('Only ADMIN can manage backups');
};

export const backupRoutes: FastifyPluginAsync = async (fastify): Promise<void> => {
  const storageBase = process.env['STORAGE_BASE_PATH'] ?? './storage';

  /**
   * GET /backup/gdrive/connect?companyId=xxx
   * Redirects to Google OAuth consent page for Drive access.
   */
  fastify.get<{ Querystring: CompanyIdQuery }>(
    '/backup/gdrive/connect',
    { onRequest: [fastify.authenticate] },
    async (request, reply) => {
      const user = request.user as AccessTokenPayload;
      const { companyId } = request.query;
      if (!companyId) throw fastify.httpErrors.badRequest('companyId query param required');

      assertAdmin(user, companyId, fastify);

      const oauthState = createBackupOAuthState(companyId, fastify.authConfig.jwt.accessSecret);

      let authUrl: string;
      try {
        authUrl = getAuthUrl(oauthState);
      } catch (err: unknown) {
        throw fastify.httpErrors.internalServerError(err instanceof Error ? err.message : String(err));
      }

      reply.setCookie(backupOAuthStateCookieName, oauthState, {
        path: getBackupOAuthCookiePath(),
        httpOnly: true,
        sameSite: fastify.authConfig.cookies.sameSite,
        secure: fastify.authConfig.cookies.secure,
        maxAge: backupOAuthStateMaxAgeSeconds,
      });

      return reply.redirect(authUrl);
    }
  );

  /**
   * GET /backup/gdrive/callback?code=xxx&state=companyId
   * Exchanges OAuth code for tokens and stores them encrypted.
   */
  fastify.get<{ Querystring: CallbackQuery }>(
    '/backup/gdrive/callback',
    { onRequest: [fastify.authenticate] },
    async (request, reply) => {
      const user = request.user as AccessTokenPayload;
      const { code, state } = request.query;
      if (!code || !state) throw fastify.httpErrors.badRequest('Missing code or state');

      const cookieState = request.cookies[backupOAuthStateCookieName];
      reply.clearCookie(backupOAuthStateCookieName, {
        path: getBackupOAuthCookiePath(),
        httpOnly: true,
        sameSite: fastify.authConfig.cookies.sameSite,
        secure: fastify.authConfig.cookies.secure,
      });

      if (!cookieState || cookieState !== state) {
        throw fastify.httpErrors.forbidden('OAuth state mismatch');
      }

      const parsedState = verifyAndParseBackupOAuthState(state, fastify.authConfig.jwt.accessSecret);
      const companyId = parsedState.companyId;

      assertAdmin(user, companyId, fastify);

      const encryptionKey = process.env['ENCRYPTION_KEY'];
      if (!encryptionKey) throw fastify.httpErrors.internalServerError('ENCRYPTION_KEY not configured');

      try {
        await exchangeCodeAndStore(fastify.prisma, companyId, code, encryptionKey);
      } catch (err: unknown) {
        throw fastify.httpErrors.badGateway(err instanceof Error ? err.message : String(err));
      }

      fastify.log.info({ companyId }, 'Google Drive connected');

      // Redirect back to settings page
      const appUrl = process.env['APP_URL'] ?? 'http://localhost:3000';
      return reply.redirect(`${appUrl}/dashboard/settings?gdrive=connected`);
    }
  );

  /**
   * POST /backup/gdrive/run
   * Triggers an incremental Google Drive backup for a company. Returns 202.
   * Streams progress via SSE in the same connection.
   */
  fastify.post<{ Body: { companyId: string } }>(
    '/backup/gdrive/run',
    {
      onRequest: [fastify.authenticate],
      schema: {
        body: {
          type: 'object',
          required: ['companyId'],
          properties: { companyId: { type: 'string' } },
        },
      },
    },
    async (request, reply) => {
      const user = request.user as AccessTokenPayload;
      const { companyId } = request.body;

      assertAdmin(user, companyId, fastify);

      const encryptionKey = process.env['ENCRYPTION_KEY'];
      if (!encryptionKey) throw fastify.httpErrors.internalServerError('ENCRYPTION_KEY not configured');

      const provider = new GDriveBackupProvider(encryptionKey);
      const startedAt = new Date();

      const result = await provider.run(fastify.prisma, storageBase, companyId).catch((err: unknown) => ({
        provider: 'gdrive',
        filesCount: 0,
        bytesTotal: 0,
        error: err instanceof Error ? err.message : String(err),
      }));

      await fastify.prisma.backupRun.create({
        data: {
          provider: 'gdrive',
          companyId,
          triggerSource: 'manual_admin',
          status: result.error ? 'error' : 'success',
          filesCount: result.filesCount,
          bytesTotal: result.bytesTotal,
          errorMessage: result.error ?? null,
          startedAt,
          finishedAt: new Date(),
        },
      });

      if (result.error) {
        fastify.log.error({ companyId, err: result.error }, 'Google Drive backup failed');
        throw fastify.httpErrors.badGateway(`Backup failed: ${result.error}`);
      }

      fastify.log.info({ companyId, filesCount: result.filesCount }, 'Google Drive backup completed');
      return reply.code(200).send({ filesCount: result.filesCount, bytesTotal: result.bytesTotal });
    }
  );

  /**
   * POST /backup/icloud/run
   * Triggers an iCloud backup (copies/syncs entire storage folder).
   */
  fastify.post(
    '/backup/icloud/run',
    { onRequest: [fastify.authenticate] },
    async (_request, reply) => {
      const provider = new ICloudBackupProvider();
      if (!provider.isEnabled()) {
        throw fastify.httpErrors.badRequest('iCloud backup is not configured (set ICLOUD_BACKUP_PATH or ICLOUD_RCLONE_REMOTE)');
      }

      const startedAt = new Date();

      const result = await provider.run(fastify.prisma, storageBase).catch((err: unknown) => ({
        provider: 'icloud',
        filesCount: 0,
        bytesTotal: 0,
        error: err instanceof Error ? err.message : String(err),
      }));

      await fastify.prisma.backupRun.create({
        data: {
          provider: 'icloud',
          triggerSource: 'manual_platform',
          status: result.error ? 'error' : 'success',
          filesCount: result.filesCount,
          bytesTotal: result.bytesTotal,
          errorMessage: result.error ?? null,
          startedAt,
          finishedAt: new Date(),
        },
      });

      if (result.error) {
        fastify.log.error({ err: result.error }, 'iCloud backup failed');
        throw fastify.httpErrors.badGateway(`Backup failed: ${result.error}`);
      }

      return reply.code(200).send({ filesCount: result.filesCount, bytesTotal: result.bytesTotal });
    }
  );

  /**
   * GET /backup/status
   * Returns the last backup run result per provider.
   */
  fastify.get(
    '/backup/status',
    { onRequest: [fastify.authenticate] },
    async () => {
      const providers = ['gdrive', 'icloud'];
      const results = await Promise.all(
        providers.map((provider) =>
          fastify.prisma.backupRun.findFirst({
            where: { provider },
            orderBy: { createdAt: 'desc' },
            select: { provider: true, status: true, filesCount: true, bytesTotal: true, errorMessage: true, startedAt: true, finishedAt: true },
          })
        )
      );

      return {
        gdrive: results[0] ? {
          ...results[0],
          startedAt: results[0].startedAt.toISOString(),
          finishedAt: results[0].finishedAt ? results[0].finishedAt.toISOString() : null,
        } : null,
        icloud: results[1] ? {
          ...results[1],
          startedAt: results[1].startedAt.toISOString(),
          finishedAt: results[1].finishedAt ? results[1].finishedAt.toISOString() : null,
        } : null,
      };
    }
  );
};
