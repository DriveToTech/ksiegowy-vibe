import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { Builder } from 'builder-pattern';
import { describe, expect, it } from 'vitest';
import { AdvisorComposer } from './AdvisorComposer';

type Props = Parameters<typeof AdvisorComposer>[0];
const render = (props: Partial<Props>) => renderToStaticMarkup(createElement(AdvisorComposer, { ...Builder<Props>()
  .question('Pytanie').questionKind('records').period('2026-10').includeRecords(false).busy(false).blockerHint(null).untested(null).taxUnavailable(false)
  .note(null).seed(null).hideConsent(false).placeholder('Placeholder').replyTo(null).sheet(false).textareaRef(null)
  .onQuestionChange(() => undefined).onQuestionKindChange(() => undefined).onIncludeRecordsChange(() => undefined).onClearReplyTo(() => undefined).onSubmit(() => undefined).onCancel(() => undefined)
  .build() as Props, ...props }));

describe('AdvisorComposer()', () => {
  it('keeps Send aria-disabled with its reason until a seed choice is made', () => {
    const markup = render({ seed: { kindLabel: 'Wybrany dokument', label: 'FV 1', subject: 'ten dokument', includeLabel: 'Dołącz', choice: null, onChoose: () => undefined } });
    expect(markup).toContain('aria-disabled="true" aria-describedby="advisor-seed-hint"');
    expect(markup).toContain('id="advisor-seed-hint"');
    expect(markup).not.toContain('type="checkbox"');
  });

  it('removes consent and kind and shows the reason when a blocker applies', () => {
    const markup = render({ blockerHint: 'Powód blokady', untested: 'cloud' });
    expect(markup).toMatch(/id="advisor-blocker-hint"[^>]*>Powód blokady/);
    expect(markup).not.toContain('type="checkbox"');
    expect(markup).not.toContain('<select');
    expect(markup).not.toContain('advisor-untested');
  });

  it('references the untested line from Send and the tax note from the field and select', () => {
    const markup = render({ untested: 'ollama', taxUnavailable: true });
    expect(markup).toContain('aria-describedby="advisor-untested"');
    expect(markup.match(/aria-describedby="advisor-tax-note"/g)).toHaveLength(2);
    expect(markup).toContain('id="advisor-tax-note" role="status"');
  });
});
