# Aurora Solid — Phase 1 Change Set

## Status
- Phase: `1` of `spec/aurora-solid-redesign-plan.md` — **planned, not started**
- Owner: **frontend-architect** (this document) → **frontend-engineer** (executes)
- Spec input: `docs/specs/aurora-solid-tokens.md` (Phase 0, signed off — §1–§9 + Frontend-Architect Addendum A1–A6)
- Branch: `design/improvements`

Everything here is derived from greps already run against the working tree. **Do not re-derive line numbers** — if a number looks stale, the file moved under you; re-grep that one file rather than the whole set.

Phase 1 is retokenization and shell rebuild only. Screen layout rebuilds are Phase 2–3. If a change starts looking like "this whole page needs a new grid", stop and leave it for Phase 2.

## Commit sequence

Six commits, not five — A6's step 3 is split because the Surface/Banner work is large enough to review on its own.

| # | Commit | Scale | Independently shippable? |
|---|---|---|---|
| C1 | Font swap | 3 files + 32 class deletions | **Yes** — ship alone if you want it de-risked |
| C2 | `globals.css` token foundation + `@theme inline` | 1 file | No — app looks wrong until C5 |
| C3 | Status tokens + opacity-modifier strip | 1 + ~24 files | Yes |
| C4 | `Surface` rebuild + new `Banner` molecule | 3 + 22 files | Yes |
| C5 | Atoms/molecules/organisms retone + blur removal + radius sweep | ~24 files | Yes |
| C6 | `apps/e2e` assertion update | 1 file | Yes |

**Ordering rationale.** C2 flips token *values* while call sites still carry `/NN` modifiers and blur, so the app is visibly wrong between C2 and C5. That is accepted and deliberate: the alternative (stripping modifiers under old values first) does not work for status, because `--error-soft` is deleted and `bg-error` under the *old* token is a solid red block. Keep C2–C5 in one PR; C1 and C6 can land separately.

---

## C1 — Font swap

Isolated on purpose: it touches every screen at once, so any FOUT/CLS regression should be bisectable to one commit.

**`apps/web/src/app/layout.tsx`**
- Replace the `Inter`/`Manrope` imports and both constants with the `Sora` + `IBM_Plex_Mono` block verbatim from token doc §4.
- `subsets: ['latin', 'latin-ext']` on both. **This is a live bug fix, not a preference** — the UI is Polish and today's `['latin']` drops `ą ć ę ł ń ó ś ź ż` to fallback glyphs.
- `<body className={`${sora.variable} ${ibmPlexMono.variable} …`}>` — same shape as today, just renamed vars.
- Do not add weights beyond the five Sora / three Plex Mono in §4.

**`apps/web/src/app/globals.css`**
- `@theme inline`: `--font-sans: var(--font-sora)`, `--font-mono: var(--font-ibm-plex-mono)`. Delete `--font-display`.
- `body { font-family: var(--font-sora), system-ui, sans-serif; }` (line 160) replaces the `var(--font-inter)` rule.

**32 `font-display` class sites** — delete the class, don't alias it. Tailwind v4 has no default `font-display` utility, so a missed one silently inherits Sora, which is the intended end state anyway. Zero risk.

```
grep -rn "font-display" apps/web/src --include='*.tsx'
```

**Verify:** `pnpm --filter @ksiegowy/web build`, then load `/dashboard` and confirm Polish diacritics render in the real face, not a fallback.

---

## C2 — `globals.css` token foundation

One file: `apps/web/src/app/globals.css`. Source of truth is token doc §2.1–§2.6 (dark), §3.1–§3.3 (light), and Addendum A1 for the `@theme inline` keys.

### `:root` / `html[data-theme='light']` and `html[data-theme='dark']`
- Repoint every existing variable per §6. **Skip the status rows** — those are C3.
- Add the new `:root` tokens: `--canvas`, `--canvas-base`, `--chrome`, `--surface-row-hover`, `--border`, `--border-strong`, `--border-control`, `--foreground-secondary`, `--foreground-disabled`, `--nav-active`, `--nav-active-border`, `--primary-gradient`, `--brand-gradient`.
- `--outline: var(--border)` — keeps all 68 `border-outline` sites working with zero churn.
- Delete `--shadow-aura`, `--shadow-soft-color`, `--error-action-ink`.

