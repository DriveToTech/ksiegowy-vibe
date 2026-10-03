# Tax advisor connection UX — Settings → Doradca

Status: **design ready for component breakdown (TRY-172); not implemented.** Updated: **2026-10-01**. Next owner: frontend-architect (component boundaries), then frontend-engineer.

Tracking: [TRY-172](https://linear.app/trysoft/issue/TRY-172). Related: [tax advisor specification](tax-advisor.md), [implementation plan — provider setup design](../../spec/tax-advisor-implementation-plan.md#provider-setup-design-openrouter-and-self-hosted-ollama), [Aurora Solid tokens](aurora-solid-tokens.md).

> **Provisional:** everything in mode B that depends on host products — per-product steps, plan/admin eligibility, host menu names and the "first host call" signal — is provisional until the connector eligibility check (TRY-173) is completed on real ChatGPT and Claude accounts. Provisional copy is marked **[P]** in the microcopy tables.

This document replaces the generic provider form in `AdvisorSettings.tsx` and the grant block in `AdvisorConnectors.tsx` with two clearly separated connection modes. It adds no tokens and no new primitives; it reuses Aurora Solid tokens and existing atoms/molecules.

## 0. Design source: Claude Design artifact 5s6ojohFet7haaSAbWV9hp

The single design source is the Claude Design artifact [5s6ojohFet7haaSAbWV9hp](https://claude.ai/artifact/5s6ojohFet7haaSAbWV9hp), titled "Aurora Solid · full platform". The Stitch project and its screen IDs are no longer used: the Stitch screens turned out to be generated content that does not match the product. The local `docs/redesign/` files are not the source either. The artifact is a static canvas. It has 37 numbered frames, all in the dark theme, and every desktop frame is 1280px wide with a 60px chrome bar and a 226px rail. Mobile frames are 390×844.

| # | Frame | Variant |
|---|---|---|
| 01–02 | Sign in; onboarding step 2 of 4 | desktop |
| 03–13 | Overview, outgoing invoices, new invoice with KSeF preflight, invoice detail, incoming, OCR inbox, contractors with drawer, Reports & JPK, bank reconciliation, **Settings — KSeF integration & team**, Settings — products & services | desktop |
| 14 | Mobile: the three things people do on a phone | 3 × 390 |
| **15** | **Advisor panel** (⌘J, 400px column beside rail and content: insight cards Act/Watch/Opportunity, suggestion chips, ask field, provenance footer) | desktop |
| **16** | **Answer card** (780px overlay card: question, success-tinted short answer, 3 figure tiles, breakdown table with certainty chips, note, actions, "14 DOCUMENTS · 0.9 S") | desktop |
| **17** | **Inline insights** (A list strip, B preflight rail, C explain a number, D reconciliation match; rule: at most one strip per view, advisor prepares, user confirms) | desktop parts |
| **18** | **Monday briefing** (advisor page with briefing history, figure row, week tasks, cash chart, "Last week, checked") | desktop |
| **19** | **Mobile advisor** (inline card on overview, bottom sheet with answer, briefing page) | 3 × 390 |
| 20–32 | Personal mode: home, money in & out, commitments, savings & goals, investing, reports, mobile, add/single payment, add/single commitment, new/single goal | desktop + 390 |
| 33–37 | Sign in for both modes, mode chooser, household onboarding steps 2 and 4, mobile entry | desktop + 390 |

**Not in the design:** Settings → Doradca, provider or API-key setup (OpenRouter, Ollama, OpenAI API, Anthropic API), model discovery, the paid connection test, the company advisor policy editor, the ChatGPT/Claude connector (host choice, grant scope, MCP address, host steps, grants list, revoke), readiness chips for the advisor, confirmation dialogs, empty, loading and error states for any advisor surface, and a light theme. Sections 3–5 of this document are therefore our own design, built from the artifact's primitives (see the visual QA findings below). They need a Claude Design frame before the UI can be called "matching design".

Design tokens in the artifact (all inline, dark only). They match the dark values in [Aurora Solid tokens](aurora-solid-tokens.md) and `apps/web/src/app/globals.css`:

| Group | Values |
|---|---|
| Page and frame | page `#060710`; frame gradient `155deg #0d1024 → #080a14 → #0f1226`; frame radius 20px (mobile 34px); shadow `0 30px 90px rgba(0,0,0,.6)` on frames only |
| Surfaces | chrome/rail/panel `#0a0c18`; card `#10132a`; raised/field `#171b36`; hover row `#131734`; hairlines `rgba(236,238,247,.07–.12)` |
| Text | `#eceef7` at 1 / .78 / .7 / .62 / .45 / .35 alpha |
| Accent | primary `#a78bfa` (hover `#c4b1fd`); primary gradient `140deg #b39cfb → #7aa7f2` with ink `#0c0d1c`; logo gradient `140deg #a78bfa → #5eb8f0`; advisor border `rgba(167,139,250,.28–.40)` |
| Status | success `#58cf9a`, warning `#f5be5a`, danger `#f07a6a`, info `#5eb8f0`; chip fill = status at .12–.18 alpha |
| Type | Sora 500/600 (body 12.5–14px, card title 14.5–15px, page title 25–27px, letter-spacing −0.03em); IBM Plex Mono for eyebrows, chips, IDs, numbers (10–11px, uppercase, tracking .12–.18em) |
| Radius | chip 5–6px, control 9px, inset 11–12px, card 14–16px, overlay card 18px, bottom sheet 26px top |
| Spacing | gaps 8/10/12/14/16/18px; card padding 15–20px; control padding 9px 12–14px; chrome padding 0 22px; main padding 26px |
| Patterns | status = 3px coloured left border on a card; insight confidence in mono at the top right; scrim `rgba(6,7,16,.72)`; no blur anywhere |

### Visual QA findings (2026-10-01)

Evidence: artifact frames 12, 15, 16 and 19 compared with the `advisor-settings.spec.ts` screenshots (20 tests passed at 1440 and 390, light theme, which is the Playwright default) and with the component source.

Blockers (fix before calling the advisor UI design-aligned):

1. **Advisor panel content is a form, not the frame 15 layer.** `AdvisorConversation.tsx` stacks provider, period, question-kind and history selects, an evidence checkbox and a textarea. Frame 15 shows a header (30px gradient tile, "Doradca", mono "CZYTA: <view>, <period>", Esc), insight cards and suggestion chips, then one ask field pinned to the bottom with a provenance line. Fix: show provider and period as the mono context line with a "Zmień" control; pin the textarea and Send to the bottom (`mt-auto`); move history behind a ghost button; keep the evidence checkbox as one line under the field.
2. **`<summary className="flex …">` removes the disclosure marker.** "Inni dostawcy API" in `AdvisorProviderChoice.tsx`, and calculations, evidence and sources in `AdvisorAnswerCard.tsx`, look like plain text with no expand cue. Fix: add a chevron icon that rotates on `[open]`, or drop `flex` and keep `list-item`.
3. **Full-page screenshots crop to the viewport.** The provider-connection screenshots are 1000/844px tall because the shell scrolls inside `main`, so visual QA cannot see steps 1–2. Fix in `advisor-settings.spec.ts`: screenshot the `section` locator, or scroll it into view in steps. Also add one `colorScheme: 'dark'` pass, because the design exists only in dark.
4. **Settings → Doradca has no design frame** (see the gap list below). Treat sections 3–4 as provisional visual design until Claude Design covers them.

Polish:

| # | Where | Deviation | Fix |
|---|---|---|---|
| P1 | `atoms/Badge.tsx` | Chips are mixed case, 28px tall with 12px padding; the design chip is uppercase mono 10px, padding 4×8px, radius 5px | Add `uppercase`, `min-h-0 px-2 py-1`; chips are not targets, so 44px does not apply |
| P2 | `molecules/Banner.tsx` (`info`) | Billing and host disclosures are grey filled blocks; the design's notices are a `#10132a` card with a 3px coloured left border | `info`: `bg-surface-raised border-l-[3px] border-l-primary`; `warning`: left border `warning-ink` |
| P3 | `AdvisorConnectors.tsx` host and environment radios | Native browser-blue radios | `accent-[var(--primary)]`, as in `AdvisorProviderChoice` |
| P4 | `AdvisorReadinessSummary.tsx` | Chip column; the design's status row is "label · mono coloured status · right-aligned action" (frame 12, "Connection ONLINE · 118 MS · Test now") | Render the status as mono text in the status colour, and put "Sprawdź połączenie" or "Przejdź do kroku" on the right |
| P5 | Step headings in `AdvisorProviderConnection` / `AdvisorConnectors` | The step numbers in sections 3.4 and 4.3 ("1 Gdzie działa model") are missing | Prefix them with a mono eyebrow "KROK 1/3" |
| P6 | `AdvisorAnswerCard.tsx` | The short answer is a heading on the card; the calculation is hidden in `<details>` | Use a success-tinted block (`rgba(88,207,154,.09)`, border .26, radius 14) with the mono eyebrow "KRÓTKA ODPOWIEDŹ"; show up to 3 figure tiles and the breakdown table open; keep evidence and sources behind a "Pokaż źródła" button |
| P7 | `atoms/NativeDialog.tsx` bottom sheet | Radius 16px and no grabber; the design sheet has radius 26px at the top, a primary .34 top border and a 40×4px grabber | Add these only when `bottomSheet` is set |
| P8 | `AdvisorWorkspace.tsx` docked aside | Plain `h2` title; the design header has a 30px gradient tile and a mono context line | Reuse the header pattern from frame 15 |
| P9 | Settings shell (`SettingsWorkspace.tsx`) | KPI tiles and a second 200px section column; frame 12 puts SECTIONS in the 226px rail under Settings, and the page title is the section name with a mono eyebrow | Out of advisor scope; track with the Aurora redesign plan |
| P10 | Mobile app header (shell) | About 155px tall, with the tagline and company select stacked; frame 14/19 uses one ~56px row (logo, short company name, TEST chip) | Shell work, tracked in `mobile-first-remediation.md` |
| P11 | Buttons | `text-sm` (14px) against 12.5–13.5px in the design | Keep 14px for legibility; this is an intentional deviation |

Intentional deviations (keep): the artifact's KSeF token row shows a masked tail ("•••• 4F2A · Replace"). Invariant I7 forbids that for API keys, so after save the key field stays empty with the helper text. Light theme, 44px targets and contrast-corrected muted text are our additions, not design drift. Proactive insights, inline strips (frame 17) and the briefing page (frame 18) are out of the current release scope (see the [tax advisor specification](tax-advisor.md)).

### Design gaps to draw in Claude Design before implementation can match

1. **Settings → Doradca entry**: its place in the frame 12 SECTIONS list, and the page header (eyebrow and title).
2. **Mode switch A/B**: the design has only the compact TEST/PROD segmented pill. Decide between a pill and two cards with a status line.
3. **Mode A, provider setup**: provider cards (OpenRouter, Ollama, plus OpenAI API and Anthropic API collapsed), billing disclosure, key field (saved and empty states), model field with discovery count, save, and the read-only Ollama operator row.
4. **Mode A, verification**: readiness rows (policy · server · my connection), the paid test with its cost note, tested and failed states, and disconnect.
5. **Mode B, connector**: host choice (ChatGPT/Claude), grant scope (company, environment, expiry, consent), MCP address with copy, host steps with verification badges, the grants list (waiting, active, expiring, expired, revoked) and revoke.
6. **Company policy card** (admin only): allowed providers and connectors.
7. **Dialogs**: disconnect and revoke confirmations, on desktop and as a mobile bottom sheet. The artifact has only the answer overlay and the advisor sheet.
8. **Advisor states**: not configured (panel, sheet, answer), loading or thinking, empty history, provider error, and policy blocked. None are drawn.
9. **Light theme** for all of the above, or a decision that the advisor is dark-only.
10. **Return-to-invoice banner** (section 4.5) and the mobile 390 versions of items 1–8.

## 1. Product invariants

These rules override any layout or copy decision below.

| # | Invariant | Design consequence |
|---|---|---|
| I1 | A ChatGPT or Claude subscription is never an embedded API credential | Mode B has no key field, no model picker, and no "use my subscription here" control. Mode A never mentions subscriptions except to say they do not apply |
| I2 | No label promises subscription billing inside the application | Mode B is named after *where the conversation happens* ("Rozmowa w ChatGPT lub Claude"), not after billing |
| I3 | API billing is separate from ChatGPT/Claude plans | Mode A shows a persistent billing disclosure next to provider choice and before the first save |
| I4 | The host product owns conversation storage and answer wording | Mode B shows a persistent host-ownership disclosure above the grant controls |
| I5 | Provider connection belongs to the user's company membership and applies to TEST and PRODUCTION | Mode A shows a scope line ("Dotyczy Twojego konta w firmie X · TEST i PRODUKCJA") and never renders an environment selector |
| I6 | Ollama endpoint is operator-controlled | No URL input anywhere; the endpoint is a read-only status row |
| I7 | Secrets are never shown after save | After save the key field is empty with "Klucz zapisany" helper text; no reveal, no masked tail, no copy |
| I8 | Discovery and the paid test are different operations | Different buttons, different labels, different success/error copy; the test is never triggered automatically |
| I9 | Connector access is read-only and scoped to company + environment + expiry | Mode B grant form always shows all three before the grant button is enabled |

## 2. Information architecture

`SettingsWorkspace` already renders the **Doradca** section. Inside it, the advisor area becomes:

```mermaid
flowchart TD
  Section[Settings → Doradca] --> Policy[Company policy · ADMIN only]
  Section --> Modes[Mode switch]
  Modes --> ModeA[A · Doradca w Księgowym Vibe]
  Modes --> ModeB[B · Rozmowa w ChatGPT lub Claude]
  ModeA --> StatusA[Readiness summary: policy · server · my connection]
  ModeA --> Provider[1 · Provider choice]
  ModeA --> Configure[2 · Key and model]
  ModeA --> Verify[3 · Saved state, paid test, disconnect]
  ModeB --> StatusB[Readiness summary: policy · connector server · my grants]
  ModeB --> Host[1 · Host choice: ChatGPT or Claude]
  ModeB --> Grant[2 · Grant scope: company, environment, expiry]
  ModeB --> AddConnector[3 · Add connector in host]
  ModeB --> Grants[4 · Active grants and revoke]
```

- **Company policy** stays a separate card, visible only when `canManagePolicy` is true. Members see its *result* in each mode's readiness summary, not the editor.
- **Mode switch** is a two-option control using the same `aria-pressed` button pattern as `SettingsWorkspace` (not a tablist; the two views are independent forms). Both modes can be configured at the same time; the switch only changes which view is visible. Each option shows a one-line status so users see the other mode's state without switching.
- Default mode on first visit: A. After that, remember the last mode per viewer in `localStorage` (convenience only, wrapped in try/catch; absence must not break rendering).

## 3. Mode A — Doradca w Księgowym Vibe (API billing)

### 3.1 Flow

```mermaid
flowchart TD
  Open[Open mode A] --> Load{Settings loaded?}
  Load -- Loading --> Skeleton[Readiness skeleton, announce loading]
  Load -- Failed --> LoadError[Error banner with Retry]
  Load -- Yes --> Choose[Choose provider card]
  Choose --> Allowed{Provider allowed by company?}
  Allowed -- No --> Denied[Card shows Not allowed; ADMIN action; setup stays possible, test and use blocked]
  Allowed -- Yes --> Kind{Provider kind}
  Denied --> Kind
  Kind -- OpenRouter / OpenAI API / Anthropic API --> Key[Enter API key]
  Key --> Discover[Fetch models with transient key]
  Kind -- Ollama --> Endpoint{Operator endpoint configured?}
  Endpoint -- No --> OperatorHelp[Operator instructions; no Save]
  Endpoint -- Yes --> DiscoverOllama[Fetch models from server]
  Discover --> Catalog{Catalog result}
  DiscoverOllama --> Catalog
  Catalog -- Loading --> Progress[Announce progress; keep entered values]
  Catalog -- Failed --> CatalogError[Auth or network error; allow manual model ID]
  Catalog -- Empty --> CatalogEmpty[No models; Ollama: operator installs a model]
  Catalog -- Models --> Pick[Choose model ID]
  CatalogError --> Pick
  Pick --> Save[Save connection]
  Save --> Saved[Saved — not tested]
  Saved --> Runtime{Operator runtime enabled?}
  Runtime -- No --> RuntimeBlocked[Test blocked: operator must enable ADVISOR_ENABLED]
  Runtime -- Yes --> TestChoice[User explicitly chooses paid test]
  TestChoice --> Testing[Test running]
  Testing -- Pass --> Tested[Tested: model and time; ready if policy allows]
  Testing -- Fail --> TestFailed[Keep draft; actionable reason]
  Tested --> Disconnect[Disconnect with confirmation]
  Saved --> Disconnect
```

Model discovery before save depends on the preview route described in the plan (transient key, rate-limited, never persisted or logged). Until that route exists the design falls back to manual model ID entry with the same layout; discovery appears only after save, labelled "Odśwież listę modeli".

### 3.2 Connection state model

```mermaid
stateDiagram-v2
  [*] --> NotConfigured
  NotConfigured --> Draft: key or model entered
  Draft --> Draft: models fetched / fetch failed
  Draft --> SavedNotTested: save succeeded
  SavedNotTested --> Testing: user starts paid test
  Testing --> Tested: test passed
  Testing --> SavedNotTested: test failed (reason shown)
  Tested --> SavedNotTested: key or model changed and saved
  SavedNotTested --> NotConfigured: disconnect
  Tested --> NotConfigured: disconnect
```

`Tested` is "ready" only when `operatorEnabled`, `enabled` and `allowedProviders` include the provider. Readiness is computed, not stored. Saving resets `testedAt` on the server, which matches `Tested → SavedNotTested`.

### 3.3 Provider cards

Native radio inputs inside a `fieldset` (one radio group, arrow-key navigation for free). OpenRouter and Ollama are shown first as large cards; OpenAI API and Anthropic API sit under a native `<details>` "Inni dostawcy API" that opens automatically when one of them already has a saved connection.

| Provider | Run location line | Billing line | Needs | Card status chip |
|---|---|---|---|---|
| OpenRouter | Chmura · OpenRouter kieruje zapytanie do wybranego modelu | Rozliczenie w Twoim koncie OpenRouter | Klucz API | Allowed / Not allowed + Saved / Tested |
| Ollama | Serwer operatora · sieć API Księgowego Vibe | Bez klucza; koszt infrastruktury operatora | Brak klucza | Endpoint configured / not configured + Saved / Tested |
| OpenAI API | Chmura · OpenAI | Rozliczenie API OpenAI, osobne od ChatGPT | Klucz API | as above |
| Anthropic API | Chmura · Anthropic | Rozliczenie Claude Console, osobne od planu Claude | Klucz API | as above |

The label for `ANTHROPIC` changes from "Claude API" to "Anthropic API" so it cannot be confused with a Claude subscription (I1, I2). The Claude model family is named in the card body, not the label.

### 3.4 Desktop layout — 1440px

Frame: 226px rail, main pane padding 26px, settings nav 200px + 16px gap → settings content column ≈ 946px. With the 400px advisor dock open the column drops to ≈ 546px and uses the mobile stacking rules below.

```text
┌ Doradca ─────────────────────────────────────────────────────────────── 946px ┐
│ [ A · W Księgowym Vibe   Gotowe ✓ ]  [ B · W ChatGPT lub Claude   Brak zgody ] │  mode switch, 44px
│                                                                              │
│ ┌ Gotowość (Surface inset, 3 rows) ───────────────────────────────────────┐  │
│ │ Zgoda firmy        [DOZWOLONY]   OpenRouter, Ollama                      │  │
│ │ Serwer doradcy     [WYŁĄCZONY]   Operator musi ustawić ADVISOR_ENABLED   │  │
│ │ Moje połączenie    [ZAPISANE]    OpenRouter · model · nie przetestowano  │  │
│ └──────────────────────────────────────────────────────────────────────────┘  │
│ Dotyczy Twojego konta w firmie „Acme sp. z o.o.” · TEST i PRODUKCJA           │  caption, muted
│                                                                              │
│ 1 Gdzie działa model                                                         │  card-title
│ ┌ ( ) OpenRouter ─────────────────┐  ┌ ( ) Ollama ─────────────────────────┐ │  2 cols, 16px gap
│ │ Chmura · klucz API               │  │ Serwer operatora · bez klucza       │ │
│ │ Rozliczenie w koncie OpenRouter  │  │ Endpoint: skonfigurowany            │ │
│ │ [DOZWOLONY] [ZAPISANE]           │  │ [NIEDOZWOLONY]                      │ │
│ └──────────────────────────────────┘  └─────────────────────────────────────┘ │
│ ▸ Inni dostawcy API (OpenAI API, Anthropic API)                              │  <details>
│ ┃ Odpowiedzi w Księgowym Vibe są rozliczane przez dostawcę API. Abonament    │  info banner
│ ┃ ChatGPT lub Claude ich nie obejmuje.                                       │
│                                                                              │
│ 2 Klucz i model                                                              │
│ Klucz API OpenRouter                                                         │
│ [••••••••••••••••••••••••••••••••••]                     max 560px field     │
│ Klucz zapisany — wpisz nowy tylko, aby go zastąpić.                          │
│ Model                                                                        │
│ [openai/gpt-…  (search / type)          ▾]   [Pobierz listę modeli]          │
│ 124 modele · Pobranie listy nie wysyła pytania do modelu.                    │
│ [Zapisz połączenie]                                                          │  primary, md
│                                                                              │
│ 3 Sprawdzenie                                                                │
│ [ZAPISANE — NIE PRZETESTOWANE]  openai/gpt-…                                 │
│ Test wysyła przykładowe pytanie bez danych firmy i może naliczyć koszt API.  │
│ [Sprawdź połączenie (płatne żądanie)]                       [Odłącz]         │  secondary · danger, separated
└──────────────────────────────────────────────────────────────────────────────┘
```

Rules: provider cards in a 2-column grid when the content column is ≥ 640px (use `md:` only when the settings nav is stacked; at `lg` with the nav beside, the column is wide enough). Field and action row max width 560px for readable line length. The destructive action is right-aligned and separated from the test action by at least 24px.

### 3.5 Mobile layout — 390px

16px side margins → 358px content. Settings section nav wraps above the panel (existing behaviour). Bottom navigation (90px + safe area) is already reserved by the shell.

```text
┌ 390 ──────────────────────────────┐
│ Doradca                           │
│ ┌───────────────┬───────────────┐ │  mode switch, 2 equal buttons, 44px min
│ │ W Księgowym   │ W ChatGPT     │ │
│ │ Vibe · Gotowe │ lub Claude    │ │
│ └───────────────┴───────────────┘ │
│ ┌ Gotowość ─────────────────────┐ │  rows stack: label / chip / reason
│ │ Zgoda firmy      [DOZWOLONY]  │ │
│ │ Serwer doradcy   [WYŁĄCZONY]  │ │
│ │  Operator musi włączyć…       │ │
│ │ Moje połączenie  [ZAPISANE]   │ │
│ └───────────────────────────────┘ │
│ TEST i PRODUKCJA · Twoje konto    │
│ 1 Gdzie działa model              │
│ ┌ ( ) OpenRouter ───────────────┐ │  full width cards, 1 column
│ └───────────────────────────────┘ │
│ ┌ ( ) Ollama ───────────────────┐ │
│ └───────────────────────────────┘ │
│ ▸ Inni dostawcy API               │
│ ┃ Rozliczenie API osobno …        │
│ 2 Klucz i model                   │
│ [ klucz ••••••••••••••••••• ]     │  full width, 44px
│ [ model                    ▾ ]    │
│ [   Pobierz listę modeli     ]    │  full width secondary
│ [     Zapisz połączenie      ]    │  full width primary, last in step
│ 3 Sprawdzenie                     │
│ [ZAPISANE — NIE PRZETESTOWANE]    │
│ [ Sprawdź połączenie (płatne) ]   │  full width secondary
│                                   │  24px gap
│ [          Odłącz             ]   │  full width danger, last
├───────────────────────────────────┤
│  bottom navigation (shell)        │
└───────────────────────────────────┘
```

No sticky action bar: the shell's bottom navigation already owns the thumb zone, and the virtual keyboard would cover a sticky bar while the key field is focused. Each step ends with its primary action, so scrolling to the end of a step brings that action into the lower third. No horizontal scrolling; long model IDs wrap with `break-all` in IBM Plex Mono.

### 3.6 Ollama variant

The key field is replaced by a read-only status row; no URL is ever displayed or editable for members (the operator variable name is shown, not its value).

```text
Serwer Ollama        [SKONFIGUROWANY]  Osiągalność: nie sprawdzono
[Pobierz modele z serwera]
Model                [llama3.1:8b …              ▾]
Klucz nie jest potrzebny. Serwer API musi mieć dostęp do Ollama; „localhost”
oznacza serwer API, nie Twój komputer. Koszt infrastruktury ponosi operator.
[Zapisz model]
```

## 4. Mode B — Rozmowa w ChatGPT lub Claude (read-only connector)

All host-specific content in this section is **[P]** until TRY-173.

### 4.1 Flow

```mermaid
flowchart TD
  Open[Open mode B] --> Endpoint{Operator connector configured?}
  Endpoint -- No --> Unavailable[Connector unavailable; operator instructions]
  Endpoint -- Yes --> Host[Choose ChatGPT or Claude]
  Host --> Policy{Host allowed by company?}
  Policy -- No --> AdminAsk[ADMIN must allow this host; grant disabled]
  Policy -- Yes --> Scope[Confirm company, choose environment and expiry]
  Scope --> Consent[Read-only consent checkbox]
  Consent --> GrantAction[Grant access]
  GrantAction --> Granted[Granted: expiry shown]
  Granted --> Copy[Copy MCP URL]
  Copy --> HostSteps[Follow host steps; sign in inside host]
  HostSteps --> Waiting[Waiting for first host call]
  Waiting --> Active[Active: last host call shown]
  Waiting --> Troubleshoot[No call yet: eligibility, admin approval, HTTPS reachability]
  Active --> Cite[Host answer cites invoice link]
  Cite --> Return[Open invoice in Księgowy Vibe; environment check]
  Granted --> Revoke[Revoke with confirmation]
  Active --> Revoke
  Revoke --> Revoked[Revoked: next host call fails]
  Granted --> Expired[Expired: grant again]
```

### 4.2 Grant state model

```mermaid
stateDiagram-v2
  [*] --> NotGranted
  NotGranted --> Granted: grant
  Granted --> Active: first authorised host call
  Granted --> Revoked: revoke
  Active --> Revoked: revoke
  Granted --> Expired: expiry passes
  Active --> Expired: expiry passes
  Revoked --> Granted: grant again
  Expired --> Granted: grant again
```

One grant exists per membership × environment × host. The grants list therefore has at most four rows (2 hosts × TEST/PRODUCTION).

### 4.3 Desktop layout — 1440px

```text
┌ Doradca ─────────────────────────────────────────────────────────────── 946px ┐
│ [ A · W Księgowym Vibe   Gotowe ]  [ B · W ChatGPT lub Claude   1 aktywna ✓ ] │
│ ┌ Gotowość ────────────────────────────────────────────────────────────────┐ │
│ │ Zgoda firmy          [DOZWOLONY]  ChatGPT · [NIEDOZWOLONY] Claude        │ │
│ │ Serwer konektora     [GOTOWY]     Publiczny adres HTTPS skonfigurowany   │ │
│ │ Moje zgody           [AKTYWNA]    ChatGPT · TEST · do 31.10.2026         │ │
│ └──────────────────────────────────────────────────────────────────────────┘ │
│ ┃ Rozmowa odbywa się w ChatGPT lub Claude. To ta aplikacja przechowuje        │  info banner (I4)
│ ┃ historię i formułuje odpowiedzi. Księgowy Vibe udostępnia tylko odczyt      │
│ ┃ wybranych danych i nie otrzymuje hasła ani tokenu Twojego konta.            │
│ ┃ Abonament nie opłaca odpowiedzi doradcy w Księgowym Vibe.                   │
│                                                                              │
│ 1 Aplikacja       ( ) ChatGPT   ( ) Claude                                   │  radio cards, 2 cols
│                                                                              │
│ 2 Zakres dostępu                                                             │
│ Firma           Acme sp. z o.o. (bieżąca firma)                              │  read-only
│ Środowisko      ( ) TEST   ( ) PRODUKCJA                                     │  radio; PRODUKCJA uses danger chip
│ Ważność         ( ) 7 dni  ( ) 30 dni                                        │
│ [ ] Zezwalam ChatGPT na odczyt kwot i numerów dokumentów tej firmy w         │
│     środowisku TEST przez 7 dni. Zgoda nie obejmuje zmiany dokumentów.       │  text reflects choices
│ [Zezwól na odczyt]                                                           │  primary
│                                                                              │
│ 3 Dodaj konektor w ChatGPT                       [P]                         │
│ Adres konektora (MCP)                                                        │
│ [https://api.example.pl/advisor/mcp                    ] [Kopiuj adres]      │  read-only mono field
│ 1. Otwórz ustawienia ChatGPT → Aplikacje i konektory …                        │  ordered list
│ 2. Włącz tryb deweloperski, jeśli wymaga tego Twój plan …                    │
│ 3. Utwórz konektor, wklej adres, wybierz logowanie OAuth.                    │
│ 4. Zaloguj się kontem Księgowego Vibe w oknie, które otworzy ChatGPT.        │
│ ▸ Ograniczenia konta i administratora                                        │  <details>
│ ▸ Instalacja własna: wymagany publiczny HTTPS                                │  <details>
│ [Otwórz ChatGPT ↗]                                                           │  secondary, new tab
│                                                                              │
│ 4 Moje zgody                                                                 │
│ Aplikacja   Środowisko   Stan                  Ważna do        Akcja         │  table, 44px rows
│ ChatGPT     TEST         [OCZEKUJE NA 1. UŻYCIE]  31.10.2026   [Cofnij]      │
│ Claude      PRODUKCJA    [WYGASŁA]             01.09.2026      [Zezwól ponownie] │
│                                                                              │
│ Powrót do dokumentu: odpowiedzi w ChatGPT zawierają link do faktury. Link    │  caption
│ otwiera ją tutaj po zalogowaniu, w środowisku, którego dotyczy zgoda.         │
└──────────────────────────────────────────────────────────────────────────────┘
```

### 4.4 Mobile layout — 390px

Same order, one column. The MCP URL field and **Kopiuj adres** stack (field full width, button full width below). The grants table becomes a list of inset cards: host + environment chip on line 1, state chip + expiry on line 2, full-width action on line 3. **Otwórz ChatGPT / Claude** is full width at the end of step 3. Revoke is the last control of each grant card. On mobile, ChatGPT and Claude apps may intercept the link; the copy explains that the connector is added in settings, which on some plans is only available on the web **[P]**.

### 4.5 Return to a cited invoice

When the host shows a cited record, the link points to the existing invoice or incoming-document page. On arrival:

| Condition | UI |
|---|---|
| Signed in, same company and environment | Normal document page; no extra banner |
| Signed in, different environment selected | Warning banner: "Ten dokument pochodzi ze środowiska {environment}. [Przełącz na {environment}]" — explicit switch, never automatic (secure switching contract in `mobile-first-remediation.md`) |
| Signed in, different company selected | Warning banner with explicit **Przełącz firmę** action; no document data rendered until switched |
| Not signed in | Existing sign-in, then return to the link |
| No access / document removed | Existing not-found state; no confirmation that the document exists |

Whether tool results carry absolute application URLs is an open question for TRY-173 and the API (§10).

## 5. Per-state UI table

Chip text uses `Badge` (IBM Plex Mono 10px, uppercase). "Announce" lists the live-region politeness.

### 5.1 Shared and mode A

| State | Trigger (data) | Chip / tone | Visible message | Actions enabled | Announce |
|---|---|---|---|---|---|
| Settings loading | `settings === null`, no error | — | Skeleton rows in readiness card (opaque `surface-raised` bars, no shimmer under reduced motion) | None | polite "Wczytuję ustawienia doradcy" |
| Settings failed | request error | `danger` | `ErrorState` with error text | Spróbuj ponownie | assertive |
| Policy disabled (company) | `enabled === false` | NIEAKTYWNY · `draft` | "Administrator firmy musi włączyć doradcę." ADMIN sees link to policy card | Setup allowed; test and use disabled | — |
| Provider denied | provider ∉ `allowedProviders` | NIEDOZWOLONY · `danger` | "Administrator musi zezwolić na {provider}. Zapisanie klucza nie zmienia zgody firmy." | Save allowed; test disabled with reason | — |
| Operator runtime disabled | `operatorEnabled === false` | WYŁĄCZONY · `warning` | Operator text with `ADVISOR_ENABLED` and restart | Save allowed; discovery after save, test and chat disabled | — |
| No provider chosen | first visit | — | Step 2/3 collapsed with hint "Wybierz dostawcę" | Provider radios | — |
| Ollama not configured | `ollamaAvailable === false` | BRAK SERWERA · `draft` | Operator must set `ADVISOR_OLLAMA_URL` and network access | No Save rendered; radio still selectable to read instructions | — |
| Ollama unreachable | discovery error `OLLAMA_UNREACHABLE` (new) | NIEOSIĄGALNY · `danger` | "Serwer API nie łączy się z Ollama. Naprawić może tylko operator (sieć, adres, zapora)." | Ponów | assertive |
| Ollama no models | discovery returns `[]` | BRAK MODELI · `warning` | "Na serwerze Ollama nie ma zainstalowanych modeli. Operator musi pobrać model." | Ponów; Save disabled | polite |
| Catalog loading | discovery pending | — | Button shows spinner + "Pobieram listę…"; entered key/model preserved | Other inputs remain editable; button disabled | polite |
| Catalog failed (auth) | `CREDENTIAL_INVALID` / 401 | — | Field error under key: "Dostawca odrzucił klucz. Sprawdź, czy jest aktywny." | Ponów; manual model entry | assertive |
| Catalog failed (network/rate) | `PROVIDER_ERROR` / `RATE_LIMITED` | — | Inline warning; manual model ID still possible | Ponów | assertive |
| Catalog empty (cloud) | `[]` | — | "Dostawca nie zwrócił modeli dla tego klucza. Wpisz identyfikator ręcznie." | Manual entry | polite |
| Catalog loaded | list | — | "{count} modeli" + hint about JSON Schema support | Choose/search | polite count |
| Saving | PUT pending | — | Primary button busy | All controls disabled in step 2 | — |
| Saved, not tested | connection, `testedAt === null` | ZAPISANE — NIE PRZETESTOWANE · `warning` | Model ID + cost disclosure | Test (if runtime and policy allow), Disconnect | polite "Zapisano połączenie" |
| Test running | POST test pending | SPRAWDZANIE · `primary` | "Wysłano przykładowe pytanie…" | Test disabled; page can be left; no auto retry | polite |
| Tested | `testedAt` set | PRZETESTOWANE · `success` | "{provider} · {model} · {date time}". "Gotowe do pytań" only when policy and runtime allow | Retest, Disconnect | polite |
| Test failed | test error | BŁĄD TESTU · `danger` | Reason mapped from error code (key, quota, reachability, unsupported structured output); model and key state kept | Retest, change model | assertive |
| Disconnect confirm | Disconnect pressed | — | `NativeDialog`: what is deleted (key, model, test result), history remains | Odłącz · Anuluj (focus on Anuluj) | dialog title |
| Disconnected | DELETE done | NIESKONFIGUROWANE · `draft` | "Odłączono {provider}. Historia rozmów pozostaje." | Configure again | polite |
| Migration missing | `ADVISOR_MIGRATION_REQUIRED` | — | Existing error copy | None | assertive |

### 5.2 Mode B

| State | Trigger (data) | Chip / tone | Visible message | Actions enabled | Announce |
|---|---|---|---|---|---|
| Connectors loading | `/connectors` pending | — | Skeleton for grants list | None | polite |
| Connector server not configured | `endpoint === null` | NIEDOSTĘPNY · `draft` | Operator must configure OAuth server and public HTTPS address | None in steps 2–4 | — |
| Host not allowed | client ∉ `allowedConnectors` or policy disabled | NIEDOZWOLONY · `danger` | "Administrator firmy musi zezwolić na {host}." | Grant disabled with reason (`aria-describedby`) | — |
| Not granted | no grant for host × environment | BRAK ZGODY · `draft` | Steps 3 hidden until grant exists; URL still visible read-only for admins planning setup | Grant (after consent) | — |
| Granting | PUT pending | — | Button busy | Disabled | — |
| Granted, waiting for first host call | grant exists, no recorded use **[P — needs API field]** | OCZEKUJE NA 1. UŻYCIE · `warning` | Steps 3 visible, troubleshooting `<details>` opened | Copy, Open host, Revoke | polite "Udzielono zgody do {date}" |
| Active | grant with recorded use **[P]** | AKTYWNA · `success` | "Ostatnie użycie: {date time}" | Revoke, extend | — |
| Revoke confirm | Revoke pressed | — | `NativeDialog`: next host request will fail; host keeps its own conversation history | Cofnij zgodę · Anuluj | dialog title |
| Revoked | DELETE done | COFNIĘTA · `draft` (session only) | "Zgoda cofnięta. {host} nie odczyta już danych. Historię rozmowy usuń w {host}." | Grant again | polite |
| Expired | grant past `expiresAt` **[P — API hides expired grants]** | WYGASŁA · `draft` | "Zgoda wygasła {date}." | Zezwól ponownie | — |
| Expiring soon | `expiresAt` within 3 days | WYGASA WKRÓTCE · `warning` | "Wygasa {date}." | Przedłuż (re-grant) | — |
| Copy succeeded | clipboard write resolved | — | Button text becomes "Skopiowano" for 2s | — | polite "Skopiowano adres konektora" |
| Copy failed / unsupported | clipboard rejected | — | Field auto-selects text; hint "Skopiuj ręcznie" | — | polite |

## 6. Component inventory

All mapped to existing components; no new tokens. "New composition" means a component built only from existing atoms, owned by the advisor feature folder.

| UI element | Existing component / pattern | Notes |
|---|---|---|
| Section and step cards | `Surface` tone `panel`; inner wells tone `inset` | Step heading `card-title` 14px/600 |
| Mode switch | `SettingsWorkspace` `aria-pressed` button pattern | Two buttons, `min-h-11`, active uses `bg-foreground/5` like settings nav |
| Readiness summary | `Surface` inset + `Badge` | New composition `AdvisorReadinessSummary`; rows are a `dl` |
| Status chips | `Badge` tones `draft`, `primary`, `success`, `warning`, `danger` | Do not invent tones; environment uses `InvoiceEnvironmentChip` mapping |
| Provider / host cards | Native `input type="radio"` inside `label` styled with `Surface` inset, `rounded-card` | Selected: `border-primary`; focus ring `outline-primary` 2px offset |
| Other API providers | Native `<details>/<summary>` | `summary` `min-h-11` |
| Disclosures (billing, host ownership, scope) | `Banner` tone `info` (role `status`), not live-updated | Static text; avoid repeated announcements by rendering without live region changes |
| Operator / admin blockers | `Banner` tone `warning` | role `alert` only when it appears after an action |
| Key field | `FormField` + `Input type="password"` | `autoComplete="off"`, `spellCheck={false}`, `autoCapitalize="none"`, no reveal toggle after save |
| Model picker | `FormField` + `Input` with native `datalist` | Keeps manual entry; count in hint text |
| MCP URL | `FormField` + read-only `Input` (mono) + `Button` secondary "Kopiuj adres" | `navigator.clipboard.writeText`, select-on-focus fallback |
| Host instructions | Ordered list inside `Surface` inset | Content from translations, marked [P] |
| Grants list | Table on desktop (`IncomingInvoicesTable` row style, 44px rows); inset cards on mobile | At most 4 rows |
| Buttons | `Button` variants: `primary` (save, grant), `secondary` (fetch models, test, copy, open host), `danger` (disconnect, revoke), `ghost` (retry) | `loading` prop for busy state |
| Confirmations | `NativeDialog` | Focus starts on cancel (`data-dialog-cancel`) |
| Load / empty / error | Skeleton built from `Surface` inset bars; `EmptyState`; `ErrorState` | Loading and empty are required for the catalog and grants list |
| Environment selection | Native radios; labels "TEST" / "PRODUKCJA" with existing chip tones | Mode B only (I5) |

## 7. Microcopy

Keys are English and extend `advisorText` in `apps/web/src/lib/advisor-translations.ts`. "Changed" marks an existing key whose text must change.

### 7.1 Shared

| Key | Polish | Note |
|---|---|---|
| `modeEmbedded` | Doradca w Księgowym Vibe | replaces `inAppMode` |
| `modeEmbeddedDescription` | Odpowiedzi powstają w tej aplikacji. Wymagają klucza API OpenRouter, OpenAI lub Anthropic albo modelu Ollama udostępnionego przez operatora. | replaces `inAppModeDescription` (adds Ollama) |
| `modeExternal` | Rozmowa w ChatGPT lub Claude | replaces `subscriptionMode`; names location, not billing (I2) |
| `modeExternalDescription` | Rozmawiasz w ChatGPT lub Claude na swoim koncie. Księgowy Vibe udostępnia tylko odczyt wybranych danych firmy. | replaces `subscriptionModeDescription` |
| `readiness` | Gotowość | |
| `readinessPolicy` | Zgoda firmy | |
| `readinessServer` | Serwer doradcy | |
| `readinessConnection` | Moje połączenie | |
| `readinessConnectorServer` | Serwer konektora | |
| `readinessGrants` | Moje zgody | |
| `loadingSettings` | Wczytuję ustawienia doradcy… | |
| `retry` | Spróbuj ponownie | |
| `policyDisabled` | Administrator firmy musi włączyć doradcę. | |
| `askAdministrator` | Poproś administratora firmy o zgodę. | |

### 7.2 Mode A

| Key | Polish | Note |
|---|---|---|
| `connectionScope` | Dotyczy Twojego konta w firmie „{company}” — w środowisku TEST i PRODUKCJA. | I5 |
| `billingDisclosure` | Odpowiedzi w Księgowym Vibe rozlicza wybrany dostawca API. Abonament ChatGPT lub Claude ich nie obejmuje. | I3 |
| `stepProvider` | Gdzie działa model | |
| `stepKeyAndModel` | Klucz i model | |
| `stepVerify` | Sprawdzenie | |
| `otherProviders` | Inni dostawcy API | |
| `providers.ANTHROPIC` | Anthropic API | Changed from "Claude API" |
| `providerOpenRouterLocation` | Chmura · OpenRouter przekazuje zapytanie do wybranego modelu | |
| `providerOpenRouterBilling` | Rozliczenie w Twoim koncie OpenRouter | |
| `providerOpenAiBilling` | Rozliczenie API OpenAI — osobne od abonamentu ChatGPT | |
| `providerAnthropicBilling` | Rozliczenie w Claude Console — osobne od planu Claude | |
| `providerOllamaLocation` | Serwer operatora · sieć serwera API | |
| `providerOllamaBilling` | Bez klucza API. Koszt infrastruktury ponosi operator. | |
| `providerAllowed` | Dozwolony | chip |
| `providerDenied` | Niedozwolony | chip |
| `providerDeniedDescription` | Administrator musi zezwolić na {provider}. Zapisanie klucza nie zmienia zgody firmy. | |
| `credential` | Klucz API {provider} | Changed: includes provider |
| `credentialSaved` | Klucz zapisany. Wpisz nowy tylko, aby go zastąpić. | Changed; helper text, not placeholder |
| `fetchModels` | Pobierz listę modeli | replaces `models` |
| `refreshModels` | Odśwież listę modeli | after save |
| `fetchModelsHint` | Pobranie listy nie wysyła pytania do modelu. | I8 |
| `fetchingModels` | Pobieram listę modeli… | |
| `modelCount` | Dostępne modele: {count} | |
| `modelHint` | Wybierz model obsługujący odpowiedzi JSON ze schematem. Możesz też wpisać identyfikator ręcznie. | Changed |
| `catalogEmpty` | Dostawca nie zwrócił modeli dla tego klucza. Wpisz identyfikator ręcznie. | |
| `credentialRejected` | Dostawca odrzucił klucz. Sprawdź, czy jest aktywny i ma środki. | |
| `ollamaEndpoint` | Serwer Ollama | |
| `ollamaConfigured` | Skonfigurowany | chip |
| `ollamaNotConfigured` | Operator nie skonfigurował serwera Ollama (`ADVISOR_OLLAMA_URL`) ani dostępu sieciowego z serwera API. | |
| `ollamaUnreachable` | Serwer API nie łączy się z Ollama. Naprawić to może tylko operator: adres, sieć lub zapora. | |
| `ollamaNoModels` | Na serwerze Ollama nie ma zainstalowanych modeli. Operator musi pobrać model, potem odśwież listę. | |
| `ollama` | Klucz nie jest potrzebny. „localhost” oznacza serwer API, nie Twój komputer. | Changed |
| `fetchServerModels` | Pobierz modele z serwera | |
| `save` | Zapisz połączenie | unchanged |
| `saveModel` | Zapisz model | Ollama |
| `connectionSaved` | Zapisano połączenie. Nie zostało jeszcze sprawdzone. | replaces generic `saved` |
| `savedNotTested` | Zapisane — nie przetestowane | chip |
| `test` | Sprawdź połączenie (płatne żądanie) | Changed |
| `testOllama` | Sprawdź połączenie (zasoby serwera) | |
| `testBilling` | Test wysyła przykładowe pytanie bez danych firmy i może naliczyć koszt API. | Changed |
| `testRunning` | Wysłano przykładowe pytanie… | |
| `testPassed` | Połączenie działa: {provider} · {model} · {dateTime} | |
| `testPassedNotReady` | Połączenie działa, ale pytania są zablokowane: {reason} | |
| `readyForQuestions` | Gotowe do pytań | |
| `testFailed` | Test nie powiódł się. {reason} Zapisany klucz i model pozostają bez zmian. | |
| `testBlockedRuntime` | Test jest niedostępny, dopóki operator nie włączy doradcy na serwerze. | |
| `disconnect` | Odłącz | unchanged |
| `disconnectTitle` | Odłączyć {provider}? | dialog |
| `disconnectBody` | Usuniemy zapisany klucz, model i wynik testu. Historia rozmów pozostanie. | dialog |
| `disconnected` | Odłączono {provider}. | |

### 7.3 Mode B (connector copy is provisional)

| Key | Polish | Note |
|---|---|---|
| `hostOwnership` | Rozmowa odbywa się w {host}. To {host} przechowuje historię i formułuje odpowiedzi — Księgowy Vibe nie sprawdza każdego zdania. | I4 |
| `noSecretsCollected` | Księgowy Vibe nie otrzymuje hasła ani tokenu Twojego konta {host}. | |
| `subscriptionNotEmbedded` | Abonament {host} nie opłaca odpowiedzi doradcy w Księgowym Vibe. | I1/I2 |
| `stepHost` | Aplikacja | |
| `stepScope` | Zakres dostępu | |
| `stepAddConnector` | Dodaj konektor w {host} | |
| `stepGrants` | Moje zgody | |
| `scopeCompany` | Firma | |
| `currentCompany` | {company} (bieżąca firma) | |
| `environment` | Środowisko danych | unchanged |
| `expiry` | Ważność zgody | |
| `expiryDays` | {days} dni | options 7, 30 (API accepts 1–30) |
| `connectorConsent` | Zezwalam {host} na odczyt kwot i numerów dokumentów firmy {company} w środowisku {environment} przez {days} dni. Zgoda nie obejmuje zmiany dokumentów. | Changed; reflects choices |
| `grant` | Zezwól na odczyt | Changed (duration moved to consent text) |
| `granted` | Udzielono zgody do {date}. | |
| `connectorAddress` | Adres konektora (MCP) | Changed |
| `copyAddress` | Kopiuj adres | |
| `copied` | Skopiowano | |
| `copyFallback` | Zaznaczono adres — skopiuj go ręcznie. | |
| `chatGptSteps` | 1. W ChatGPT otwórz Ustawienia → Aplikacje i konektory. 2. Jeśli plan tego wymaga, włącz tryb deweloperski. 3. Utwórz konektor, wklej adres i wybierz logowanie OAuth. 4. Zaloguj się kontem Księgowego Vibe w oknie otwartym przez ChatGPT. | **[P]** TRY-173 |
| `claudeSteps` | 1. W Claude otwórz Ustawienia → Konektory. 2. Wybierz „Dodaj własny konektor” i wklej adres. 3. Połącz i zaloguj się kontem Księgowego Vibe w otwartym oknie. | **[P]** TRY-173 |
| `accountRestrictions` | Ograniczenia konta i administratora | `<summary>` |
| `chatGptRestrictions` | Własne konektory są dostępne tylko w wybranych planach ChatGPT. W kontach firmowych administrator obszaru roboczego musi je dopuścić. | **[P]** |
| `claudeRestrictions` | Własne konektory są dostępne tylko w wybranych planach Claude. W organizacjach właściciel może dodać konektor dla wszystkich lub go zablokować. | **[P]** |
| `selfHostedHttps` | Instalacja własna: wymagany publiczny HTTPS | `<summary>` |
| `selfHostedHttpsBody` | {host} łączy się z konektorem ze swoich serwerów. Adres musi być publiczny, z ważnym certyfikatem HTTPS. Adresy localhost, sieci firmowej i VPN nie zadziałają. | |
| `openHost` | Otwórz {host} | replaces `openSubscription`; opens new tab |
| `opensNewTab` | (otwiera się w nowej karcie) | visually hidden suffix |
| `waitingFirstCall` | Oczekuje na pierwsze użycie | chip **[P]** |
| `waitingFirstCallHelp` | Jeśli {host} nie korzysta z konektora: sprawdź plan i zgodę administratora, adres HTTPS oraz czy logujesz się tym samym kontem Księgowego Vibe. | **[P]** |
| `active` | Aktywna | chip **[P]** |
| `lastUsed` | Ostatnie użycie: {dateTime} | **[P]** |
| `expiresSoon` | Wygasa wkrótce | chip |
| `expired` | Wygasła | chip **[P]** |
| `expiredOn` | Zgoda wygasła {date}. | |
| `grantAgain` | Zezwól ponownie | |
| `revoke` | Cofnij zgodę | unchanged |
| `revokeTitle` | Cofnąć zgodę dla {host}? | dialog |
| `revokeBody` | Następne zapytanie {host} o dane tej firmy zostanie odrzucone. Historię rozmów usuń w {host}. | dialog |
| `revoked` | Zgoda cofnięta. {host} nie odczyta już danych tej firmy. | |
| `connectorUnavailable` | Połączenie z ChatGPT i Claude jest niedostępne: operator musi skonfigurować serwer autoryzacji i publiczny adres HTTPS. | Changed |
| `hostNotAllowed` | Administrator firmy musi zezwolić na {host}. | |
| `returnToDocument` | Odpowiedzi w {host} mogą zawierać link do dokumentu. Otworzy się tutaj, w środowisku objętym zgodą. | **[P]** |
| `documentOtherEnvironment` | Ten dokument pochodzi ze środowiska {environment}. | return banner |
| `switchEnvironment` | Przełącz na {environment} | |
| `switchCompany` | Przełącz firmę | |

Remove `companyIdentifier` ("Identyfikator firmy do rozmowy") from the visible UI: tools receive the company through the grant scope, and a raw identifier invites copy/paste mistakes. Keep it only if TRY-173 shows hosts need it in the prompt.

## 8. Accessibility (WCAG 2.1 AA)

- **Structure:** one `h2` for the Doradca section, `h3` per step. Mode switch buttons use `aria-pressed` and `aria-controls` like `SettingsWorkspace`. Provider/host/environment/expiry choices are native radios in `fieldset` + `legend`.
- **Targets:** every interactive element `min-h-11` (44px); radio cards are entire-label hit areas ≥ 44px tall; 8px minimum gap between adjacent targets, 24px between the paid test and destructive actions.
- **Focus:** after save, move focus to the step 3 status heading; after grant, to the step 3 heading of mode B; after disconnect/revoke, back to the mode's readiness summary. `NativeDialog` restores focus to its trigger on cancel. Focus ring: 2px `--primary` outline with 2px offset (Aurora).
- **Announcements:** one shared polite `role="status"` region per mode for operation results; `role="alert"` only for failures caused by the user's last action. Never announce on every keystroke; catalog count is announced once on load. Do not render static disclosures inside live regions.
- **Disabled controls:** prefer `aria-disabled="true"` with `aria-describedby` pointing to the reason (policy, runtime, consent) so screen-reader users learn why; native `disabled` only while a request is in flight.
- **Key field:** labelled with the provider name, `autoComplete="off"`; helper text linked with `aria-describedby`. Errors use `FormField` `error` (sets `aria-invalid`).
- **External links:** **Otwórz {host}** has a visually hidden "(otwiera się w nowej karcie)" suffix and `rel="noopener noreferrer"`.
- **Copy:** button announces "Skopiowano adres konektora"; fallback selects the field text.
- **Language and units:** dates via `toLocaleString('pl-PL')`; environment names spelled out ("PRODUKCJA"), not colour-only.
- **Motion:** micro-interactions use `transform`/`opacity` only and are disabled under `prefers-reduced-motion: reduce`: a 160ms scale "pop" (1 → 1.04 → 1) on a newly set success chip; a 200ms 4px horizontal shake on the key field when the provider rejects the key. No motion on chip state that changes without user action.
- **Gestures:** no swipe-to-revoke or swipe-to-disconnect; destructive actions always need a visible button and a confirmation dialog.

## 9. Light and dark themes

- Use only existing tokens: `surface-panel` cards, `surface-raised` inset wells, `outline` hairlines, `outline-control` field borders, status `bg-<status>` + `text-<status>-ink` chips, `primary` for selected radio-card border and focus.
- Selected radio card: `border-primary` (≥ 3:1 against card in both themes) plus the checked native radio — never colour alone.
- PRODUKCJA environment uses the existing `danger` chip; TEST uses `warning` (same as `InvoiceEnvironmentChip`).
- Banners: `info` tone for disclosures, `warning` for operator/admin blockers, `error` only for failed actions. No large filled blocks (Aurora rule §1).
- Mono font (IBM Plex Mono) for model IDs, the MCP URL and environment variable names; these wrap with `break-all` on mobile.
- Skeletons use opaque `surface-raised` bars; no shimmer gradient, no blur, no shadow.
- Dark: muted copy uses `--muted` (0.60) minimum; light uses 0.64. Disabled text `foreground-disabled` only on inactive controls.
- Follow system theme via the existing `ThemeSwitcher`; nothing in this design is theme-specific beyond tokens.

## 10. Security alignment (SecOps)

| Concern | Design decision |
|---|---|
| Secret exposure | Key accepted once; never echoed, masked-tail, logged in UI state after save, or stored in browser storage. Field cleared on save, provider change and unmount |
| Transient discovery | "Pobierz listę modeli" sends the typed key to the preview route only; the UI explains it does not send a question. Rate-limit errors are surfaced, not retried automatically |
| Paid action consent | The test is a separate secondary button with cost text; never auto-run after save |
| Arbitrary endpoints | No URL input for Ollama or connectors; endpoint names shown as operator variables |
| Scope clarity | Mode B consent text is generated from the selected host, company, environment and duration; grant button stays disabled until consent is checked for exactly that combination (changing any choice clears consent, as today) |
| Least surprise on return links | Never auto-switch company or environment from a link |
| Revocation | Revoke states that host history is not deleted by Księgowy Vibe |
| Clipboard | Only the public MCP URL is copyable; no secret is ever copyable |

## 11. API dependencies for frontend-architect

| Needed by design | Current API | Gap |
|---|---|---|
| Model discovery before save | `GET /connections/:provider/models` requires saved connection | Planned preview route (transient key, rate-limited) — plan phase 3 |
| Ollama unreachable vs. not configured vs. no models | `ollamaAvailable` (configured only) | Distinct error code for reachability from discovery (e.g. `OLLAMA_UNREACHABLE`) |
| Test failure reason after reload | Only `testedAt` on success | Acceptable: failure shown for the session only; no persistence needed |
| Grant "waiting for first host call" / "active" | Grant has `createdAt`, `expiresAt` | Needs `lastUsedAt` on `AdvisorConnectorGrant`, updated on authorised tool call |
| Expired grant visibility | `GET /connectors` filters out expired grants; hourly cron deletes them | Return recently expired grants (or accept "Not granted" instead of "Expired") |
| Revoked state | DELETE removes row | Session-only confirmation is enough; no persisted revoked state |
| Current company name in mode B scope | Not in connector settings | Available from existing company context in the shell |

## 12. Open questions for the connector eligibility check (TRY-173)

Connector copy in §4 and §7.3 stays provisional until these are answered on real accounts:

1. Which ChatGPT plans (Plus, Pro, Business, Enterprise, Edu) can add a custom MCP connector today, and does it require developer mode? Is it read-only-tool friendly without extra approval?
2. For ChatGPT Business/Enterprise, what exactly must a workspace admin enable, and can a member request it from the connector setup screen?
3. Which Claude plans (Pro, Max, Team, Enterprise) can add a custom remote connector, and who (owner vs. member) can add it in organisations?
4. Exact current menu paths and labels in both products (web and mobile/desktop apps) for adding a connector, in Polish UI where available.
5. Do both hosts support OAuth with dynamic client registration, or must the operator pre-register client IDs and exact callback URLs? Which callback URLs?
6. Can a host connector be added from mobile apps, or only on the web? This decides the mobile copy in §4.4.
7. What does the host show when the connector is unreachable or the token is rejected (revoked/expired grant)? Can we rely on that message, or must our copy explain it?
8. Do host answers render links returned by tool results as clickable links to `/dashboard/invoices/:id`? Do tool results need absolute URLs, and should they include company/environment hints for the return banner?
9. Is a per-grant "last used" timestamp acceptable from a privacy perspective (it reveals host activity to the user only)? Confirms the `lastUsedAt` API change.
10. Should the connector instructions mention that the user must sign in with the *same* Księgowy Vibe account that granted access, and how does the OAuth server display that account?
11. Does either host cache tool results across conversations after revocation, and how should revocation copy describe it?
12. Grant duration options: are 7 and 30 days enough, or should TEST default shorter?

## 13. Handoff checklist

- frontend-architect: split `AdvisorSettings.tsx` into policy, mode switch, embedded connection and external connection boundaries; define state ownership for draft key, catalog and operation status; keep `advisor-api.ts` as the only transport.
- frontend-engineer: implement per §5 tables and §7 keys; update `advisor-translations.ts`, `docs/specs/tax-advisor.md` and E2E tests (policy denied, OpenRouter first setup, saved/tested, Ollama not configured/configured, grant/revoke).
- After TRY-173: replace **[P]** copy, remove the provisional banner from this document, and resolve §11 gaps.
- When the user adds Claude Design frames for the §0 design gaps, link them in §0 and re-run the visual QA.


## 14. Frontend architecture and delivery plan

Owner: frontend-architect. Added: **2026-10-01**. Status: **foundation implemented (steps 0.1 to 0.5, TRY-169); steps 1 to 6 planned**. Covers TRY-167 (frontend part), TRY-168, TRY-169, TRY-170, TRY-171 and TRY-180. Backend contracts from TRY-167 and TRY-181 are **implemented** (merged 2026-10-01); §14.5 records the contract as built. User decisions of 2026-10-01 are recorded in §14.8. The ordered backlog for frontend-engineer is §14.12.

### 14.1 Decisions

| Decision | Choice | Why |
|---|---|---|
| Rendering | Settings page stays a Server Component; the advisor area is one client island. The container `AdvisorSettings.tsx` keeps `'use client'`, and its children run as client components because the container imports them | The area is all forms, dialogs, clipboard and `localStorage`. The server passes `companyId` and `companyName`, nothing else |
| Data fetching | Keep the existing `useEffect` + `AbortController` + refetch-after-mutation pattern. **No React Query, Zustand or Context** | Two GET endpoints, one consumer tree, no cache shared across routes. A library would be a new dependency for about four fetch calls |
| Transport | `advisor-api.ts` stays the only transport. Components call named endpoint functions (§14.4), never `advisorRequest` with inline paths | Endpoint paths, the `x-ksef-environment` header and request bodies are defined in one place, so the backend contract is reviewable in one file |
| Draft reset | `AdvisorProviderConnection` is rendered with `key={provider}` | Changing provider remounts the component, which clears the key draft, catalog and operation status. No reset effects are needed, and the secret leaves memory (§10) |
| Consent validity | Store `consentFor = "${host}:${environment}:${days}"` instead of a boolean. Consent counts only while it matches the current choices | This implements "changing any choice clears consent" (I9) without effects |
| Status derivation | One pure function, `embeddedConnectionReadiness()`, in `lib/advisor-connection-status.ts`, computed from the settings snapshot and never stored in state. Grant status is **not** derived on the client: `GET /connectors` returns a server-computed `status` (§14.5 #4); the client only adds the "expires soon" flag inline (`expiresAt - now <= 3 days`) | One tested source for readiness chips, the mode-switch status line and the enabled/disabled actions; no duplicated grant logic |
| Operation feedback | One discriminated union per form: `{ name: 'discover' \| 'save' \| 'test' \| 'disconnect'; phase: 'running' \| 'succeeded' \| 'failed'; message: string } \| null` | This fixes TRY-169 ("Zapisano" after test or discovery): each message comes from `name`, so the generic `perform()` goes away |
| Grants list markup | One `ul` of rows with a responsive grid (columns at `md`, stacked below it), **not** a desktop `table` plus separate mobile cards | One markup for at most four rows, so desktop and mobile cannot drift apart. It matches §4.4 visually |
| Unit test runner | Add `vitest` (same major as `apps/api`, latest secure patch at implementation time) to `@ksiegowy/web`, node environment only, for `advisor-connection-status.ts` | Branch-heavy logic deserves a cheap test. No jsdom or Testing Library: Playwright with mocked routes already covers rendering (existing `advisor.spec.ts` pattern) |

### 14.2 Component boundaries

All files are in `apps/web/src/components/advisor/` unless noted. Sizes are estimates, and every file must stay under 500 lines.

| File | Kind | Owns (state) | Renders | Est. lines |
|---|---|---|---|---|
| `AdvisorSettings.tsx` | rewrite, container | `settings`, `connectors` (fetched in parallel), load error, `mode` (`localStorage`, try/catch) | Policy card (ADMIN), mode switch (two `aria-pressed` buttons, inline), the active mode | ~140 |
| `AdvisorPolicyForm.tsx` | new, extracted as-is from `AdvisorSettings` | Policy draft, its own save status | Enable, allowed providers, allowed hosts, retention | ~80 |
| `AdvisorReadinessSummary.tsx` | new, shared by both modes | none | `dl` of `{ label, chip, tone, reason }` rows, skeleton while `rows === null` | ~50 |
| `AdvisorProviderChoice.tsx` | new | none (controlled) | `fieldset` radio cards, `<details>` for OpenAI/Anthropic API (open when either has a saved connection), billing disclosure (I3) | ~90 |
| `AdvisorProviderConnection.tsx` | new, `key={provider}` | Key draft, model draft, catalog, operation, disconnect dialog open | Step 2 (key field or Ollama status row, model `datalist`, discover, save) and step 3 (status chip, cost text, test, disconnect `NativeDialog`), plus the scope line (I5, TRY-170) | ~260 |
| `AdvisorConnectors.tsx` | rewrite, mode B | `host`, `environment`, `days`, `consentFor`, grant operation | Host-ownership disclosure (I4), step 1 host radios, step 2 scope + consent + grant | ~180 |
| `AdvisorConnectorSetup.tsx` | new | Copy feedback (2s) | Step 3: read-only MCP URL, copy button with select fallback, `ol` of host steps [P], two `<details>`, open-host link | ~100 |
| `AdvisorConnectorGrants.tsx` | new | Revoke dialog target | Step 4: grant rows, chips from `grant.status`, revoke `NativeDialog`, "Zezwól ponownie" / "Przedłuż" (calls `onRegrant(client, environment)`, which pre-fills step 2; never grants, §14.8 issue 4) | ~120 |
| `lib/advisor-connection-status.ts` | new, pure | — | `embeddedConnectionReadiness()` only | ~60 |

Kept unchanged: `AdvisorWorkspace`, `AdvisorAnswerCard`. `AdvisorConversation` changes only as described in §14.8 issue 5.

```mermaid
flowchart TD
  Page["settings/page.tsx (RSC)<br/>companyId, companyName"] --> Workspace[SettingsWorkspace]
  Workspace --> Container["AdvisorSettings (client)<br/>state: settings, connectors, mode"]
  Container -->|settings, onChanged| Policy[AdvisorPolicyForm · ADMIN only]
  Container -->|rows| ReadinessA[AdvisorReadinessSummary]
  Container -->|mode A| Choice[AdvisorProviderChoice]
  Container -->|"key=provider"| Connection["AdvisorProviderConnection<br/>state: key draft, model, catalog, operation"]
  Container -->|mode B: connectors, settings| Connectors["AdvisorConnectors<br/>state: host, environment, days, consentFor"]
  Connectors --> ReadinessB[AdvisorReadinessSummary]
  Connectors --> Setup["AdvisorConnectorSetup<br/>state: copy feedback"]
  Connectors --> Grants["AdvisorConnectorGrants<br/>state: revoke target"]
  Status[(advisor-connection-status.ts)] -.derives.-> Container
  Status -.derives.-> Connection
  Api[(advisor-api.ts)] -.only transport.-> Container
  Api -.-> Connection
  Api -.-> Connectors
  Api -.-> Grants
```

Data flow rule: children never refetch on their own. Every mutation runs `onChanged()`, which makes the container refetch `/settings` and `/connectors`, and only then does the child show its success message and move focus (§8). The draft key is never passed up.

### 14.3 State and data flow per state

The state tables in §5.1 and §5.2 map onto these sources. "Snapshot" means the API response that the container holds.

| UI state (§5) | Source | Derived by |
|---|---|---|
| Settings loading / failed | container `settings === null`, load error | container |
| Policy disabled, provider denied, runtime disabled | snapshot `enabled`, `allowedProviders`, `operatorEnabled` | `embeddedConnectionReadiness()` |
| Saved not tested / tested / disconnected | snapshot `connections[].testedAt` | `embeddedConnectionReadiness()` |
| Ollama not configured | snapshot `ollamaAvailable` | `embeddedConnectionReadiness()` |
| Catalog loading / failed / loaded, Ollama unreachable (`502 OLLAMA_UNREACHABLE`) / no models (`409 OLLAMA_NO_MODELS`) / not configured (`503 OLLAMA_NOT_CONFIGURED`) | discover operation + catalog; Ollama states come from the error `code`, never from an empty list | `AdvisorProviderConnection` local |
| Saving, test running, test failed (session only) | operation union | `AdvisorProviderConnection` local |
| Connector unavailable, host not allowed | snapshot `endpoint`, `settings.enabled`, `allowedConnectors` | `AdvisorConnectors` |
| Not granted / waiting / active / expired / revoked | `grants[].status` (`WAITING` \| `ACTIVE` \| `EXPIRED` \| `REVOKED`, server-computed); no row = not granted | `AdvisorConnectorGrants` reads it as-is |
| Expiring soon | `status` is `WAITING`/`ACTIVE` and `expiresAt - now <= 3 days` | inline in `AdvisorConnectorGrants` |
| Copy succeeded / failed | clipboard promise | `AdvisorConnectorSetup` local |

Signature (grant status needs no client function, the API sends `status`):

```ts
embeddedConnectionReadiness(settings: AdvisorSettings, provider: AdvisorProvider): {
  policy: 'disabled' | 'denied' | 'allowed';
  runtime: 'enabled' | 'disabled';
  connection: 'notConfigured' | 'savedNotTested' | 'tested';
  ollamaConfigured: boolean;
  canDiscover: boolean;   // runtime enabled && policy allowed (decided, §14.8 issue 1)
  canTest: boolean;       // canDiscover && connection !== 'notConfigured'
  readyForQuestions: boolean;
};
```

Mode A: discover, save, explicit test.

```mermaid
sequenceDiagram
  actor User
  participant Form as AdvisorProviderConnection
  participant Api as advisor-api.ts
  participant Server as Fastify advisor routes
  participant Container as AdvisorSettings
  User->>Form: type key, press "Pobierz listę modeli"
  Form->>Form: operation = discover/running (inputs stay editable)
  Form->>Api: discoverAdvisorModels(companyId, provider, credential?)
  alt typed key or OLLAMA
    Api->>Server: POST /connections/:provider/model-preview { credential? }
  else saved connection, empty key field
    Api->>Server: GET /connections/:provider/models
  end
  Server-->>Form: { models } (sorted) or error code (CREDENTIAL_REQUIRED, RATE_LIMITED, PROVIDER_ERROR, OLLAMA_*)
  Form->>Form: catalog or failed (key and model kept)
  User->>Form: choose model, press "Zapisz połączenie"
  Form->>Api: saveAdvisorConnection(provider, { model, credential? })
  Api->>Server: PUT /connections/:provider
  Server-->>Form: ok (testedAt reset to null)
  Form->>Container: onChanged()
  Container->>Server: GET /settings + GET /connectors
  Form->>Form: clear key, operation = save/succeeded, focus step 3 heading
  Note over Form: The test never runs automatically (I8)
  User->>Form: press "Sprawdź połączenie (płatne żądanie)"
  Form->>Api: testAdvisorConnection(provider)
  Api->>Server: POST /connections/:provider/test
  Server-->>Form: { testedAt } or error code
  Form->>Container: onChanged() on success; on failure keep the reason for this session only
```

Mode B: grant, then revoke.

```mermaid
sequenceDiagram
  actor User
  participant Scope as AdvisorConnectors
  participant Grants as AdvisorConnectorGrants
  participant Api as advisor-api.ts
  participant Server as Fastify connector routes
  participant Container as AdvisorSettings
  User->>Scope: choose host, environment, days
  Scope->>Scope: consentFor !== current choices, so grant is aria-disabled with reason
  User->>Scope: tick consent (text built from host, company, environment, days)
  User->>Scope: press "Zezwól na odczyt"
  Scope->>Api: grantAdvisorConnector(client, environment, days)
  Api->>Server: PUT /connectors/:client (x-ksef-environment, { days })
  Server-->>Scope: { expiresAt }
  Scope->>Container: onChanged() then refetch /connectors
  Scope->>Scope: clear consentFor, focus step 3 heading
  User->>Grants: press "Cofnij zgodę" on a row
  Grants->>Grants: NativeDialog, focus on Anuluj
  Grants->>Api: revokeAdvisorConnector(client, environment)
  Api->>Server: DELETE /connectors/:client (x-ksef-environment)
  Server-->>Grants: { revoked: true } (row kept with revokedAt, status REVOKED, visible 30 days)
  Grants->>Container: onChanged(), focus readiness summary
  User->>Grants: press "Zezwól ponownie" / "Przedłuż" on a row
  Grants->>Scope: onRegrant(client, environment): pre-fill step 2, consentFor stays empty
  Scope->>Scope: focus consent checkbox (no request sent)
```

Grant status mapping. The server computes `status` with this precedence (replaces the provisional parts of §4.2); the client maps it to chips and adds only "expires soon":

```mermaid
flowchart TD
  Grant[grant row] --> Status{"status (server)"}
  Status -- REVOKED --> StateRevoked[COFNIĘTA]
  Status -- EXPIRED --> StateExpired[WYGASŁA]
  Status -- WAITING --> StateWaiting[OCZEKUJE NA 1. UŻYCIE]
  Status -- ACTIVE --> StateActive[AKTYWNA]
  StateWaiting --> Soon{"expiresAt - now <= 3 days?"}
  StateActive --> Soon
  Soon -- yes --> Chip[add WYGASA WKRÓTCE chip]
  NoRow[no row for host × environment] --> StateNotGranted[BRAK ZGODY]
```

Server precedence, for reference: `revokedAt` set → `REVOKED`; else `expiresAt <= now` → `EXPIRED`; else `lastUsedAt` set → `ACTIVE`; else `WAITING`.

### 14.4 Client boundary — `advisor-api.ts`

Keep `advisorRequest`, `advisorErrorMessage` and `streamAdvisorAnswer` as they are. Add named endpoint functions, with no hooks and no caching. Types come from `packages/types/src/advisor.ts`, which the backend engineer owns in TRY-181. The frontend does not edit that file in parallel.

| Function | Request | Response | Ticket |
|---|---|---|---|
| `readAdvisorSettings(companyId, signal)` | `GET /settings` | `AdvisorSettings` (unchanged) | 169 |
| `saveAdvisorPolicy(companyId, policy)` | `PATCH /policy` | ignored | 169 (extracted) |
| `saveAdvisorConnection(companyId, provider, { model, credential? })` | `PUT /connections/:provider` | ignored | 169 |
| `deleteAdvisorConnection(companyId, provider)` | `DELETE /connections/:provider` | ignored | 169 |
| `testAdvisorConnection(companyId, provider)` | `POST /connections/:provider/test` | `{ testedAt: string }` | 169 |
| `discoverAdvisorModels(companyId, provider, credential?)` | `POST /connections/:provider/model-preview` with `{ credential }` when a key is typed or `{}` for `OLLAMA`; otherwise `GET /connections/:provider/models` (saved connection) | `AdvisorModelPreview` (`{ models: string[] }`, sorted) | 167, 168 |
| `readAdvisorConnectors(companyId, signal)` | `GET /connectors` | `AdvisorConnectorSettings` (grants carry `status`, §14.5 #4) | 180 |
| `grantAdvisorConnector(companyId, client, environment, days)` | `PUT /connectors/:client` + `x-ksef-environment`, body `{ days }` | `{ expiresAt: string }` | 180 |
| `revokeAdvisorConnector(companyId, client, environment)` | `DELETE /connectors/:client` + `x-ksef-environment` | `{ revoked: true }` (ignored) | 180 |

Error handling stays as it is: every function rejects with the API `{ code }`, and components show `advisorErrorMessage(error)`. New codes only need translations. Unknown codes fall back to `ADVISOR_ERROR`.

### 14.5 Backend contract as implemented (TRY-167, TRY-181)

Source of truth: `packages/types/src/advisor.ts` (`AdvisorConnectorGrantStatus`, `AdvisorConnectorGrant`, `AdvisorModelPreview`, `AdvisorOllamaErrorCode`), `apps/api/src/routes/advisor-settings.ts`, `apps/api/src/routes/advisor-connectors.ts`. All open questions from the earlier draft are closed.

| # | Contract (implemented) | Frontend consequence |
|---|---|---|
| 1 | **Preview route:** `POST /companies/:companyId/advisor/connections/:provider/model-preview` (not `models/preview`). Body strictly `{ credential?: string }` (trimmed, 1–4096 chars, extra keys rejected). Available for all four providers. Gates in order: membership, `ADVISOR_DISABLED` (503, runtime off), `POLICY_DENIED` (403, policy disabled or provider not allowed), `CREDENTIAL_REQUIRED` (400, hosted provider without `credential`), `RATE_LIMITED` (429). Ollama ignores `credential`. Response `{ models: string[] }`, sorted. The key is never stored or logged; the non-GET origin check applies | Discovery is `aria-disabled` with the reason when the runtime is off or the provider is denied; manual model entry still allows save (§14.8 issue 1). Send `{}` for Ollama, `{ credential }` otherwise; do not call preview without a typed key for hosted providers |
| 2 | Preview errors: `CREDENTIAL_REQUIRED` (400), `RATE_LIMITED` (429, **one preview per user per 10 s**), `PROVIDER_ERROR` (502, or 429 when the provider rate-limits; this includes a rejected key, there is **no** `CREDENTIAL_INVALID` code) | The "rejected key" case shows the `PROVIDER_ERROR` copy, which must mention a possibly wrong key. On `RATE_LIMITED` the discover button shows "Odczekaj chwilę" and is re-enabled after 10 s |
| 3 | **Ollama:** `OLLAMA_NOT_CONFIGURED` (503), `OLLAMA_UNREACHABLE` (502, connection, DNS, timeout or non-2xx), `OLLAMA_NO_MODELS` (**409**, not `200 []`). `OLLAMA_UNAVAILABLE` is removed. Same codes from the preview, saved-models and test routes. `settings.ollamaAvailable` still means "configured" | Rename the `errors.OLLAMA_UNAVAILABLE` key in `apps/web/src/lib/advisor-translations.ts` to `OLLAMA_NOT_CONFIGURED`, add `OLLAMA_UNREACHABLE` and `OLLAMA_NO_MODELS`. The no-models state comes from the 409 code; an empty `models` array is never expected |
| 4 | **Grant shape** in `GET /connectors`: `grants: Array<{ client; environment; status: 'WAITING' \| 'ACTIVE' \| 'EXPIRED' \| 'REVOKED'; expiresAt; lastUsedAt \| null; revokedAt \| null }>`, `status` computed on the server. `clients` lists the hosts that have a pre-registered OAuth client; `endpoint` is the public `/mcp` URL or `null` | `connectorGrantStatus()` is dropped. Chips map from `status`; "expires soon" is the only client-side computation. A host missing from `clients` is "unavailable", not "not allowed" |
| 5 | Revoked and expired grants are returned for **30 days** (`advisorGrantRetentionDays`), then cleaned up | Render whatever comes back; no client-side filtering |
| 6 | `DELETE /connectors/:client` sets `revokedAt` and keeps the row; response `{ revoked: true }`. The MCP token check rejects revoked grants | Focus moves to the readiness summary; the row turns `COFNIĘTA` after refetch |
| 7 | `PUT /connectors/:client` (grant or re-grant) upserts with a new `expiresAt` and resets `lastUsedAt` and `revokedAt` to `null`. Body strictly `{ days }` (1–30); response `{ expiresAt }`. Requires `x-ksef-environment`; `CONNECTOR_UNAVAILABLE` (503) when the host has no client; `POLICY_DENIED` (403) when the host is not allowed | A re-granted row shows `OCZEKUJE NA 1. UŻYCIE` again. The UI sends 7 or 30 |
| 8 | `lastUsedAt` is kept (user decision) and shown only to the grant owner | Show it in the grant row as "Ostatnie użycie" when not null |
| 9 | **Not implemented:** distinct test-failure reasons (`CREDENTIAL_INVALID`, quota, reachability, structured output) | Follow-up ticket. The UI shows the generic `PROVIDER_ERROR` copy; no frontend work is blocked |
| 10 | No change to `GET /settings`. The company name comes from the settings page (`getCompany`), not from the advisor API | — |

### 14.6 Translation key plan (`advisor-translations.ts`)

Keep a single file (estimated ~220 lines after the change). Group the new keys by owner so the parallel mode A and mode B work merges cleanly. Use interpolation functions as in `lib/translations.ts` (for example, `credential: (provider: string) => \`Klucz API ${provider}\``), not `{placeholder}` string replacement.

| Group | Contents | Notes |
|---|---|---|
| top level (unchanged) | Conversation keys used by `AdvisorConversation`, `AdvisorWorkspace`, `AdvisorAnswerCard` (`settings`, `loading`, `disabled`, …) | Untouched to avoid churn |
| `modes` | `embedded`, `embeddedDescription`, `external`, `externalDescription` | §7.1 |
| `readiness` | `title`, `policy`, `server`, `connection`, `connectorServer`, `grants`, `loadingSettings`, `retry`, `policyDisabled`, `askAdministrator` | §7.1 |
| `policy` | Existing `enable`, `allowed`, `savePolicy`, `retention`, plus `allowedHosts` and `allowedHostsDescription` (replace `connectorsAllowed`, which says "abonament" and breaks I2). Copy below | Moved |
| `embedded` | All §7.2 keys. `providers.ANTHROPIC` changes from "Claude API" to **"Anthropic API"** (user decision) | Mode A only |
| `external` | All §7.3 keys. Host steps become arrays rendered as an `ol`: `hostSteps: { CHATGPT: string[]; CLAUDE: string[] }`, `hostRestrictions: { CHATGPT; CLAUDE }`, `webOnlySetup`, `sameAccountNotice`, `lastUsed`. Copy from TRY-173 below; items still unverified carry a `// unverified (TRY-173)` comment | Mode B only |
| `errors` | Rename `OLLAMA_UNAVAILABLE` → `OLLAMA_NOT_CONFIGURED`; add `OLLAMA_UNREACHABLE`, `OLLAMA_NO_MODELS`, `CREDENTIAL_REQUIRED`, `CONNECTOR_UNAVAILABLE`, `ADVISOR_DISABLED` (aligned with `testBlockedRuntime`). Reword `PROVIDER_ERROR` to cover a rejected key (there is no `CREDENTIAL_INVALID`) | Shared |

Proposed copy (Polish, for ux-ui-architect review; no "abonament", no billing claim, I2):

| Key | Copy |
|---|---|
| `policy.allowedHosts` | "Aplikacje, w których członkowie mogą rozmawiać z Doradcą" |
| `policy.allowedHostsDescription` | "Członek zespołu łączy własne konto ChatGPT lub Claude i daje tej aplikacji dostęp tylko do odczytu danych firmy. Księgowy Vibe nie otrzymuje danych logowania do tych aplikacji." |
| `errors.PROVIDER_ERROR` | "Dostawca odrzucił żądanie. Sprawdź klucz API i spróbuj ponownie." |
| `errors.OLLAMA_NOT_CONFIGURED` | "Operator nie skonfigurował Ollama." |
| `errors.OLLAMA_UNREACHABLE` | "Serwer Księgowy Vibe nie może połączyć się z Ollama. Spróbuj ponownie lub poproś operatora o sprawdzenie usługi." |
| `errors.OLLAMA_NO_MODELS` | "Ollama nie ma zainstalowanych modeli. Poproś operatora o pobranie modelu." |

#### Mode B setup copy (from `docs/specs/tax-advisor-connector-eligibility.md`)

Replaces the [P] steps in §7.3. Labels: (v) verified, (p) partial, (u) unverified. Host menu names change often, so copy names them generically.

- **Both hosts:** show `endpoint` (ends with `/mcp`, HTTPS) as the URL to paste (v). Show `external.webOnlySetup`: "Dodaj połączenie w przeglądarce. Dodawanie z aplikacji mobilnej nie zostało potwierdzone." (Claude can use an existing connector on mobile; ChatGPT MCP apps are web-only per its Help Center). Show `external.sameAccountNotice`: "Gdy aplikacja poprosi o logowanie, zaloguj się tym samym kontem Księgowy Vibe, które udzieliło zgody." (recommended, not documented by either host (u)).
- **ChatGPT steps:** 1) "Otwórz ChatGPT w przeglądarce." (v, web only) 2) "W ustawieniach włącz tryb dewelopera, jeśli jest dostępny na Twoim koncie." (menu differs by plan; Polish labels (u)) 3) "W sekcji aplikacji lub wtyczek wybierz „+”, podaj nazwę i wklej adres połączenia." (v for developer flow) 4) "Utwórz połączenie i zaloguj się." **Restrictions:** Pro read/fetch is documented; Plus appears in the developer guide but conflicts with Help Center scope (u until target-account check); Business requires an admin/owner, Enterprise/Edu an admin or RBAC-authorised developer; Free unsupported/unknown (u). Do not promise a particular plan without seeing the target workspace.
- **Claude steps:** Free, Pro, Max: 1) "Otwórz Dostosuj → Łączniki → Dodaj własny łącznik." 2) "Wklej adres połączenia i dodaj." 3) "W rozmowie włącz łącznik przez „+”." (v; Polish labels (u)). Team, Enterprise: "Właściciel organizacji dodaje łącznik w ustawieniach organizacji; potem każdy członek wybiera Połącz i loguje się własnym kontem." (v). **Restrictions:** Free allows one custom connector (v).
- **OAuth client (user decision: pre-registered client per host in Keycloak, no open DCR).** The operator registers one client per host with the exact callbacks: Claude `https://claude.ai/api/mcp/auth_callback` (v); ChatGPT `https://chatgpt.com/connector_platform_oauth_redirect`, which needs issuer identification (`authorization_response_iss_parameter_supported`) on Keycloak (u, needs a test realm). Callback URLs are operator configuration (README), **not** end-user copy. Open (u): whether the user must type the pre-registered client ID into the host's "own OAuth client" option. `GET /connectors` exposes only host names in `clients`, not client IDs, so if a client ID must be shown, that is a backend follow-up; until then step 3 shows no client ID.
- **Recovery copy** (our wording, never host strings): revoked or expired grant → "Udziel zgody ponownie w kroku 2, a potem połącz się ponownie w aplikacji."; the data already shared in a host conversation follows that host's retention rules (§12 q11).

