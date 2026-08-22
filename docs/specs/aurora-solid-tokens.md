# Aurora Solid — Design Token Spec

## Status
- Phase: `0` of `spec/aurora-solid-redesign-plan.md` — **spec only, nothing implemented**
- Dark theme: extracted verbatim from `docs/redesign/kv-redesign-system-design.html` + `docs/redesign/kv-redesign-platform.html`
- Light theme: **original design work** — the mock is dark-only. Needs sign-off before Phase 1.
- Contrast: every text and non-text pairing below was measured (WCAG 2.1 relative luminance); 9 failures are listed in §7 with the corrective values already folded into the tables.
- Review: frontend-architect Phase 0 feasibility review — conditional GO. Blockers B1 (status fill/text token ambiguity) and B2 (`--error-action-ink` orphaned deletion) fixed; B3 count corrections applied; the light `--foreground-disabled` pushback accepted (§7 F9). Architect addendum §A1–A3 appended below.

## 1. Structural rules (both themes, non-negotiable)

| Rule | Value |
|---|---|
| Blur | **Never.** No `filter: blur()`, no `backdrop-filter`, no `backdrop-blur-*` Tailwind utility. |
| Shadow | **One per frame.** Applied only to the outer page frame. Never on cards, rows, chips, buttons, inputs, modals-inside-frames. |
| Depth | From opaque surface steps only: `canvas → chrome → card → inset`. |
| Fills | Opaque hex on anything that scrolls. Translucent `bg-*/NN` on scrolling surfaces is banned (it forces per-frame compositing and breaks the surface ladder). |
| Gradients | Baked into the element, never layered as a separate blurred pseudo-element. |
| Transitions | `opacity` and `transform` only. |
| State colour | 14–16% tinted fill + 28–34% tinted border + full-strength text, or a 3px rail. **Never a large filled block.** |
| Numerics | `font-variant-numeric: tabular-nums` on every amount. |

---

## 2. Dark theme (Aurora Solid, from the mock)

Ink base: `#ECEEF7`. Wherever the mock writes `rgba(236,238,247,α)` this doc writes `ink α`.

### 2.1 Surfaces

| Token (globals.css) | New? | Value | Role | Mock source |
|---|---|---|---|---|
| `--canvas` | **new** | `linear-gradient(155deg, #0D1024 0%, #080A14 45%, #0F1226 100%)` | page frame ground | `platform.html` frame `background` |
| `--canvas-base` | **new** | `#0D1024` | flat fallback / gradient start | surface swatch "Canvas" |
| `--background` | repoint | `#080A14` | `body` background behind the frame | canvas mid-stop |
| `--chrome` | **new** | `#0A0C18` | 60px top bar, 226px rail, split-panel aside | surface swatch "Chrome" |
| `--surface-panel` | repoint | `#10132A` | card / panel plane | surface swatch "Card" |
| `--surface-raised` | repoint | `#171B36` | inset well inside a card (fields, KPI cells, alert bodies) | surface swatch "Inset" |
| `--surface-muted` | repoint | `#0D1024` | table header row, table footer bar | surface swatch "Table header" |
| `--surface` | repoint | `#10132A` | alias of card (bare `bg-surface`, ~7 call sites) | — |
| `--surface-row-hover` | **new** | `#131734` | table row hover | `ROW 44PX · HOVER #131734` |
| `--border` | **new** (was `--outline`) | `rgba(236,238,247,0.10)` | hairline divider, card border | "Hairline border" |
| `--border-strong` | **new** | `rgba(236,238,247,0.14)` | emphasised divider | "Border, strong" |
| `--border-control` | **new** | `#6B7398` | input / select / button boundary — see §7 F5 | *designed, not in mock* |
| `--outline` | keep as alias | `= --border` | 57 existing `border-outline` call sites keep working | — |
| `--shadow-frame` | repoint `--shadow-soft` | `0 30px 90px rgba(0,0,0,0.6)` | **the only shadow** | "Frame shadow — the only shadow" |
| `--shadow-aura` | **delete** | — | Aeon Ethereal leftover, no Aurora equivalent | — |

### 2.2 Ink / text

The mock uses ten alpha steps for text. Four of them fail AA (§7 F1). The shipped ladder collapses to three.

| Token | New? | Value | Contrast on card / chrome / inset | Use |
|---|---|---|---|---|
| `--foreground` | repoint | `#ECEEF7` | 15.79 / 16.82 / 14.55 | headings, values, row primary text |
| `--foreground-secondary` | **new** | `rgba(236,238,247,0.72)` | 8.54 / 8.88 / 8.08 | body copy, field labels, banner text |
| `--muted` | repoint | `rgba(236,238,247,0.60)` | 6.26 / 6.41 / 6.01 | captions, eyebrow labels, table headers, nav idle, mono metadata |
| `--foreground-disabled` | **new** | `rgba(236,238,247,0.45)` | 3.97 — WCAG 1.4.3 exempts inactive components | disabled control text only |

Mock alphas `0.55/0.5/0.45/0.42/0.4/0.35` used for *readable* text all collapse to `--muted` (0.60).

### 2.3 Accent, primary, status

