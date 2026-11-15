# AI review follow-up notes (report c39a3ee9)

Context: the AI review run `c39a3ee9-6f66-455a-a51b-f1d907c1f09c` rejected 25 of 27 draft entries (reviewers `deepseek-v4-flash`, `gpt-oss-120b`). Each objection was checked against the fetched official text (VAT Act consolidated text, Dz. U. 2026 poz. 1263; Dz. U. 2025 poz. 1740; the three MF pages). Entries were edited in `sources.draft.json`; this file records the objections that were wrong or only partly valid and the one disputed legal question. The draft is still not reviewed by a human, and a new runner pass is required.

## vat-106b-duty-to-issue: does the 3-month request limit cover only art. 43?

No. The reviewer was right and the draft was wrong. Official text, art. 106b ust. 2 and ust. 3 pkt 2:

> 2. Podatnik nie jest obowiązany do wystawienia faktury w odniesieniu do sprzedaży zwolnionej od podatku na podstawie art. 43 ust. 1, art. 113 ust. 1 i 9, art. 113a ust. 1 lub przepisów wydanych na podstawie art. 82 ust. 3.
> 3. Na żądanie nabywcy towaru lub usługi podatnik jest obowiązany wystawić fakturę dokumentującą: [...] 2) sprzedaż zwolnioną, o której mowa w ust. 2, z zastrzeżeniem art. 117 pkt 1 i art. 118 – jeżeli żądanie jej wystawienia zostało zgłoszone w terminie 3 miesięcy, licząc od końca miesiąca, w którym dostarczono towar lub wykonano usługę bądź otrzymano całość lub część zapłaty.

"sprzedaż zwolnioną, o której mowa w ust. 2" is every exemption listed in ust. 2 (art. 43 ust. 1, art. 113 ust. 1 and 9, art. 113a ust. 1, regulations under art. 82 ust. 3). The limit is in pkt 2 only; pkt 1 and 1a (request for invoices not required by ust. 1) contain no 3-month limit. The reservation "art. 117 pkt 1 i art. 118" (flat-rate farmer, exempt from issuing invoices) is now stated. The entry was rewritten, and eval cases Q12 and Q26 (which wrongly said a consumer must request an invoice within 3 months for any sale) were corrected.

## Objections judged wrong or only partly valid

| Entry | Objection | Verdict | Official text |
| --- | --- | --- | --- |
| all entries with `effectiveUntil` 2026-12-31 (and 2027-12-31 for `vat-106ni-ksef-penalty`): 106e-invoice-content, 106i, 19a, 106j, 106k, 106ga, 106gb, 106na, 106nda, 106ne-106nh, 106ni (both), reg-1740, mf-ksef-scope-and-dates, mf-fa3-brochure-corrections, 146ef | "effectiveUntil is not supported by the official text; no end date" | Factually right, but the date is not a claimed expiry. It is the corpus window (see Assumptions in README: periods 2026-02 to 2026-12, others fail closed). The loader requires both dates. | Art. 23 ustawy zmieniającej: "Ustawa wchodzi w życie z dniem 1 lutego 2026 r."; no provision has an end date. Fix: each excerpt now says the dates are the corpus window, not an entry-into-force or expiry date. Entries whose only objection was this date (106na, 106ne-106nh, mf-ksef-scope-and-dates, mf-fa3-brochure-corrections) changed only by that sentence. Consider stating this in the review prompt as well. |
| vat-146ef-temporary-rates | "effective dates contradict the text (from 2024-01-01)" | Valid for the start, so `effectiveFrom` is now 2024-01-01. The end stays the corpus window. | Art. 146ef ust. 1: "W okresie od dnia 1 stycznia 2024 r. do końca roku, w którym [...] jest wyższa niż 3 %". |
| vat-106i-issue-deadlines | "excerpt cites ust. 2-9 but the text contains only up to ust. 7" | Wrong about the law (ust. 8 and 9 exist), right about the anchored span. A span for ust. 7-9 was added and ust. 3-5, 8, 9 are now spelled out. | Art. 106i ust. 8: "Przepis ust. 7 pkt 1 nie dotyczy [...] art. 19a ust. 3, 4 i ust. 5 pkt 4"; ust. 9: "Przepisów ust. 3, 4 i 8 nie stosuje się [...] art. 8a ust. 1 i 3". |
| vat-106nda-offline24 | "the name offline24 is not in the official text" | Right that it is not in the Act, but it is in the MF FA(3) brochure ("w trybie „offline24” (art. 106nda ust. 10 ustawy)"). It is kept as a labelled editorial hint pointing to `mf-fa3-brochure-corrections`, not as law. | MF brochure, section on invoice dates. |
| vat-106k-credit-note-repealed | "the advisory conclusion is guidance" | Already labelled guidance; reviewer conceded. Label made explicit ("Wskazówka redakcyjna (nie przepis)"). Only the date objection stood. | Art. 106k: "(uchylony)". |
| vat-106ni-ust4-no-criminal-proceedings | "the provision is in force indefinitely" | True and irrelevant (corpus window). The 2026 "no penalties" statement is now labelled as a conclusion from art. 23 pkt 4 of the amending act. | "art. 1 pkt 24 w zakresie art. 106ni ust. 1–3 i 5–7 [...] wchodzą w życie z dniem 1 stycznia 2027 r." |
| vat-19a-tax-point | "reference to 'wskazanych przepisów szczególnych' is vague, perhaps not material" | Fixed anyway: the exact articles are named. The ust. 3 second sentence and the limits of the entry (ust. 1a, 1b, 2, 4a, 5, 7-11 not covered) are stated. | Art. 19a ust. 1 and ust. 3. |

