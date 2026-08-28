#!/usr/bin/env bash
# Runs once, automatically, via docker-entrypoint-initdb.d/ on first container
# start with an empty data directory (Postgres's documented init-script
# convention — https://hub.docker.com/_/postgres, "Initialization scripts").
# It does NOT re-run on subsequent container starts against an existing volume,
# same as how POSTGRES_DB itself is only created once.
#
# CREATE DATABASE cannot run inside a transaction block. Running it here as a
# single psql statement (not inside a .sql file processed with
# --single-transaction) keeps it outside any implicit transaction wrapper.
set -euo pipefail

household_database_name="${HOUSEHOLD_POSTGRES_DB:-ksiegowy_household}"

echo "[init-household-db] Creating database '${household_database_name}'."

psql -v ON_ERROR_STOP=1 --username "${POSTGRES_USER}" --dbname "${POSTGRES_DB}" <<-SQL
    CREATE DATABASE "${household_database_name}";
SQL

echo "[init-household-db] Database '${household_database_name}' created."
