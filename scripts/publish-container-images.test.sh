#!/usr/bin/env bash

set -euo pipefail

repository_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
script_path="${repository_root}/scripts/publish-container-images.sh"

assert_contains() {
  local expected_text="$1"
  local file_path="$2"

  if ! grep -Fq -- "$expected_text" "$file_path"; then
    printf 'Expected to find "%s" in %s\n' "$expected_text" "$file_path" >&2
    printf -- '--- file contents ---\n' >&2
    cat "$file_path" >&2
    exit 1
  fi
}

assert_not_empty() {
  local file_path="$1"

  if [[ ! -s "$file_path" ]]; then
    printf 'Expected non-empty file: %s\n' "$file_path" >&2
    exit 1
  fi
}

test_fails_when_required_environment_variable_is_missing() {
  local output_file
  output_file="$(mktemp)"

  if env \
    IMAGE_NAMESPACE="accounting" \
    REGISTRY_USERNAME="registry-user" \
    REGISTRY_PASSWORD="registry-password" \
    IMAGE_TAG="2026-06-13" \
    bash "$script_path" >"$output_file" 2>&1; then
    printf 'Expected script to fail when REGISTRY_HOST is missing\n' >&2
    exit 1
  fi

  assert_contains 'Missing required environment variable: REGISTRY_HOST' "$output_file"
}

test_builds_and_pushes_both_images_with_secondary_tag() {
  local temporary_directory
  local fake_engine_path
  local log_file
  local output_file

  temporary_directory="$(mktemp -d)"
  fake_engine_path="${temporary_directory}/fake-container-engine.sh"
  log_file="${temporary_directory}/engine.log"
  output_file="${temporary_directory}/script-output.log"

  cat > "$fake_engine_path" <<'FAKE_ENGINE'
#!/usr/bin/env bash
set -euo pipefail
log_file="${FAKE_ENGINE_LOG_FILE:?}"
printf '%s\n' "$*" >> "$log_file"
if [[ "$1" == "login" ]]; then
  password_from_standard_input="$(cat)"
  printf 'stdin:%s\n' "$password_from_standard_input" >> "$log_file"
fi
FAKE_ENGINE
  chmod +x "$fake_engine_path"

  env \
    REGISTRY_HOST="registry.example.internal" \
    IMAGE_NAMESPACE="accounting" \
    REGISTRY_USERNAME="registry-user" \
    REGISTRY_PASSWORD="registry-password" \
    IMAGE_TAG="2026-06-13" \
    SECONDARY_IMAGE_TAG="latest" \
    CONTAINER_ENGINE="$fake_engine_path" \
    BUILD_CONTEXT_DIRECTORY="$repository_root" \
    API_IMAGE_NAME="api-service" \
    WEB_IMAGE_NAME="web-frontend" \
    API_DOCKERFILE_PATH="apps/api/Dockerfile" \
    WEB_DOCKERFILE_PATH="apps/web/Dockerfile" \
    WEB_NEXT_PUBLIC_API_URL="https://app.example.com/backend" \
    FAKE_ENGINE_LOG_FILE="$log_file" \
    bash "$script_path" >"$output_file" 2>&1

  assert_not_empty "$log_file"
  assert_contains 'login registry.example.internal --username registry-user --password-stdin' "$log_file"
  assert_contains 'stdin:registry-password' "$log_file"
  assert_contains "build --file ${repository_root}/apps/api/Dockerfile --tag registry.example.internal/accounting/api-service:2026-06-13 ${repository_root}" "$log_file"
  assert_contains "build --file ${repository_root}/apps/web/Dockerfile --build-arg NEXT_PUBLIC_API_URL=https://app.example.com/backend --tag registry.example.internal/accounting/web-frontend:2026-06-13 ${repository_root}" "$log_file"
  assert_contains 'tag registry.example.internal/accounting/api-service:2026-06-13 registry.example.internal/accounting/api-service:latest' "$log_file"
  assert_contains 'tag registry.example.internal/accounting/web-frontend:2026-06-13 registry.example.internal/accounting/web-frontend:latest' "$log_file"
  assert_contains 'push registry.example.internal/accounting/api-service:2026-06-13' "$log_file"
  assert_contains 'push registry.example.internal/accounting/api-service:latest' "$log_file"
  assert_contains 'push registry.example.internal/accounting/web-frontend:2026-06-13' "$log_file"
  assert_contains 'push registry.example.internal/accounting/web-frontend:latest' "$log_file"

  assert_contains 'Published API image: registry.example.internal/accounting/api-service:2026-06-13' "$output_file"
  assert_contains 'Published API image: registry.example.internal/accounting/api-service:latest' "$output_file"
  assert_contains 'Published web image: registry.example.internal/accounting/web-frontend:2026-06-13' "$output_file"
  assert_contains 'Published web image: registry.example.internal/accounting/web-frontend:latest' "$output_file"
}

