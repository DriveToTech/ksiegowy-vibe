import { afterEach, describe, expect, it, vi } from 'vitest';
import { generateAdvisorResponse } from './advisor-provider.js';

afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe('generateAdvisorResponse()', () => {
  it.each(['OPENAI', 'OPENROUTER', 'OLLAMA'] as const)('uses structured output and disables retries for %s', async (provider) => {
    vi.stubEnv('ADVISOR_OLLAMA_URL', 'http://localhost:11434/v1');
    const answer = { status: 'needs_clarification', shortAnswer: 'Question required', explanation: '', assumptions: [], questions: ['Which period?'], evidenceIds: [], sourceIds: [], containsTaxGuidance: false };
    const request = vi.fn().mockResolvedValue(new Response(JSON.stringify({ choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(answer) } }] }), { headers: { 'content-type': 'application/json' } }));
    vi.stubGlobal('fetch', request);
    const signal = new AbortController().signal;
    expect(await generateAdvisorResponse({ provider, model: 'configured-model', credential: 'private-key' }, 'Only this input', signal)).toEqual(answer);
    expect(request).toHaveBeenCalledTimes(1);
    const options = request.mock.calls[0]?.[1] as RequestInit;
    const body = JSON.parse(String(options.body));
    expect(body.model).toBe('configured-model');
    expect(body.response_format.json_schema.strict).toBe(true);
    expect(body.messages[1]).toEqual({ role: 'user', content: 'Only this input' });
    expect(options.redirect).toBe('error');
    if (provider === 'OPENROUTER') expect(body.provider).toEqual({ data_collection: 'deny', allow_fallbacks: false, require_parameters: true });
    if (provider === 'OPENAI') expect(body.store).toBe(false);
  });

  it('uses an Anthropic-compatible schema and rejects truncated or oversized answers', async () => {
    const answer = { status: 'needs_clarification', shortAnswer: 'Question required', explanation: '', assumptions: [], questions: [], evidenceIds: [], sourceIds: [], containsTaxGuidance: false };
    const request = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ stop_reason: 'end_turn', content: [{ type: 'text', text: JSON.stringify(answer) }] })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ stop_reason: 'max_tokens', content: [] })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ stop_reason: 'end_turn', content: [{ type: 'text', text: JSON.stringify({ ...answer, shortAnswer: 'x'.repeat(1501) }) }] })));
    vi.stubGlobal('fetch', request);
    expect(await generateAdvisorResponse({ provider: 'ANTHROPIC', model: 'configured-model', credential: 'private-key' }, 'Question', new AbortController().signal)).toEqual(answer);
    await expect(generateAdvisorResponse({ provider: 'ANTHROPIC', model: 'configured-model', credential: 'private-key' }, 'Question', new AbortController().signal)).rejects.toThrow();
    await expect(generateAdvisorResponse({ provider: 'ANTHROPIC', model: 'configured-model', credential: 'private-key' }, 'Question', new AbortController().signal)).rejects.toThrow();
    expect(request.mock.calls[0]?.[0]).toBe('https://api.anthropic.com/v1/messages');
    const options = request.mock.calls[0]?.[1] as RequestInit;
    expect(options.headers).toEqual({ 'x-api-key': 'private-key', 'anthropic-version': '2023-06-01', 'content-type': 'application/json' });
    expect(JSON.parse(String(options.body)).output_config.format.type).toBe('json_schema');
    expect(JSON.stringify(JSON.parse(String(options.body)).output_config.format.schema)).not.toMatch(/"(?:minLength|maxLength|maxItems)":/);
  });
});
