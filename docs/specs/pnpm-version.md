# pnpm version

The repository uses pnpm 12.5.1, pinned in the root `package.json`. GitHub Actions must use the same exact version so local, CI, and Corepack installs stay aligned.

pnpm 12 requires Node.js 22.13 or newer when installed through Corepack or npm. Keep the root Node.js engine requirement aligned with that minimum.

Workspace overrides belong in `pnpm-workspace.yaml`; pnpm 12 ignores the former `pnpm.overrides` field in `package.json`.

`allowBuilds` permits Prisma's CLI and engines, SWC, and esbuild. It denies `@prisma/client`'s install script because the schema is under `apps/api` and client generation runs through `prisma generate` in setup, CI, and Docker. Puppeteer's browser download is also denied because production uses system Chromium and local development supplies its own browser path.
