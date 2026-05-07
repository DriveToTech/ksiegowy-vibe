const DEFAULT_BACKUP_DESTINATION_ROOT = 'ksiegowy-vibe-backups';
const DEFAULT_BACKUP_ENVIRONMENT_NAME = 'local';

export const validateBackupDestinationPathSegment = (pathSegment: string, segmentLabel = 'Backup destination path segment'): string => {
  if (!pathSegment) {
    throw new Error(`${segmentLabel} cannot be empty`);
  }

  if (pathSegment === '.' || pathSegment === '..') {
    throw new Error(`${segmentLabel} cannot be "." or ".."`);
  }

  if (pathSegment.includes('/') || pathSegment.includes('\\')) {
    throw new Error(`${segmentLabel} cannot contain path separators`);
  }

  if (
    Array.from(pathSegment).some((character) => {
      const characterCode = character.charCodeAt(0);

      return characterCode >= 0 && characterCode <= 31;
    })
  ) {
    throw new Error(`${segmentLabel} cannot contain control characters`);
  }

  return pathSegment;
};

export const getBackupDestinationRootName = (): string => {
  return validateBackupDestinationPathSegment(
    process.env['BACKUP_DESTINATION_ROOT'] ?? DEFAULT_BACKUP_DESTINATION_ROOT,
    'BACKUP_DESTINATION_ROOT'
  );
};

export const getBackupDestinationEnvironmentName = (): string => {
  return validateBackupDestinationPathSegment(
    process.env['DB_BACKUP_ENVIRONMENT_NAME'] ?? DEFAULT_BACKUP_ENVIRONMENT_NAME,
    'DB_BACKUP_ENVIRONMENT_NAME'
  );
};

export const buildGoogleDriveCompanyBackupRootPathSegments = (companyId: string): string[] => {
  const validatedCompanyId = validateBackupDestinationPathSegment(companyId, 'Company identifier');

  if (!process.env['BACKUP_DESTINATION_ROOT']) {
    return [validatedCompanyId];
  }

  return [
    getBackupDestinationRootName(),
    'files',
    getBackupDestinationEnvironmentName(),
    validateBackupDestinationPathSegment(`company-${validatedCompanyId}`, 'Company backup folder name'),
  ];
};

export const buildPostgresqlBackupDestinationPathSegments = (): string[] => {
  return [
    getBackupDestinationRootName(),
    'postgresql',
    getBackupDestinationEnvironmentName(),
  ];
};
