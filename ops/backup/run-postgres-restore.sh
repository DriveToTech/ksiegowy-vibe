#!/usr/bin/env bash

set -euo pipefail
umask 077

restore_confirmed="${DB_RESTORE_CONFIRMED:-}"
postgres_host="${POSTGRES_HOST:-postgres}"
postgres_port="${POSTGRES_PORT:-5432}"
postgres_user="${POSTGRES_USER:?POSTGRES_USER is required}"
postgres_database="${POSTGRES_DB:?POSTGRES_DB is required}"
restore_environment_name="${DB_RESTORE_ENVIRONMENT_NAME:-production}"
restore_artifact_name="${DB_RESTORE_ARTIFACT_NAME:-}"
postgres_ready_timeout_seconds="${DB_BACKUP_POSTGRES_READY_TIMEOUT_SECONDS:-120}"
backup_input_directory="/backup-output"

if [[ "${restore_confirmed}" != "yes" ]]; then
  echo "[restore-postgres] DANGER: This will DESTROY and replace all data in '${postgres_database}' on ${postgres_host}:${postgres_port}."
  echo "[restore-postgres] Set DB_RESTORE_CONFIRMED=yes to proceed."
  exit 1
fi

if [[ -n "${restore_artifact_name}" ]]; then
  backup_file_name="${restore_artifact_name}"
else
  backup_file_name="$(ls -t "${backup_input_directory}"/postgresql-"${restore_environment_name}"-*.sql.gz 2>/dev/null | head -1 | xargs -r basename)"
  if [[ -z "${backup_file_name}" ]]; then
    echo "[restore-postgres] No artifacts found for environment '${restore_environment_name}' in ${backup_input_directory}."
    exit 1
  fi
fi

checksum_file_name="${backup_file_name}.sha256"

if [[ ! -f "${backup_input_directory}/${backup_file_name}" ]]; then
  echo "[restore-postgres] Artifact not found: ${backup_input_directory}/${backup_file_name}"
  exit 1
fi

if [[ ! -f "${backup_input_directory}/${checksum_file_name}" ]]; then
  echo "[restore-postgres] Checksum file not found: ${backup_input_directory}/${checksum_file_name}"
  exit 1
fi

if ! (cd "${backup_input_directory}" && sha256sum --check "${checksum_file_name}" --status); then
  echo "[restore-postgres] Checksum verification FAILED for ${backup_file_name}."
  exit 1
fi

echo "[restore-postgres] Checksum OK."

readiness_deadline=$((SECONDS + postgres_ready_timeout_seconds))

until pg_isready --host="${postgres_host}" --port="${postgres_port}" --username="${postgres_user}" --dbname="${postgres_database}" >/dev/null 2>&1; do
  if [[ "${SECONDS}" -ge "${readiness_deadline}" ]]; then
    echo "[restore-postgres] PostgreSQL is not ready after ${postgres_ready_timeout_seconds}s."
    exit 1
  fi

  echo "[restore-postgres] Waiting for PostgreSQL readiness..."
  sleep 2
done

echo "[restore-postgres] Restoring ${backup_file_name} into '${postgres_database}' on ${postgres_host}:${postgres_port}."
echo "[restore-postgres] WARNING: Ensure the API service is stopped to avoid data corruption during restore."

gzip -dc "${backup_input_directory}/${backup_file_name}" | psql \
  --host="${postgres_host}" \
  --port="${postgres_port}" \
  --username="${postgres_user}" \
  --dbname="${postgres_database}" \
  -v ON_ERROR_STOP=1

echo "[restore-postgres] Restore completed successfully."
echo "[restore-postgres] Start the API: docker compose start api"
echo "[restore-postgres] Smoke checks: curl -fsS http://localhost:3001/health && curl -fsS http://localhost:3001/ready"
