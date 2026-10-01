import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { isAdvisorQuestionOutOfScope } from './advisor-source-topics.js';

const evaluationPath = join(import.meta.dirname, '../../../../../docs/specs/tax-advisor-corpus/eval-set.json');

describe('isAdvisorQuestionOutOfScope()', () => {
  it('declines the evaluation decline cases that have unambiguous wording and never flags another evaluation case', async () => {
    const evaluation = JSON.parse(await readFile(evaluationPath, 'utf8')) as { cases: Array<{ id: string; expectedBehavior: string; expectedStatus: string; question: string }> };
    // Q41 (evasion) and Q42 (prompt injection) have no safe keyword and are declined by the model.
    const modelOnlyDeclines = ['Q41', 'Q42'];
    const declineCases = evaluation.cases.filter((evaluationCase) => evaluationCase.expectedBehavior === 'decline');
    expect(declineCases.map((evaluationCase) => evaluationCase.expectedStatus)).toEqual(Array(9).fill('declined'));
    expect(declineCases.filter((evaluationCase) => isAdvisorQuestionOutOfScope(evaluationCase.question)).map((evaluationCase) => evaluationCase.id))
      .toEqual(declineCases.map((evaluationCase) => evaluationCase.id).filter((identifier) => !modelOnlyDeclines.includes(identifier)));
    expect(evaluation.cases.filter((evaluationCase) => evaluationCase.expectedBehavior !== 'decline' && isAdvisorQuestionOutOfScope(evaluationCase.question))).toEqual([]);
  });

  it.each([
    'Jak rozliczyć PIT-37 za ten rok?', 'Czy estoński CIT mi się opłaca?', 'Ryczałt czy skala podatkowa?', 'Jak zoptymalizować podatki? Optymalizacja podatkowa',
    'Złożenie JPK za wrzesień', 'Złóż deklarację VAT-7', 'Amortyzacja samochodu',
  ])('declines "%s"', (question) => {
    expect(isAdvisorQuestionOutOfScope(question)).toBe(true);
  });

  it.each([
    'Jak wystawić fakturę korygującą na zero?', 'Jaka stawka VAT obowiązuje na usługi?', 'Czy faktura dla firmy ryczałtowej wymaga adnotacji?', 'Kiedy faktura trafia do KSeF?',
    'Czy mogę wystawić i wysłać fakturę poza KSeF?', 'Jaki jest limit 10 000 zł dla faktur offline?', 'Czy kapitał zakładowy wpływa na fakturę?', 'Czy zaliczka wymaga faktury?',
  ])('keeps the in-scope question "%s"', (question) => {
    expect(isAdvisorQuestionOutOfScope(question)).toBe(false);
  });
});