test_uses_standard_next_public_api_url_when_specific_override_is_unset() {
  local temporary_directory
  local fake_engine_path
  local log_file

  temporary_directory="$(mktemp -d)"
  fake_engine_path="${temporary_directory}/fake-container-engine.sh"
  log_file="${temporary_directory}/engine.log"

  cat > "$fake_engine_path" <<'FAKE_ENGINE'
#!/usr/bin/env bash
set -euo pipefail
printf '%s\n' "$*" >> "${FAKE_ENGINE_LOG_FILE:?}"
if [[ "$1" == "login" ]]; then
  cat >/dev/null
fi
FAKE_ENGINE
  chmod +x "$fake_engine_path"

  env \
    REGISTRY_HOST="registry.example.internal" \
    IMAGE_NAMESPACE="accounting" \
    REGISTRY_USERNAME="registry-user" \
    REGISTRY_PASSWORD="registry-password" \
    IMAGE_TAG="2026-06-13" \
    CONTAINER_ENGINE="$fake_engine_path" \
    BUILD_CONTEXT_DIRECTORY="$repository_root" \
    NEXT_PUBLIC_API_URL="https://app.example.com/backend" \
    FAKE_ENGINE_LOG_FILE="$log_file" \
    bash "$script_path" >/dev/null 2>&1

  assert_contains "build --file ${repository_root}/apps/web/Dockerfile --build-arg NEXT_PUBLIC_API_URL=https://app.example.com/backend --tag registry.example.internal/accounting/web:2026-06-13 ${repository_root}" "$log_file"
}

test_fails_when_browser_api_url_is_missing() {
  local output_file
  output_file="$(mktemp)"

  if env \
    REGISTRY_HOST="registry.example.internal" \
    IMAGE_NAMESPACE="accounting" \
    REGISTRY_USERNAME="registry-user" \
    REGISTRY_PASSWORD="registry-password" \
    IMAGE_TAG="2026-06-13" \
    CONTAINER_ENGINE="true" \
    bash "$script_path" >"$output_file" 2>&1; then
    printf 'Expected script to fail when browser API URL is missing\n' >&2
    exit 1
  fi

  assert_contains 'Missing required environment variable: WEB_NEXT_PUBLIC_API_URL or NEXT_PUBLIC_API_URL' "$output_file"
}

test_fails_when_browser_api_url_points_to_localhost() {
  local output_file
  output_file="$(mktemp)"

  if env \
    REGISTRY_HOST="registry.example.internal" \
    IMAGE_NAMESPACE="accounting" \
    REGISTRY_USERNAME="registry-user" \
    REGISTRY_PASSWORD="registry-password" \
    IMAGE_TAG="2026-06-13" \
    CONTAINER_ENGINE="true" \
    NEXT_PUBLIC_API_URL="http://localhost:3001" \
    bash "$script_path" >"$output_file" 2>&1; then
    printf 'Expected script to fail when browser API URL points to localhost\n' >&2
    exit 1
  fi

  assert_contains 'Browser API URL must use a non-local http or https origin' "$output_file"
}

test_supports_absolute_dockerfile_paths() {
  local temporary_directory
  local fake_engine_path
  local log_file
  local absolute_api_dockerfile_path
  local absolute_web_dockerfile_path

  temporary_directory="$(mktemp -d)"
  fake_engine_path="${temporary_directory}/fake-container-engine.sh"
  log_file="${temporary_directory}/engine.log"
  absolute_api_dockerfile_path="${repository_root}/apps/api/Dockerfile"
  absolute_web_dockerfile_path="${repository_root}/apps/web/Dockerfile"

  cat > "$fake_engine_path" <<'FAKE_ENGINE'
#!/usr/bin/env bash
set -euo pipefail
printf '%s\n' "$*" >> "${FAKE_ENGINE_LOG_FILE:?}"
if [[ "$1" == "login" ]]; then
  cat >/dev/null
fi
FAKE_ENGINE
  chmod +x "$fake_engine_path"

  env \
    REGISTRY_HOST="registry.example.internal" \
    IMAGE_NAMESPACE="accounting" \
    REGISTRY_USERNAME="registry-user" \
    REGISTRY_PASSWORD="registry-password" \
    IMAGE_TAG="2026-06-13" \
    CONTAINER_ENGINE="$fake_engine_path" \
    BUILD_CONTEXT_DIRECTORY="$repository_root" \
    API_DOCKERFILE_PATH="$absolute_api_dockerfile_path" \
    WEB_DOCKERFILE_PATH="$absolute_web_dockerfile_path" \
    NEXT_PUBLIC_API_URL="https://app.example.com/backend" \
    FAKE_ENGINE_LOG_FILE="$log_file" \
    bash "$script_path" >/dev/null 2>&1

  assert_contains "build --file ${absolute_api_dockerfile_path} --tag registry.example.internal/accounting/api:2026-06-13 ${repository_root}" "$log_file"
  assert_contains "build --file ${absolute_web_dockerfile_path} --build-arg NEXT_PUBLIC_API_URL=https://app.example.com/backend --tag registry.example.internal/accounting/web:2026-06-13 ${repository_root}" "$log_file"
}

test_fails_when_required_environment_variable_is_missing
test_builds_and_pushes_both_images_with_secondary_tag
test_uses_standard_next_public_api_url_when_specific_override_is_unset
test_fails_when_browser_api_url_is_missing
test_fails_when_browser_api_url_points_to_localhost
test_supports_absolute_dockerfile_paths

printf 'publish-container-images tests passed\n'
