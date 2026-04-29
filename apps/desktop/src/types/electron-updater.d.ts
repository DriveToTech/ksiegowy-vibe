declare module 'electron-updater' {
  import { EventEmitter } from 'node:events';

  export interface UpdateInfo {
    version: string;
    releaseDate: string;
    releaseName?: string;
    releaseNotes?: string;
    files: unknown[];
    path?: string;
    sha512?: string;
    stagingPercentage?: number;
  }

  export interface UpdateCheckResult {
    updateInfo: UpdateInfo;
    versionInfo: UpdateInfo;
    fileInfo?: unknown;
    downloadPromise?: Promise<unknown> | null;
    cancellationToken?: unknown;
  }

  export class AppUpdater extends EventEmitter {
    autoDownload: boolean;
    autoInstallOnAppQuit: boolean;
    fullChangelog: boolean;
    allowDowngrade: boolean;
    disableWebInstaller: boolean;
    forceDevUpdateConfig: boolean;

    checkForUpdates(): Promise<UpdateCheckResult | null>;
    checkForUpdatesAndNotify(): Promise<UpdateCheckResult | null>;
    downloadUpdate(cancellationToken?: unknown): Promise<unknown[]>;
    quitAndInstall(isSilent?: boolean, isForceRunAfter?: boolean): void;

    on(event: 'checking-for-update', listener: () => void): this;
    on(event: 'update-available', listener: (info: UpdateInfo) => void): this;
    on(event: 'update-not-available', listener: (info: UpdateInfo) => void): this;
    on(event: 'download-progress', listener: (progress: unknown) => void): this;
    on(event: 'update-downloaded', listener: (event: unknown, info: UpdateInfo) => void): this;
    on(event: 'error', listener: (error: Error) => void): this;

    once(event: 'checking-for-update', listener: () => void): this;
    once(event: 'update-available', listener: (info: UpdateInfo) => void): this;
    once(event: 'update-not-available', listener: (info: UpdateInfo) => void): this;
    once(event: 'download-progress', listener: (progress: unknown) => void): this;
    once(event: 'update-downloaded', listener: (event: unknown, info: UpdateInfo) => void): this;
    once(event: 'error', listener: (error: Error) => void): this;
  }

  export const autoUpdater: AppUpdater;
}
