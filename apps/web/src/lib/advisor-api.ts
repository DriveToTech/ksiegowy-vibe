import { API_BASE } from './api-base';
import { clientFetch } from './api-client';
import { advisorText } from './advisor-translations';
import type { AdvisorAnswer, AdvisorEnvironment, AdvisorScope } from '../../../../packages/types/src/advisor';
export type { AdvisorAnswer, AdvisorEnvironment, AdvisorScope, AdvisorSettings, AdvisorProvider, AdvisorConversationSummary, AdvisorConversationDetail, AdvisorTurn, AdvisorConnectorClient, AdvisorConnectorSettings } from '../../../../packages/types/src/advisor';

export function advisorRequest<Result>(companyId: string, path: string, options?: RequestInit): Promise<Result> {
  return clientFetch<Result>(`/companies/${encodeURIComponent(companyId)}/advisor${path}`, options);
}

export function advisorErrorMessage(error: unknown): string {
  const code = typeof error === 'object' && error !== null && 'code' in error ? String(error.code) : 'ADVISOR_ERROR';
  return advisorText.errors[code] ?? advisorText.errors.ADVISOR_ERROR;
}

export async function streamAdvisorAnswer(companyId: string, environment: AdvisorEnvironment, conversationId: string,
  input: { question: string; requestId: string; scope: AdvisorScope }, signal: AbortSignal, onProgress: () => void): Promise<AdvisorAnswer> {
  const response = await fetch(`${API_BASE}/companies/${encodeURIComponent(companyId)}/advisor/conversations/${encodeURIComponent(conversationId)}/messages`, {
    method: 'POST', credentials: 'include', signal,
    headers: { 'Content-Type': 'application/json', 'x-ksef-environment': environment }, body: JSON.stringify(input),
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({ code: 'ADVISOR_ERROR' }));
    throw error;
  }
  if (response.headers.get('content-type')?.includes('application/json')) {
    const result = await response.json() as { answer: AdvisorAnswer | null };
    if (!result.answer) throw { code: 'REQUEST_INTERRUPTED' };
    return result.answer;
  }
  if (!response.body) throw { code: 'ADVISOR_ERROR' };
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let answer: AdvisorAnswer | undefined;
  try {
    while (true) {
      const chunk = await reader.read();
      buffer += decoder.decode(chunk.value, { stream: !chunk.done });
      if (buffer.length > 256_000) throw { code: 'INVALID_ANSWER' };
      const events = buffer.split(/\r?\n\r?\n/);
      buffer = events.pop() ?? '';
      for (const event of events) {
        const eventType = event.split(/\r?\n/).find((line) => line.startsWith('event:'))?.slice(6).trim();
        const data = event.split(/\r?\n/).filter((line) => line.startsWith('data:')).map((line) => line.slice(5).trim()).join('\n');
        if (!data) continue;
        if (eventType === 'error') throw JSON.parse(data);
        if (eventType === 'answer') answer = JSON.parse(data) as AdvisorAnswer;
        if (eventType === 'status') onProgress();
      }
      if (chunk.done) break;
    }
  } finally { await reader.cancel().catch(() => undefined); reader.releaseLock(); }
  if (!answer) throw { code: 'REQUEST_INTERRUPTED' };
  return answer;
}