| Token | New? | Value | Role |
|---|---|---|---|
| `--primary` | repoint | `#A78BFA` | accent, links, focus ring, active-nav border, ghost button |
| `--primary-strong` | repoint | `#C4B1FD` | link/accent hover |
| `--primary-gradient` | **new** | `linear-gradient(140deg, #B39CFB, #7AA7F2)` | primary button fill |
| `--brand-gradient` | **new** | `linear-gradient(140deg, #A78BFA, #5EB8F0)` | logo mark, progress bar fill |
| `--primary-ink` | repoint | `#0C0D1C` | text on the primary gradient (8.32 / 7.92) |
| `--primary-soft` | repoint | `rgba(167,139,250,0.14)` | accent chip fill |
| `--primary-soft-ink` | repoint | `#A78BFA` | text on accent chip |
| `--nav-active` | **new** | `linear-gradient(100deg, rgba(167,139,250,0.24), rgba(94,184,240,0.12))` | active rail item fill |
| `--nav-active-border` | **new** | `rgba(167,139,250,0.34)` | active rail item border |
**Token convention (unchanged from today's `globals.css`):** `--<status>` is the **fill**, `--<status>-ink` is the **text colour**. This is what the ~110 existing call sites already consume (`bg-success/25` + `text-success-ink`). Aurora keeps the convention and repoints the values.

Fills are **opaque hex**, not `rgba()` — §1 bans translucent fills on scrolling surfaces, and a translucent token would silently break the existing `bg-success/25` modifiers. Each fill below is its tint pre-composited over the card surface.

| Token | New? | Value | Role |
|---|---|---|---|
| `--success` | repoint | `#1A2D3A` | accepted / paid / PROD — **fill** (= `#58CF9A` @14% over card) |
| `--success-ink` | repoint | `#58CF9A` | **text** on `--success` (7.28) |
| `--warning` | repoint | `#302B31` | in clearance / due / unpaid / TEST — **fill** |
| `--warning-ink` | repoint | `#F5BE5A` | **text** on `--warning` (8.18) |
| `--error` | repoint | `#342334` | rejected / error / destructive — **fill** |
| `--error-ink` | repoint | `#F07A6A` | **text** on `--error` (5.34) |
| `--neutral-status` | **new** (`offline24`) | `#242842` | offline24 — **fill** (= `#8F96C0` @16% over card) |
| `--neutral-status-ink` | **new** | `#B6BCE0` | **text** on `--neutral-status` (7.72) |
| `--draft` | **new** | `#22253A` | draft chip — **fill** (= ink @8% over card) |
| `--draft-ink` | **new** | `rgba(236,238,247,0.60)` | **text** on `--draft` (5.65, was 0.55 — see §7 F2) |

Source tints, for deriving the fill against a non-card ground:

| Slot | Tint | Border | Variants in the mock |
|---|---|---|---|
| success | `#58CF9A` @14% | `#58CF9A` @30% → `#264B4C` | chip-on-chrome 12% |
| warning | `#F5BE5A` @14% | `#F5BE5A` @28–30% → `#554638` | banner 10%, chip-on-chrome 12% |
| error | `#F07A6A` @16% | `#F07A6A` @32% → `#58343E` | field bg 8%, button 12%, invalid-field border 50% |
| offline24 | `#8F96C0` @16% | — | — |
| draft | `#ECEEF7` @8% | — | — |

The same opaque fill is reused on inset and chrome grounds; it stays visibly separated there (1.11–1.40 against both) and the text contrast is unaffected because the fill is opaque.

`--success-soft` / `--error-soft` (a second, softer fill, 20 call sites) collapse into the single `--<status>` fill above — Aurora has one tint level per status, not two.

`--error-action-ink` is dropped — see §6.

### 2.4 Type scale

Interface: **Sora**. Identifiers, labels, mono, tabular: **IBM Plex Mono**.

| Name | Font | Size | Weight | Tracking | Use |
|---|---|---|---|---|---|
| `display` | Sora | 46px | 600 | -0.035em | marketing headline (sign-in left panel) |
| `hero-value` | Sora | 34px | 600 | -0.03em | headline amount |
| `page-title` | Sora | 25px | 600 | -0.02em | page H1 ("Operations panel") |
| `section-title` | Sora | 24px | 600 | -0.02em | panel H2 ("Sign in") |
| `kpi-value` | Sora | 27px | 600 | -0.03em | KPI cell number |
| `rail-value` | Sora | 20px | 600 | -0.02em | rail widget value |
| `card-title` | Sora | 14px | 600 | 0 | card / section header |
| `nav-item` | Sora | 14px | 400/500 | 0 | rail item (500 when active) |
| `body` | Sora | 13.5px | 400 | 0 | field values, list copy |
| `row` | Sora | 13px | 400 | 0 | table row, body |
| `caption` | Sora | 12px | 400 | 0 | secondary caption under a value |
| `label` | Sora | 12.5px | 400 | 0 | field label |
| `mono-hero` | IBM Plex Mono | 30px | 500 | 0 | invoice number as a headline |
| `mono-body` | IBM Plex Mono | 14px | 400 | 0 | KSeF reference, long identifier |
| `mono-row` | IBM Plex Mono | 12px | 400 | 0 | in-table invoice number |
| `mono-meta` | IBM Plex Mono | 11px | 400 | 0.10em | counts, inline metadata |
| `eyebrow` | IBM Plex Mono | 10–11px | 400 | 0.14–0.18em, uppercase | section eyebrow, table column head |
| `chip` | IBM Plex Mono | 10px | 400 | 0.08em | status chip |

Line heights: `1.06` display, `1.08` hero, `1.3` chrome stack, `1.45–1.6` body/copy, `1.55` alert copy.

### 2.5 Spacing scale

| Step | Use |
|---|---|
| `8` | chip padding, tight stacks |
| `10` | list gap |
| `13` | inset card padding, row padding |
| `16` | grid gap |
| `18` | card padding, table gutter |
| `26` | page gutter |

Frame-level constants: chrome bar **60px**, rail **226px**, page gutter **26px**, table row **44px**, mobile status bar 44px, chrome bar horizontal padding 22px, rail padding `18px 14px`, main pane padding `22px 26px 26px`, split-panel widths 300px (list) / 372px (detail aside), mobile frame radius 34px.

### 2.6 Radius scale

| Token | New? | Value | Use |
|---|---|---|---|
| `--radius-chip` | **new** | `6px` | status chip, badge, small tag |
| `--radius-control` | **new** | `9px` | rail item, header chip, small button |
| `--radius-inset` | **new** | `12px` | inset well, banner, rail widget |
| `--radius-card` | **new** | `16px` | card, panel |
| `--radius-frame` | **new** | `20px` | outer page frame |

In-between values in the mock (`8` KSeF chip, `10` button/field, `11` large button/alert, `14` KPI cell) snap to the nearest step: `8→9`, `10→9`, `11→12`, `14→16`, `5→6`.

Old tokens `--radius-md` (6px) / `--radius-lg` (24px) / `--radius-xl` (32px): `--radius-md` becomes an alias of `--radius-chip`; `--radius-lg` / `--radius-xl` are deleted along with every `rounded-[1.75rem]` / `rounded-[2rem_1.25rem_2.25rem_1.5rem]` / `rounded-full` literal (see §8).

### 2.7 Component states (dark)

| Component | Fill | Border | Text | Radius |
|---|---|---|---|---|
| Button primary | `--primary-gradient` | none | `#0C0D1C` 600 | 9 (12 at large) |
| Button secondary | `ink 0.06` | `ink 0.12` | `#ECEEF7` | 9 |
| Button destructive | `rgba(240,122,106,0.12)` | `rgba(240,122,106,0.32)` | `#F07A6A` 500 | 9 |
| Button ghost | none | none | `#A78BFA` 500 | 9 |
| Button disabled | `ink 0.04` | `ink 0.08` | `ink 0.45` | 9 |
| Button sizes | small 32px `7px 12px` / default 40px `10px 17px` / large 46px `12px 19px` | | | |
| Field default | `#171B36` | `#6B7398` (§7 F5) | `#ECEEF7` | 9 |
| Field focus | `#171B36` | `#A78BFA` + 2px offset ring | `#ECEEF7` | 9 |
| Field invalid | `rgba(240,122,106,0.08)` | `rgba(240,122,106,0.50)` | `#ECEEF7`, message `#F07A6A` | 9 |
| Field read-only | `ink 0.03` | `ink 0.07` | `ink 0.60` (§7 F3) | 9 |
| Nav item active | `--nav-active` | `--nav-active-border` | `#ECEEF7` 500 | 9 |
| Nav item hover | `ink 0.05` | none | `ink 0.72` | 9 |
| Nav item idle | none | none | `ink 0.60` | 9 |
| Alert (blocking) | `#171B36` | `border-left: 3px solid` status colour | `#ECEEF7` + `ink 0.60` meta | 12 |
| Banner (page) | status @ 10% | status @ 28% | `ink 0.72` | 12 |
| Table header | `#0D1024` | bottom `ink 0.08` | `ink 0.60` eyebrow | — |
| Table row | transparent | top `ink 0.07` | `#ECEEF7` | — |
| Table row hover | `#131734` | — | — | — |
| KPI cell | `#171B36` | none | eyebrow `ink 0.60` + 7px status square, value `#ECEEF7`, caption `ink 0.60` | 16 |
| Clearance stepper | 3px rail: done `#58CF9A`, pending `ink 0.14`; label done `#ECEEF7` 500, pending `ink 0.60` | | | 99px |
| Environment chip | status @ 12% | status @ 30% | status colour, 6px dot | 9 |

---

## 3. Light theme (designed — no source mock)

Same structural rules, same token names, same alpha/step *ratios*. Hues carry over from the current light theme (cool slate neutrals) with the indigo primary shifted to Aurora's violet family so both themes share one accent identity.

**One deliberate inversion:** in dark, `inset` is *lighter* than `card` (it steps forward). In light, `inset` must be *darker* than `card`, because `card` is already white and there is nothing brighter. So the inset step reverses direction while keeping the same step magnitude. Every other step keeps its direction (canvas is the ground, chrome sits between ground and card, card is the content plane).

Ink base: `#141731`.

### 3.1 Surfaces

| Token | Value | Role | Adjacent-step ratio |
|---|---|---|---|
| `--canvas` | `linear-gradient(155deg, #ECEEF8 0%, #E4E8F4 45%, #E9ECF7 100%)` | page frame ground | — |
| `--canvas-base` | `#ECEEF8` | flat fallback | — |
| `--background` | `#E4E8F4` | `body` behind the frame | — |
| `--chrome` | `#F4F6FC` | 60px bar, 226px rail, split aside | canvas → chrome **1.133** |
| `--surface-panel` | `#FFFFFF` | card / panel plane | chrome → card **1.081**, canvas → card **1.225** |
| `--surface-raised` | `#F0F2FA` | inset well | card → inset **1.118** |
| `--surface-muted` | `#F5F7FD` | table header / footer | card → header **1.071** |
| `--surface` | `#FFFFFF` | alias of card | — |
| `--surface-row-hover` | `#F6F8FD` | table row hover | card → hover **1.063** |
| `--border` | `rgba(20,23,49,0.10)` | hairline | — |
| `--border-strong` | `rgba(20,23,49,0.16)` | emphasised divider | — |
| `--border-control` | `#7F86A2` | input / button boundary (3.60 on card, 3.22 on inset) | — |
| `--outline` | `= --border` | back-compat alias | — |
| `--shadow-frame` | `0 24px 64px rgba(20,23,49,0.14)` | the only shadow, retuned for light (the dark `rgba(0,0,0,0.6)` reads as dirt on a light ground) | — |

### 3.2 Ink / text

| Token | Value | Contrast card / chrome / inset / canvas | Use |
|---|---|---|---|
| `--foreground` | `#141731` | 17.55 / 15.97 / 16.24 / 14.49 | headings, values, row primary |
| `--foreground-secondary` | `rgba(20,23,49,0.72)` | 7.00 / 6.73 / 6.62 / 6.31 | body, labels, banner text |
| `--muted` | `rgba(20,23,49,0.64)` | 5.30 / 5.14 / 5.07 / 4.89 | captions, eyebrows, table heads, nav idle |
| `--foreground-disabled` | `rgba(20,23,49,0.55)` | 3.85 — 1.4.3 exempt (inactive) | disabled control text only |

Note the light ladder is *not* the dark ladder: dark's `0.60` muted maps to light's `0.64`, because alpha-over-light loses contrast faster than alpha-over-dark. Same visual weight, different number.

### 3.3 Accent, primary, status

| Token | Value | Role |
|---|---|---|
| `--primary` | `#6D3AE0` | accent, links, focus ring (5.15–6.30 on every surface, ≥3:1 as a ring everywhere) |
| `--primary-strong` | `#5A2BC4` | hover |
| `--primary-gradient` | `linear-gradient(140deg, #7C4DF5, #4468DE)` | primary button (white ink: 4.96 light stop / 4.91 dark stop) |
| `--brand-gradient` | `linear-gradient(140deg, #7C4DF5, #2E86C8)` | logo mark, progress fill |
| `--primary-ink` | `#FFFFFF` | text on the primary gradient |
| `--primary-soft` | `rgba(109,58,224,0.14)` | accent chip fill |
| `--primary-soft-ink` | `#6D3AE0` | text on accent chip (4.59 worst case) |
| `--nav-active` | `linear-gradient(100deg, rgba(109,58,224,0.16), rgba(46,134,200,0.09))` | active rail item |
| `--nav-active-border` | `rgba(109,58,224,0.30)` | active rail item border |
Same convention as dark: `--<status>` is the **fill** (opaque, tint pre-composited over `#FFFFFF`), `--<status>-ink` is the **text**.

| Token | Value | Role | Text-on-fill |
|---|---|---|---|
| `--success` | `#DDEAE5` | fill (= `#0F6B45` @14%) | — |
| `--success-ink` | `#0F6B45` | text on `--success` | 5.30 |
| `--warning` | `#EFE7DB` | fill (= `#8A5300` @14%) | — |
| `--warning-ink` | `#8A5300` | text on `--warning` | 5.16 |
| `--error` | `#F3DCD9` | fill (= `#B32410` @16%) | — |
| `--error-ink` | `#B32410` | text on `--error` | 5.05 |
| `--neutral-status` | `#E1E2E9` | fill (= `#454C73` @16%) | — |
| `--neutral-status-ink` | `#454C73` | text on `--neutral-status` | 6.43 |
| `--draft` | `#ECECEF` | fill (= ink @8%) | — |
| `--draft-ink` | `rgba(20,23,49,0.70)` | text on `--draft` (§7 F7) | 6.04 |

Borders, for the tinted-border variant: success `#B7D3C7`, warning `#DCCBB3`, error `#E7B9B3`, offline24 `#C7C9D5`, primary `#D3C4F6`.

Status colours as 3px rails / dots: 5.64–7.41 against inset, all ≥3:1.

### 3.4 Type, spacing, radius

Identical to dark (§2.4–§2.6). Nothing in the type, spacing or radius scale is theme-dependent.

### 3.5 Component states (light)

Structurally identical to §2.7; substitute the light values above and the following:

| Component | Difference from dark |
|---|---|
| Button primary | white ink on `--primary-gradient` |
| Button secondary | `rgba(20,23,49,0.05)` fill, `rgba(20,23,49,0.16)` border, `#141731` text |
| Button destructive | `rgba(179,36,16,0.12)` fill, `rgba(179,36,16,0.32)` border, `#B32410` text (5.41) |
| Button disabled | `rgba(20,23,49,0.04)` fill, `rgba(20,23,49,0.10)` border, `ink 0.55` |
| Field default | `#F0F2FA` fill, `#7F86A2` border |
| Field invalid | `rgba(179,36,16,0.08)` fill, `rgba(179,36,16,0.45)` border, message `#B32410` (5.79) |
| Field read-only | `rgba(20,23,49,0.04)` fill, `rgba(20,23,49,0.08)` border, `ink 0.64` (5.14) |
| Alert blocking | `#F0F2FA` body, 3px left rail in the light status colour |
| Banner | status @ 12% fill, status @ 28% border, `ink 0.72` text (8.36) |
| Table header | `#F5F7FD` |
| Table row hover | `#F6F8FD` |
| KPI cell | `#F0F2FA` |
| Stepper pending rail | `rgba(20,23,49,0.16)` |
| Frame shadow | `0 24px 64px rgba(20,23,49,0.14)` |

---

## 4. Font swap plan

Replaces Inter (`--font-inter`) + Manrope (`--font-manrope`) in `apps/web/src/app/layout.tsx`.

```ts
import { Sora, IBM_Plex_Mono } from 'next/font/google';

const sora = Sora({
  subsets: ['latin', 'latin-ext'],
  weight: ['300', '400', '500', '600', '700'],
  variable: '--font-sora',
  display: 'swap',
});

const ibmPlexMono = IBM_Plex_Mono({
  subsets: ['latin', 'latin-ext'],
  weight: ['400', '500', '600'],
  variable: '--font-ibm-plex-mono',
  display: 'swap',
});
```

- `latin-ext` is **required** — the UI is Polish (`ą ć ę ł ń ó ś ź ż`). The current `subsets: ['latin']` is already a live bug for Inter/Manrope; do not carry it forward.
- `<body className={`${sora.variable} ${ibmPlexMono.variable} …`}>` — same wiring shape as today.
- Sora ships as a variable font, so the five weights cost one file; IBM Plex Mono is static, so three weights are three files. Do not add 200/800 "for later".
- `globals.css` `@theme inline`: `--font-sans: var(--font-sora)`, `--font-mono: var(--font-ibm-plex-mono)`. `--font-display` is **deleted** — Aurora Solid has no separate display face; headings are Sora 600.
- `body { font-family: var(--font-sora), system-ui, sans-serif; }` replaces the `var(--font-inter)` rule.
- Every `font-display`/Manrope class in components resolves to Sora; grep and delete rather than aliasing.
- CLS: `display: 'swap'` + `next/font` self-hosting keeps metrics-adjusted fallbacks in place. No preload changes needed.

---

## 5. Frame constants for Phase 1

| Constant | Value |
|---|---|
| Chrome bar height | 60px |
| Chrome bar padding | `0 22px` |
| Rail width | 226px |
| Rail padding | `18px 14px` |
| Rail item gap | 2px |
| Main pane padding | `22px 26px 26px` |
| Page gutter | 26px |
| Table row height | 44px |
| Table gutter | 18px |
| Split list column | 300px |
| Detail aside column | 372px |
| Frame radius | 20px |
| Mobile frame radius | 34px |

---

## 6. Migration map — existing variable → Aurora Solid

| Existing | Dark | Light | Note |
|---|---|---|---|
| `--background` | `#080A14` | `#E4E8F4` | body behind frame |
| `--surface` | `#10132A` | `#FFFFFF` | alias of card |
| `--surface-muted` | `#0D1024` | `#F5F7FD` | now specifically "table header" |
| `--surface-panel` | `#10132A` | `#FFFFFF` | card (40 call sites) |
| `--surface-raised` | `#171B36` | `#F0F2FA` | inset (44 call sites) |
| `--foreground` | `#ECEEF7` | `#141731` | |
| `--muted` | `ink 0.60` | `ink 0.64` | 150 call sites |
| `--outline` | `= --border` | `= --border` | 57 call sites, kept as alias |
| `--primary` | `#A78BFA` | `#6D3AE0` | |
| `--primary-strong` | `#C4B1FD` | `#5A2BC4` | |
| `--primary-soft` | `rgba(167,139,250,0.14)` | `rgba(109,58,224,0.14)` | |
| `--primary-ink` | `#0C0D1C` | `#FFFFFF` | |
| `--primary-soft-ink` | `#A78BFA` | `#6D3AE0` | |
| `--success` — **fill** | `#1A2D3A` | `#DDEAE5` | semantics **unchanged**; value repointed. Opaque, not rgba |
| `--success-ink` — **text** | `#58CF9A` | `#0F6B45` | semantics unchanged (17 `text-success-ink` sites) |
| `--warning` — **fill** | `#302B31` | `#EFE7DB` | semantics unchanged |
| `--warning-ink` — **text** | `#F5BE5A` | `#8A5300` | semantics unchanged (10 sites) |
| `--error` — **fill** | `#342334` | `#F3DCD9` | semantics unchanged |
| `--error-ink` — **text** | `#F07A6A` | `#B32410` | semantics unchanged (25 sites) |
| `--neutral-status` — **fill** | `#242842` | `#E1E2E9` | **new**, offline24 |
| `--neutral-status-ink` — **text** | `#B6BCE0` | `#454C73` | **new**, offline24 |
| `--draft` / `--draft-ink` | `#22253A` / `ink 0.60` | `#ECECEF` / `ink 0.70` | **new**, draft chip |
| `--success-soft` / `--error-soft` | **deleted** | **deleted** | Aurora has one tint level per status; the ~20 `bg-error-soft*` sites move to `--error` |
| `--error-action-ink` | **deleted** | **deleted** | removed with the destructive-button rebuild in §8 (`Button.tsx:18` is its only consumer) — destructive becomes a tinted fill with `--error-ink` text, so no white-on-red ink is needed |
| `--secondary-surface` / `--secondary-ink` | `ink 0.06` / `#ECEEF7` | `ink 0.05` / `#141731` | secondary button |
| `--shadow-soft` → `--shadow-frame` | `0 30px 90px rgba(0,0,0,0.6)` | `0 24px 64px rgba(20,23,49,0.14)` | |
| `--shadow-aura` | **deleted** | **deleted** | |
| `--font-display` | **deleted** | **deleted** | |
| `--radius-lg` / `--radius-xl` | **deleted** | **deleted** | replaced by the 5-step scale |

**Migration trap — strip the opacity modifiers.** Status fills are now opaque and already carry their tint. Existing call sites apply a *second* Tailwind modifier on top (`bg-success/25`, `bg-success/15`, `bg-warning/10`, `bg-error-soft/70`, `border-error/20`, `border-success/30`, …). Left in place these render the new fills at a quarter strength or less — effectively invisible. Phase 1 must drop the `/NN` from every `bg-`/`border-` status utility, not just repoint the variables. Same applies to `bg-surface-panel/55` and friends in §8.

---

## 7. WCAG AA contrast — findings and fixes

Method: WCAG 2.1 relative luminance, alpha layers composited against the actual parent surface (not against pure black/white). Threshold 4.5:1 for text ≤18.66px/bold-14px, 3:1 for UI component boundaries and status rails/dots. Worst-case surface used for every pairing.

### Passing without change

Dark: ink 100% on every surface **14.55–17.05**; all four status colours on their tints over card **5.34–8.18** and over inset **4.86–7.41**; accent `#A78BFA` on card **6.72** / inset **6.19**; KSeF TEST/PROD chips on chrome **9.35 / 8.29**; primary-button ink on both gradient stops **8.32 / 7.92**; active-nav ink **11.53**; warning banner text **8.92**; invalid-field message **6.07**.

Light: ink 100% on every surface **14.49–17.55**; all four status colours on their tints over the worst surface **4.55–5.80**; accent on card/inset/canvas **6.30 / 5.64 / 5.15**; environment chips on chrome **4.86–5.09**; white on both gradient stops **4.96 / 4.91**; destructive button **5.41**; banner **8.36**; invalid message **5.79**; every status rail/dot ≥ **5.64** against inset.

### Failures found and resolved

| # | Theme | Pairing | Measured | Fix |
|---|---|---|---|---|
| **F1** | dark | Mock's `ink 0.45` (eyebrow labels, table column heads, mono metadata, avatar caption) on card | **4.04** | Muted floor raised to `ink 0.60` → **6.26**. Mock alphas 0.55/0.50/0.45/0.42/0.40/0.35 for readable text all collapse to 0.60. |
| **F2** | dark | DRAFT chip `ink 0.55` on `ink 0.08` fill | **4.99** — passes, but 0.55 fails at **4.04** on inset-backed chips | Chip text set to `ink 0.60` → **5.65** on card, **5.4+** everywhere. |
| **F3** | dark | Read-only field text `ink 0.45` on `ink 0.03` | **4.00** | → `ink 0.60`, **6.08**. Read-only content is readable content; it is not exempt like disabled. |
| **F4** | dark | Disabled button text `ink 0.35` on `ink 0.04` | **2.93** | Raised to `ink 0.45` → **3.97**. Still below 4.5 but WCAG 1.4.3 explicitly exempts inactive components; 0.35 was too faint to read *at all*, 0.45 is legible-but-clearly-off. Light needs `ink 0.55` for the same **3.85** (see F9). |
| **F9** | light | Disabled text ported at dark's `ink 0.45` | **2.87** | Raised to `ink 0.55` → **3.85**, matching dark's 3.97 legibility. Parity of *legibility*, not parity of alpha value — the same reasoning as F6. Raised on frontend-architect's Phase 0 review. |
| **F5** | **both** | Input/select boundary. Mock uses `ink 0.12` on `#171B36` → **1.39** (dark) and the light equivalent → **1.28**. The field *fill* alone does not identify the control either: card→inset is only **1.085** (dark) / **1.118** (light), far under 3:1. So WCAG 1.4.11 is failed with no fallback identifier. | **1.28–1.48** | New `--border-control` token, opaque and outside the ink-alpha ladder: dark `#6B7398` (**3.63** on inset, **3.94** on card), light `#7F86A2` (**3.22** on inset, **3.60** on card). Applies to input, select, textarea, and outlined buttons. The `ink 0.10/0.14` hairlines stay as-is for *dividers*, which are decorative and exempt. |
| **F6** | light | Ink alpha ladder ported 1:1 from dark: `0.55` on white | **3.94** | Light needs its own ladder. Secondary `0.72` → **7.00**, muted `0.64` → **5.30** (worst surface **4.89**). Anything below 0.64 is banned for text in light. |
| **F7** | light | DRAFT chip `ink 0.64` on `ink 0.08` over inset | **4.75** on card, **4.75** on inset — marginal | Set to `ink 0.70` → **5.72**. The one place light diverges from the shared alpha ladder. |
| **F8** | light | First primary-gradient candidate `#7C4DF5 → #3B74D9`, white ink on the dark stop | **4.48** | Dark stop moved to `#4468DE` → **4.91**. Also keeps the gradient inside the violet→indigo family instead of drifting to a generic blue. |

### Accepted, documented

- **Dark canvas → card separation is 1.029**, below the 1.03 target — this is the mock's own value. Mitigated by the mandatory `ink 0.10` hairline on every card. Do not "fix" it by lightening the card; it would break the mock's match. Light does not have this problem (**1.225**).
- **Hairline dividers never reach 3:1** in either theme (dark 1.28, light 1.23). Correct and intentional: 1.4.11 covers boundaries *required to identify a component*. Row separators, card outlines and section rules are decorative — the content identifies the structure. Controls get `--border-control` instead (F5).
- **Disabled text** (dark **3.97**, light **3.85**) is below 4.5 in both themes under WCAG 1.4.3's inactive-component exemption.

---

## 8. Component impact list — Phase 1 change set

Audit of `apps/web/src/components` and `apps/web/src/app` for `blur(` / `backdrop-filter` / stacked or non-frame shadows / translucent scrolling fills.

### Blocking — `backdrop-blur` must be removed (24 sites, 18 files)

| File | Line(s) | Violation | Phase 1 action |
|---|---|---|---|
| `apps/web/src/components/atoms/Badge.tsx` | 7–11 | `backdrop-blur-xl` on all five variants + translucent `/85 /90 /95` fills | Rebuild as the status-chip spec: opaque tint fill, `--radius-chip`, IBM Plex Mono 10px/0.08em. Add the `offline24` neutral variant. |
| `apps/web/src/components/atoms/Button.tsx` | 10, 14, 18 | `backdrop-blur-xl` on secondary; `shadow-[var(--shadow-aura)]` on primary **and** destructive; `rounded-full` | Remove both shadows (no shadow on buttons), remove blur, `rounded-full` → `--radius-control`. Destructive becomes tinted-fill, not solid `bg-error`. |
| `apps/web/src/components/atoms/Input.tsx` | 8 | `backdrop-blur-xl`, `bg-surface-raised/65`, `rounded-[1rem]`, `ring-4` focus | Opaque `--surface-raised`, `--border-control`, `--radius-control`, focus = 1px `--primary` border + 2px offset outline (not a 4px ring). |
| `apps/web/src/components/atoms/Select.tsx` | 8 | same as Input | same |
| `apps/web/src/components/atoms/Textarea.tsx` | 11 | same as Input, `rounded-[1.25rem]` | same, `--radius-control` |
| `apps/web/src/components/atoms/FloatingLabelInput.tsx` | 15 | `backdrop-blur-xl`, `bg-surface-raised/65` | same |
| `apps/web/src/components/atoms/FloatingLabelSelect.tsx` | 21 | same | same |
| `apps/web/src/components/molecules/MetricCard.tsx` | 39 | `backdrop-blur-xl` + `bg-surface-panel/80` on the icon puck | Rebuild as the KPI cell: `--surface-raised`, `--radius-card`, 7px status square instead of a round puck. |
| `apps/web/src/components/organisms/AppHeader.tsx` | 44 | `backdrop-blur-sm` + `bg-surface-panel/95` | Rebuild as the 60px chrome bar: opaque `--chrome`, `border-bottom: 1px solid --border`. |
| `apps/web/src/components/organisms/DashboardShell.tsx` | 38 | `backdrop-blur-[28px]` on the mobile nav, `rounded-full` | Opaque `--chrome`, `--radius-inset`. |
| `apps/web/src/components/organisms/InvoiceLineItemsEditor.tsx` | 327 | `backdrop-blur-xl` + `bg-surface-raised/50` | Opaque `--surface-raised`, `--radius-inset`. |
| `apps/web/src/app/dashboard/contractors/ContractorList.tsx` | 78 | `backdrop-blur-xl` + `bg-surface-panel/55`; also `shadow-sm` on the active filter pill (line 56) | Opaque card + remove `shadow-sm`. |
| `apps/web/src/app/dashboard/contractors/page.tsx` | 72 | `backdrop-blur-xl` + `/55` + organic radius | Opaque card, `--radius-card`. |
| `apps/web/src/app/dashboard/incoming/KsefSyncButton.tsx` | 91, 94 | `backdrop-blur-sm` on the modal scrim; `shadow-xl` on the dialog | Scrim → flat `rgba(8,10,20,0.72)`. Dialog is inside the frame, so **no shadow** — it gets `--surface-panel` + `--border-strong` + `--radius-card`. |
| `apps/web/src/app/dashboard/invoices/[id]/InvoiceActions.tsx` | 292, 341 | `backdrop-blur-xl` + `bg-surface-panel/70`, `rounded-full` | Opaque secondary-button spec. |
| `apps/web/src/app/dashboard/invoices/[id]/page.tsx` | 206 | `backdrop-blur-xl` + `bg-surface-raised/50` | Opaque inset. |
| `apps/web/src/app/dashboard/settings/KsefSettingsForm.tsx` | 130 | `backdrop-blur-xl` + `/55` | Opaque card. |
| `apps/web/src/app/dashboard/settings/page.tsx` | 99, 124 | `backdrop-blur-xl` + `/55` ×2 | Opaque card. |

### Shadow violations — 7 sites in 5 files (must collapse to the single frame shadow)

| File | Line(s) | Violation |
|---|---|---|
| `apps/web/src/components/atoms/Surface.tsx` | 13, 14 | `shadow-soft` on both `raised` and `glass` tones. The `glass` tone (`bg-surface-panel/95 shadow-soft`) has no Aurora equivalent at all — **delete the tone**, migrate its call sites to `panel`. Retone the whole component to `canvas / chrome / panel / inset` and swap `shapeClasses` (`rounded-[1.75rem]` / `rounded-[2.5rem_1.5rem_2rem_1.25rem]` / `rounded-full`) for the 5-step radius scale. |
| `apps/web/src/components/atoms/Button.tsx` | 10, 18 | `shadow-[var(--shadow-aura)]` ×2 |
| `apps/web/src/app/loading.tsx` | 4 | `shadow-soft` on a loading card |
| `apps/web/src/app/dashboard/contractors/ContractorList.tsx` | 56 | `shadow-sm` on the active filter pill |
| `apps/web/src/app/dashboard/incoming/KsefSyncButton.tsx` | 94 | `shadow-xl` on the modal |
| `apps/web/src/app/globals.css` | 34, 64, 97, 98 | two shadow tokens (`--shadow-soft`, `--shadow-aura`) → one `--shadow-frame` |

### ThemeSwitcher — checked, one issue

`apps/web/src/components/organisms/ThemeSwitcher.tsx:40` — **no blur and no shadow**, contrary to expectation. It is clean on the two blocking rules. The one Phase 1 change it needs is cosmetic: `rounded-full` → `--radius-control`, and `bg-surface-panel` → `--chrome` since it lives in the chrome bar. Not a blocker.

### Translucent scrolling fills (secondary sweep)

`bg-*/NN` on a surface that scrolls breaks the opaque-fill rule even without blur. 32 files match `bg-[a-z-]*/[0-9]`; the 18 above cover the ones that also blur. The remaining 14 need the same opaque-fill pass in Phase 1:

`app/dashboard/contractors/[id]/edit/EditContractorForm.tsx`, `app/dashboard/contractors/ContractorServiceRates.tsx`, `app/dashboard/incoming/[id]/ReviewPanel.tsx`, `app/dashboard/invoices/[id]/edit/EditInvoiceForm.tsx`, `app/dashboard/invoices/new/NewInvoiceForm.tsx`, `app/dashboard/settings/CompanyBackupPolicyForm.tsx`, `app/dashboard/settings/CompanyDetailsForm.tsx`, `app/dashboard/settings/InvoiceNumberPatternForm.tsx`, `app/dashboard/settings/MembersTab.tsx`, `app/dashboard/settings/service-catalog/ServiceCatalogManager.tsx`, `components/KsefEnvironmentSwitcher.tsx`, `components/molecules/ErrorState.tsx`, `components/organisms/IncomingInvoicesTable.tsx`, `components/organisms/InvoicesTable.tsx`.

Legitimate exceptions: tint fills that *are* the spec (`--primary-soft`, status tints at 8–16%) and the modal scrim.

### `globals.css` (Phase 1, not now)

- Delete the two `radial-gradient` body backgrounds (lines 156–168) — replaced by the `--canvas` linear gradient on the frame.
- `--shadow-aura` (34, 64, 98) and `--shadow-soft` (33, 63, 97) → one `--shadow-frame`.
- `--font-inter` / `--font-manrope` / `--font-display` (68–69, 160) → `--font-sans: var(--font-sora)`, `--font-mono: var(--font-ibm-plex-mono)`.
- `--radius-md/lg/xl` (94–96) → the 5-step scale.
- `::selection` (183) uses `color-mix(… , black)`; needs a theme-aware value.

### Verification gate for Phase 1

```
grep -rn "blur(\|backdrop-blur\|backdrop-filter" apps/web/src   # must return nothing
grep -rn "shadow-" apps/web/src --include=*.tsx                 # only the frame element
pnpm --filter @ksiegowy/web typecheck && pnpm --filter @ksiegowy/web build
```

---

## 9. Open items for sign-off

1. **Light theme is original work** — §3 has no mock to diff against. The one structural liberty taken is the inset-step inversion (§3 preamble); everything else mirrors dark's ratios.
2. **`--border-control` is a new invention** (§7 F5). The mock's `ink 0.12` field border is an accessibility failure at 1.39:1 with no fallback identifier. If the design intent is to keep the mock's exact hairline look, the alternative is to raise the card→inset surface step to 3:1, which would visibly change every screen. The border was chosen as the smaller change.
3. **Dark muted text moves from the mock's 0.45 to 0.60** (§7 F1). This is the most visible deviation from the mock — eyebrow labels and table column heads will read noticeably brighter than the reference screens.
4. **Status fills are opaque hexes, not the mock's `rgba()` tints** (B1, and the architect's chip-fill note in §A2). Rendered colour is identical against the card surface; against inset and chrome the pre-composited fill is off by ~1% luminance from a live tint. Accepted — it is what makes the fills legal under §1 and keeps chips off the compositor on scrolling rows.
5. **Every `bg-`/`border-` status call site loses its `/NN` modifier** in Phase 1 (migration trap note, end of §6). Roughly 60 sites. This is a hand sweep, not a token repoint, and `--success-soft`/`--error-soft` removal fails silently.

