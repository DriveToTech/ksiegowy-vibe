#!/usr/bin/env bash

set -euo pipefail

repository_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

registry_host="${REGISTRY_HOST:-}"
image_namespace="${IMAGE_NAMESPACE:-}"
registry_username="${REGISTRY_USERNAME:-}"
registry_password="${REGISTRY_PASSWORD:-}"
image_tag="${IMAGE_TAG:-}"

container_engine="${CONTAINER_ENGINE:-docker}"
build_context_directory="${BUILD_CONTEXT_DIRECTORY:-$repository_root}"
api_dockerfile_path="${API_DOCKERFILE_PATH:-apps/api/Dockerfile}"
web_dockerfile_path="${WEB_DOCKERFILE_PATH:-apps/web/Dockerfile}"
api_image_name="${API_IMAGE_NAME:-api}"
web_image_name="${WEB_IMAGE_NAME:-web}"
secondary_image_tag="${SECONDARY_IMAGE_TAG:-}"
web_next_public_api_url="${WEB_NEXT_PUBLIC_API_URL:-${NEXT_PUBLIC_API_URL:-}}"

for required_environment_variable_name in \
  REGISTRY_HOST \
  IMAGE_NAMESPACE \
  REGISTRY_USERNAME \
  REGISTRY_PASSWORD \
  IMAGE_TAG
do
  if [[ -z "${!required_environment_variable_name:-}" ]]; then
    printf 'Missing required environment variable: %s\n' "$required_environment_variable_name" >&2
    exit 1
  fi
done

if [[ -z "$web_next_public_api_url" ]]; then
  printf 'Missing required environment variable: WEB_NEXT_PUBLIC_API_URL or NEXT_PUBLIC_API_URL\n' >&2
  exit 1
fi

if [[ ! "$web_next_public_api_url" =~ ^https?:// ]] || \
  [[ "$web_next_public_api_url" =~ ^https?://(localhost|127\.0\.0\.1|0\.0\.0\.0)(:|/|$) ]]; then
  printf 'Browser API URL must use a non-local http or https origin: %s\n' "$web_next_public_api_url" >&2
  exit 1
fi

if ! command -v "$container_engine" >/dev/null 2>&1; then
  printf 'Container engine command is not available: %s\n' "$container_engine" >&2
  exit 1
fi

if [[ "$build_context_directory" != /* ]]; then
  build_context_directory="${repository_root}/${build_context_directory}"
fi

if [[ ! -d "$build_context_directory" ]]; then
  printf 'Build context directory does not exist: %s\n' "$build_context_directory" >&2
  exit 1
fi

if [[ "$api_dockerfile_path" == /* ]]; then
  api_dockerfile_file="$api_dockerfile_path"
else
  api_dockerfile_file="${repository_root}/${api_dockerfile_path}"
fi

if [[ "$web_dockerfile_path" == /* ]]; then
  web_dockerfile_file="$web_dockerfile_path"
else
  web_dockerfile_file="${repository_root}/${web_dockerfile_path}"
fi

if [[ ! -f "$api_dockerfile_file" ]]; then
  printf 'API Dockerfile does not exist: %s\n' "$api_dockerfile_file" >&2
  exit 1
fi

if [[ ! -f "$web_dockerfile_file" ]]; then
  printf 'Web Dockerfile does not exist: %s\n' "$web_dockerfile_file" >&2
  exit 1
fi

api_primary_image_reference="${registry_host}/${image_namespace}/${api_image_name}:${image_tag}"
web_primary_image_reference="${registry_host}/${image_namespace}/${web_image_name}:${image_tag}"

printf 'Logging in to registry %s with %s\n' "$registry_host" "$container_engine"
printf '%s' "$registry_password" | "$container_engine" login "$registry_host" --username "$registry_username" --password-stdin

printf 'Building API image %s\n' "$api_primary_image_reference"
"$container_engine" build \
  --file "$api_dockerfile_file" \
  --tag "$api_primary_image_reference" \
  "$build_context_directory"

printf 'Pushing API image %s\n' "$api_primary_image_reference"
"$container_engine" push "$api_primary_image_reference"

printf 'Building web image %s\n' "$web_primary_image_reference"

web_build_command=(
  "$container_engine"
  build
  --file "$web_dockerfile_file"
)

web_build_command+=(--build-arg "NEXT_PUBLIC_API_URL=${web_next_public_api_url}")
web_build_command+=(--tag "$web_primary_image_reference" "$build_context_directory")

"${web_build_command[@]}"

printf 'Pushing web image %s\n' "$web_primary_image_reference"
"$container_engine" push "$web_primary_image_reference"

published_api_image_references=("$api_primary_image_reference")
published_web_image_references=("$web_primary_image_reference")

if [[ -n "$secondary_image_tag" ]]; then
  api_secondary_image_reference="${registry_host}/${image_namespace}/${api_image_name}:${secondary_image_tag}"
  web_secondary_image_reference="${registry_host}/${image_namespace}/${web_image_name}:${secondary_image_tag}"

  printf 'Tagging API image %s\n' "$api_secondary_image_reference"
  "$container_engine" tag "$api_primary_image_reference" "$api_secondary_image_reference"
  printf 'Pushing API image %s\n' "$api_secondary_image_reference"
  "$container_engine" push "$api_secondary_image_reference"

  printf 'Tagging web image %s\n' "$web_secondary_image_reference"
  "$container_engine" tag "$web_primary_image_reference" "$web_secondary_image_reference"
  printf 'Pushing web image %s\n' "$web_secondary_image_reference"
  "$container_engine" push "$web_secondary_image_reference"

  published_api_image_references+=("$api_secondary_image_reference")
  published_web_image_references+=("$web_secondary_image_reference")
fi

printf 'Published API image references:\n'
for published_api_image_reference in "${published_api_image_references[@]}"; do
  printf 'Published API image: %s\n' "$published_api_image_reference"
done

printf 'Published web image references:\n'
for published_web_image_reference in "${published_web_image_references[@]}"; do
  printf 'Published web image: %s\n' "$published_web_image_reference"
done