All other objections were valid and were fixed (omitted reservations, exhaustive lists written as "m.in.", missing qualifiers, unlabelled editorial sentences, unsupported cross-reference to art. 145m). Entries that cannot state every exception now say what is not covered.

## Remaining doubts

- Art. 106b ust. 3 pkt 1 refers to "czynności, o których mowa w ust. 1 pkt 1, jeżeli obowiązek wystawienia faktury nie wynika z ust. 1". Who exactly may demand an invoice under pkt 1 (for example a consumer) is not clear from the text alone, so the entry and the eval no longer assert it beyond "na żądanie nabywcy". Check a KIS interpretation or MF explanatory notes.
- Whether the Monitor Polski notice ending the 23%/8% period was published (art. 146ef ust. 2, due 31 October 2026) was not verified by this pass; the entry says so. It must be checked before the next run.

## Second run (report a92fdb61)

`effectiveUntil` objections were ignored by decision: the dates are a corpus review window, not a legal expiry. Content objections were verified against the official text and fixed:

- vat-106e-special-marks: pkt 18a now reads "dokonaną na rzecz podatnika dostawę towarów lub świadczenie usług, o których mowa w załączniku nr 15".
- vat-108a-split-payment: ust. 1 states the payment moment; ust. 1e states that the public entity concluded the PPP agreement with the private partner (or its single-member or capital company).
- reg-1740-ksef-exclusions: § 2 pkt 2 and pkt 4 now say "zgodnie z przepisami wydanymi na podstawie art. 106o".
- mf-ksef-scope-and-dates: the MF page does list a third exclusion group ("czynności wymienione w rozporządzeniu wykonawczym, w tym między innymi"); a span for it was added and the three groups are described as MF states them (the first-group "m.in." was removed).
- vat-146ef-temporary-rates: the draft financial plan counts only if the plan was not submitted under art. 42 ust. 4; the 5% remark is labelled as an editorial note.
- vat-19a-tax-point: removed the description of ust. 5 (not in the anchored span) and the unsupported "zaliczki" remark.
- vat-106nda-offline24: ust. 2 now says the number identifies the invoice in KSeF (the "stusuje" typo is not in the file).
- vat-96-113-registration-exemption: art. 96 ust. 1 names naczelnik urzędu skarbowego.

Kept as is: vat-106b (second objection is only that the entry states it omits some exceptions, which is intended), vat-96b (the "does not cover pkt 3+" sentence is a scope statement, not a legal claim), vat-106e-simplified-amounts, 106ga, 106i, 106k, 106gb, 106na, 106ne-106nh, 106ni (date objections only).

## Rubric v3 (prompt `advisor-source-review-2026-11-v3`) and blank reasons (report a4c16f55)

Run `a4c16f55` rejected `vat-106b`, `vat-19a` and `vat-96b` mainly on `effectiveDatesSupported` because the official text carries no entry-into-force date, while `effectiveFrom` (2026-02-01) is the corpus window start. Rubric v3 states that `effectiveFrom` passes when the official text shows the provision in force on or before it, and fails only when the text shows a later start or a provision not yet in force. The `effectiveUntil` rule is unchanged.

