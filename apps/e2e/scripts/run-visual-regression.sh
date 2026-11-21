#!/usr/bin/env bash
# Runs the visual regression suite inside the pinned Playwright container with the repository bind-mounted.
#
# Usage: pnpm --filter @ksiegowy/e2e visual [-- --update] [-- <spec files or playwright arguments>]
#   pnpm --filter @ksiegowy/e2e visual                                  verify every visual spec
#   pnpm --filter @ksiegowy/e2e visual -- --update tests/advisor-visual.spec.ts   regenerate one spec
#
# Linux node_modules and the production build live in named Docker volumes, so host (macOS) files are never
# overwritten and later runs skip the install. Remove them with `docker volume rm` (never `docker volume prune`).
set -euo pipefail

playwright_image="mcr.microsoft.com/playwright:v1.59.1-noble"
repository_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
workers="${E2E_WORKERS:-3}"

playwright_arguments=(--project=chromium-linux --grep 'visual:' --retries=0 --reporter=list)
specs=()
for argument in "$@"; do
  case "$argument" in
    --) ;;
    --update) playwright_arguments+=(--update-snapshots) ;;
    tests/*.spec.ts) specs+=("$argument") ;;
    *) playwright_arguments+=("$argument") ;;
  esac
done
if [ "${#specs[@]}" -eq 0 ]; then
  specs=(tests/dashboard.spec.ts tests/invoices-visual.spec.ts tests/advisor-visual.spec.ts)
fi

volume_arguments=(
  -v ksiegowy-visual-node-modules-root:/work/node_modules
  -v ksiegowy-visual-pnpm-store:/pnpm-store
  -v ksiegowy-visual-web-build:/work/apps/web/.next-visual
)
for package_directory in "$repository_root"/apps/* "$repository_root"/packages/*; do
  [ -f "$package_directory/package.json" ] || continue
  relative_directory="${package_directory#"$repository_root"/}"
  volume_arguments+=(-v "ksiegowy-visual-node-modules-${relative_directory//\//-}:/work/$relative_directory/node_modules")
done

start_seconds=$SECONDS
docker run --rm --ipc=host --env CI=true -e VISUAL_REGRESSION=true -e E2E_WORKERS="$workers" \
  -v "$repository_root:/work" "${volume_arguments[@]}" -w /work "$playwright_image" bash -lc "
    corepack enable &&
    pnpm config set store-dir /pnpm-store &&
    pnpm install --frozen-lockfile --reporter=silent &&
    pnpm --filter @ksiegowy/e2e exec playwright test ${specs[*]} ${playwright_arguments[*]@Q}
  "
echo "Visual regression finished in $((SECONDS - start_seconds)) seconds."
