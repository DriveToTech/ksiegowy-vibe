#!/usr/bin/env bash

set -euo pipefail
umask 077

backup_enabled="${DB_BACKUP_ENABLED:-false}"

if [[ "${backup_enabled}" != "true" ]]; then
  echo "[backup-postgres] PostgreSQL backup is disabled. Set DB_BACKUP_ENABLED=true to run."
  exit 0
fi

postgres_host="${POSTGRES_HOST:-postgres}"
postgres_port="${POSTGRES_PORT:-5432}"
postgres_user="${POSTGRES_USER:?POSTGRES_USER is required}"
business_postgres_database="${POSTGRES_DB:?POSTGRES_DB is required}"
household_postgres_database="${HOUSEHOLD_POSTGRES_DB:?HOUSEHOLD_POSTGRES_DB is required}"
backup_database_labels=(business household)
backup_database_names=("${business_postgres_database}" "${household_postgres_database}")
backup_environment_name="${DB_BACKUP_ENVIRONMENT_NAME:-local}"
backup_retention_days="${DB_BACKUP_RETENTION_DAYS:-14}"
backup_local_retention_days="${DB_BACKUP_LOCAL_RETENTION_DAYS:-14}"
postgres_ready_timeout_seconds="${DB_BACKUP_POSTGRES_READY_TIMEOUT_SECONDS:-120}"
legacy_backup_remote_base_path="${DB_BACKUP_REMOTE_BASE_PATH:-}"
backup_remote_primary_name="${DB_BACKUP_REMOTE_PRIMARY_NAME:-}"
backup_remote_secondary_name="${DB_BACKUP_REMOTE_SECONDARY_NAME:-}"
rclone_config_path="${DB_BACKUP_RCLONE_CONFIG_PATH:-/tmp/rclone-runtime/rclone.conf}"
rclone_source_config_path="${DB_BACKUP_RCLONE_SOURCE_CONFIG_PATH:-/tmp/rclone-source/rclone.conf}"
backup_output_directory="/backup-output"

validate_backup_destination_path_segment() {
  local path_segment="$1"
  local segment_label="$2"

  if [[ -z "${path_segment}" ]]; then
    echo "[backup-postgres] ${segment_label} cannot be empty."
    exit 1
  fi

  if [[ "${path_segment}" == "." || "${path_segment}" == ".." ]]; then
    echo "[backup-postgres] ${segment_label} cannot be \".\" or \"..\"."
    exit 1
  fi

  if [[ "${path_segment}" == *"/"* || "${path_segment}" == *\\* ]]; then
    echo "[backup-postgres] ${segment_label} cannot contain path separators."
    exit 1
  fi

  if [[ "${path_segment}" =~ [[:cntrl:]] ]]; then
    echo "[backup-postgres] ${segment_label} cannot contain control characters."
    exit 1
  fi
}

remote_upload_enabled="false"

if [[ -n "${backup_remote_primary_name}" || -n "${backup_remote_secondary_name}" ]]; then
  remote_upload_enabled="true"

  if [[ ! -f "${rclone_source_config_path}" ]]; then
    echo "[backup-postgres] Rclone source config file not found at ${rclone_source_config_path}. Update DB_BACKUP_RCLONE_CONFIG_PATH to a valid host-mounted file."
    exit 1
  fi

  mkdir -p "$(dirname "${rclone_config_path}")"

  if [[ ! -s "${rclone_config_path}" ]]; then
    cp "${rclone_source_config_path}" "${rclone_config_path}"
    chmod 600 "${rclone_config_path}"
    echo "[backup-postgres] Seeded writable runtime rclone config at ${rclone_config_path}."
  fi
fi

if [[ "${remote_upload_enabled}" == "true" ]]; then
  if ! [[ "${backup_retention_days}" =~ ^[0-9]+$ ]] || [[ "${backup_retention_days}" -lt 1 ]]; then
    echo "[backup-postgres] DB_BACKUP_RETENTION_DAYS must be a positive integer when remote upload is enabled."
    exit 1
  fi
fi

if ! [[ "${backup_local_retention_days}" =~ ^[0-9]+$ ]] || [[ "${backup_local_retention_days}" -lt 1 ]]; then
  echo "[backup-postgres] DB_BACKUP_LOCAL_RETENTION_DAYS must be a positive integer."
  exit 1
fi

if ! [[ "${postgres_ready_timeout_seconds}" =~ ^[0-9]+$ ]] || [[ "${postgres_ready_timeout_seconds}" -lt 1 ]]; then
  echo "[backup-postgres] DB_BACKUP_POSTGRES_READY_TIMEOUT_SECONDS must be a positive integer."
  exit 1