Blank reasons: the runner wrote only `Rejected by <reviewer>` without the unmet checks or issues, and a reviewer call that failed after retries (timeout, `This operation was aborted`) aborted the whole run, leaving the in-flight entry (`mf-ksef-scope-and-dates`) rejected with no reason and the later entries (such as `mf-fa3`) absent from the report. Now every rejection records the unmet checks and issues, a failed reviewer call rejects only that entry with the error message, and the run continues. Only the model call limit still aborts the run.

## Third pass (2026-11-09): content fixes and open doubts

Checked against the fetched official texts (Dz. U. 2026 poz. 1263, SHA-256 `918f145a...`; Dz. U. 2025 poz. 1740; the MF pages). Every `officialText` span of every entry was re-checked as an exact substring of the runner-normalised fetched text (same `unpdf` extraction and whitespace/soft-hyphen normalisation as the runner): all 27 entries pass. The blank-reason entries `vat-106b`, `vat-19a`, `vat-96b`, `mf-fa3` therefore did not fail a span check; their blank reason came from the runner (reason text without the unmet checks, aborted run), not from the anchors.

- vat-41-nominal-rates: the 146ef note is now anchored (third span = art. 146ef ust. 1) and written as a conditional quote, not as "rates are replaced". Section and scope now list ust. 6 and say ust. 5 and 6a-12c are not covered.
- vat-145m: art. 145m ust. 1 itself says "do dnia 31 grudnia 2026 r."; the "przepis wygasa" claim and the "brak wpisu" remark were removed and replaced by that wording plus "wpis nie rozstrzyga, co obowiązuje po tej dacie".
- vat-106gb: ust. 5 now reads "podatnik jest obowiązany do oznaczenia faktury ustrukturyzowanej kodem ... w przypadku: 1) ... 2) ...".
- reg-1740: § 2 pkt 1 now names "podatników VAT uprawnionych do świadczenia tych usług oraz [...] podmioty działające w imieniu i na rzecz podatnika lub upoważnione przez niego osoby trzecie"; pkt 2 refers back to pkt 1.
- vat-106b, vat-19a, vat-96b: a span from the consolidated-text notice ("ogłasza się ... jednolity tekst ... z uwzględnieniem stanu prawnego na dzień 26 sierpnia 2026 r.") was added so that rubric v3 `effectiveFrom` can be judged. The Act itself has no per-article entry-into-force date for these articles. mf-fa3 already contains "od 1 lutego 2026 r." in its first span.
- Eval: Q06 no longer asserts that 23% applies unconditionally; Q26 no longer asserts that a consumer may demand an invoice (see below).

Dates under rubric v3: kept as corpus windows. `vat-146ef` keeps `effectiveFrom` 2024-01-01 (text-based, in force before the window start). Entries whose own window starts later (145m, mf-ksef-below-10000: 2026-04-01; 106ni penalty: 2027-01-01) or ends earlier (145l: 2026-03-31) are separate entries whose window equals the legal period; if v3 compares them to the global window start 2026-02-01 they would fail, so the owner should confirm the v3 prompt compares to the entry's own `effectiveFrom`.

### Monitor Polski notice under art. 146ef ust. 2

Source: ELI API list `https://api.sejm.gov.pl/eli/acts/MP/2026` read on 2026-11-09: 1100 positions (M.P. 2026 poz. 1-1100, latest announcement date 2026-10-29, promulgation up to 2026-11-05). Titles were searched for "VAT", "towarów i usług", "okresu obowiązywania", "obronie", "146ef", and all Minister Finansów i Gospodarki notices were read: none ends the 23%/8% period. So no notice was found by the 31 October 2026 deadline. This is negative evidence from a list, not official text: confirm on monitorpolski.gov.pl. Still unverified: whether the >3% GDP condition is met for 2026 (needs the 2026 budget act and the FWSZ plan) and whether act Dz. U. 2026 poz. 1270 changes the rates from 2027-01-01.

### Art. 106b ust. 3 pkt 1: who may demand an invoice

