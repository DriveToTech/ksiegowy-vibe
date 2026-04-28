# Ksiegowy Vibe Desktop

Cross-platform desktop application for Ksiegowy Vibe accounting platform, built with Electron.

## Overview

The desktop app is a **thin shell** around the existing web frontend and API. It provides:

- **Local Fastify gateway** that proxies to your self-hosted API
- **Secure storage** via OS credential store (keychain/Windows Credential/KWallet)
- **Encrypted local cache** for drafts and offline data
- **Auto-updates** via electron-updater with staged releases
- **Google OAuth** via system browser with custom protocol callback

## Prerequisites

- Node.js 22 LTS
- pnpm
- Docker (for PostgreSQL)
- macOS 10.15+ / Windows 10+ / Linux (Ubuntu 20.04+)

## Quick Start

### 1. Install dependencies

```bash
# From repo root
pnpm install
```

### 2. Configure environment

```bash
# From repo root
cp .env.example .env
```

Edit `.env` with at minimum:

```bash
# API Configuration
API_URL=http://localhost:3001
NEXT_PUBLIC_API_URL=http://localhost:3001

# Google OAuth (required for desktop sign-in)
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret
GOOGLE_REDIRECT_URI=http://localhost:3001/auth/google/callback

# Desktop Configuration
DESKTOP_AUTH_CALLBACK_URL=ksiegowy-vibe://auth/desktop/callback
DESKTOP_WEB_RUNTIME_URL=http://127.0.0.1:3000
DESKTOP_API_URL=http://localhost:3001
```

### 3. Start the stack

```bash
# Start PostgreSQL
pnpm db:up

# Run migrations
pnpm db:migrate

# Start API and Web (in separate terminals, or use `pnpm dev`)
pnpm --filter @ksiegowy/api dev
pnpm --filter @ksiegowy/web dev

# Start desktop app (in another terminal)
pnpm --filter @ksiegowy/desktop dev
```

## Development Commands

| Command | Description |
|---------|-------------|
| `pnpm --filter @ksiegowy/desktop dev` | Build and run desktop in dev mode |
| `pnpm --filter @ksiegowy/desktop watch` | Watch TypeScript files for changes |
| `pnpm --filter @ksiegowy/desktop build` | Compile TypeScript to `dist/` |
| `pnpm --filter @ksiegowy/desktop typecheck` | Run TypeScript type checking |
| `pnpm --filter @ksiegowy/desktop clean` | Remove `dist/` directory |

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `DESKTOP_WEB_RUNTIME_URL` | No | `http://127.0.0.1:3000` | Local web runtime to proxy UI requests |
| `DESKTOP_API_URL` | No | `API_URL` or `http://localhost:3001` | API origin for proxied requests |
| `DESKTOP_GATEWAY_PORT` | No | `3001` | Desktop gateway port; keep `GOOGLE_REDIRECT_URI` aligned if you change it |
| `DESKTOP_AUTH_CALLBACK_URL` | No | `ksiegowy-vibe://auth/desktop/callback` | OAuth callback URL |
| `DESKTOP_ENCRYPTION_KEY` | No | Auto-generated | Base64-encoded 32-byte key for cache encryption |

## Building for Distribution

### Prerequisites for Packaging

```bash
# Install electron-builder dependencies
pnpm --filter @ksiegowy/desktop install-app-deps
```

### Build Packages

```bash
# Build TypeScript first
pnpm --filter @ksiegowy/desktop build

# Package all platforms
pnpm --filter @ksiegowy/desktop dist

# Platform-specific builds
pnpm --filter @ksiegowy/desktop dist:mac     # macOS DMG + ZIP
pnpm --filter @ksiegowy/desktop dist:win    # Windows NSIS + Portable
pnpm --filter @ksiegowy/desktop dist:linux  # Linux AppImage + DEB
```

### Output Locations

| Platform | Output |
|----------|--------|
| macOS | `apps/desktop/release/mac/` (DMG, ZIP) |
| Windows | `apps/desktop/release/win/` (NSIS installer, portable EXE) |
| Linux | `apps/desktop/release/linux/` (AppImage, DEB) |

## Code Signing

### macOS

Requires Apple Developer ID certificate:

```bash
# Set environment variables
export CSC_NAME="Developer ID Application: Your Name (TEAM_ID)"
export CSC_KEY_PASSWORD="keychain-password"

# For notarization
export APPLE_ID="your-email@example.com"
export APPLE_APP_SPECIFIC_PASSWORD="app-specific-password"
export APPLE_TEAM_ID="YOUR_TEAM_ID"

# Build
pnpm --filter @ksiegowy/desktop dist:mac
```

### Windows

Requires code signing certificate:

```bash
# Set environment variable
set CSC_NAME="Your Certificate Name"

# Or provide certificate file
export CSC_LINK=/path/to/certificate.p12
export CSC_KEY_PASSWORD="certificate-password"

# Build
pnpm --filter @ksiegowy/desktop dist:win
```

