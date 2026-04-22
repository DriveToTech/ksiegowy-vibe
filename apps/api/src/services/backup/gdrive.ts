import { google, type Auth } from 'googleapis';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createReadStream } from 'node:fs';
import type { PrismaClient } from '@prisma/client';
import { encrypt, decrypt } from '@ksiegowy/shared-utils';
import type { BackupProvider, BackupResult } from './provider.js';

const DRIVE_SCOPES = ['https://www.googleapis.com/auth/drive.file'];

export interface DriveTokens {
  access_token: string;
  refresh_token: string;
  expiry_date: number;
}

export const buildPendingCompanyFileRecordFilter = (
  companyId: string,
  lastBackupAt: Date | null,
  snapshotCutoff: Date
) => {
  return {
    companyId,
    createdAt: {
      ...(lastBackupAt
        ? {
            gt: lastBackupAt,
          }
        : {}),
      lte: snapshotCutoff,
    },
  };
};

export const resolveFilePathForBackup = (
  recordPath: string,
  recordRelativePath: string,
  storageBasePath: string
): string[] => {
  const resolvedPaths: string[] = [];
  const normalizedRelativePath = path.normalize(recordRelativePath).replace(/^[/\\]+/, '');

  if (
    normalizedRelativePath.length > 0 &&
    !path.isAbsolute(normalizedRelativePath) &&
    !normalizedRelativePath.startsWith('..') &&
    !normalizedRelativePath.includes(`${path.sep}..${path.sep}`) &&
    !normalizedRelativePath.endsWith(`${path.sep}..`)
  ) {
    resolvedPaths.push(path.resolve(storageBasePath, normalizedRelativePath));
  }

  const persistedAbsolutePath = path.resolve(recordPath);
  if (!resolvedPaths.includes(persistedAbsolutePath)) {
    resolvedPaths.push(persistedAbsolutePath);
  }

  return resolvedPaths;
};

const normalizeRelativePathWithinCompany = (companyId: string, relativePath: string): string => {
  if (relativePath.startsWith(`${companyId}/`)) {
    return relativePath.slice(companyId.length + 1);
  }

  return relativePath;
};

const getDriveFolderPathForFileRecord = (companyId: string, relativePath: string): string[] => {
  const relativePathWithinCompany = normalizeRelativePathWithinCompany(companyId, relativePath);
  const directoryPath = path.dirname(relativePathWithinCompany);

  if (!directoryPath || directoryPath === '.') {
    return [];
  }

  return directoryPath.split('/').filter((segment) => segment.length > 0);
};

const getDriveFileNameForFileRecord = (companyId: string, relativePath: string, fallbackPath: string): string => {
  const relativePathWithinCompany = normalizeRelativePathWithinCompany(companyId, relativePath);
  const fileName = path.basename(relativePathWithinCompany);

  if (fileName && fileName !== '.') {
    return fileName;
  }

  return path.basename(fallbackPath);
};

interface DriveFolderResolver {
  getFolderIdForPathSegments: (pathSegments: string[]) => Promise<string>;
}

const createDriveFolderResolver = (
  drive: ReturnType<typeof google.drive>,
  companyRootFolderId: string
): DriveFolderResolver => {
  const folderIdByPath = new Map<string, string>();
  folderIdByPath.set('', companyRootFolderId);

  return {
    async getFolderIdForPathSegments(pathSegments: string[]): Promise<string> {
      let currentPathKey = '';
      let currentParentFolderId = companyRootFolderId;

      for (const pathSegment of pathSegments) {
        const nextPathKey = currentPathKey ? `${currentPathKey}/${pathSegment}` : pathSegment;
        const cachedFolderId = folderIdByPath.get(nextPathKey);

        if (cachedFolderId) {
          currentParentFolderId = cachedFolderId;
          currentPathKey = nextPathKey;
          continue;
        }

        const childFolderId = await ensureDriveFolder(drive, pathSegment, currentParentFolderId);
        folderIdByPath.set(nextPathKey, childFolderId);
        currentParentFolderId = childFolderId;
        currentPathKey = nextPathKey;
      }

      return currentParentFolderId;
    },
  };
};

// ── OAuth helpers ────────────────────────────────────────────────────────────