### `@theme inline`
Apply Addendum A1's table exactly. The named traps:
- **No `--color-canvas: var(--canvas)`.** `--color-canvas` points at `--canvas-base` (flat hex). The gradient never enters the colour namespace — `background-color: linear-gradient(…)` is invalid and drops silently with no error.
- **No `--color-border`.** `--border` is consumed through the existing `--color-outline`.
- Border tokens map as `--color-outline-strong` / `--color-outline-control`, not `border-border-*`.
- `--nav-active-border` gets no theme key — one call site uses `border-[var(--nav-active-border)]`.
- Radius: add all five (`--radius-chip/control/inset/card/frame`), delete `--radius-md/lg/xl`. No aliases — Tailwind's default `rounded-md` is already 0.375rem = `--radius-chip`.
- Shadow: `--shadow-frame` only. Delete `--shadow-soft` and `--shadow-aura`.

### Body / frame rules
- Delete both `radial-gradient` body backgrounds (lines 156–168) — the `--canvas` gradient replaces them on the frame.
- Add the `.app-frame` rule (hand-written, same pattern as the existing `.app-header-content`):
  ```css
  .app-frame {
    background-color: var(--canvas-base);
    background-image: var(--canvas);
  }
  ```
  `background-color` underneath is the opaque fallback if the gradient fails to paint.
- `::selection` (line 183) uses `color-mix(…, black)` — make it theme-aware or it inverts in light.

**Verify:** `pnpm --filter @ksiegowy/web build` succeeds. Visual will be wrong until C5 — that is expected here.

---

## C3 — Status tokens + opacity-modifier strip

**This is the commit that breaks silently if half-done.** Status fills are now opaque hexes with the tint already baked in (§2.3 / §3.3). Any surviving `/NN` modifier renders them at a fraction of strength — a `bg-success/25` on the new `#1A2D3A` is effectively invisible. Token repoint and modifier strip must land together.

### Token changes — `apps/web/src/app/globals.css`
Per §6: repoint `--success`, `--warning`, `--error` (fills, opaque), `--success-ink`, `--warning-ink`, `--error-ink` (text). Add `--neutral-status`, `--neutral-status-ink`, `--draft`, `--draft-ink`. Delete `--success-soft`, `--error-soft`.

Convention is **unchanged** from today: `--<status>` is the fill, `--<status>-ink` is the text. Only values move.

### 65 status-utility modifier strips

Drop the `/NN`. Where the class is `bg-error-soft*` or `bg-success-soft*`, also rename to `bg-error` / `bg-success` (those tokens are deleted).

| File | Lines |
|---|---|
| `app/dashboard/contractors/[id]/edit/EditContractorForm.tsx` | 72 |
| `app/dashboard/contractors/ContractorList.tsx` | 124 |
| `app/dashboard/contractors/ContractorServiceRates.tsx` | 114 |
| `app/dashboard/incoming/[id]/ReviewPanel.tsx` | 285, 290 |
| `app/dashboard/incoming/KsefSyncButton.tsx` | 14, 15, 143, 153, 159 |
| `app/dashboard/invoices/[id]/InvoiceActions.tsx` | 17, 18, 270, 276, 331, 353, 367, 406 |
| `app/dashboard/settings/CompanyBackupPolicyForm.tsx` | 236, 251, 358 |
| `app/dashboard/settings/CompanyDetailsForm.tsx` | 139, 144 |
| `app/dashboard/settings/InvoiceNumberPatternForm.tsx` | 114, 119, 177 |
| `app/dashboard/settings/KsefSettingsForm.tsx` | 90, 95 |
| `app/dashboard/settings/MembersTab.tsx` | 78, 83, 138, 179 |
| `app/dashboard/settings/page.tsx` | 79, 95 |
| `app/dashboard/settings/service-catalog/ServiceCatalogManager.tsx` | 200, 225 |
| `components/atoms/Badge.tsx` | 8, 9, 10, 11 |
| `components/KsefEnvironmentSwitcher.tsx` | 19, 20 |
| `components/molecules/ErrorState.tsx` | 12, 15 |
| `components/organisms/InvoiceLineItemsEditor.tsx` | 217, 250 |

