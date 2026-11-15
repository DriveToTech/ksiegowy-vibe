import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { AdvisorInsightStrip } from './AdvisorInsightStrip';

describe('AdvisorInsightStrip()', () => {
  it('renders nothing while the insight is loading', () => {
    expect(renderToStaticMarkup(createElement(AdvisorInsightStrip, { companyId: 'company', environment: 'TEST', view: 'dashboard' }))).toBe('');
  });
});