export function buildOAuthClient(): Auth.OAuth2Client {
  const clientId = process.env['GDRIVE_CLIENT_ID'];
  const clientSecret = process.env['GDRIVE_CLIENT_SECRET'];
  const redirectUri = process.env['GDRIVE_REDIRECT_URI'];

  if (!clientId || !clientSecret || !redirectUri) {
    throw new Error('Google Drive credentials not configured (GDRIVE_CLIENT_ID, GDRIVE_CLIENT_SECRET, GDRIVE_REDIRECT_URI)');
  }

  return new google.auth.OAuth2(clientId, clientSecret, redirectUri);
}

export function getAuthUrl(state: string): string {
  const oauth2Client = buildOAuthClient();
  return oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: DRIVE_SCOPES,
    state,
    prompt: 'consent',
  });
}

export async function exchangeCodeAndStore(
  prisma: PrismaClient,
  companyId: string,
  code: string,
  encryptionKey: string
): Promise<void> {
  const oauth2Client = buildOAuthClient();
  const { tokens } = await oauth2Client.getToken(code);

  if (!tokens.access_token || !tokens.refresh_token) {
    throw new Error('Google did not return required tokens');
  }

  const credentials: DriveTokens = {
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token,
    expiry_date: tokens.expiry_date ?? Date.now() + 3600_000,
  };

  const { enc, iv } = encrypt(JSON.stringify(credentials), encryptionKey);

  await prisma.googleDriveCredential.upsert({
    where: { companyId },
    create: {
      companyId,
      credentialsEnc: enc,
      credentialsIv: iv,
      expiresAt: new Date(credentials.expiry_date),
    },
    update: {
      credentialsEnc: enc,
      credentialsIv: iv,
      expiresAt: new Date(credentials.expiry_date),
    },
  });
}

// ── Backup provider ──────────────────────────────────────────────────────────

export class GDriveBackupProvider implements BackupProvider {
  readonly name = 'gdrive';

  constructor(private readonly encryptionKey: string) {}

  isEnabled(): boolean {
    return !!(
      process.env['GDRIVE_CLIENT_ID'] &&
      process.env['GDRIVE_CLIENT_SECRET'] &&
      process.env['GDRIVE_REDIRECT_URI'] &&
      this.encryptionKey
    );
  }

  async run(prisma: PrismaClient, storageBasePath: string, companyId?: string): Promise<BackupResult> {
    const where = companyId
      ? { companyId }
      : {};

    const credentials = await prisma.googleDriveCredential.findMany({ where });

    if (credentials.length === 0) {
      return { provider: 'gdrive', filesCount: 0, bytesTotal: 0, error: 'No Google Drive credentials found' };
    }

    let totalFiles = 0;
    let totalBytes = 0;

    for (const cred of credentials) {
      const result = await this.backupCompany(
        prisma,
        cred.companyId,
        cred.credentialsEnc,
        cred.credentialsIv,
        cred.lastBackupAt,
        storageBasePath
      );
      totalFiles += result.filesCount;
      totalBytes += result.bytesTotal;
    }

    return { provider: 'gdrive', filesCount: totalFiles, bytesTotal: totalBytes };
  }