`ErrorState.tsx:15` is `text-error-ink/90` — a *text* modifier. Drop it too; the ink token is already contrast-tuned and 90% pushes it under AA.

### 31 `border-outline/NN` strips — **not covered by the token doc, do not skip**

`--outline` is now `rgba(ink, 0.10)` — translucent *by design*, because it is the hairline. A `/20` modifier on top composites to ~0.02 alpha and the border disappears. This matters more than it looks: §7 documents dark canvas→card separation at **1.029**, and states the mandatory hairline is the only thing making cards legible as cards. Losing these borders is a visible regression on every card in the app.

Drop the modifier at all 31 sites:

`app/dashboard/contractors/[id]/edit/EditContractorForm.tsx:72` · `app/dashboard/contractors/ContractorList.tsx:48,72,104` · `app/dashboard/contractors/ContractorServiceRates.tsx:69,97,128` · `app/dashboard/incoming/[id]/ReviewPanel.tsx:135,159,256` · `app/dashboard/invoices/[id]/edit/EditInvoiceForm.tsx:164` · `app/dashboard/invoices/[id]/page.tsx:222,244` · `app/dashboard/invoices/new/NewInvoiceForm.tsx:168` · `app/dashboard/settings/CompanyBackupPolicyForm.tsx:257,262,282,327,374,479,493` · `app/dashboard/settings/InvoiceNumberPatternForm.tsx:132,160,194` · `app/dashboard/settings/MembersTab.tsx:115` · `app/dashboard/settings/service-catalog/ServiceCatalogManager.tsx:168` · `app/loading.tsx:4` · `components/molecules/VatBreakdownTable.tsx:88,97` · `components/organisms/AppHeader.tsx:71,74`

Where a site genuinely wants a *stronger* divider than the hairline, use `border-outline-strong` rather than reinstating a modifier.

### 57 surface-fill modifier strips
`bg-surface-panel/NN`, `bg-surface-raised/NN`, `bg-surface-muted/NN` → drop the `/NN`. Full list is the "Translucent scrolling fills" sweep in token doc §8 plus the blur table; the two overlap heavily, so do these **as you touch each file in C4/C5** rather than as a separate pass. Grep gate at the end of C5 catches stragglers.

**Verify:**
```
grep -rnE "(bg|border|text)-(success|warning|error|draft|neutral-status|outline|surface-panel|surface-raised|surface-muted)(-ink|-soft)?/[0-9]+" apps/web/src --include='*.tsx'
```
Must return nothing except deliberate tint exceptions (`--primary-soft` usage and the modal scrim).

---

## C4 — `Surface` rebuild + new `Banner` molecule

63 `<Surface>` call sites across 22 files. The tone rename alone touches all of them, so do the Banner extraction in the same pass — it *removes* ~24 of those call sites rather than migrating them.

### C4a — New `components/molecules/Banner.tsx`

24 hand-rolled status banners across the app repeat three shapes with copy-pasted classNames. They are the single largest source of the `/NN` modifiers in C3 and they are not panels — they are token doc §2.7's Banner/Alert spec. One component replaces all of them.

```
tone: 'error' | 'success' | 'warning' | 'info'
```
Per §2.7: status fill, status border, `--radius-inset`, `--foreground-secondary` text, `role="alert"` for error/warning and `role="status"` for success/info. No shadow, no blur, opaque fill.

Replace at these sites (all currently `<Surface className="border-X/NN bg-X/NN …">` or a bare `<div>` with the same blob):

| File | Lines |
|---|---|
| `app/dashboard/settings/InvoiceNumberPatternForm.tsx` | 114, 119, 177 |
| `app/dashboard/settings/KsefSettingsForm.tsx` | 90, 95 |
| `app/dashboard/settings/CompanyBackupPolicyForm.tsx` | 236, 251, 257 |
| `app/dashboard/settings/CompanyDetailsForm.tsx` | 139, 144 |
| `app/dashboard/settings/MembersTab.tsx` | 78, 83 |
| `app/dashboard/settings/page.tsx` | 79, 95 (plain `<div>`) |
| `app/dashboard/invoices/[id]/InvoiceActions.tsx` | 270, 276, 353, 367, 406 |
| `app/dashboard/invoices/[id]/page.tsx` | 60 (currently hardcoded `bg-amber-400/10` — route to `tone="warning"`, drop the raw Tailwind colour) |
| `app/dashboard/incoming/KsefSyncButton.tsx` | 143, 153, 159 (plain `<div>`) |
| `components/molecules/ErrorState.tsx` | 12 — reimplement on top of `Banner tone="error"` |

