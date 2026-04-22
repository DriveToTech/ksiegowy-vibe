#!/usr/bin/env bash

set -euo pipefail

freshness_check_enabled="${BACKUP_FRESHNESS_ENABLED:-true}"

if [[ "${freshness_check_enabled}" != "true" ]]; then
  echo "[verify-backups] Backup freshness check is disabled. Set BACKUP_FRESHNESS_ENABLED=true to run."
  exit 0
fi

postgres_host="${POSTGRES_HOST:-postgres}"
postgres_port="${POSTGRES_PORT:-5432}"
postgres_user="${POSTGRES_USER:?POSTGRES_USER is required}"
postgres_database="${POSTGRES_DB:?POSTGRES_DB is required}"
postgres_ready_timeout_seconds="${DB_BACKUP_POSTGRES_READY_TIMEOUT_SECONDS:-120}"

backup_environment_name="${DB_BACKUP_ENVIRONMENT_NAME:-local}"
backup_output_directory="/backup-output"

require_postgresql_backup_mode="${BACKUP_FRESHNESS_REQUIRE_POSTGRESQL_BACKUP:-auto}"
require_google_drive_backup_mode="${BACKUP_FRESHNESS_REQUIRE_GDRIVE_BACKUP:-auto}"
require_icloud_backup_mode="${BACKUP_FRESHNESS_REQUIRE_ICLOUD_BACKUP:-auto}"

postgresql_backup_max_age_hours="${BACKUP_FRESHNESS_POSTGRESQL_MAX_AGE_HOURS:-30}"
google_drive_backup_max_age_hours="${BACKUP_FRESHNESS_GDRIVE_MAX_AGE_HOURS:-30}"
icloud_backup_max_age_hours="${BACKUP_FRESHNESS_ICLOUD_MAX_AGE_HOURS:-30}"

failure_count=0

is_positive_integer() {
  local value="$1"
  [[ "${value}" =~ ^[0-9]+$ ]] && [[ "${value}" -ge 1 ]]
}

resolve_requirement_mode() {
  local mode="$1"
  local auto_value="$2"

  case "${mode}" in
    true)
      echo "true"
      ;;
    false)
      echo "false"
      ;;
    auto)
      echo "${auto_value}"
      ;;
    *)
      echo "[verify-backups] Invalid requirement mode '${mode}'. Use true, false, or auto."
      exit 1
      ;;
  esac
}

if ! is_positive_integer "${postgres_ready_timeout_seconds}"; then
  echo "[verify-backups] DB_BACKUP_POSTGRES_READY_TIMEOUT_SECONDS must be a positive integer."
  exit 1
fi

if ! is_positive_integer "${postgresql_backup_max_age_hours}" || ! is_positive_integer "${google_drive_backup_max_age_hours}" || ! is_positive_integer "${icloud_backup_max_age_hours}"; then
  echo "[verify-backups] Freshness max age values must be positive integers."
  exit 1
fi

is_postgresql_backup_required_auto="false"
if [[ "${DB_BACKUP_ENABLED:-false}" == "true" ]]; then
  is_postgresql_backup_required_auto="true"
fi

is_google_drive_backup_required_auto="false"
if [[ -n "${GDRIVE_CLIENT_ID:-}" && -n "${GDRIVE_CLIENT_SECRET:-}" && -n "${GDRIVE_REDIRECT_URI:-}" && -n "${ENCRYPTION_KEY:-}" ]]; then
  is_google_drive_backup_required_auto="true"
fi

is_icloud_backup_required_auto="false"
if [[ -n "${ICLOUD_BACKUP_PATH:-}" || -n "${ICLOUD_RCLONE_REMOTE:-}" ]]; then
  is_icloud_backup_required_auto="true"
fi

is_postgresql_backup_required="$(resolve_requirement_mode "${require_postgresql_backup_mode}" "${is_postgresql_backup_required_auto}")"
is_google_drive_backup_required="$(resolve_requirement_mode "${require_google_drive_backup_mode}" "${is_google_drive_backup_required_auto}")"
is_icloud_backup_required="$(resolve_requirement_mode "${require_icloud_backup_mode}" "${is_icloud_backup_required_auto}")"

