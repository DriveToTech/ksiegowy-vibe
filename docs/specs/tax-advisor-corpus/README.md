# Tax advisor VAT/invoice corpus and evaluation set (DRAFT)

Linear: TRY-174. Drafted: 2026-10-01 against the VAT Act consolidated text **Dz. U. 2026 poz. 1263 (legal status 2026-08-26)**. Parent plan: [tax-advisor-implementation-plan](../../../spec/tax-advisor-implementation-plan.md) (phase 1 and phase 2 corpus items). Behaviour spec: [tax-advisor](../tax-advisor.md).

**This is informational drafting material, not tax advice. Nothing here is reviewed.** Every entry has `review.status = "PENDING"`. A qualified human reviewer (doradca podatkowy or equivalent) must check each excerpt against the official text and sign off before any entry is loaded in production.

## Files

| File | Purpose |
| --- | --- |
| `sources.draft.json` | 24 draft source entries (loader fields plus drafting metadata and `review` block, all PENDING) |
| `eval-set.json` | 45 Polish evaluation cases: 26 answer, 7 clarify, 9 decline (`declined`), 3 insufficient-evidence. Single source of truth for the harness |
| `questions.md` | Reviewer-friendly view of the same cases, generated from `eval-set.json` |

## Loader format and why the draft is deliberately not loadable