`invoices/[id]/page.tsx:60` is the only site using a raw Tailwind palette colour (`amber-400`) instead of a token. It must not survive Phase 1.

### C4b — `components/atoms/Surface.tsx` rebuild

- Tones `base | muted | raised | glass` → `canvas | chrome | panel | inset` per §8.
- Delete the `glass` tone. Confirmed safe: it is `bg-surface-panel/95 shadow-soft`, no `backdrop-filter` anywhere in the repo, so nothing depends on it functionally — only visually.
- Delete `shadow-soft` from both tones. No shadow on cards, ever.
- Replace `shapeClasses` (`rounded-[1.75rem]` / `rounded-[2.5rem_1.5rem_2rem_1.25rem]` / `rounded-full`) with the radius scale. The `organic` shape has no Aurora equivalent — **remove the `shape` prop entirely** rather than keeping a one-value prop.
- Default border stays `border border-outline` (the mandatory hairline).

**Do not add a `tailwind-merge`-style className resolver.** `lib/cn.ts` is a plain join, and the call sites that fight it (passing their own `bg-*` over the tone) are exactly the banners C4a deletes. Once those are gone the conflict is gone. If a genuine override survives the migration, fix that call site, don't add a dependency.

### C4c — Migrate the remaining ~39 `<Surface>` call sites

`tone="glass" shape="organic"` → `tone="panel"` in every file below. Drop the `shape` prop.

`app/dashboard/page.tsx` (1) · `app/login/page.tsx` (1) · `app/dashboard/settings/KsefSettingsForm.tsx` (1) · `app/dashboard/settings/CompanyBackupPolicyForm.tsx` (1) · `app/dashboard/settings/CompanyDetailsForm.tsx` (2) · `app/dashboard/settings/InvoiceNumberPatternForm.tsx` (1) · `app/dashboard/settings/MembersTab.tsx` (5) · `app/dashboard/settings/service-catalog/ServiceCatalogManager.tsx` (2) · `app/dashboard/invoices/new/NewInvoiceForm.tsx` (5) · `app/dashboard/invoices/[id]/page.tsx` (4) · `app/dashboard/invoices/[id]/edit/EditInvoiceForm.tsx` (5) · `app/dashboard/invoices/[id]/InvoiceActions.tsx` (2) · `app/dashboard/incoming/[id]/ReviewPanel.tsx` (3) · `app/dashboard/contractors/new/NewContractorForm.tsx` (1) · `app/dashboard/contractors/[id]/edit/EditContractorForm.tsx` (1) · `components/molecules/EmptyState.tsx` (1) · `components/molecules/MetricCard.tsx` (1) · `components/organisms/InvoicesTable.tsx` (2) · `components/organisms/IncomingInvoicesTable.tsx` (2) · `components/organisms/InvoiceLineItemsEditor.tsx` (1)

Two call sites need judgement, not a rename:
- `components/organisms/DashboardShell.tsx:23` — `tone="base"`. Under the new scale this is the rail: `tone="chrome"`. See C5.
- Nested `<Surface>` inside a `<Surface>` (e.g. `MembersTab.tsx:154`, `invoices/[id]/page.tsx:184`, `InvoiceLineItemsEditor.tsx:241`) is a card-inside-a-card → the inner one is `tone="inset"`, not `panel`.

---

## C5 — Atoms, molecules, organisms

Blur removal (token doc §8: **24 sites, 18 files**), retoning, and the radius sweep. Do it file by file, stripping any leftover surface `/NN` modifiers as you go.

