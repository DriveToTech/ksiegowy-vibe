#!/usr/bin/env bash

set -euo pipefail

backup_remote_name="${DB_BACKUP_REMOTE_PRIMARY_NAME:?DB_BACKUP_REMOTE_PRIMARY_NAME is required}"
backup_destination_root="${BACKUP_DESTINATION_ROOT:-ksiegowy-vibe-backups}"
backup_environment_name="${DB_BACKUP_ENVIRONMENT_NAME:-production}"
rclone_config_path="${DB_BACKUP_RCLONE_CONFIG_PATH:-/tmp/rclone-runtime/rclone.conf}"
rclone_source_config_path="${DB_BACKUP_RCLONE_SOURCE_CONFIG_PATH:-/tmp/rclone-source/rclone.conf}"
backup_output_directory="/backup-output"

echo "[download-postgres-backup] Fetching latest PostgreSQL backup for environment '${backup_environment_name}' from remote '${backup_remote_name}'."

if [[ ! -f "${rclone_source_config_path}" ]]; then
  echo "[download-postgres-backup] Rclone source config file not found at ${rclone_source_config_path}. Update DB_BACKUP_RCLONE_CONFIG_PATH to a valid host-mounted file."
  exit 1
fi

mkdir -p "$(dirname "${rclone_config_path}")"

if [[ ! -s "${rclone_config_path}" ]]; then
  cp "${rclone_source_config_path}" "${rclone_config_path}"
  chmod 600 "${rclone_config_path}"
  echo "[download-postgres-backup] Seeded writable runtime rclone config at ${rclone_config_path}."
fi

remote_env_path="${backup_remote_name}:${backup_destination_root}/postgresql/${backup_environment_name}"

latest_timestamp=$(rclone lsf "${remote_env_path}/" --dirs-only --config "${rclone_config_path}" 2>/dev/null | sort | tail -1 | tr -d '/')

if [[ -z "${latest_timestamp}" ]]; then
  echo "[download-postgres-backup] No backups found on remote for environment '${backup_environment_name}'."
  exit 1
fi

backup_file_name="postgresql-${backup_environment_name}-${latest_timestamp}.sql.gz"
checksum_file_name="${backup_file_name}.sha256"
manifest_file_name="postgresql-${backup_environment_name}-${latest_timestamp}.manifest.json"

echo "[download-postgres-backup] Downloading ${latest_timestamp} from ${backup_remote_name}..."

rclone copy "${remote_env_path}/${latest_timestamp}/" "${backup_output_directory}/" --config "${rclone_config_path}"

if [[ ! -f "${backup_output_directory}/${backup_file_name}" ]]; then
  echo "[download-postgres-backup] Missing artifact after download: ${backup_file_name}"
  exit 1
fi

if [[ ! -f "${backup_output_directory}/${checksum_file_name}" ]]; then
  echo "[download-postgres-backup] Missing artifact after download: ${checksum_file_name}"
  exit 1
fi

if [[ ! -f "${backup_output_directory}/${manifest_file_name}" ]]; then
  echo "[download-postgres-backup] Missing artifact after download: ${manifest_file_name}"
  exit 1
fi

if ! (cd "${backup_output_directory}" && sha256sum --check "${checksum_file_name}" --status); then
  echo "[download-postgres-backup] Integrity check FAILED for ${backup_file_name}."
  exit 1
fi

backup_size_bytes="$(wc -c < "${backup_output_directory}/${backup_file_name}" | tr -d ' ')"
echo "[download-postgres-backup] Downloaded successfully: ${backup_file_name} (${backup_size_bytes} bytes)."
echo "[download-postgres-backup] Inspect the files, then run: DB_RESTORE_CONFIRMED=yes pnpm restore:postgres"
