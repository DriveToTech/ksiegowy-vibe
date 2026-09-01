# Demo screenshot inventory

There are 49 files here: 48 PNG screenshots plus this `README.md`. Every PNG is a desktop capture at **1440×1000** made through Playwright MCP against `apps/e2e/mock-api/server.js`, using a synthetic fixture only. No real company, contractor, invoice, credential, or OAuth data is included.

The dark counterparts use the app-supported persisted preference `ksiegowy-theme=dark` and were captured against the mock API on port `3199` and web app on port `3200`. The dark theme was verified from the rendered `data-theme` attribute and dark canvas background before each capture.

| Filename | Dark counterpart | View / state | URL |
|---|---|---|---|
| `01-landing-desktop.png` | `01-landing-dark-desktop.png` | Public landing page | `/` |
| `02-login-desktop.png` | `02-login-dark-desktop.png` | Google sign-in page | `/login` |
| `03-onboarding-company-filled-desktop.png` | `03-onboarding-company-filled-dark-desktop.png` | Company setup with dummy data | `/onboarding/company` |
| `04-onboarding-ksef-test-filled-desktop.png` | `04-onboarding-ksef-test-filled-dark-desktop.png` | KSeF TEST setup with dummy token | `/onboarding/ksef` |
| `05-onboarding-team-desktop.png` | `05-onboarding-team-dark-desktop.png` | Accountant invitation step | `/onboarding/team` |
| `06-dashboard-desktop.png` | `06-dashboard-dark-desktop.png` | Dashboard overview | `/dashboard` |
| `07-invoices-issued-desktop.png` | `07-invoices-issued-dark-desktop.png` | Outgoing invoices with issued data | `/dashboard/invoices` |
| `08-invoices-draft-desktop.png` | `08-invoices-draft-dark-desktop.png` | Outgoing invoices draft filter | `/dashboard/invoices?status=DRAFT` |
| `09-invoice-new-filled-desktop.png` | `09-invoice-new-filled-dark-desktop.png` | New invoice with dummy line items | `/dashboard/invoices/new` |
| `10-invoice-detail-accepted-desktop.png` | `10-invoice-detail-accepted-dark-desktop.png` | Accepted invoice detail | `/dashboard/invoices/accepted-invoice-id` |
| `11-invoice-edit-draft-desktop.png` | `11-invoice-edit-draft-dark-desktop.png` | Draft invoice editor | `/dashboard/invoices/draft-invoice-id/edit` |
| `12-incoming-invoices-desktop.png` | `12-incoming-invoices-dark-desktop.png` | Incoming invoices list | `/dashboard/incoming` |
| `13-incoming-ocr-review-desktop.png` | `13-incoming-ocr-review-dark-desktop.png` | Incoming OCR review | `/dashboard/incoming/incoming-ocr-review-id` |
| `14-contractors-list-desktop.png` | `14-contractors-list-dark-desktop.png` | Contractors list and detail panel | `/dashboard/contractors` |
| `15-contractor-edit-desktop.png` | `15-contractor-edit-dark-desktop.png` | Contractor edit form | `/dashboard/contractors/test-contractor-id/edit` |
| `16-contractor-new-desktop.png` | `16-contractor-new-dark-desktop.png` | New contractor form | `/dashboard/contractors/new` |
| `17-settings-company-desktop.png` | `17-settings-company-dark-desktop.png` | Settings: company tab | `/dashboard/settings` |
| `18-settings-ksef-desktop.png` | `18-settings-ksef-dark-desktop.png` | Settings: KSeF tab | `/dashboard/settings` |
| `19-settings-numbering-desktop.png` | `19-settings-numbering-dark-desktop.png` | Settings: invoice numbering tab | `/dashboard/settings` |
| `20-settings-services-desktop.png` | `20-settings-services-dark-desktop.png` | Settings: services and goods tab | `/dashboard/settings` |
| `21-settings-team-desktop.png` | `21-settings-team-dark-desktop.png` | Settings: team and roles tab | `/dashboard/settings` |
| `22-settings-backups-desktop.png` | `22-settings-backups-dark-desktop.png` | Settings: backups tab | `/dashboard/settings` |
| `23-service-catalog-desktop.png` | `23-service-catalog-dark-desktop.png` | Service catalog manager | `/dashboard/settings/service-catalog` |
| `24-compliance-jpk-desktop.png` | `24-compliance-jpk-dark-desktop.png` | Compliance/JPK placeholder state | `/dashboard/compliance` |
| `README.md` | This screenshot index | — |

## Intentionally not captured

- `/onboarding`: redirect-only entry route; its concrete company, KSeF, and team steps are captured above.
- `/dashboard/compliance/download/xml` and `/dashboard/compliance/submit/jpk`: the frontend-only compliance action links are missing. The compliance image captures only the current parent-route placeholder/error state.
- `/invite/{token}` and bank reconciliation: no current frontend view exists.
- Mobile variants are not captured.
- Dark onboarding team limitation: the dark capture uses the filled invitation form before submission. The submitted-success variant would display the app-generated `http://localhost:3200/invite/...` link, so it was intentionally omitted to keep visible domains limited to `example.test`; no production code or fixture was changed.