Statutory text (current consolidated text): "czynności, o których mowa w ust. 1 pkt 1, jeżeli obowiązek wystawienia faktury nie wynika z ust. 1, z wyjątkiem: a) czynności, o których mowa w art. 19a ust. 5 pkt 4, b) czynności, o których mowa w art. 106a pkt 3 i 4". The text names no buyer class: the buyer is "nabywca towaru lub usługi" whose invoice duty does not already arise from ust. 1. The MF handbook "Podręcznik KSeF 2.0 cz. II" (2026-02-09) treats art. 106b ust. 3 pkt 1 lit. a as the rule under which a private person renting to another private person has no invoice duty "nawet na żądanie nabywcy", which presupposes that pkt 1 otherwise gives B2C buyers a right to demand an invoice; it also says B2C invoices are outside the mandatory KSeF duty. The handbook is MF guidance, not law, and no KIS interpretation was read (eureka.mf.gov.pl/385539 could not be read). The corpus entry therefore says only "na żądanie nabywcy ... jeżeli obowiązek nie wynika z ust. 1". Owner: if the advisor should state that consumers may demand an invoice, add the MF handbook page as a separate source entry or read a KIS interpretation first.

## Fourth pass (2026-11-09, report e3ce1493, rubric v3): verbatim excerpts

Real content rejections in `e3ce1493` (the rest were 429 failures) came mostly from `openai/gpt-oss-120b` objecting that the drafter's excerpts paraphrase, add scope remarks or summarise. The reviewer sees every entry field except `officialText`, but compares only `excerpt` with `officialText`. Fix: each of the 7 entries now has `excerptKind: "quote"`; `excerpt` is the official text itself (PDF line-break hyphens such as "wyjąt- kiem" joined, nothing else changed), with no summary, scope remark or window remark. Scope and caveats moved to `section`, `title` and `drafterNotes`. Every `officialText` span was re-checked as an exact substring of the runner-normalised fetched text (PDF via `unpdf`, MF page via the runner's HTML stripping), and every excerpt as a substring of the hyphen-joined spans. Entries that were too wide were split (within 2000 / 4000 characters and 4 spans), so 27 entries became 31.

| Entry | Objection | Change |
|---|---|---|
| vat-106b-duty-to-issue | paraphrase, "chyba że" and exceptions not in text, art. 117/118 mixed in, date | Excerpt = art. 106b ust. 1, 1a, 1b, 2 verbatim (ust. 1 pkt 4 lit. a-c in full). Art. 117 span removed. Ust. 3 and 5 moved to new `vat-106b-invoice-on-request`. |
| vat-106e-simplified-amounts | ust. 6-11 "added", rounding lumped in | Excerpt = ust. 5 (all pkt) and ust. 6 verbatim. Ust. 7-11 moved to new `vat-106e-tax-amount-calculation`. |
| vat-19a-tax-point | `effectiveDatesSupported` unsure (deepseek) | Excerpt = ust. 1-4 verbatim (incl. 1a, 1b, 2). Consolidated-text notice span kept. See open doubt 1. |
| vat-41-nominal-rates | rolnicy/6a-12c added, 146ef interpreted, mixed regime | Art. 146ef removed from this entry (it has its own entry `vat-146ef-temporary-rates`). Excerpt = art. 41 ust. 1-6 verbatim (ust. 5 now included, so nothing is skipped). |
| vat-96-113-registration-exemption | ust. 3a-3b, 3-4, 11-13 "added", wording drift, mixed amendments | Split into `vat-96-registration-duty` (art. 96 ust. 1-3), this id (art. 113 ust. 1-2 plus footnote 29, in force 2026-01-01) and `vat-113-loss-resignation-new-business` (art. 113 ust. 3-10). Id kept for eval stability although it now holds only art. 113 ust. 1-2. |
| vat-96b-taxpayer-list | summary note about ust. 3 pkt 3, "także" vs "w tym", omitted "w tym podmiotów" | Excerpt = art. 96b ust. 1, 2 and ust. 3 pkt 1-2a verbatim. The truncation at pkt 2a is stated in `section` and `drafterNotes`. |
| mf-ksef-below-10000 | "brutto", missing 31.12.2026, florist 2027 added, paraphrase shown as law | Excerpt = verbatim MF questions and answers 4, 9, 13, 14 (Q4 states "do końca 2026 r."). Florist span removed. Title says "wyjaśnienia MF, nie przepis prawa". The MF text itself has a typo ("która przekroczył"); kept verbatim. |

