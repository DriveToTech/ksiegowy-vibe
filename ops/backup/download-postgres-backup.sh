#!/usr/bin/env bash

set -euo pipefail

backup_remote_name="${DB_BACKUP_REMOTE_PRIMARY_NAME:?DB_BACKUP_REMOTE_PRIMARY_NAME is required}"
backup_destination_root="${BACKUP_DESTINATION_ROOT:-ksiegowy-vibe-backups}"
backup_environment_name="${DB_BACKUP_ENVIRONMENT_NAME:-production}"
backup_database_label="${DB_BACKUP_DATABASE_LABEL:-all}"
rclone_config_path="${DB_BACKUP_RCLONE_CONFIG_PATH:-/tmp/rclone-runtime/rclone.conf}"
rclone_source_config_path="${DB_BACKUP_RCLONE_SOURCE_CONFIG_PATH:-/tmp/rclone-source/rclone.conf}"
backup_output_directory="/backup-output"

case "${backup_database_label}" in
  all)
    backup_database_labels=(business household)
    ;;
  business|household)
    backup_database_labels=("${backup_database_label}")
    ;;
  *)
    echo "[download-postgres-backup] Invalid DB_BACKUP_DATABASE_LABEL '${backup_database_label}'. Use 'all', 'business', or 'household'."
    exit 1
    ;;
esac

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

remote_timestamp_list="$(rclone lsf "${remote_env_path}/" --dirs-only --config "${rclone_config_path}" 2>/dev/null)" || {
  echo "[download-postgres-backup] Failed to list backups on remote for environment '${backup_environment_name}'."
  exit 1
}

if [[ -z "${remote_timestamp_list}" ]]; then
  echo "[download-postgres-backup] No backups found on remote for environment '${backup_environment_name}'."
  exit 1
fi

mkdir -p "${backup_output_directory}"

backup_database_timestamps=()

for database_label in "${backup_database_labels[@]}"; do
  latest_timestamp=""

  while IFS= read -r remote_timestamp; do
    remote_timestamp="${remote_timestamp%/}"
    if [[ -z "${remote_timestamp}" ]]; then
      continue
    fi

    remote_file_list="$(rclone lsf "${remote_env_path}/${remote_timestamp}/" --files-only --config "${rclone_config_path}" 2>/dev/null)" || continue
    backup_file_name="postgresql-${database_label}-${backup_environment_name}-${remote_timestamp}.sql.gz"
    checksum_file_name="${backup_file_name}.sha256"
    manifest_file_name="postgresql-${database_label}-${backup_environment_name}-${remote_timestamp}.manifest.json"

    if printf '%s\n' "${remote_file_list}" | grep -Fxq "${backup_file_name}" \
      && printf '%s\n' "${remote_file_list}" | grep -Fxq "${checksum_file_name}" \
      && printf '%s\n' "${remote_file_list}" | grep -Fxq "${manifest_file_name}"; then
      latest_timestamp="${remote_timestamp}"
      break
    fi
  done < <(printf '%s\n' "${remote_timestamp_list}" | sort -r)

  if [[ -z "${latest_timestamp}" ]]; then
    echo "[download-postgres-backup] No complete '${database_label}' backup found on remote for environment '${backup_environment_name}'."
    exit 1
  fi

  backup_database_timestamps+=("${latest_timestamp}")
done

for database_index in "${!backup_database_labels[@]}"; do
  database_label="${backup_database_labels[$database_index]}"
  latest_timestamp="${backup_database_timestamps[$database_index]}"
  backup_file_name="postgresql-${database_label}-${backup_environment_name}-${latest_timestamp}.sql.gz"
  checksum_file_name="${backup_file_name}.sha256"
  manifest_file_name="postgresql-${database_label}-${backup_environment_name}-${latest_timestamp}.manifest.json"

  echo "[download-postgres-backup] Downloading ${database_label} backup from ${latest_timestamp} on ${backup_remote_name}..."

  for file_name in "${backup_file_name}" "${checksum_file_name}" "${manifest_file_name}"; do
    rclone copyto "${remote_env_path}/${latest_timestamp}/${file_name}" "${backup_output_directory}/${file_name}" --config "${rclone_config_path}"
  done

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

  if ! (cd "${backup_output_directory}" && sha256sum -cs "${checksum_file_name}"); then
    echo "[download-postgres-backup] Integrity check FAILED for ${backup_file_name}."
    exit 1
  fi

  backup_size_bytes="$(wc -c < "${backup_output_directory}/${backup_file_name}" | tr -d ' ')"
  echo "[download-postgres-backup] Downloaded successfully: ${backup_file_name} (${backup_size_bytes} bytes)."
done

echo "[download-postgres-backup] Inspect the files, then restore the selected database(s) with DB_RESTORE_DATABASE_LABEL."
