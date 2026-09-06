# Google Drive Backup Setup

## Purpose

Use this guide to configure the Google OAuth2 credentials required for **company Google Drive backups** in `ksiegowy-vibe`.

```mermaid
flowchart LR
    operator[Operator creates Google OAuth app] --> env[Set GDRIVE_* env variables]
    env --> app[App starts with Google Drive backup enabled]
    app --> authorize[Company admin authorizes Google Drive in app]
    authorize --> callback[/backup/gdrive/callback]
    callback --> ready[Backup can run manually or by schedule]
```

## Prerequisites

- Access to [Google Cloud Console](https://console.cloud.google.com/)
- Access to this app's `.env`
- A reachable API URL for the callback route

---

## 1. Create or select a Google Cloud project

In Google Cloud Console:

1. Open **Google Cloud Console**
2. Create a new project or select an existing one for backup integration

---

## 2. Enable the required API

Go to:

**APIs & Services → Library**

Enable:

- **Google Drive API**

---

## 3. Configure the OAuth consent screen

Go to:

**APIs & Services → OAuth consent screen**

Recommended setup:

1. Choose **External** unless you intentionally use a Google Workspace-only internal app
2. Fill the required basics:
   - **App name**
   - **User support email**
   - **Developer contact email**
3. Save the configuration
4. If the app is in **Testing** mode, add every operator/admin Google account that will authorize backup under **Test users**

> If you do not add the account as a test user while the app is still in testing, Google authorization will fail.

---

## 4. Create the correct credential type

Go to:

**APIs & Services → Credentials → Create credentials → OAuth client ID**

Choose:

- **Application type:** `Web application`

Do **not** use:

- `Service account`
- `Desktop app`

Add an **Authorized redirect URI** that matches this app exactly.

---

## 5. Configure env variables

Map the created OAuth client values into the app environment:

```bash
GDRIVE_CLIENT_ID=<Google OAuth client ID>
GDRIVE_CLIENT_SECRET=<Google OAuth client secret>
GDRIVE_REDIRECT_URI=<authorized redirect URI>
```

Example:

```bash
GDRIVE_CLIENT_ID=your-drive-client-id.apps.googleusercontent.com
GDRIVE_CLIENT_SECRET=your-drive-client-secret
GDRIVE_REDIRECT_URI=http://localhost:3001/backup/gdrive/callback
```

---

## 6. Redirect URI examples

Use the API callback route, not the frontend URL.

### Local development

```bash
GDRIVE_REDIRECT_URI=http://localhost:3001/backup/gdrive/callback
```

### Production

```bash
GDRIVE_REDIRECT_URI=https://api.example.com/backup/gdrive/callback
```

If the API is exposed behind a public path prefix, include that prefix in the
redirect URI. The application uses this path for the OAuth state cookie, so the
public callback path and `GDRIVE_REDIRECT_URI` must match exactly.

> The value in `GDRIVE_REDIRECT_URI` must be **identical** to the redirect URI configured in Google Cloud Console.

---

## Common pitfalls

- **`redirect_uri_mismatch`**
  - The URI in Google Cloud Console does not exactly match `GDRIVE_REDIRECT_URI`
- **Wrong credential type**
  - Use **OAuth client ID → Web application**
- **Missing test users**
  - If the consent screen is in **Testing**, the Google account used for authorization must be added as a test user
- **Wrong callback host**
  - Use the externally reachable API callback route, including any public path prefix
- **Reusing the login OAuth app by accident**
  - Backup credentials are expected to be configured separately from `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` used for login

---

## Verification in this app

After setting `GDRIVE_CLIENT_ID`, `GDRIVE_CLIENT_SECRET`, `GDRIVE_REDIRECT_URI`, and restarting the app:

1. Sign in as a company admin
2. Open **Dashboard → Ustawienia**
3. Go to the **company backup policy / Google Drive backup** section
4. Start the Google Drive authorization flow
5. Complete Google consent
6. Confirm the callback returns successfully and the company shows Google Drive as connected
7. Run a **manual backup**
8. Verify that:
    - the run completes successfully in the app
    - a `BackupRun` entry is recorded
    - files appear in the expected Google Drive folder structure:

```text
<BACKUP_DESTINATION_ROOT>/
└── files/
    └── <environment>/
        └── company-<companyId>/
            ├── invoices/
            └── incoming/
```

Canonical layout example:

- `BACKUP_DESTINATION_ROOT=ksiegowy-vibe-backups`
- `<environment>` comes from `DB_BACKUP_ENVIRONMENT_NAME` and defaults to `local`

For PostgreSQL remote publishing, this canonical root is an explicit opt-in. When `BACKUP_DESTINATION_ROOT` is unset, PostgreSQL keeps using legacy `DB_BACKUP_REMOTE_BASE_PATH/<environment>/...` destinations.

For restore steps, see [File Backup Restore Runbook](./restore-files.md).

If Google later revokes the refresh token or the consent becomes invalid, the API persists a **reauthorization required** state after the next failed token refresh (`invalid_grant`). That state is exposed by the company backup settings/status endpoints and is cleared automatically after the admin completes `/backup/gdrive/connect` again.

In **Dashboard → Ustawienia**, this state is shown separately from a normal disconnected account. The UI keeps the existing connect flow, but changes the action copy to a reconnect prompt and surfaces the same reconnect link after a manual backup fails with a reauthorization-required error.

If authorization fails, check:

- app logs
- redirect URI value
- consent screen status
- test user configuration