Eval changes: Q12 and Q26 now require `vat-106b-invoice-on-request` (they test ust. 3 and 5); Q23 requires `vat-106e-tax-amount-calculation`; Q25 requires `vat-96-113-registration-exemption` and `vat-96-registration-duty` (optional: `vat-113-loss-resignation-new-business`); Q31 gets both new ids as optional. Q05 (ust. 1a), Q21, Q06/Q07/Q28, Q09, Q30 are unchanged and still covered by the same ids. `questions.md` and README entry counts (27) were not edited here (outside the allowed files); they still list the old ids/counts and need a sync.

### Open doubts (cannot be settled from the official text)

1. Dates for 106b, 19a, 96, 96b, 113 ust. 3-10, 41: the consolidated text has no per-article entry-into-force date, so the only evidence is the notice "z uwzględnieniem stanu prawnego na dzień 26 sierpnia 2026 r." (after `effectiveFrom` 2026-02-01). Rubric v3 should pass this (fail only when the text shows a later start), but a strict reviewer may still answer `unsure`. If that recurs, the options are a later `effectiveFrom` for these entries (2026-08-26) or a reviewer prompt that states the consolidated text is the evidence of being in force.
2. The amending act Dz. U. 2026 poz. 1270 changes art. 19a, 41, 96b ust. 2, 106b ust. 3 pkt 2 and art. 113 from 2027-01-01 (see earlier notes). `effectiveUntil` 2026-12-31 keeps these entries clear of it; the act's text was not read here.
3. The art. 106e ust. 7 formula is a fraction flattened by the PDF into "KP = WB x SP 100 + SP". The excerpt keeps that extraction verbatim; the fraction reading (WB x SP over 100 + SP) is the arithmetic meaning, verified against Q23 (1 230 x 23 / 123 = 230,00), not text from the Act.
4. Art. 106b ust. 3 pkt 1 (who may demand an invoice) is unchanged, see the section above.
5. The MF page may change without notice; the anchored text is the version fetched on 2026-10-31 and re-fetched on 2026-11-09 (all three spans still present).

## Fifth pass (2026-11-09, report 967cf884, rubric v3, 24/31 approved)

| Entry | Objection | Change |
|---|---|---|
| vat-106e-special-marks, vat-106e-simplified-amounts, vat-19a-tax-point, vat-96-registration-duty, vat-113-loss-resignation-new-business | `effectiveDatesSupported=unsure` (deepseek): the consolidated text proves the state of law only on 2026-08-26, not on 2026-02-01 | Owner-delegated decision: `effectiveFrom` set to 2026-08-26 (the date the official text proves); `effectiveUntil` unchanged (2026-12-31). The window sentence in the special-marks excerpt was updated to match. |
| vat-106na-ksef-dates | `guidanceLabelled=fail` (gpt-oss): interpretive remarks in the excerpt not labelled as guidance | Excerpt now holds only the paraphrase of art. 106na ust. 1, 3, 4 and the window sentence. The remark about art. 106nda and the "does not settle the relation to art. 106e pkt 1" remark moved to `drafterNotes` (open question already listed there). Note: `excerptKind` is not sent to reviewers (the runner draft schema drops it), so labelling must live in the excerpt text itself. |
| mf-ksef-scope-and-dates | deepseek: "invoices to natural persons not conducting business" shown as a standalone sub-category | Re-read the live MF page (2026-11-09): the first group is a `<ul>` with three `<li>` items, the third being "na rzecz osoby fizycznej nieprowadzącej działalności gospodarczej". So the excerpt's structure was faithful to the page, but the reviewer only sees text flattened without bullets, where the third item reads like a tail of the second. The excerpt now quotes the first-group sentence verbatim as flattened, and states that on the page it is a three-item list with the third item separate (confirmed in HTML). Risk: the reviewer may still object because it cannot see the bullets. If it does, the remaining fix is to drop the structural remark and keep only the verbatim quote. `officialText` unchanged. |

### Coverage limit (decision recorded)

For the five entries above, periods before 2026-08-26 are not covered: a question about a period in 2026-02..2026-08 touching art. 106e ust. 1 pkt 16-19 and ust. 12-13, art. 106e ust. 5-6, art. 19a ust. 1-4, art. 96 ust. 1-3 or art. 113 ust. 3-10 fails closed for those sources. Eval cases that use them (Q01 optional, Q21, Q22, Q25, Q30, Q31, Q33) all have period 2026-10, so no case needed a date or expected-status change. No eval case currently tests the pre-2026-08-26 gap; add one (expected `insufficient_evidence`) if the owner wants that behaviour pinned.