---

## Frontend-Architect Addendum — Phase 1 prerequisites

Appended by **frontend-architect** as the B4/B5 items from the Phase 0 feasibility review. Sections §1–§9 above are owned by **ux-ui-architect** and are unchanged. This section covers only *how the tokens above become usable utilities* — it adds no new design values.

### A1. `@theme inline` mapping — Tailwind v4 needs this or no utility exists

The spec above defines `:root` custom properties. Tailwind v4 generates utilities **only** from namespaced keys inside `@theme inline`. A token declared at `:root` and not mapped here produces no class at all — silently, with no build error. Every new token in §2–§3 currently lacks a mapping.

Namespaces in play: `--color-*` → `bg-/text-/border-/fill-`, `--radius-*` → `rounded-`, `--shadow-*` → `shadow-`, `--font-*` → `font-`.

**Naming rule applied below:** new border tokens map into the existing `outline` utility vocabulary rather than a `border-border-*` stutter. The `:root` variable names from §2.1 are kept exactly as written; only the theme key differs.

| `:root` token (§2.1–§3.3) | `@theme inline` key | Utility | Note |
|---|---|---|---|
| `--canvas-base` | `--color-canvas` | `bg-canvas` | **flat hex only** — see A2 |
| `--chrome` | `--color-chrome` | `bg-chrome` | chrome bar, rail, split aside |
| `--surface-row-hover` | `--color-surface-row-hover` | `hover:bg-surface-row-hover` | |
| `--border` | *(none — reuse `--color-outline`)* | `border-outline` | `--outline: var(--border)` per §2.1; 68 existing call sites keep working with zero churn. Do **not** add `--color-border`. |
| `--border-strong` | `--color-outline-strong` | `border-outline-strong` | |
| `--border-control` | `--color-outline-control` | `border-outline-control` | input / select / textarea / outlined button (§7 F5) |
| `--foreground-secondary` | `--color-foreground-secondary` | `text-foreground-secondary` | |
| `--foreground-disabled` | `--color-foreground-disabled` | `text-foreground-disabled` | |
| `--neutral-status` | `--color-neutral-status` | `bg-neutral-status` | offline24 chip **fill**, opaque (B1 resolved) |
| `--neutral-status-ink` | `--color-neutral-status-ink` | `text-neutral-status-ink` | offline24 chip **text** (was `--neutral-status-tint`; renamed in B1) |
| `--draft` / `--draft-ink` | `--color-draft` / `--color-draft-ink` | `bg-draft` / `text-draft-ink` | draft chip fill + text |
| `--nav-active-border` | *(none — one call site)* | `border-[var(--nav-active-border)]` | single usage in `DashboardNavigation`; a theme key for one site is not worth it |
| `--radius-chip` … `--radius-frame` | `--radius-chip/control/inset/card/frame` | `rounded-chip` … `rounded-frame` | all five collision-free against Tailwind's defaults (`sm/md/lg/xl/2xl/3xl/full/none`) |
| `--shadow-frame` | `--shadow-frame` | `shadow-frame` | the only shadow |
| `--font-sora` | `--font-sans` | `font-sans` | |
| `--font-ibm-plex-mono` | `--font-mono` | `font-mono` | |