### Linux

Optional GPG signing for DEB packages:

```bash
# Build unsigned
pnpm --filter @ksiegowy/desktop dist:linux
```

## Auto-Updates

The desktop app supports automatic updates via GitHub releases.

### Configuration

Update provider is configured in `package.json`:

```json
"build": {
  "publish": {
    "provider": "github",
    "owner": "ksiegowy-vibe",
    "repo": "desktop-releases"
  }
}
```

### Publishing Releases

```bash
# Set GitHub token
export GH_TOKEN=your_github_token

# Build and publish
pnpm --filter @ksiegowy/desktop dist --publish always
```

### Update Channels

- **Stable** (default): Production releases
- **Beta**: Pre-releases for testing
- **Dev**: Development builds

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      Desktop App                            │
│  ┌─────────────┐    ┌──────────────┐    ┌────────────────┐  │
│  │  Electron   │───▶│ Local Fastify │───▶│   Next.js UI   │  │
│  │   Main      │    │   Gateway     │    │   (Proxied)    │  │
│  └─────────────┘    └──────────────┘    └────────────────┘  │
│         │                   │                                 │
│         ▼                   ▼                                 │
│  ┌─────────────┐    ┌──────────────┐                          │
│  │OS Secret    │    │  Encrypted   │                          │
│  │  Store      │    │    Cache     │                          │
│  └─────────────┘    └──────────────┘                          │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
                    ┌──────────────────┐
                    │  Self-hosted API │
                    │  (Your server)   │
                    └──────────────────┘
```

### Security Model

- **Renderer isolation**: `sandbox: true`, `contextIsolation: true`, `nodeIntegration: false`
- **IPC restrictions**: Only typed, allowlisted APIs exposed via preload
- **Navigation control**: Renderer can only load local gateway origin
- **Secret storage**: AES-256-GCM encrypted, stored in OS credential store
- **Cache encryption**: All local cache files encrypted at rest

## Desktop-Specific APIs

The renderer can access these via `window.desktop`:

```typescript
// Authentication
await window.desktop.startGoogleAuthentication();
const callback = await window.desktop.consumePendingAuthenticationCallback();

// Secret storage
await window.desktop.setSecret('ksiegowy-vibe', 'refresh-token', token);
const token = await window.desktop.getSecret('ksiegowy-vibe', 'refresh-token');
await window.desktop.deleteSecret('ksiegowy-vibe', 'refresh-token');
const credentials = await window.desktop.findCredentials('ksiegowy-vibe');

// Encrypted cache
await window.desktop.setCacheEntry('draft-123', { /* data */ });
const draft = await window.desktop.getCacheEntry('draft-123');
await window.desktop.deleteCacheEntry('draft-123');
const keys = await window.desktop.listCacheKeys();

// Updates
const update = await window.desktop.checkForUpdates();
if (update.available) {
  await window.desktop.installUpdate();
}
```

See `src/desktop-api.ts` for full TypeScript definitions.

## Testing

### Manual Testing

1. Start the full stack (PostgreSQL, API, Web)
2. Run desktop app: `pnpm --filter @ksiegowy/desktop dev`
3. Verify window opens at expected size (1280x800)
4. Test Google sign-in via system browser
5. Verify callback completes and redirects to dashboard
6. Check gateway health: `curl http://127.0.0.1:<port>/_desktop/health`

### E2E Tests

```bash
# Build desktop first
pnpm --filter @ksiegowy/desktop build

# Run Playwright tests
pnpm --filter @ksiegowy/e2e test desktop/smoke
```

## Troubleshooting

### Desktop won't start

- Check `DESKTOP_WEB_RUNTIME_URL` points to running web dev server
- Verify `DESKTOP_API_URL` points to running API
- Check gateway health endpoint manually
- Look for errors in terminal output

### OAuth callback not working

- Ensure `GOOGLE_REDIRECT_URI` points at the desktop gateway callback, for example `http://localhost:3001/auth/google/callback`
- Ensure `DESKTOP_AUTH_CALLBACK_URL` matches Google OAuth config
- Check that desktop protocol is registered: `ksiegowy-vibe://`
- On macOS: System Preferences → Security → Allow app to handle URLs

### Type errors

```bash
pnpm --filter @ksiegowy/desktop typecheck
```

### Build fails

```bash
# Clean and rebuild
pnpm --filter @ksiegowy/desktop clean
pnpm --filter @ksiegowy/desktop build
```

## Documentation

- [Desktop Architecture](../../docs/desktop-architecture.md) — Architecture decisions and security model
- [Desktop Auth Decoupling](../../docs/desktop-auth-decoupling.md) — OAuth flow implementation
- [Development Run Modes](../../docs/development-run-modes.md) — Mode 4 for desktop development
- [spec/desktop-implementation-plan.md](../../spec/desktop-implementation-plan.md) — Implementation roadmap

## License

Same as the parent repository. See root `LICENSE`.