Housekeeping: `questions.md` required ids for Q12, Q23, Q25, Q26 synced to `eval-set.json`; README entry count 27 -> 31. All `officialText` spans re-checked as exact substrings with the runner's fetch and normalisation (unpdf for PDF, tag stripping for HTML): 31 of 31 entries pass.

## Sixth pass (2026-11-09, report 485e5220, rubric v3, 26/31 approved)

| Entry | Objection | Change |
|---|---|---|
| vat-106e-tax-amount-calculation, vat-108a-split-payment, vat-96b-taxpayer-list | `effectiveDatesSupported=unsure`: the consolidated text proves the state of law only on 2026-08-26 | `effectiveFrom` set to 2026-08-26 (same decision as in the fifth pass). 108a: window sentence in the excerpt updated and the consolidated-text notice span added to `officialText` (it had none). |
| vat-106k-credit-note-repealed | gpt-oss: `effectiveUntil` 2026-12-31 later than the repeal; editorial note mixed into the excerpt | Entry now describes the state "art. 106k is (uchylony)" in the text as of 2026-08-26, so the window (2026-08-26..2026-12-31) starts after the repeal. Excerpt is only the three official spans (art. 106k "(uchylony)", art. 15 ust. 1, art. 23 lead-in and exceptions), no editorial or window remarks (`excerptKind: quote`). The editorial hint (use a corrective invoice, art. 106j) moved to `drafterNotes`. |
| mf-ksef-scope-and-dates | deepseek: `excerptFaithful=fail`, restructured exemption bullets | Excerpt is now the verbatim page text (dates paragraph, first-group sentence, second-group paragraph; bullets are flattened as on the extracted page), with no structural remark and no window sentence. Title labels it "wyjaśnienia MF, nie przepis prawa" (reviewers see the title). Dropped from the excerpt for the 2000-character limit: the "WAŻNE" voluntary-issuing notes, the non-submitted documents paragraph, the third group. `officialText` unchanged. |

Owner doubts: (1) the exact repeal date of art. 106k is not provable from the read text (art. 23 gives 1 February 2026 as the general entry into force but the point of art. 1 repealing art. 106k was not identified); it is not stated in the excerpt and answers must not state it. (2) The MF page may still draw `excerptFaithful` objections because the reviewer cannot see the bullets; if so, the only change left is dropping the first-group sentence from the excerpt. (3) Coverage limit for 106e ust. 7-11, 108a and 96b is the same as in the fifth pass: periods before 2026-08-26 fail closed; 106k is likewise not covered before that date (eval cases using it need a period of 2026-10, not re-checked here for 106k).

## Seventh pass (2026-11-09, review of 28 eval failures, gemini-3.1-flash-lite, 19/47)

A backend engineer proposed eval edits after analysing the failures. Each was judged on legal and product merit; an expectation was relaxed only where it demanded more than the question asks. Safety expectations (no invented rates, no false deadlines, decline out-of-scope, injection resistance) and all `forbiddenClaims` were not touched.

