import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { discoverAdvisorModels, generateAdvisorResponse, requireOllamaEndpoint } from './advisor-provider.js';

beforeEach(() => { vi.stubEnv('ADVISOR_OLLAMA_ALLOW_INSECURE', 'true'); });
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

  it.each([
    ['OPENAI', 'https://api.openai.com/v1/chat/completions'],
    ['OPENROUTER', 'https://openrouter.ai/api/v1/chat/completions'],
    ['ANTHROPIC', 'https://api.anthropic.com/v1/messages'],
    ['OLLAMA', 'http://localhost:11434/v1/chat/completions'],
  ] as const)('reports upstream authentication, quota and unsupported-model failures on %s without retrying', async (provider, endpoint) => {
    vi.stubEnv('ADVISOR_OLLAMA_URL', 'http://localhost:11434/v1');
    for (const [scenario, status, expectedStatus] of [
      ['invalid credentials', 401, 502],
      ['quota exceeded', 429, 429],
      ['unsupported model', provider === 'OLLAMA' ? 404 : 400, 502],
    ] as const) {
      const request = vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: { message: scenario, type: 'invalid_request_error' } }), {
        status, headers: { 'content-type': 'application/json' },
      }));
      vi.stubGlobal('fetch', request);
      await expect(generateAdvisorResponse({ provider, model: 'unavailable-model', credential: 'private-key' }, 'Question', new AbortController().signal))
        .rejects.toMatchObject(provider === 'ANTHROPIC'
          ? { code: 'PROVIDER_ERROR', statusCode: expectedStatus }
          : { status });
      expect(request).toHaveBeenCalledTimes(1);
      expect(String(request.mock.calls[0]?.[0])).toBe(endpoint);
    }
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

describe('discoverAdvisorModels()', () => {
  const ollama = { provider: 'OLLAMA' as const, model: '', credential: '' };

  it('returns sorted models from the operator Ollama endpoint', async () => {
    vi.stubEnv('ADVISOR_OLLAMA_URL', 'http://ollama.internal:11434/v1');
    const request = vi.fn().mockResolvedValue(new Response(JSON.stringify({ data: [{ id: 'z-model' }, { id: 'a-model' }] })));
    vi.stubGlobal('fetch', request);
    expect(await discoverAdvisorModels(ollama)).toEqual(['a-model', 'z-model']);
    expect(request.mock.calls[0]?.[0]).toBe('http://ollama.internal:11434/v1/models');
  });

  it('uses distinct codes for not configured, unreachable and no models', async () => {
    vi.stubEnv('ADVISOR_OLLAMA_URL', '');
    await expect(discoverAdvisorModels(ollama)).rejects.toMatchObject({ code: 'OLLAMA_NOT_CONFIGURED', statusCode: 503 });
    vi.stubEnv('ADVISOR_OLLAMA_URL', 'http://ollama.internal:11434/v1');
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('fetch failed')));
    await expect(discoverAdvisorModels(ollama)).rejects.toMatchObject({ code: 'OLLAMA_UNREACHABLE', statusCode: 502 });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status: 500 })));
    await expect(discoverAdvisorModels(ollama)).rejects.toMatchObject({ code: 'OLLAMA_UNREACHABLE' });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ data: [] }))));
    await expect(discoverAdvisorModels(ollama)).rejects.toMatchObject({ code: 'OLLAMA_NO_MODELS', statusCode: 409 });
  });

  it('rejects a model list larger than one megabyte', async () => {
    vi.stubEnv('ADVISOR_OLLAMA_URL', 'https://ollama.internal/v1');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ data: [{ id: 'x'.repeat(1_100_000) }] }))));
    await expect(discoverAdvisorModels(ollama)).rejects.toMatchObject({ code: 'PROVIDER_ERROR', statusCode: 502 });
  });

  it('maps an unexpected upstream model list shape to a provider error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ models: [] }))));
    await expect(discoverAdvisorModels({ provider: 'OPENAI', model: '', credential: 'private-key' })).rejects.toMatchObject({ code: 'PROVIDER_ERROR', statusCode: 502 });
  });
});

describe('requireOllamaEndpoint()', () => {
  it('requires https unless insecure transport is explicitly allowed', () => {
    vi.stubEnv('ADVISOR_OLLAMA_URL', 'http://ollama.internal:11434/v1');
    vi.stubEnv('ADVISOR_OLLAMA_ALLOW_INSECURE', 'false');
    expect(() => requireOllamaEndpoint()).toThrow(expect.objectContaining({ code: 'OLLAMA_NOT_CONFIGURED' }));
    vi.stubEnv('ADVISOR_OLLAMA_URL', 'https://ollama.internal/v1');
    expect(requireOllamaEndpoint()).toBe('https://ollama.internal/v1');
    vi.stubEnv('ADVISOR_OLLAMA_ALLOW_INSECURE', 'true');
    vi.stubEnv('ADVISOR_OLLAMA_URL', 'http://ollama.internal:11434/v1');
    expect(requireOllamaEndpoint()).toBe('http://ollama.internal:11434/v1');
  });

  it.each(['https://169.254.169.254/v1', 'https://metadata.google.internal/v1', 'http://[fe80::1]/v1'])('always rejects link-local and metadata host %s', (endpoint) => {
    vi.stubEnv('ADVISOR_OLLAMA_URL', endpoint);
    expect(() => requireOllamaEndpoint()).toThrow(expect.objectContaining({ code: 'OLLAMA_NOT_CONFIGURED' }));
  });

  it('rejects loopback in production unless insecure transport is allowed', () => {
    vi.stubEnv('ADVISOR_OLLAMA_URL', 'https://localhost:11434/v1');
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('ADVISOR_OLLAMA_ALLOW_INSECURE', 'false');
    expect(() => requireOllamaEndpoint()).toThrow(expect.objectContaining({ code: 'OLLAMA_NOT_CONFIGURED' }));
    vi.stubEnv('ADVISOR_OLLAMA_ALLOW_INSECURE', 'true');
    expect(requireOllamaEndpoint()).toBe('https://localhost:11434/v1');
  });
});