Remove (no longer used): `inAppMode`, `inAppModeDescription`, `subscriptionMode`, `subscriptionModeDescription`, `subscriptions`, `subscriptionDescription`, `openSubscription`, `companyIdentifier`, `connectorsAllowed`, `saved`, `tested`, `models`, `expires`, `grant` (replaced by `external.grant`).

### 14.7 File list

| Path | Change |
|---|---|
| `apps/web/src/components/advisor/AdvisorSettings.tsx` | Rewrite as the container (§14.2) |
| `apps/web/src/components/advisor/AdvisorPolicyForm.tsx` | New, extracted |
| `apps/web/src/components/advisor/AdvisorReadinessSummary.tsx` | New |
| `apps/web/src/components/advisor/AdvisorProviderChoice.tsx` | New |
| `apps/web/src/components/advisor/AdvisorProviderConnection.tsx` | New |
| `apps/web/src/components/advisor/AdvisorConnectors.tsx` | Rewrite (mode B container) |
| `apps/web/src/components/advisor/AdvisorConnectorSetup.tsx` | New |
| `apps/web/src/components/advisor/AdvisorConnectorGrants.tsx` | New |
| `apps/web/src/components/advisor/AdvisorConversation.tsx` | Replace the inline settings with a link (§14.8 issue 5) |
| `apps/web/src/lib/advisor-api.ts` | Add endpoint functions (§14.4) |
| `apps/web/src/lib/advisor-translations.ts` | Regroup keys (§14.6) |
| `apps/web/src/lib/advisor-connection-status.ts` | New, pure status derivation |
| `apps/web/src/lib/advisor-connection-status.test.ts` | New, vitest |
| `apps/web/package.json` | Add `vitest` devDependency and a `"test": "vitest run"` script |
| `apps/web/src/app/dashboard/settings/page.tsx` | Pass `companyName`, plus `initialSection` from `searchParams.section` |
| `apps/web/src/app/dashboard/settings/SettingsWorkspace.tsx` | Optional `initialSection` prop used as the initial active section (deep link `?section=advisor`; unknown values fall back to the default section). No URL syncing on tab change (YAGNI) |
| `packages/types/src/advisor.ts` | No change: `AdvisorConnectorGrant`, `AdvisorConnectorGrantStatus`, `AdvisorModelPreview`, `AdvisorOllamaErrorCode` already exist (TRY-181) |
| `apps/e2e/tests/advisor-settings.spec.ts` | New (§14.9) |
| `apps/e2e/tests/advisor.spec.ts` | Remove the old "settings separate API billing…" test (superseded) |
| `docs/specs/tax-advisor.md`, `README.md`, this file | Update after implementation (status, §11 gaps resolved) |