fi

timestamp_utc="$(date -u +%Y%m%dT%H%M%SZ)"

echo "[backup-postgres] Starting PostgreSQL logical backup for environment ${backup_environment_name}."

if [[ "${remote_upload_enabled}" == "true" ]]; then
  echo "[backup-postgres] Backup mode: remote upload enabled (primary='${backup_remote_primary_name:-none}', secondary='${backup_remote_secondary_name:-none}')."
else
  echo "[backup-postgres] Backup mode: local-only. Remote upload is skipped because no remotes are configured."
fi

mkdir -p "${backup_output_directory}"

readiness_deadline=$((SECONDS + postgres_ready_timeout_seconds))

until pg_isready --host="${postgres_host}" --port="${postgres_port}" --username="${postgres_user}" --dbname="${business_postgres_database}" >/dev/null 2>&1; do
  if [[ "${SECONDS}" -ge "${readiness_deadline}" ]]; then
    echo "[backup-postgres] PostgreSQL is not ready after ${postgres_ready_timeout_seconds}s."
    exit 1
  fi

  echo "[backup-postgres] Waiting for PostgreSQL readiness..."
  sleep 2
done

echo "[backup-postgres] PostgreSQL is ready."

# Two databases (business, household) are dumped separately, sharing one timestamp,
# so a restore can target either one independently — see run-postgres-restore.sh's
# DB_RESTORE_DATABASE_LABEL.
artifact_file_names=()

for database_index in "${!backup_database_labels[@]}"; do
  database_label="${backup_database_labels[$database_index]}"
  database_name="${backup_database_names[$database_index]}"

  backup_file_name="postgresql-${database_label}-${backup_environment_name}-${timestamp_utc}.sql.gz"
  checksum_file_name="${backup_file_name}.sha256"
  manifest_file_name="postgresql-${database_label}-${backup_environment_name}-${timestamp_utc}.manifest.json"

  backup_file_path="${backup_output_directory}/${backup_file_name}"
  checksum_file_path="${backup_output_directory}/${checksum_file_name}"
  manifest_file_path="${backup_output_directory}/${manifest_file_name}"

  echo "[backup-postgres] Dumping database '${database_name}' (${database_label})."

  pg_dump \
    --host="${postgres_host}" \
    --port="${postgres_port}" \
    --username="${postgres_user}" \
    --dbname="${database_name}" \
    --clean \
    --if-exists \
    --no-owner \
    --no-privileges \
    | gzip -9 > "${backup_file_path}"

  backup_checksum="$(sha256sum "${backup_file_path}" | cut -d ' ' -f 1)"
  backup_size_bytes="$(wc -c < "${backup_file_path}" | tr -d ' ')"

  printf '%s  %s\n' "${backup_checksum}" "${backup_file_name}" > "${checksum_file_path}"

  cat <<EOF > "${manifest_file_path}"
{
  "backupType": "postgresql-logical",
  "databaseLabel": "${database_label}",
  "environmentName": "${backup_environment_name}",
  "createdAtUtc": "${timestamp_utc}",
  "postgresHost": "${postgres_host}",
  "postgresPort": "${postgres_port}",
  "postgresDatabase": "${database_name}",
  "artifact": {
    "fileName": "${backup_file_name}",
    "sizeBytes": ${backup_size_bytes},
    "sha256": "${backup_checksum}"
  }
}
EOF

  artifact_file_names+=("${backup_file_name}" "${checksum_file_name}" "${manifest_file_name}")

  echo "[backup-postgres] Completed dump for '${database_label}': ${backup_file_path}"
done

backup_destination_path=""

if [[ -n "${BACKUP_DESTINATION_ROOT:-}" ]]; then
  validate_backup_destination_path_segment "${BACKUP_DESTINATION_ROOT}" "BACKUP_DESTINATION_ROOT"
  validate_backup_destination_path_segment "${backup_environment_name}" "DB_BACKUP_ENVIRONMENT_NAME"
  backup_destination_path="${BACKUP_DESTINATION_ROOT}/postgresql/${backup_environment_name}"
elif [[ -n "${legacy_backup_remote_base_path}" ]]; then
  backup_destination_path="${legacy_backup_remote_base_path}/${backup_environment_name}"
  echo "[backup-postgres] BACKUP_DESTINATION_ROOT is not set. Falling back to legacy DB_BACKUP_REMOTE_BASE_PATH=${legacy_backup_remote_base_path}. BACKUP_DESTINATION_ROOT takes precedence when both are set."