`apps/api/src/services/advisor/advisor-sources.ts` loads a JSON array from `ADVISOR_TAX_SOURCES_PATH`. The schema is `.strict()` and requires: `id`, `title`, `url` (HTTPS, host ending `.gov.pl`), `section`, `effectiveFrom`, `effectiveUntil`, `reviewedAt`, `reviewExpiresAt` (ISO dates), `reviewedBy`, `excerpt` (at most 2,000 characters). An optional `topics` array (1-6 unique values from the vocabulary below) is accepted. Limits: 128 KB, 40 entries, unique ids. `selectAdvisorSources` keeps entries that cover the **whole** requested month and whose review window contains today, then ranks them by topic match and recency and returns at most eight (see [tax-advisor](../tax-advisor.md#source-retrieval)).

`sources.draft.json` carries extra fields (`authority`, `legalInstrument`, `excerptKind`, `verifiedAt`, `verificationMethod`, `confidence`, `drafterNotes`, `review`) that the strict schema rejects (`topics` is accepted by the loader), and `reviewedAt` is `null`. It therefore fails closed if someone points the loader at it. I checked this against the loader's zod schema: the draft is rejected, and the promoted shape below passes for all 24 entries.

Promotion (done by or after the reviewer, never by the drafter), with the reviewer's identity and dates filled in. Entries the reviewer rejects are removed first.

```bash
jq --arg who "Imię Nazwisko, doradca podatkowy nr wpisu XXXX" --arg at "YYYY-MM-DD" --arg until "YYYY-MM-DD" \
  '[.sources[] | {id,title,url,section,effectiveFrom,effectiveUntil,excerpt,topics,reviewedBy:$who,reviewedAt:$at,reviewExpiresAt:$until}]' \
  sources.draft.json > advisor-tax-sources.json
```

## Topic vocabulary

Closed list, enforced by the loader (`advisor-source-topics.ts`). Questions are mapped to these topics by a deterministic Polish and English keyword table; a source is retrieved when it shares at least one topic with the question. Adding a topic means extending the list and the keyword table in code.

| Group | Topics |
| --- | --- |
| Invoice | `invoice-obligation`, `invoice-content`, `sale-date`, `issue-date`, `advance-payment`, `tax-point`, `amounts`, `rounding`, `correction`, `fa3` |
| VAT | `vat-rates`, `split-payment`, `exempt-sales`, `vat-status` |
| KSeF | `ksef-obligation`, `ksef-delivery`, `ksef-dates`, `ksef-offline`, `ksef-failure`, `ksef-limit-10000`, `ksef-penalty`, `transitional` |

Tag each source with every topic a question about it could match; an untagged source is a general entry that never fails the topic filter but ranks last.

## Scope

First supported scope: Polish VAT and invoicing for a JDG or small company using KSeF/FA(3). Covered: invoice duty and content, VAT rates, issue and sale dates, corrections, KSeF obligation and dates, the 2026 transitional 10,000 zł limit, offline/failure modes, split payment, VAT status. Out of scope (must decline): PIT/CIT/ZUS optimisation, depreciation, legal opinions, filing or issuing documents, evasion.

## Assumptions

1. Today is 2026-10-01; questions concern periods from **2026-02** (KSeF start) to **2026-12**. The corpus window is `2026-02-01..2026-12-31`, so earlier and 2027 periods fail closed on purpose.
2. Taxpayer is a Polish VAT payer with a Polish seat, B2B and B2C sales, not in special procedures, unless a case says otherwise.
3. The consolidated text Dz. U. 2026 poz. 1263 downloaded from `eli.gov.pl` is the authoritative statute text. Excerpts are paraphrases with short quotes, marked by `excerptKind`.
4. KSeF information pages and the FA(3) brochure of the Ministry of Finance are guidance, not law. Entries based on them are labelled and carry `confidence: medium` where the content came from a page summary.
5. Where a source says "from 1 February 2026", entries start at 2026-02-01 because the earlier text differed (for example art. 106e pkt 5, 26, 27).

## Verification method and what was not verified

- Statute entries: the full PDF of Dz. U. 2026 poz. 1263 (224 pages) was downloaded and the cited articles were read in the extracted text.
- Regulation entries: Dz. U. 2025 poz. 1740 read in full. Metadata for poz. 1740, 1742, 1815 and 2021 poz. 1979 read from `api.sejm.gov.pl/eli`.
- FA(3) brochure: downloaded and the cited passages located in the extracted text.
- Two Ministry pages were read through a page-summarising tool, not byte-exact. Reviewer should compare them with the live pages.
- **Not read, not cited:** text of Dz. U. 2025 poz. 1815 (KSeF usage regulation), poz. 1742 (invoice regulation amendment), the invoice regulation Dz. U. 2021 poz. 1979 as amended, VAT Act art. 29a, 86, 88, 117ba, annexes 3, 10 and 15, Ordynacja podatkowa art. 12. Questions that depend on them are set to clarify or decline.
- The Ministry white-list page `podatki.gov.pl/narzedzia/white-list` surfaced in search but was not fetched; the white-list entry relies on art. 96b of the statute.

## Known blockers before this corpus is useful

1. **Retrieval (resolved in code).** Topic retrieval replaces the first-eight cut. A test loads `eval-set.json` against a synthetic reviewed copy of this draft (review fields filled in the test only) and checks that every `requiredSourceIds` entry of the 26 answer cases is retrieved. The draft itself is still rejected by the loader until a human reviews it.
2. **Date semantics.** The loader needs one entry to cover the whole month. Art. 145l (Feb–Mar 2026) and art. 145m (Apr–Dec 2026) sit in one entry dated from 2026-04-01; art. 106ni (penalties effective 2027-01-01) is dated from 2026-02-01 so 2026 questions can cite it. The reviewer should split or accept these.
3. **`declined` status (resolved).** The answer contract has a fourth status `declined` for out-of-scope questions. The 9 decline cases expect `declined`; the 3 fail-closed cases keep `insufficient_evidence` (`expectedBehavior: insufficient_evidence`). A test checks that the keyword pre-check declines Q34-Q40 without a model call and does not flag any other case; Q41 (evasion) and Q42 (prompt injection) are declined by the model through the prompt.
4. **Deduction is a hole.** Art. 86 and 88 are not in the corpus, yet "can I deduct VAT" is a likely question and appears in the plan's sample set. The expected behaviour is to clarify and state the limitation, not to answer.

## Risks

- **High:** VAT rates. Art. 41 nominally says 22%/7%, art. 146ef applies 23%/8% while a defence-spending condition holds. The Minister announces the end of that period in Monitor Polski by 31 October each year. Wrong rate guidance is the highest-impact error.
- **High:** KSeF dates and limits change by statute. Art. 145m expires 2026-12-31 and penalties start 2027-01-01 per the footnote in the consolidated text.
- **Medium:** guidance versus law. The "correct a wrong buyer NIP by correcting to zero values" rule comes from the Ministry brochure, not the statute.
- **Medium:** weekend rule for the 15th-of-month issue deadline is not answered by the source; the evaluation forbids asserting a shift.
- **Medium:** excerpts are paraphrases. A paraphrase can drift from the law, so the reviewer must read the statute, not only this file.

## Reviewer checklist (per entry)

- [ ] Article, paragraph and point match the official text; the excerpt is faithful and not broader than the source.
- [ ] Official URL opens, is the right act and version (consolidated text identifier and legal-status date recorded).
- [ ] `effectiveFrom` and `effectiveUntil` are correct, including transitional rules and any later amendment already published.
- [ ] The excerpt states conditions and exceptions that change the answer, or the entry says they are out of scope.
- [ ] Guidance (Ministry pages, brochure, interpretations) is labelled as guidance with its factual scope.
- [ ] Interpretations of tax authorities are not generalised beyond their facts.
- [ ] Excerpt is at most 2,000 characters, no personal data, no invented dates.
- [ ] Reviewer has the qualification, is named in `reviewedBy`, and `reviewExpiresAt` follows the staleness rules below.
- [ ] Evaluation cases for the entry: expected behaviour, required citations and forbidden claims are correct; add or remove cases as needed.
- [ ] Representative real answers from the model are reviewed, since schema checks cannot prove legal correctness.

## Staleness rules (proposal)

1. `reviewExpiresAt` is at most **90 days** after `reviewedAt` for KSeF, rates and transitional entries, and at most **180 days** for stable statute entries (invoice content, correction, status).
2. **Hard triggers**, regardless of the date: a new consolidated text of the VAT Act (Obwieszczenie Marszałka Sejmu); a new act or regulation changing a cited article; a Monitor Polski notice under art. 146ef ust. 2 (due by 31 October each year); any change to the Ministry KSeF pages or FA(3) brochure; the end of a transitional period (art. 145m on 2026-12-31).
3. **Calendar triggers:** re-review after 2026-10-31 (rate notice) and before 2027-01-01 (KSeF limit end, penalties start); add 2027 entries before 2027 questions are accepted.
4. Do not rely on the loader to detect legal change. It only compares dates; a scheduled freshness check may flag changes but cannot certify correctness (as the plan states).
5. A source with an expired review is excluded by the loader; with no applicable reviewed source the advisor must say so and refer to an accountant.
6. Keep the corpus checksum (`version`) in each evaluation run, and rerun the full set after any corpus, prompt or model change.

## How the harness should use `eval-set.json`

For each case: send `question` with `period`, `questionKind: tax` and record consent set per `companyFacts` where relevant. Check (1) returned `status` equals `expectedStatus`; (2) for `answer`, every `requiredSourceIds` entry is among the cited source ids; (3) no `forbiddenClaims` statement appears; (4) `mustInclude` points are covered (reviewer or LLM-judge, not string match); (5) `clarify` cases ask about `mustAskAbout`; (6) `decline` cases return status `declined`, give no recommendation and no claim of an action performed. `reviewerNote` explains the intent of tricky cases.

## Open questions for the human reviewer

1. Art. 146ef: has the 23%/8% period ended or been announced to end? Which rates apply from 2027-01-01?
2. Does the 15th-of-month deadline in art. 106i move when it falls on a weekend or holiday (for example 15 November 2026 is a Sunday)? Which source applies?
3. What date did art. 106k (credit notes) cease to apply, and which text of the 5 August 2025 act states it? Confirm "correction to zero then a new invoice" for a wrong buyer NIP.
4. How do art. 106na ust. 1 (issued on the day sent to KSeF) and the invoice date field interact for the issue deadline in art. 106i?
5. Are art. 113 taxpayers within the KSeF obligation (art. 106ga ust. 2 pkt 6 names only art. 113a)? Do simplified invoices for exempt sellers change that?
6. Is it acceptable to date art. 106ni from 2026-02-01 and 145l/145m in one entry, or should the loader contract gain day-level or multi-period entries?
7. Which additional entries are required for the supported scope: art. 86 and 88 (deduction), art. 29a (correction effects), art. 117ba (white-list payments), annexes 3, 10 and 15, art. 42 (WDT conditions), art. 106nb and the KSeF regulation Dz. U. 2025 poz. 1815?
8. Who is the named source owner and the qualified reviewer, and what is their review SLA?
9. Should the evaluation also cover the plan's "apparent VAT discrepancy" and "rejected KSeF document" cases? They need company records and a defined meaning of KSeF acceptance; they are not in this question set.
10. ~~Is `decline` mapped to `insufficient_evidence` acceptable, or should the contract get a separate status?~~ **Decided:** separate status `declined`; decline cases expect `declined`, see blocker 3.

## Sources to verify

- Consolidated VAT Act Dz. U. 2026 poz. 1263: `https://eli.gov.pl/api/acts/DU/2026/1263/text/T/D20261263L.pdf`
- Regulation Dz. U. 2025 poz. 1740: `https://api.sejm.gov.pl/eli/acts/DU/2025/1740/text.pdf`
- Ministry KSeF pages and FA(3) brochure on `ksef.podatki.gov.pl`, linked in each entry