### Atoms
| File | Change |
|---|---|
| `Badge.tsx` | Rebuild to the §2.7 chip spec: opaque status fill, `--radius-chip`, IBM Plex Mono 10px / 0.08em. Remove `backdrop-blur-xl` ×5 and all `/NN`. Add `offline24` and `draft` tones. **This is the highest-leverage file in C5** — `StatusChip.tsx` routes all 26 invoice/KSeF/incoming/environment chips through it, so Badge alone fixes every status chip in the app. |
| `Button.tsx` | Remove `shadow-[var(--shadow-aura)]` (lines 10, 18) and `backdrop-blur-xl` (14). `rounded-full` → `--radius-control` on all five variants. `primary` → `bg-[image:var(--primary-gradient)]`. `danger` → tinted fill (`--error` bg, `--error-ink` text), **not** solid red — this is what retires `--error-action-ink`. Sizes to §2.7: sm 32px / md 40px / lg 46px. |
| `Input.tsx`, `Select.tsx`, `Textarea.tsx`, `FloatingLabelInput.tsx`, `FloatingLabelSelect.tsx` | Identical treatment: remove blur, `bg-surface-raised/65` → opaque `bg-surface-raised`, `border-outline` → **`border-outline-control`** (the 1.4.11 fix — these five files are the entire reason `--border-control` exists), `rounded-[1rem]`/`rounded-[1.25rem]` → `--radius-control`. Focus: 1px `--primary` border + 2px offset outline, **not** the current `ring-4`. |
| `Surface.tsx` | Done in C4. |

### Molecules
| File | Change |
|---|---|
| `MetricCard.tsx` | Rebuild as the §2.7 KPI cell: `--surface-raised`, `--radius-card`, 7px status square replacing the round `backdrop-blur-xl` icon puck (line 39). |
| `ErrorState.tsx` | Now a thin wrapper over `Banner` (C4a). |
| `EmptyState.tsx`, `FormField.tsx`, `PageHeader.tsx`, `VatBreakdownTable.tsx`, `StatusChip.tsx` | Token/radius swap only. `StatusChip` needs no change beyond whatever Badge's new tone names force. |