Existing keys that stay and are only repointed in value: `--color-background`, `--color-surface`, `--color-surface-muted`, `--color-surface-panel`, `--color-surface-raised`, `--color-foreground`, `--color-muted`, `--color-outline`, `--color-primary`, `--color-primary-strong`, `--color-primary-soft`, `--color-primary-ink`, `--color-primary-soft-ink`, `--color-secondary-surface`, `--color-secondary-ink`.

Keys **removed**: `--color-error-action-ink` (destructive is a tinted-fill button, §2.7), `--font-display`, `--radius-md`, `--radius-lg`, `--radius-xl`, `--shadow-soft`, `--shadow-aura`.

**B1 resolved — status keys are now specified and unblocked.** The convention is today's `globals.css` convention, unchanged: `--<status>` is the **fill**, `--<status>-ink` is the **text**. §2.3 was the incorrect half and has been rewritten; §6 was already right.

| Variable | `@theme inline` key | Utility | Note |
|---|---|---|---|
| `--success` | `--color-success` | `bg-success` | opaque fill |
| `--success-ink` | `--color-success-ink` | `text-success-ink` | text on fill |
| `--warning` | `--color-warning` | `bg-warning` | opaque fill |
| `--warning-ink` | `--color-warning-ink` | `text-warning-ink` | text on fill |
| `--error` | `--color-error` | `bg-error` | opaque fill |
| `--error-ink` | `--color-error-ink` | `text-error-ink` | text on fill |

