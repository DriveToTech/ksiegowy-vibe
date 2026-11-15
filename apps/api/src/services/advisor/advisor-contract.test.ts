import { Builder } from 'builder-pattern';
import { describe, expect, it } from 'vitest';
import { advisorModelAnswerSchema } from './advisor-contract.js';

type ModelAnswer = ReturnType<typeof advisorModelAnswerSchema.parse>;

describe('advisorModelAnswerSchema.parse()', () => {
  const declined = () => Builder<ModelAnswer>().status('declined').shortAnswer('Out of scope').explanation('I can explain VAT, invoices and KSeF.')
    .assumptions([]).questions([]).evidenceIds([]).sourceIds([]).containsTaxGuidance(false);

  it('accepts a bounded declined answer without citations', () => {
    const answer = declined().build();
    expect(advisorModelAnswerSchema.parse(answer)).toEqual(answer);
  });

  it.each([
    ['sources', { sourceIds: ['source'] }], ['questions', { questions: ['Which period?'] }], ['tax guidance', { containsTaxGuidance: true }],
    ['a missing capability description', { explanation: '' }], ['an oversized reason', { shortAnswer: 'x'.repeat(401) }], ['an oversized capability description', { explanation: 'x'.repeat(601) }],
  ])('rejects a declined answer with %s', (_name, override) => {
    expect(() => advisorModelAnswerSchema.parse({ ...declined().build(), ...override })).toThrow('A declined answer must be short');
  });

  it.each(['See https://evil.example', 'http://evil.example', 'visit www.evil.example', '<b>bold</b>', '[click](x)', '![pixel](x)', 'HTTPS://EVIL.EXAMPLE'])('rejects answer text containing %s', (text) => {
    const answer = { ...declined().build(), status: 'needs_clarification' as const, explanation: '', questions: ['Which period?'] };
    expect(() => advisorModelAnswerSchema.parse({ ...answer, shortAnswer: text })).toThrow('links, HTML or markdown images');
    expect(() => advisorModelAnswerSchema.parse({ ...answer, questions: [text] })).toThrow('links, HTML or markdown images');
    expect(() => advisorModelAnswerSchema.parse({ ...answer, assumptions: [text] })).toThrow('links, HTML or markdown images');
  });

  it('keeps existing limits for other statuses', () => {
    expect(advisorModelAnswerSchema.parse({ ...declined().build(), status: 'needs_clarification', explanation: '', questions: ['Which period?'] }).status).toBe('needs_clarification');
  });
});