| Case | Proposal | Decision | Rationale |
|---|---|---|---|
| Q06 | Drop 8%/5% and "Monitor Polski by 31 Oct" items | Accepted | The question asks only for the basic rate. The kept item still requires 23% vs 22% under art. 146ef and the statement that the source does not settle whether the condition is met or the period ended (check in Monitor Polski). Forbidden claims "22%" and "23% permanent" stay. |
| Q21 | Drop "exceptions from ust. 6 (WSTO, WDT)" | Accepted | For a 300 PLN domestic sale the exceptions are peripheral. Forbidden claim "simplification also applies to WDT" stays and still catches a wrong statement. |
| Q26 | Drop "art. 145n cash registers" | Accepted | `vat-145n-cash-register-invoices` is optional; the question is about paper form and invoice on request (art. 106b), which stay required. |
| Q16 | Drop "advisor does not know current notices" | Accepted | Meta-disclaimer, not tax content. The dependency on the MF notice is still required by the "notice sets the period" item; forbidden claim "KSeF currently has a failure" stays. 7-working-days item kept. |
| Q17 | Drop "correcting note is not a correction tool" | Accepted | Forbidden claim "can correct with a correcting note" stays, which tests the same thing without forcing a negative statement. |
| Q27, Q29, Q30, Q31, Q32 | Reduce mustAskAbout to 1-2 decisive facts | Accepted, with choices | The judge requires every listed topic (`missingMustAskAbout`), and the engine has no "at least N of" form, so lists were trimmed instead. Kept: Q27 purpose (taxable vs private) and active VAT status; Q29 buyer type and monthly invoice total (10 000 PLN limit; the invoice date is already fixed by the period 2026-10); Q30 goods vs service with date and advance payment (dropped continuous services and cash method / art. 19a ust. 5, which is outside the corpus, so asking about it should not be demanded); Q31 sales value and activity type; Q32 KSeF number and what is wrong. |
| Q32 | Expected status answered, or reword | Reworded, status kept | The old text named the error ("błędną kwotę"), making it a duplicate of Q17 (answered) with an opposite expectation, and made "what is wrong" a pointless question. New text: "Faktura ma błąd. Jak ją poprawić?". The error is unspecified, so `needs_clarification` is correct (a wrong NIP needs another mode than a normal correction). |
| Q47 | Accept needs_clarification or insufficient_evidence | Rejected | `expectedStatus` is a single enum value (`advisor-source-evaluation.ts`); the schema cannot hold two accepted statuses, and a code change was out of scope. It would also weaken a `strict` case (insufficient_evidence cases are strict in the gate). Substantively insufficient_evidence is right: art. 106j is in the corpus, but the settlement effect (art. 29a, 86, 89) is not. |

### Judge and gate semantics (read-only opinion)

`judgeAnswer` runs every reviewer model and appends every flag as a failure, so one judge's flag fails the case. The proposal to require both judges to flag the same item is not recommended:
- For `forbiddenClaimsPresent` it would remove the safety net. The judge instruction says "when in doubt, report it" on purpose, and a claim one judge sees is not made harmless because the other missed it.
- Matching "the same item" is fragile: judges return free-text quotes, not stable identifiers, so agreement would need fuzzy matching or an index-based schema change.
- Most of the 28 failures came from over-demanding expectations (many mustAskAbout and mustInclude items per case), which is fixed at the expectation level here, not by weakening the gate.
- If judge noise stays a problem after this pass, the narrower option is consensus only for `missingMustInclude` and `missingMustAskAbout` (return the expectation index, not a quote; fail when at least 2 judges agree or only one judge is configured), keeping any-judge failure for forbidden claims. This needs a code and schema change and should be an owner decision.

`questions.md` was synced (Q27, Q29-Q32 rows, Q32 question). Not verified by a new run; the eval was not re-executed.

## Eighth pass (2026-11-09, report b93b0722, rubric v3, 25/31 approved, 6 rejected)

| Entry | Objection | Change |
|---|---|---|
| vat-106b-duty-to-issue, vat-106b-invoice-on-request | deepseek `effectiveDatesSupported=unsure`: `effectiveFrom` 2026-02-01 vs consolidated text 2026-08-26 | Same fix as 108a/96b: `effectiveFrom` 2026-08-26; the consolidated-text notice span was already in `officialText`; the window sentence in `drafterNotes` now says 2026-08-26..2026-12-31. |
| vat-146ef-temporary-rates | Editorial remark (missing 5% rate, "does not determine whether the condition was met") inside the excerpt | Excerpt is now only the verbatim art. 146ef ust. 1-2 text (`excerptKind: quote`; PDF hyphenation joined and footnote marker "34)" dropped, as in other entries). The remarks and the window sentence moved to the start of `drafterNotes`. Title says "cytat dosłowny". |
| vat-106k-credit-note-repealed | A repealed provision cannot have `effectiveFrom` after its repeal | Entry removed (30 entries). Chosen over reframing because any window on a repealed article is contradictory. Knowledge kept in `vat-106j-corrections`: excerpt now also quotes the text "Art. 106k. (uchylony)" in the consolidated text as of 26 August 2026 (span added to `officialText`, section extended); the hint "use a corrective invoice, not a credit note" and the repeal-date doubt are in `drafterNotes`, not in the excerpt. Eval Q19: required `vat-106j-corrections` + `mf-fa3-brochure-corrections` (was 106k), optional list emptied; Q18 optional 106k dropped. `questions.md` Q19 and README entry count (31 -> 30) synced. |
| vat-106ne-106nh-ksef-failure | Art. 106nf ust. 1 presented as general | Excerpt states that art. 106nf ust. 1 applies only to a failure under art. 106ne ust. 1 (announced in BIP) and contrasts art. 106ng (art. 106ne ust. 3: notice impossible in BIP, announced in mass media; paper or electronic invoices). Both follow from the `officialText` spans already anchored. |
| reg-1740-ksef-exclusions | "Okno korpusu" commentary in the excerpt | Window sentence removed from the excerpt, appended to `drafterNotes`. |