`--color-success-soft` and `--color-error-soft` are **removed** — Aurora has one tint level per status; the ~20 `bg-error-soft*` sites move to `bg-error`. Removal is **silent** (no Tailwind default named `success-soft`/`error-soft`), so these must be swept by hand like `shadow-sm`.

The repoint is not a pure value swap: every call site also has to drop its `/NN` opacity modifier (see the migration trap note at the end of §6), because the fills now carry their own tint.

#### Deletion behaviour — what fails loudly vs silently

Only two of these fail loudly. Plan the sweep accordingly:

| Removed | What happens to existing call sites |
|---|---|
| `--radius-lg` / `--radius-xl` | **Silent.** `rounded-lg`/`rounded-xl` are Tailwind defaults, so they keep compiling — at 0.5rem/0.75rem instead of 1.5rem/2rem. See A3. |
| `--radius-md` | **Silent and harmless.** Tailwind's default `rounded-md` is 0.375rem — identical to today's value and to `--radius-chip`. No alias needed. |
| `--shadow-soft` | Silent no-op (no Tailwind default named `soft`); the 3 sites lose their shadow, which is the intent. Still delete them explicitly. |
| `shadow-sm` / `shadow-xl` | **Silent.** Both are Tailwind defaults and keep rendering. `ContractorList.tsx:56` and `KsefSyncButton.tsx:94` must be edited by hand — the token change will not touch them. |
| `--font-display` | Silent no-op; the 32 `font-display` sites become dead classes and inherit Sora. That is the desired end state — grep-and-delete is cleanup, not a blocker. |

