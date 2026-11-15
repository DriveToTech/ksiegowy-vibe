import { afterEach, describe, expect, it, vi } from 'vitest';
import { deleteAdvisorConversation, listAdvisorConversations, streamAdvisorAnswer } from './advisor-api';

function streamResponse(text: string): Response {
  return new Response(text, { headers: { 'content-type': 'text/event-stream' } });
}
const input = { question: 'Q', requestId: 'r', scope: {} as never };

describe('streamAdvisorAnswer()', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('reports status events and returns the answer', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(streamResponse('event: status\ndata: {"stage":"preparing"}\n\nevent: answer\ndata: {"status":"answered"}\n\n')));
    const onStatus = vi.fn();

    await expect(streamAdvisorAnswer('c', 'TEST' as never, 'v', input, new AbortController().signal, onStatus)).resolves.toEqual({ status: 'answered' });
    expect(onStatus).toHaveBeenCalledWith({ stage: 'preparing' });
  });

  it('throws the stream error with retryAfterSeconds', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(streamResponse('event: error\ndata: {"code":"PROVIDER_UNAVAILABLE","message":"m","retryAfterSeconds":7}\n\n')));

    await expect(streamAdvisorAnswer('c', 'TEST' as never, 'v', input, new AbortController().signal, vi.fn())).rejects.toEqual({ code: 'PROVIDER_UNAVAILABLE', message: 'm', retryAfterSeconds: 7 });
  });
});

describe('listAdvisorConversations() and deleteAdvisorConversation()', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('lists conversations for the environment and deletes by identifier', async () => {
    const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(new Response('[]', { headers: { 'content-type': 'application/json' } })));
    vi.stubGlobal('fetch', fetchMock);

    await expect(listAdvisorConversations('company', 'TEST')).resolves.toEqual([]);
    await deleteAdvisorConversation('company', 'TEST', 'a/b');

    expect(fetchMock.mock.calls[0][0]).toMatch(/\/companies\/company\/advisor\/conversations$/);
    expect(fetchMock.mock.calls[1][0]).toMatch(/\/conversations\/a%2Fb$/);
    expect(fetchMock.mock.calls[1][1]).toMatchObject({ method: 'DELETE' });
  });
});
