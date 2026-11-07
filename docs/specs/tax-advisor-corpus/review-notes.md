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