### A2. The four gradient tokens must never enter the `--color-*` namespace

`--canvas`, `--primary-gradient`, `--brand-gradient`, and `--nav-active` hold `linear-gradient(…)` values. Registered under `--color-*`, `bg-canvas` compiles to `background-color: linear-gradient(…)` — an invalid declaration the browser drops with no error and no visible fallback. This is the single easiest way to break Phase 1 silently.

They are `background-image` values. Consume them as follows:

| Token | Consumed by | How |
|---|---|---|
| `--canvas` | the outer page frame, 1 element | A hand-written `.app-frame` rule in `globals.css` (`background-image: var(--canvas)`), same pattern as the existing `.app-header-content` rule. Not a utility. |
| `--primary-gradient` | `atoms/Button.tsx`, primary variant only | `bg-[image:var(--primary-gradient)]` inline |
| `--brand-gradient` | logo mark + progress-bar fill, 2 sites | `bg-[image:var(--brand-gradient)]` inline |
| `--nav-active` | `DashboardNavigation` active item, 1 site | `bg-[image:var(--nav-active)]` inline |

**`--canvas-base` is the safety net and it is wired correctly.** §2.1/§3.1 define it as the flat hex at the gradient's first stop. The mapping in A1 points `--color-canvas` at `--canvas-base`, never at `--canvas`. Net effect: anything named `canvas` in the colour namespace is always an opaque hex, and the gradient only ever reaches the page through `.app-frame`. Keep that invariant — it is what makes the gradient impossible to misuse.

