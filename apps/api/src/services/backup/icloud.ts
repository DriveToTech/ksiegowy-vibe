import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { promisify } from 'node:util';
import type { PrismaClient } from '@prisma/client';
import type { BackupProvider, BackupResult } from './provider.js';
import { expandStoragePath } from '../storage/local-fs.js';

const execFileAsync = promisify(execFile);

/**
 * iCloud backup provider.
 *
 * macOS: copies the storage folder into an iCloud Drive path (iCloud daemon auto-syncs).
 *   Set ICLOUD_BACKUP_PATH=~/Library/Mobile Documents/com~apple~CloudDocs/TrysoftBackups
 *
 * Linux/VPS: runs rclone sync (requires rclone installed and configured).
 *   Set ICLOUD_RCLONE_REMOTE=icloud and ICLOUD_RCLONE_DEST=TrysoftBackups
 */
export class ICloudBackupProvider implements BackupProvider {
  readonly name = 'icloud';

  isEnabled(): boolean {
    return !!(process.env['ICLOUD_BACKUP_PATH'] || process.env['ICLOUD_RCLONE_REMOTE']);
  }

  async run(prisma: PrismaClient, storageBase: string): Promise<BackupResult> {
    const icloudPath = process.env['ICLOUD_BACKUP_PATH'];
    const rcloneRemote = process.env['ICLOUD_RCLONE_REMOTE'];
    const rcloneDest = process.env['ICLOUD_RCLONE_DEST'] ?? 'ksiegowy-backup';

    const resolvedSource = expandStoragePath(storageBase);

    if (icloudPath) {
      return this.runMacOsSync(resolvedSource, icloudPath, prisma);
    }

    if (rcloneRemote) {
      return this.runRcloneSync(resolvedSource, rcloneRemote, rcloneDest, prisma);
    }

    throw new Error('iCloud backup is not configured (set ICLOUD_BACKUP_PATH or ICLOUD_RCLONE_REMOTE)');
  }

  private async runMacOsSync(source: string, dest: string, prisma: PrismaClient): Promise<BackupResult> {
    const resolvedDest = dest.replace(/^~/, os.homedir());
    await fs.mkdir(resolvedDest, { recursive: true });

    // rsync is more efficient than cpSync for incremental updates
    await execFileAsync('rsync', ['-a', '--delete', `${source}/`, `${resolvedDest}/`]);

    const stats = await countFiles(source);
    await markFilesBackedUp(prisma, source);

    return { provider: 'icloud', ...stats };
  }

  private async runRcloneSync(source: string, remote: string, dest: string, prisma: PrismaClient): Promise<BackupResult> {
    await execFileAsync('rclone', ['sync', source, `${remote}:${dest}`, '--progress']);

    const stats = await countFiles(source);
    await markFilesBackedUp(prisma, source);

    return { provider: 'icloud', ...stats };
  }
}

async function countFiles(dir: string): Promise<{ filesCount: number; bytesTotal: number }> {
  let filesCount = 0;
  let bytesTotal = 0;

  const walk = async (current: string): Promise<void> => {
    const entries = await fs.readdir(current, { withFileTypes: true }).catch(() => []);
    for (const entry of entries) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        await walk(full);
      } else {
        const stat = await fs.stat(full).catch(() => null);
        if (stat) {
          filesCount++;
          bytesTotal += stat.size;
        }
      }
    }
  };

  await walk(dir);
  return { filesCount, bytesTotal };
}

async function markFilesBackedUp(prisma: PrismaClient, storageBase: string): Promise<void> {
  await prisma.fileRecord.updateMany({
    where: { backedUpAt: null, path: { startsWith: storageBase } },
    data: { backedUpAt: new Date() },
  });
}