fi

if [[ "${remote_upload_enabled}" == "true" && -z "${backup_destination_path}" ]]; then
  echo "[backup-postgres] Remote upload requires BACKUP_DESTINATION_ROOT for the canonical destination layout, or legacy DB_BACKUP_REMOTE_BASE_PATH for backward-compatible PostgreSQL destinations."
  exit 1
fi

verify_remote_artifact_set() {
  local remote_directory="$1"
  local remote_file_list
  local file_name

  remote_file_list="$(rclone lsf "${remote_directory}" --files-only --config "${rclone_config_path}")"

  for file_name in "${artifact_file_names[@]}"; do
    if ! printf '%s\n' "${remote_file_list}" | grep -Fxq "${file_name}"; then
      echo "[backup-postgres] Missing ${file_name} in ${remote_directory}."
      return 1
    fi
  done

  return 0
}

upload_artifact_set() {
  local remote_name="$1"

  if [[ -z "${remote_name}" ]]; then
    return 0
  fi

  local remote_directory_root="${remote_name}:${backup_destination_path}"
  local remote_staging_directory="${remote_directory_root}/_staging/${timestamp_utc}"
  local remote_final_directory="${remote_directory_root}/${timestamp_utc}"
  local file_name

  cleanup_remote_partial_set() {
    rclone purge "${remote_staging_directory}" --config "${rclone_config_path}" >/dev/null 2>&1 || true
    rclone purge "${remote_final_directory}" --config "${rclone_config_path}" >/dev/null 2>&1 || true
  }

  echo "[backup-postgres] Uploading artifacts to staging directory ${remote_staging_directory}."
  if ! rclone mkdir "${remote_staging_directory}" --config "${rclone_config_path}"; then
    cleanup_remote_partial_set
    echo "[backup-postgres] Failed to create staging directory on ${remote_name}."
    return 1
  fi

  for file_name in "${artifact_file_names[@]}"; do
    if ! rclone copyto "${backup_output_directory}/${file_name}" "${remote_staging_directory}/${file_name}" --config "${rclone_config_path}"; then
      cleanup_remote_partial_set
      echo "[backup-postgres] Failed to upload ${file_name} to staging on ${remote_name}."
      return 1
    fi
  done

  if ! verify_remote_artifact_set "${remote_staging_directory}"; then
    cleanup_remote_partial_set
    echo "[backup-postgres] Staged artifact verification failed on ${remote_name}."
    return 1
  fi

  echo "[backup-postgres] Promoting staged artifacts to ${remote_final_directory}."
  if ! rclone mkdir "${remote_final_directory}" --config "${rclone_config_path}"; then
    cleanup_remote_partial_set
    echo "[backup-postgres] Failed to create final directory on ${remote_name}."
    return 1
  fi

  for file_name in "${artifact_file_names[@]}"; do
    if ! rclone moveto "${remote_staging_directory}/${file_name}" "${remote_final_directory}/${file_name}" --config "${rclone_config_path}"; then
      cleanup_remote_partial_set
      echo "[backup-postgres] Failed to promote ${file_name} to final directory on ${remote_name}."
      return 1
    fi
  done

  if ! verify_remote_artifact_set "${remote_final_directory}"; then
    cleanup_remote_partial_set
    echo "[backup-postgres] Final artifact verification failed on ${remote_name}."
    return 1
  fi

  rclone purge "${remote_staging_directory}" --config "${rclone_config_path}" || true

  echo "[backup-postgres] Applying remote retention (${backup_retention_days} days) in ${remote_directory_root}."
  rclone delete "${remote_directory_root}" --min-age "${backup_retention_days}d" --config "${rclone_config_path}"
  rclone rmdirs "${remote_directory_root}" --leave-root --config "${rclone_config_path}"
}

if [[ "${remote_upload_enabled}" == "true" ]]; then
  upload_artifact_set "${backup_remote_primary_name}"
  upload_artifact_set "${backup_remote_secondary_name}"
else
  echo "[backup-postgres] Skipping remote upload and remote retention."
fi

echo "[backup-postgres] Applying local retention (${backup_local_retention_days} days) in ${backup_output_directory}."
find "${backup_output_directory}" -maxdepth 1 -type f -name "postgresql-*-${backup_environment_name}-*" -mtime +$((backup_local_retention_days - 1)) -delete

echo "[backup-postgres] Backup finished successfully."
echo "[backup-postgres] Local artifacts (${#artifact_file_names[@]} files) in ${backup_output_directory}: ${artifact_file_names[*]}."