`.app-frame` should also carry `background-color: var(--canvas-base)` beneath the gradient so the frame is opaque if the gradient fails to paint.

**Chip-fill note — resolved.** This review caught that §1 bans translucent fills on scrolling surfaces while §2.3/§3.3 specified chip fills as `rgba(…, 0.14–0.16)`, so a table-row chip violated the rule it sat next to. Fixed exactly as suggested: every status, `offline24` and draft fill in §2.3/§3.3 is now an opaque hex, pre-composited against the card surface. Same rendered colour, no per-frame compositing. The source tints are kept in a separate table for deriving a fill against a non-card ground.

### A3. Radius sweep — the exact 10 sites

`grep "var(--radius"` returns zero consumers outside `globals.css`, so the old scale is reached only through utilities. `rounded-md` (6 sites) needs no action per A1. These 10 change value silently when `--radius-lg`/`--radius-xl` are deleted and must be rewritten by hand:

**`rounded-lg` → `rounded-control`** (1.5rem → 9px; both are interactive controls)

| File | Line |
|---|---|
| `apps/web/src/components/organisms/DashboardNavigation.tsx` | 45 |
| `apps/web/src/components/organisms/InvoiceLineItemsEditor.tsx` | 217 |

**`rounded-xl` → `rounded-control`** (2rem → 9px; all six are form fields)