  private async backupCompany(
    prisma: PrismaClient,
    companyId: string,
    credentialsEnc: string,
    credentialsIv: string,
    lastBackupAt: Date | null,
    storageBasePath: string
  ): Promise<{ filesCount: number; bytesTotal: number }> {
    const snapshotCutoff = new Date();
    const json = decrypt(credentialsEnc, credentialsIv, this.encryptionKey);
    const tokens = JSON.parse(json) as DriveTokens;

    const oauth2Client = buildOAuthClient();
    oauth2Client.setCredentials({
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      expiry_date: tokens.expiry_date,
    });

    // Auto-refresh the token if expired
    const { credentials: refreshed } = await oauth2Client.refreshAccessToken();
    if (refreshed.access_token && refreshed.expiry_date) {
      const updated: DriveTokens = {
        access_token: refreshed.access_token,
        refresh_token: refreshed.refresh_token ?? tokens.refresh_token,
        expiry_date: refreshed.expiry_date,
      };
      const { enc: encData, iv: encIv } = encrypt(JSON.stringify(updated), this.encryptionKey);
      await prisma.googleDriveCredential.update({
        where: { companyId },
        data: {
          credentialsEnc: encData,
          credentialsIv: encIv,
          expiresAt: new Date(updated.expiry_date),
        },
      });
      oauth2Client.setCredentials(refreshed);
    }

    const drive = google.drive({ version: 'v3', auth: oauth2Client });
    // Find or create root and company folder
    const rootFolderId = await ensureDriveFolder(drive, 'ksiegowy-backup');
    const companyFolderId = await ensureDriveFolder(drive, `company-${companyId}`, rootFolderId);
    const folderResolver = createDriveFolderResolver(drive, companyFolderId);

    // Get files created after last successful Google Drive backup for this company.
    // This intentionally does not use FileRecord.backedUpAt so company-scoped Google Drive
    // backups are not blocked by platform-level iCloud backup updates.
    const pending = await prisma.fileRecord.findMany({
      where: buildPendingCompanyFileRecordFilter(companyId, lastBackupAt, snapshotCutoff),
      orderBy: { createdAt: 'asc' },
    });

    const filesToUpload: Array<{
      id: string;
      companyId: string;
      relativePath: string;
      absolutePath: string;
      mimeType: string;
      fileSizeBytes: number;
    }> = [];
    const inaccessibleFileRecordIds: string[] = [];

    for (const pendingRecord of pending) {
      const candidatePaths = resolveFilePathForBackup(pendingRecord.path, pendingRecord.relativePath, storageBasePath);
      let selectedPath = '';
      let selectedFileStat: Awaited<ReturnType<typeof fs.stat>> | null = null;

      for (const candidatePath of candidatePaths) {
        const fileStat = await fs.stat(candidatePath).catch(() => null);
        if (fileStat) {
          selectedPath = candidatePath;
          selectedFileStat = fileStat;
          break;
        }
      }

      if (!selectedPath || !selectedFileStat) {
        inaccessibleFileRecordIds.push(pendingRecord.id);
        continue;
      }

      filesToUpload.push({
        id: pendingRecord.id,
        companyId: pendingRecord.companyId,
        relativePath: pendingRecord.relativePath,
        absolutePath: selectedPath,
        mimeType: pendingRecord.mimeType,
        fileSizeBytes: selectedFileStat.size,
      });
    }

    if (inaccessibleFileRecordIds.length > 0) {
      throw new Error(
        `Scheduled Google Drive backup skipped due to inaccessible files for company ${companyId}. ` +
          `Not advancing lastBackupAt. inaccessibleCount=${inaccessibleFileRecordIds.length}`
      );
    }

    let filesCount = 0;
    let bytesTotal = 0;

    for (const fileToUpload of filesToUpload) {
      const folderPathSegments = getDriveFolderPathForFileRecord(companyId, fileToUpload.relativePath);
      const targetFolderId = await folderResolver.getFolderIdForPathSegments(folderPathSegments);
      const targetFileName = getDriveFileNameForFileRecord(companyId, fileToUpload.relativePath, fileToUpload.absolutePath);

      await drive.files.create({
        requestBody: {
          name: targetFileName,
          parents: [targetFolderId],
        },
        media: {
          mimeType: fileToUpload.mimeType,
          body: createReadStream(fileToUpload.absolutePath),
        },
      });

      await prisma.fileRecord.update({
        where: { id: fileToUpload.id },
        data: { backedUpAt: new Date() },
      });

      filesCount++;
      bytesTotal += fileToUpload.fileSizeBytes;
    }

    await prisma.googleDriveCredential.update({
      where: { companyId },
      data: { lastBackupAt: snapshotCutoff },
    });

    return { filesCount, bytesTotal };
  }
}

async function ensureDriveFolder(
  drive: ReturnType<typeof google.drive>,
  name: string,
  parentFolderId?: string
): Promise<string> {
  const escapedName = name.replace(/'/g, "\\'");
  const parentFolderFilter = parentFolderId ? ` and '${parentFolderId}' in parents` : '';

  const existing = await drive.files.list({
    q: `name='${escapedName}' and mimeType='application/vnd.google-apps.folder' and trashed=false${parentFolderFilter}`,
    fields: 'files(id)',
  });

  if (existing.data.files && existing.data.files.length > 0) {
    return existing.data.files[0]!.id!;
  }

  const folder = await drive.files.create({
    requestBody: {
      name,
      mimeType: 'application/vnd.google-apps.folder',
      ...(parentFolderId
        ? {
            parents: [parentFolderId],
          }
        : {}),
    },
    fields: 'id',
  });

  return folder.data.id!;
}