No new atoms or molecules. Reuse `Surface`, `Badge`, `Banner`, `FormField`, `Input`, `Button`, `NativeDialog`, `ErrorState` and `InvoiceEnvironmentChip`.

### 14.8 UX sign-off

**Signed off** for implementation. The design is feasible with existing components, needs no new tokens, and every state in §5 maps to a data source (§14.3). The user approved decisions on 2026-10-01 that close issues 1, 3, 4, 5, 6 and 9; the rest keep the frontend default.

| # | Issue | Where | Resolution |
|---|---|---|---|
| 1 | Discovery gating: §5.1 vs §3.1 contradicted each other | §3.1, §5.1 | **Decided.** Discovery is `aria-disabled` with the reason when the runtime is off or the provider is denied (matches the API, §14.5 #1). Manual model ID entry stays open, so save is always possible (TRY-169 AC) |
| 2 | Test-failure reasons have no API codes | §5.1 "Test failed" | **Open, not blocking.** Generic `PROVIDER_ERROR` copy (§14.5 #9); distinct codes are a backend follow-up |
| 3 | Revoked was "session only" in §5.2, but the backend retains grants | §4.2, §5.2, §11 | **Decided.** Persisted chips from server `status`; revoked and expired rows visible for 30 days; `lastUsedAt` kept and shown. §5.2 and §11 owners update their sections accordingly |
| 4 | One-click "Zezwól ponownie" / "Przedłuż" would bypass consent (I9) | §4.3, §5.2 | **Decided.** The row action pre-fills step 2 (host, environment), leaves consent unticked and moves focus to the consent checkbox. It never grants in one click |
| 5 | Advisor dock (400px) and mobile sheet embed `AdvisorSettings` inline | `AdvisorConversation.tsx` | **Decided.** Replace with a link to `/dashboard/settings?section=advisor` plus the existing blocked-state text; `SettingsWorkspace` gets an optional `initialSection` prop (§14.7) |
| 6 | Policy card copy says "abonament" (breaks I2) | §7 | **Decided.** Keys `policy.allowedHosts` and `policy.allowedHostsDescription`, proposed copy in §14.6, pending ux-ui-architect wording review only |
| 7 | KISS: step 3 hidden until a grant exists adds a role branch | §5.2 | Default kept: show step 3 whenever `endpoint` is set, for everyone |
| 8 | Two grant markups (table and cards) | §4.3, §4.4, §6 | Default kept: one responsive `ul` (§14.1) |
| 9 | §4.5 return-to-invoice banner | §4.5 | **Decided.** Split out of TRY-180 into a follow-up ticket; not part of this delivery |
| 10 | Shake and chip "pop" motion | §8 | Default kept: built last, CSS only, off under reduced motion, dropped if it slips |
| 11 | Light-theme screens not drawn | §0 | Default kept: tokens only (§9); Playwright screenshots in both themes go to review |

Also decided: the UI label "Claude API" becomes "Anthropic API" (§14.6); Mode B uses a pre-registered OAuth client per host, and the setup copy follows the TRY-173 findings (§14.6, Mode B setup copy).

### 14.9 Test plan

**Unit tests** (`pnpm --filter @ksiegowy/web test -- src/lib/advisor-connection-status.test.ts`), with fixtures from small builders that include only the fields each case needs:

- `describe('embeddedConnectionReadiness()')`: policy disabled; provider denied while the runtime is enabled; runtime disabled while the provider is allowed (separate reasons, TRY-169); saved not tested; tested and ready; tested but blocked by policy; Ollama not configured.
Grant status is server-computed and covered by API route tests; there is no client unit test for it.

**Playwright** (`apps/e2e/tests/advisor-settings.spec.ts`). Each scenario loops over `{ width: 1440 }` and `{ width: 390 }`, mocks `**/companies/test-company-id/advisor/**` with a stateful in-test handler (existing pattern), asserts `body.scrollWidth === viewport.width`, and saves a full-page screenshot to `testInfo.outputPath`.

| # | Scenario | Key assertions | Ticket |
|---|---|---|---|
| 1 | OpenRouter first setup | Key → "Pobierz listę modeli" sends a POST to the preview route with `{ credential }`; count is shown; model chosen; save sends PUT with `{ model, credential }`; key field empty with saved helper; chip "Zapisane — nie przetestowane"; **test request count is 0**; test → chip "Przetestowane"; scope line (TEST i PRODUKCJA) visible | 167, 169, 170, 171 |
| 2 | Rejected key, rate limit | Preview returns 502 `PROVIDER_ERROR`: error mentions the key, key value kept, manual model ID still saves; a second preview returning 429 `RATE_LIMITED` shows the wait message | 167, 171 |
| 3 | Policy gates | `allowedProviders` without OpenRouter and `operatorEnabled: false`: two separate readiness reasons; test `aria-disabled` with a description; save still sends PUT; success says only "Zapisano połączenie" | 169 |
| 4 | Ollama not configured | `ollamaAvailable: false`: operator text, no save button, no URL input anywhere | 168, 171 |
| 5 | Ollama configured | Discovery sends `{}` to `model-preview`; 502 `OLLAMA_UNREACHABLE` → message + retry; retry returns 409 `OLLAMA_NO_MODELS` → no-models message, save disabled; retry returns models → choose, "Zapisz model" sends PUT **without** `credential`; explicit test | 168, 171 |
| 6 | Disconnect | Dialog opens with focus on Anuluj; confirm sends DELETE; chip "Nieskonfigurowane"; focus on readiness | 169 |
| 7 | Grant | Consent text reflects host, environment and days; grant `aria-disabled` until consent; changing environment clears consent; grant sends PUT with `x-ksef-environment: PRODUCTION` and `{ days: 7 }`; copy URL (clipboard permission granted) shows "Skopiowano"; open-host link has `target=_blank` and `rel` containing `noopener` | 180 |
| 8 | Grant states | Mocked grants with `status` `WAITING`, `ACTIVE` (expiring within 3 days), `EXPIRED`, `REVOKED` → chips, `lastUsedAt` shown; revoke dialog → DELETE with the environment header, mock returns `{ revoked: true }` and the row turns revoked; "Zezwól ponownie" pre-fills step 2, consent unticked, focus on consent, **no request sent** | 180 |
| 10 | Dock deep link | Advisor dock (desktop) and mobile sheet show a link to `/dashboard/settings?section=advisor`; following it opens the advisor section | 169 |
| 9 | Connector blockers | `endpoint: null` → unavailable; host not in `allowedConnectors` → grant disabled with the reason | 180 |

TRY-171 is done when scenarios 1, 2, 4 and 5 pass at both widths. The backend engineer owns API route tests for §14.5.
### 14.10 Implementation sequence

Backend TRY-167 and TRY-181 are merged, so no frontend step waits on the API any more. The only external dependency left is the TRY-173 real-account check, which gates removing the "(u)" marks, not the build.

```mermaid
flowchart LR
  F0["Step 0 · foundation (TRY-169)"]
  F1["Step 1 · TRY-169 + TRY-170<br/>mode A connection"]
  F2["Step 2 · TRY-167 UI<br/>discovery before save"]
  F3["Step 3 · TRY-168<br/>Ollama"]
  F4a["Step 4a · TRY-180<br/>scope, consent, setup copy"]
  F4b["Step 4b · TRY-180<br/>grant rows, revoke, re-grant"]
  F171["Step 5 · TRY-171<br/>E2E at 1440 and 390"]
  T173["TRY-173 real-account check"]
  Follow["Follow-ups<br/>return banner, test-failure codes,<br/>client ID exposure if needed"]
  F0 --> F1 --> F2 --> F3 --> F171
  F0 --> F4a --> F4b
  F2 --> F171
  T173 --> Follow
  F4b --> Follow
```

Two tracks start after step 0: mode A (1 → 2 → 3) and mode B (4a → 4b). They touch separate files. The only shared file is `advisor-translations.ts`, and the `embedded` and `external` groups keep both tracks' edits apart in it. Each step's PR includes its own E2E scenarios and doc updates (`docs/specs/tax-advisor.md`, README, §11 of this file). The ordered backlog is §14.12.

### 14.11 SecOps alignment checklist

Review with secops-security-auditor before steps 2 and 4b are merged:

- The preview key is sent only in a POST body, is never persisted, and is never logged (check Fastify request logging and the error serializer). The frontend keeps it only in component state, which `key={provider}` remounts, successful saves and unmount all clear. It is never written to `localStorage`.
- Preview is rate-limited per user (one per 10 s, per process; see the `ponytail:` note in `advisor-access.ts`) and the origin check applies (non-GET).
- The MCP resource rejects grants with `revokedAt` set or a past `expiresAt` (§14.5 #6).
- `lastUsedAt` is rendered only in the owner's own grant list (`GET /connectors` is scoped to the membership).
- Pre-registered OAuth clients per host; no anonymous DCR on the Keycloak realm. Callback URLs live in operator configuration, never in user-editable fields.
- Consent is bound to the exact host × environment × days combination (`consentFor`). Row actions never grant directly (§14.8 issue 4).
- The only clipboard content is the public MCP URL. Host links use `rel="noopener noreferrer"`. No user-supplied endpoint exists anywhere (I6).
- `localStorage` holds only the last mode, and every access is wrapped in try/catch.
- Return links never switch company or environment automatically (§4.5, follow-up).

### 14.12 Implementation backlog (for frontend-engineer)

Ordered; steps in the same "Lane" column after step 0 can run in parallel (separate files). Each step ends with `pnpm --filter @ksiegowy/web lint`, typecheck and its E2E scenarios at 1440 and 390, plus the doc updates required by `CLAUDE.md`.

| # | Ticket | Lane | Work | Files | Done when |
|---|---|---|---|---|---|
| 0.1 | TRY-169 | foundation | Add endpoint functions from §14.4 (`model-preview` path, `{}` body for Ollama, typed with `AdvisorModelPreview`, `AdvisorConnectorSettings`) | `lib/advisor-api.ts` | Typecheck green |
| 0.2 | TRY-169 | foundation | Regroup translations (§14.6); rename `errors.OLLAMA_UNAVAILABLE` → `OLLAMA_NOT_CONFIGURED`, add the new codes, "Anthropic API", `policy.allowedHosts*` copy, remove dead keys | `lib/advisor-translations.ts` | No unused keys; no "abonament" in the file |
| 0.3 | TRY-169 | foundation | `embeddedConnectionReadiness()` + vitest (add `vitest` and `test` script) | `lib/advisor-connection-status.ts`, `.test.ts`, `apps/web/package.json` | Unit tests green |
| 0.4 | TRY-169 | foundation | Container split: `AdvisorSettings` (parallel fetch, mode switch), `AdvisorPolicyForm`, `AdvisorReadinessSummary` | `components/advisor/*` | Existing E2E green |
| 0.5 | TRY-169 | foundation | Deep link: `initialSection` prop, `page.tsx` reads `searchParams.section`, passes `companyName`; dock and mobile sheet link instead of inline settings | `SettingsWorkspace.tsx`, `settings/page.tsx`, `AdvisorConversation.tsx` | E2E 10 |
| 1 | TRY-169, TRY-170 | mode A | `AdvisorProviderChoice`, `AdvisorProviderConnection` (`key={provider}`, operation union, explicit test, disconnect dialog, scope line, cost text); discovery via saved route only | `components/advisor/*` | E2E 3, 6 |
| 2 | TRY-167 | mode A | Discovery before save via `model-preview`; disabled with reason when runtime off or provider denied; 10 s wait on `RATE_LIMITED`; `PROVIDER_ERROR` keeps key and manual entry | `AdvisorProviderConnection.tsx` | E2E 1, 2 |
| 3 | TRY-168 | mode A | Ollama: no key field, `OLLAMA_NOT_CONFIGURED` / `OLLAMA_UNREACHABLE` (retry) / `OLLAMA_NO_MODELS` (save disabled) states from error codes | `AdvisorProviderConnection.tsx` | E2E 4, 5 |
| 4a | TRY-180 | mode B | `AdvisorConnectors` (host, environment, days, `consentFor`), `AdvisorConnectorSetup` (URL copy, Mode B setup copy from §14.6 with web-only and same-account notices); hosts missing from `clients` shown as unavailable | `AdvisorConnectors.tsx`, `AdvisorConnectorSetup.tsx` | E2E 7, 9 |
| 4b | TRY-180 | mode B | `AdvisorConnectorGrants`: chips from `status`, expires-soon flag, `lastUsedAt`, revoke dialog, re-grant pre-fills step 2 via `onRegrant` (no request) | `AdvisorConnectorGrants.tsx`, `AdvisorConnectors.tsx` | E2E 8 |
| 5 | TRY-171 | both | Run the full `advisor-settings.spec.ts` at both widths, light and dark screenshots for review; delete the superseded test in `advisor.spec.ts` | `apps/e2e/tests/*` | E2E 1–10 green |
| 6 | — | docs | Update `docs/specs/tax-advisor.md`, README, §11 and this section's status to "implemented" | docs | Reviewed |

Follow-up tickets (not in this delivery): §4.5 return-to-invoice banner; distinct test-failure codes (§14.5 #9); exposing the pre-registered client ID to users if TRY-173 shows the host needs it typed in; replacing "(u)" marks after the TRY-173 real-account check.

Implementation status (2026-10-01): steps 0.1 to 0.5 are done. Details of what landed and what differs from the plan:

- Done: endpoint functions (`advisor-api.ts`), regrouped translations (`modes`, `readiness`, `policy`, `embedded`, `external`; only keys that are used today, so steps 1 to 4 add their own copy), `embeddedConnectionReadiness()` with vitest (`pnpm --filter @ksiegowy/web test`), container split (`AdvisorSettings`, `AdvisorPolicyForm`, `AdvisorReadinessSummary`), per-form operation status, `?section=advisor` deep link, dock and mobile sheet link instead of inline settings.
- Mode A (steps 1, 2 and 3; TRY-169, TRY-170, TRY-167 UI, TRY-168) is done. `AdvisorProviderChoice` renders the radio cards (OpenRouter and Ollama first, OpenAI API and Anthropic API in a `<details>`), the billing disclosure and the TEST/PRODUCTION scope line from `companyName`. `AdvisorProviderConnection` (`key={provider}`) holds the key and model drafts, discovery before save through `model-preview`, the 10 s wait after `RATE_LIMITED`, the `DAILY_LIMIT_REACHED` state (429 from the per-user 30/day or per-company 100/day cap: the existing "try again tomorrow" error text, discovery disabled until reload or provider change, no polling, `Retry-After` is not read because the request helper only surfaces the error body; manual model entry and save stay possible, covered by Playwright at 1440 and 390), the key-rejected error under the key field, the blockers (runtime off, policy off, provider denied, each with who can resolve it), Ollama states from the error codes (not configured, unreachable with retry, no models with save disabled), the explicit paid test with its cost notice, and the disconnect dialog. Focus moves to the verification step after save and to the readiness summary after disconnect. `advisor-settings.spec.ts` covers scenarios 1, 2, 4 and 5 at 1440 and 390 in `describe('provider connection')`.
- Mode A differences from the design: blocked discovery and test use native `disabled` with `aria-describedby` instead of `aria-disabled` (the shared `Button` always derives `aria-disabled` from `disabled`); the "no provider chosen" state is not built (the provider with a saved connection, otherwise OpenRouter, is preselected); the shake and chip-pop motion (issue 10) is not built; scenarios 3 and 6 (policy gates, disconnect) are covered by Playwright, see the verification note below.
- `AdvisorConnectors` is controlled by the container (no own fetching) and only treats `WAITING` and `ACTIVE` grants as granted. The mode B redesign (step 4a/4b) is not built.
- Not done yet: `companyIdentifier` is still shown in mode B until step 4a.
- The existing "advisor settings" e2e test was updated for the mode switch; `advisor-settings.spec.ts` exists (step 5).
- Mode B (steps 4a and 4b, TRY-180) is built: `AdvisorConnectors` (host, environment, days, `consentFor`; hosts missing from `clients` are unavailable, hosts outside `allowedConnectors` are not allowed), `AdvisorConnectorSetup` (MCP address with copy and select fallback, per-host step arrays, restrictions, HTTPS note, web-only and same-account notices, each marked verified, partial or unverified per the eligibility doc) and `AdvisorConnectorGrants` (one responsive list, chips from server `status`, browser-computed "expires soon" at 3 days or less, `lastUsedAt`, revoke dialog, re-grant and extend pre-fill step 2 without a request). `companyIdentifier` and the old host links are gone; no client ID or callback URL is shown. `AdvisorSettings` and the settings page now pass `companyName`. E2E scenarios 7, 8 and 9 live in the `connectors` block of `advisor-settings.spec.ts` at 1440 and 390. Not built: the return-to-invoice banner (§4.5) and the motion polish; layouts follow §4.3 and §4.4 (the Claude Design artifact has no mode B frame, see §0).
- Integrated verification (2026-10-01): web `tsc`, web vitest (7 tests), API `tsc` and API vitest (168 tests) pass; web lint reports only the unrelated unused `redirect` in `onboarding/layout.tsx`. Playwright scenarios 3 (policy gates), 6 (disconnect dialog) and 10 (dock deep link) were added to `describe('provider connection')` at 1440 and 390, each with the no-horizontal-scroll check. Scenario 3 asserts native `disabled` on the test button (see the Mode A differences) and a PUT without `credential`. `advisor-settings.spec.ts` passed 100 of 100 with `--repeat-each=5`, including the revoke-focus test. The full e2e suite passed except `mobile-regression.spec.ts`, whose dock label expectation was still "Asystent podatkowy AI — wkrótce" and now reads "Otwórz doradcę". Not verified: light-theme screenshots and a human review of the screenshots.
- Visual QA fixes (2026-10-01): the panel (`AdvisorConversation`) follows screen 15: mono context line with a "Zmień" control (provider, period, question kind and consent behind it), history behind a ghost button, ask field pinned to the bottom with the data disclosure above it; `AdvisorWorkspace` dock header with brand tile, subtitle and Esc hint. `summary` elements regained a rotating chevron. `Badge variant="tag"` (uppercase, compact), `Banner variant="accent"` (3px left border), `NativeDialog sheet` (26px top radius and grabber) are opt-in variants, so shared defaults are unchanged. `AdvisorStepEyebrow` renders "Krok n z 3" (aria-hidden), radios use the primary accent, `AdvisorReadinessSummary` uses status rows, `AdvisorAnswerCard` has a green short-answer block (only for `answered`), figure tiles and the calculations open by default. Dark and light both use existing tokens only. E2E: `advisor-settings.spec.ts` screenshots the full `#settings-panel` (viewport grown to the section height) in light and dark at 1440 and 390; the theme is switched through `data-theme` because the app reads it from localStorage, not from `prefers-color-scheme`. Remaining: dock action buttons wrap onto two lines in the 400px dock, P9/P10/P11 intentionally skipped.
- `declined` answers (2026-10-01): `AdvisorAnswerCard` renders status `Poza zakresem doradcy` with the neutral short-answer block (green stays `answered` only), labels `explanation` as `W czym mogę pomóc` and shows no assumptions, questions, calculations, evidence or sources because the contract leaves them empty; no citations UI. The calculations summary now reads `Wyliczenia` because it is open by default. `advisor.spec.ts` covers a `declined` fixture at 1440 and 390 (label, hidden empty sections, no horizontal scroll, light and dark screenshots).