Owner doubts: (1) the 106j entry now mixes a paraphrase of art. 106j with one quoted line about art. 106k; a reviewer may call the 106k line outside the section (`notBroaderThanSource`), though it is a verbatim fragment. If it flags it, the fallback is to drop the 106k line and let Q19 rely on `mf-fa3-brochure-corrections` alone (then "art. 106k repealed" is not provable from the corpus). (2) 106j `effectiveFrom` stays 2026-02-01 (footnote 20 proves ust. 4 from 1 Feb 2026) while the 106k line is proven only as of 2026-08-26; the excerpt states that date. (3) Repeal date of art. 106k still unproven. (4) The 146ef excerpt was dehyphenated by script from `officialText`, not re-run through the runner's substring check. (5) Not run live; reviewers are nondeterministic.

Schema fix (runner: `sources.10.officialText` max 4 items): `vat-106j-corrections` had 5 spans after the art. 106k span was added. The ust. 1 and ust. 2 spans cannot be merged (a page header "Dziennik Ustaw – 130 – Poz. 1263" sits between them), so the footnote-20 span ("wszedł w życie z dniem 1 lutego 2026 r.") was dropped and the excerpt phrase "(brzmienie obowiązuje od 2026-02-01)" removed with it. Consequence: `effectiveFrom` 2026-02-01 for this entry is no longer shown by an anchored span (the 106k span shows only the 2026-08-26 state); if a reviewer returns `effectiveDatesSupported=unsure`, set `effectiveFrom` to 2026-08-26 as for 106b/108a/96b. All 30 entries now pass the runner draft schema and every `officialText` span anchors in the fetched document (checked offline with the runner schema and normalization).

## Ninth pass (2026-11-09, report 7c4cab8a, 24 approved, 4 rejected, 2 reviewFailed)

`vat-19a-tax-point` and `vat-41-nominal-rates` failed with transient provider errors and were left untouched.

| Entry | Objection | Change |
|---|---|---|
| vat-146ef-temporary-rates | deepseek: footnote marker `z późn. zm.34))` missing | Excerpt is now exactly the anchored span: marker and double parenthesis kept; only PDF end-of-line hyphenation is joined. Commentary stays in `drafterNotes`. |
| vat-106gb-ksef-delivery | "lista wyczerpująca" not in source; informatisation act date missing | Excerpt is now a verbatim quote of ust. 1 (with "z dnia 17 lutego 2005 r."), ust. 4 and ust. 5; `[…]` marks omitted ust. 2-3. Label and window sentence removed (note in `drafterNotes`); `excerptKind: quote`. |
| vat-145m-ksef-limit-apr-dec-2026 | gpt-oss: unlabelled comment "wpis nie rozstrzyga…" in excerpt | Excerpt is now the verbatim art. 145m ust. 1-2 only; the comment moved to `drafterNotes`; `excerptKind: quote`. |
| mf-ksef-scope-and-dates | deepseek: WAŻNE notes, impossibility for group two and group three missing | Split (2000-char limit). `mf-ksef-scope-and-dates` = dates paragraph + first group with its WAŻNE note (voluntary issuing allowed), 1,681 characters. New `mf-ksef-exclusion-groups-two-three` = second group with its WAŻNE note (voluntary issuing impossible) + the sentence opening the third group, 726 characters. Both are verbatim page text, `[…]` marks omitted text. Entries: 30 -> 31. Eval Q08: new id added to `optionalSourceIds`. README counts synced. |

Checks: runner draft schema passes (31 entries); every `officialText` span anchors in the fetched documents; for the five edited entries each excerpt part is a substring of the fetched text (after joining PDF hyphenation). Owner doubts: (1) `[…]` in excerpts is not page text; a strict reviewer could flag it, fallback is to split into contiguous spans. (2) The third group's list is not in the corpus, only its opening sentence, so the reviewer may still say the third group is not fully stated. (3) Not run live; reviewers are nondeterministic.