if [[ "${is_postgresql_backup_required}" == "false" && "${is_google_drive_backup_required}" == "false" && "${is_icloud_backup_required}" == "false" ]]; then
  echo "[verify-backups] No required backup checks are enabled. Nothing to verify."
  exit 0
fi

echo "[verify-backups] Starting backup freshness verification."

wait_for_postgresql_readiness() {
  local readiness_deadline
  readiness_deadline=$((SECONDS + postgres_ready_timeout_seconds))

  until pg_isready --host="${postgres_host}" --port="${postgres_port}" --username="${postgres_user}" --dbname="${postgres_database}" >/dev/null 2>&1; do
    if [[ "${SECONDS}" -ge "${readiness_deadline}" ]]; then
      echo "[verify-backups] PostgreSQL is not ready after ${postgres_ready_timeout_seconds}s."
      exit 1
    fi

    echo "[verify-backups] Waiting for PostgreSQL readiness..."
    sleep 2
  done

  echo "[verify-backups] PostgreSQL is ready."
}

query_single_value() {
  local sql_query="$1"
  psql \
    --host="${postgres_host}" \
    --port="${postgres_port}" \
    --username="${postgres_user}" \
    --dbname="${postgres_database}" \
    --tuples-only \
    --no-align \
    --command="${sql_query}" | tr -d '[:space:]'
}

check_postgresql_backup_freshness() {
  local latest_postgresql_artifact_path=""
  local latest_postgresql_timestamp=""
  local sql_file_path
  local sql_file_name
  local sql_file_timestamp
  local checksum_file_name
  local manifest_file_name
  local checksum_file_path
  local manifest_file_path
  local latest_postgresql_artifact_epoch
  local current_epoch
  local artifact_age_hours

  shopt -s nullglob
  for sql_file_path in "${backup_output_directory}/postgresql-${backup_environment_name}-"*.sql.gz; do
    sql_file_name="$(basename "${sql_file_path}")"
    sql_file_timestamp="${sql_file_name#postgresql-${backup_environment_name}-}"
    sql_file_timestamp="${sql_file_timestamp%.sql.gz}"

    if [[ -z "${latest_postgresql_timestamp}" || "${sql_file_timestamp}" > "${latest_postgresql_timestamp}" ]]; then
      latest_postgresql_timestamp="${sql_file_timestamp}"
      latest_postgresql_artifact_path="${sql_file_path}"
    fi
  done
  shopt -u nullglob

  if [[ -z "${latest_postgresql_artifact_path}" ]]; then
    echo "[verify-backups] Missing PostgreSQL backup artifact for environment ${backup_environment_name}."
    failure_count=$((failure_count + 1))
    return
  fi

  checksum_file_name="postgresql-${backup_environment_name}-${latest_postgresql_timestamp}.sql.gz.sha256"
  manifest_file_name="postgresql-${backup_environment_name}-${latest_postgresql_timestamp}.manifest.json"
  checksum_file_path="${backup_output_directory}/${checksum_file_name}"
  manifest_file_path="${backup_output_directory}/${manifest_file_name}"

  if [[ ! -f "${checksum_file_path}" || ! -f "${manifest_file_path}" ]]; then
    echo "[verify-backups] Latest PostgreSQL backup set is incomplete for timestamp ${latest_postgresql_timestamp}."
    failure_count=$((failure_count + 1))
    return
  fi

  if ! (cd "${backup_output_directory}" && sha256sum -c "${checksum_file_name}" >/dev/null); then
    echo "[verify-backups] Checksum validation failed for latest PostgreSQL backup set (${latest_postgresql_timestamp})."
    failure_count=$((failure_count + 1))
    return
  fi

  latest_postgresql_artifact_epoch="$(stat -c %Y "${latest_postgresql_artifact_path}")"
  current_epoch="$(date +%s)"
  artifact_age_hours=$(((current_epoch - latest_postgresql_artifact_epoch) / 3600))

  if [[ "${artifact_age_hours}" -gt "${postgresql_backup_max_age_hours}" ]]; then
    echo "[verify-backups] PostgreSQL backup is stale. Latest artifact age: ${artifact_age_hours}h, max: ${postgresql_backup_max_age_hours}h."
    failure_count=$((failure_count + 1))
    return
  fi

  echo "[verify-backups] PostgreSQL backup freshness is OK. Latest complete set (${latest_postgresql_timestamp}) age: ${artifact_age_hours}h."
}