| File | Line |
|---|---|
| `apps/web/src/app/dashboard/invoices/[id]/InvoiceActions.tsx` | 431, 471 |
| `apps/web/src/app/dashboard/incoming/KsefSyncButton.tsx` | 118, 133 |

**`rounded-xl` → `rounded-inset`** (2rem → 12px; all three are banners/alerts per §2.7)

| File | Line |
|---|---|
| `apps/web/src/app/dashboard/settings/InvoiceNumberPatternForm.tsx` | 169 |
| `apps/web/src/app/dashboard/incoming/KsefSyncButton.tsx` | 143, 153, 159 |

**Free win, same pass:** `rounded-2xl` (9 sites) was never overridden and resolves to Tailwind's default 1rem = 16px, which is exactly `--radius-card`. `rounded-2xl` → `rounded-card` is a pure rename with zero visual change. Do it now so the 5-step scale is the only radius vocabulary left.

`rounded-full` (33 sites) is already covered by §8.

### A4. `apps/e2e` is in Phase 1, not Phase 2

Not covered anywhere in §8 or in `spec/aurora-solid-redesign-plan.md`. `apps/e2e/tests/dashboard.spec.ts` runs its contrast assertions by **reconstructing atom classNames as literal strings** — 17 of them, e.g.:

```ts
['input', 'h-11 w-full rounded-[1rem] border border-outline bg-surface-raised/65 text-sm text-foreground'],
['danger button', 'rounded-full bg-error text-error-action-ink'],
```

Every one breaks in Phase 1: `rounded-full` is removed, `bg-surface-raised/65` goes opaque, fields move to `border-outline-control`, `--error-action-ink` is deleted. Because Phase 1's gate is only typecheck + build + grep, this surfaces first in Phase 2 and gets blamed on the wrong change.

- Add the `dashboard.spec.ts` probe update to the Phase 1 task list.
- Add `pnpm --filter @ksiegowy/e2e test` to Phase 1's verification gate.
- While in there: read computed styles off rendered atoms instead of hardcoding class strings, or Phases 2–5 will each re-break it.

### A5. Two `:root` tokens change *meaning*, not just value

Neither is a blocker; both will confuse whoever does the repoint if it is not written down.

- **`--surface`** flips role in dark: today `#070e1b` (= `--background`, the page ground), after `#10132A` (the card plane). Only 7 bare `bg-surface` sites, all benign, but `Surface`'s `base` tone silently becomes identical to `panel`. The §8 retone to `canvas / chrome / panel / inset` resolves it — just make sure `base` is retired rather than remapped.
- **`--surface-muted`** narrows from "generic step above background" to "table header specifically". Of its 4 call sites only `MembersTab.tsx:105` is an actual table header; `Surface` muted tone, `Badge` neutral, and `CompanyBackupPolicyForm.tsx:257` will otherwise inherit a table-header colour for non-table content. Reassign those three, don't just repoint.

### A6. Suggested Phase 1 commit order

1. Font swap alone — `layout.tsx`, `--font-sans`/`--font-mono`, delete the 32 `font-display` classes. Isolates any FOUT/CLS regression from 200 colour changes. The `subsets: ['latin']` Polish-diacritics bug (§4) is fixed here and is independently shippable ahead of everything else if you want it de-risked early.
2. `@theme inline` + `:root` token blocks per A1/A2. **B1 is resolved**, so the status tokens are no longer excluded — but keep them out of *this* commit anyway: their repoint is coupled to a hand sweep (step 4), and landing the variables without the sweep renders every status fill at a quarter strength.
3. Radius sweep (A3) + shadow deletions + the `backdrop-blur` removals from §8.
4. Status tokens: repoint `--<status>`/`--<status>-ink`, delete `--success-soft`/`--error-soft`/`--error-action-ink`, and strip the `/NN` modifiers from all ~60 `bg-`/`border-` status call sites in one commit (§6 migration trap). Both deletions fail silently, so grep, don't trust the build.
5. `apps/e2e` probes (A4) — must be in this phase, before Phase 2 opens.