### Organisms
| File | Change |
|---|---|
| `AppHeader.tsx` | Rebuild as the 60px chrome bar: opaque `--chrome`, `border-bottom: 1px solid --border`. Remove `backdrop-blur-sm` + `bg-surface-panel/95` (line 44). Lines 71/74 lose their `border-outline/NN` and `bg-surface-raised/75`. Frame constants in §5. |
| `DashboardNavigation.tsx` | Rail item spec §2.7. Active state → `bg-[image:var(--nav-active)]` + `border-[var(--nav-active-border)]`, replacing today's `bg-primary-soft … ring-1 ring-primary/30` (line 47). `rounded-lg` → `rounded-control` (line 45, part of the radius sweep). Idle `ink 0.60`, hover `ink 0.05` fill. |
| `DashboardShell.tsx` | 226px rail per §5 (today's grid is `15rem`). `Surface tone="base"` → `tone="chrome"` (line 23). Mobile nav (line 38): remove `backdrop-blur-[28px]`, opaque `--chrome`, `rounded-full` → `--radius-inset`. Main pane padding `22px 26px 26px`. |
| `ThemeSwitcher.tsx` | Clean on blur and shadow — audited, not an offender. Two cosmetic changes only: `rounded-full` → `--radius-control`, `bg-surface-panel` → `bg-chrome` (it lives in the chrome bar). Line 40. |
| `KsefEnvironmentSwitcher.tsx` | `environmentToneClasses` (lines 19–20) → the §2.7 environment chip: status @12% fill, status @30% border, 6px dot, `--radius-control`. Modifiers already stripped in C3. |
| `CompanySwitcher.tsx` | `rounded-md` → `--radius-control`, `bg-surface-raised` opaque (line 27). Small. |
| `InvoicesTable.tsx`, `IncomingInvoicesTable.tsx` | Table header `--surface-muted`, 44px rows, row hover `--surface-row-hover`, `bg-surface-raised/32` → opaque. Column heads are `--muted` eyebrows (IBM Plex Mono). |
| `InvoiceLineItemsEditor.tsx` | Remove `backdrop-blur-xl` + `bg-surface-raised/50` (line 327), `rounded-lg` → `rounded-control` (line 217). |
| `SessionActions.tsx` | Token/radius swap only. |

### Route-level files with blur (from §8)
`app/dashboard/contractors/ContractorList.tsx` (78, plus `shadow-sm` on 56) · `app/dashboard/contractors/page.tsx` (72) · `app/dashboard/incoming/KsefSyncButton.tsx` (91 scrim → flat `rgba(8,10,20,0.72)`; 94 `shadow-xl` → **no shadow**, the dialog is inside the frame so it gets `--surface-panel` + `--border-strong` + `--radius-card`) · `app/dashboard/invoices/[id]/InvoiceActions.tsx` (292, 341) · `app/dashboard/invoices/[id]/page.tsx` (206) · `app/dashboard/settings/KsefSettingsForm.tsx` (130) · `app/dashboard/settings/page.tsx` (99, 124) · `app/loading.tsx` (4, `shadow-soft`)

### Radius sweep — the 10 sites (Addendum A3)
`rounded-lg` → `rounded-control`: `DashboardNavigation.tsx:45`, `InvoiceLineItemsEditor.tsx:217`
`rounded-xl` → `rounded-control` (form fields): `InvoiceActions.tsx:431,471`, `KsefSyncButton.tsx:118,133`
`rounded-xl` → `rounded-inset` (banners): `InvoiceNumberPatternForm.tsx:169`, `KsefSyncButton.tsx:143,153,159`

**These fail silently, not loudly** — `rounded-lg`/`rounded-xl` are Tailwind defaults and keep compiling at 0.5rem/0.75rem after the tokens are deleted. Nothing errors; the corners just quietly change size.

Free win in the same pass: `rounded-2xl` (9 sites) resolves to Tailwind's default 1rem = 16px = exactly `--radius-card`. Rename to `rounded-card` for zero visual change and one radius vocabulary. Same for the 33 `rounded-full` sites, which map to `--radius-control` or `--radius-chip` by element per §2.7 (genuine pills — avatars, dots — keep `rounded-full`).

**Verify (the §8 gate):**
```
grep -rn "blur(\|backdrop-blur\|backdrop-filter" apps/web/src    # must return nothing
grep -rn "shadow-" apps/web/src --include='*.tsx'                # only the frame element
grep -rn "rounded-\[" apps/web/src --include='*.tsx'             # must return nothing
pnpm --filter @ksiegowy/web typecheck && pnpm --filter @ksiegowy/web build
```

---

## C6 — `apps/e2e`

`apps/e2e/tests/dashboard.spec.ts` runs its contrast assertions by reconstructing atom classNames as **literal strings** — 17 of them, at lines 170–181, 399–419, 457. Every one breaks in C3–C5: `rounded-full` is gone, `bg-surface-raised/65` is opaque, fields moved to `border-outline-control`, `--error-action-ink` no longer exists.

Two options, in preference order:

1. **Read computed styles off rendered atoms** instead of hardcoding class strings. The probes already build DOM nodes — render the real `Button`/`Input`/`Badge` and measure those. Then Phases 2–5 never break this file again.
2. If that is too large for this commit, update the 17 strings to match the new classNames and open a follow-up. Say so explicitly rather than leaving it silent.

Take option 1 unless it turns into its own project. This file breaking is otherwise a recurring tax on every remaining phase.

**Verify:** `pnpm --filter @ksiegowy/e2e test`.

---

## Phase 1 exit criteria

- All four grep gates above return clean.
- `pnpm --filter @ksiegowy/web typecheck` and `build` pass.
- `pnpm --filter @ksiegowy/e2e test` passes.
- `/dashboard` and `/login` visually smoke-checked in **both** themes — the light theme is original work with no mock to diff against (token doc §9.1), so it needs real eyes, not just a passing build.
- No raw Tailwind palette colours left in app code (`amber-400`, `rose-600`, …) — grep `bg-\(amber\|rose\|emerald\|slate\|indigo\)-` and expect nothing.

## Out of scope — leave for Phase 2/3

Layout rebuilds (Overview KPI grid, monthly chart, "Needs you today" alert list, service-catalog split panel), the onboarding wizard, and any new organism. If a file needs structural change to look right, retokenize it and note it — do not rebuild it here.

## Known deviations from the mock, already signed off
Carried from token doc §9 so nobody re-litigates them mid-implementation: the light theme is original design work; `--border-control` is invented to fix a 1.4.11 failure; dark muted text is `ink 0.60` not the mock's `0.45`, so eyebrows and table column heads read brighter than the reference screens. All three are intentional.