check_file_backup_provider_freshness() {
  local provider_name="$1"
  local provider_max_age_hours="$2"
  local latest_status
  local latest_success_age_hours

  latest_status="$(query_single_value "SELECT status FROM \"BackupRun\" WHERE provider='${provider_name}' ORDER BY \"startedAt\" DESC LIMIT 1;")"

  if [[ -z "${latest_status}" ]]; then
    echo "[verify-backups] Missing backup metadata for provider ${provider_name}."
    failure_count=$((failure_count + 1))
    return
  fi

  if [[ "${latest_status}" != "success" ]]; then
    echo "[verify-backups] Latest backup run for provider ${provider_name} has status '${latest_status}'."
    failure_count=$((failure_count + 1))
    return
  fi

  latest_success_age_hours="$(query_single_value "SELECT FLOOR(EXTRACT(EPOCH FROM (NOW() - \"finishedAt\")) / 3600)::int FROM \"BackupRun\" WHERE provider='${provider_name}' AND status='success' ORDER BY \"finishedAt\" DESC LIMIT 1;")"

  if [[ -z "${latest_success_age_hours}" ]]; then
    echo "[verify-backups] Missing successful backup metadata for provider ${provider_name}."
    failure_count=$((failure_count + 1))
    return
  fi

  if [[ "${latest_success_age_hours}" -gt "${provider_max_age_hours}" ]]; then
    echo "[verify-backups] Provider ${provider_name} backup is stale. Latest successful run age: ${latest_success_age_hours}h, max: ${provider_max_age_hours}h."
    failure_count=$((failure_count + 1))
    return
  fi

  echo "[verify-backups] Provider ${provider_name} backup freshness is OK. Latest successful run age: ${latest_success_age_hours}h."
}

if [[ "${is_postgresql_backup_required}" == "true" ]]; then
  check_postgresql_backup_freshness
else
  echo "[verify-backups] PostgreSQL backup check skipped (not required)."
fi

requires_backup_run_metadata_checks="false"
if [[ "${is_google_drive_backup_required}" == "true" || "${is_icloud_backup_required}" == "true" ]]; then
  requires_backup_run_metadata_checks="true"
fi

if [[ "${requires_backup_run_metadata_checks}" == "true" ]]; then
  wait_for_postgresql_readiness
else
  echo "[verify-backups] PostgreSQL connection check skipped (BackupRun metadata checks not required)."
fi

if [[ "${is_google_drive_backup_required}" == "true" ]]; then
  check_file_backup_provider_freshness "gdrive" "${google_drive_backup_max_age_hours}"
else
  echo "[verify-backups] Google Drive file backup check skipped (not required)."
fi

if [[ "${is_icloud_backup_required}" == "true" ]]; then
  check_file_backup_provider_freshness "icloud" "${icloud_backup_max_age_hours}"
else
  echo "[verify-backups] iCloud file backup check skipped (not required)."
fi

echo "[verify-backups] Verification scope note: this check validates PostgreSQL local artifact age and BackupRun metadata freshness/status."
echo "[verify-backups] It does not prove remote artifact checksum integrity or full restoreability."

if [[ "${failure_count}" -gt 0 ]]; then
  echo "[verify-backups] Freshness verification failed with ${failure_count} issue(s)."
  exit 1
fi

echo "[verify-backups] Freshness verification passed."
