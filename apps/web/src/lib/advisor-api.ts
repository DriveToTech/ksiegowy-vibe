import { API_BASE } from './api-base';
import { clientFetch } from './api-client';
import { advisorText } from './advisor-translations';
import type { AdvisorAnswer, AdvisorStreamError, AdvisorStreamStatus, AdvisorConnectorClient, AdvisorConnectorSettings, AdvisorConversationSummary, AdvisorEnvironment, AdvisorModelPreview, AdvisorProvider, AdvisorScope, AdvisorSettings } from '../../../../packages/types/src/advisor';
export type { AdvisorAnswer, AdvisorEnvironment, AdvisorScope, AdvisorSettings, AdvisorProvider, AdvisorConversationSummary, AdvisorConversationDetail, AdvisorTurn, AdvisorConnectorClient, AdvisorConnectorSettings, AdvisorModelPreview, AdvisorConnectionSummary, AdvisorConnectorGrant, AdvisorConnectorGrantStatus, AdvisorInsight, AdvisorInsightView } from '../../../../packages/types/src/advisor';

export function advisorRequest<Result>(companyId: string, path: string, options?: RequestInit): Promise<Result> {
  return clientFetch<Result>(`/companies/${encodeURIComponent(companyId)}/advisor${path}`, options);
}

export interface AdvisorPolicyInput {
  enabled: boolean;
  allowedProviders: AdvisorProvider[];
  allowedConnectors: AdvisorConnectorClient[];
  retentionDays: number;
}

export function readAdvisorSettings(companyId: string, signal?: AbortSignal, period?: string): Promise<AdvisorSettings> {
  return advisorRequest<AdvisorSettings>(companyId, period ? `/settings?period=${encodeURIComponent(period)}` : '/settings', signal ? { signal } : undefined);
}

export function saveAdvisorPolicy(companyId: string, policy: AdvisorPolicyInput): Promise<unknown> {
  return advisorRequest(companyId, '/policy', { method: 'PATCH', body: JSON.stringify(policy) });
}

export function saveAdvisorConnection(companyId: string, provider: AdvisorProvider, connection: { model: string; credential?: string }): Promise<unknown> {
  return advisorRequest(companyId, `/connections/${provider}`, { method: 'PUT', body: JSON.stringify(connection) });
}

export function deleteAdvisorConnection(companyId: string, provider: AdvisorProvider): Promise<unknown> {
  return advisorRequest(companyId, `/connections/${provider}`, { method: 'DELETE' });
}

export function testAdvisorConnection(companyId: string, provider: AdvisorProvider): Promise<{ testedAt: string }> {
  return advisorRequest(companyId, `/connections/${provider}/test`, { method: 'POST' });
}

// A typed key (or Ollama, which has no key) is previewed before saving; otherwise the saved connection is queried.
export function discoverAdvisorModels(companyId: string, provider: AdvisorProvider, credential?: string): Promise<AdvisorModelPreview> {
  if (!credential && provider !== 'OLLAMA') return advisorRequest(companyId, `/connections/${provider}/models`);
  return advisorRequest(companyId, `/connections/${provider}/model-preview`, { method: 'POST', body: JSON.stringify(credential ? { credential } : {}) });
}

export function readAdvisorConnectors(companyId: string, signal?: AbortSignal): Promise<AdvisorConnectorSettings> {
  return advisorRequest<AdvisorConnectorSettings>(companyId, '/connectors', signal ? { signal } : undefined);
}

export function grantAdvisorConnector(companyId: string, client: AdvisorConnectorClient, environment: AdvisorEnvironment, days: number): Promise<{ expiresAt: string }> {
  return advisorRequest(companyId, `/connectors/${client}`, { method: 'PUT', headers: { 'x-ksef-environment': environment }, body: JSON.stringify({ days }) });
}

export function revokeAdvisorConnector(companyId: string, client: AdvisorConnectorClient, environment: AdvisorEnvironment): Promise<unknown> {
  return advisorRequest(companyId, `/connectors/${client}`, { method: 'DELETE', headers: { 'x-ksef-environment': environment } });
}

export function listAdvisorConversations(companyId: string, environment: AdvisorEnvironment, signal?: AbortSignal): Promise<AdvisorConversationSummary[]> {
  return advisorRequest<AdvisorConversationSummary[]>(companyId, '/conversations', { headers: { 'x-ksef-environment': environment }, ...(signal ? { signal } : {}) });
}

export function deleteAdvisorConversation(companyId: string, environment: AdvisorEnvironment, conversationId: string): Promise<unknown> {
  return advisorRequest(companyId, `/conversations/${encodeURIComponent(conversationId)}`, { method: 'DELETE', headers: { 'x-ksef-environment': environment } });
}

export function advisorErrorCode(error: unknown): string {
  return typeof error === 'object' && error !== null && 'code' in error ? String(error.code) : 'ADVISOR_ERROR';
}

export function advisorErrorMessage(error: unknown): string {
  return advisorText.errors[advisorErrorCode(error)] ?? advisorText.errors.ADVISOR_ERROR;
}

export async function streamAdvisorAnswer(companyId: string, environment: AdvisorEnvironment, conversationId: string,
  input: { question: string; requestId: string; scope: AdvisorScope; replyToTurnId?: string }, signal: AbortSignal, onStatus: (status: AdvisorStreamStatus) => void): Promise<AdvisorAnswer> {
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
        if (eventType === 'error') {
          const streamError = JSON.parse(data) as Partial<AdvisorStreamError>;
          throw { code: streamError.code ?? 'ADVISOR_ERROR', message: streamError.message, ...(typeof streamError.retryAfterSeconds === 'number' && { retryAfterSeconds: streamError.retryAfterSeconds }) };
        }
        if (eventType === 'answer') answer = JSON.parse(data) as AdvisorAnswer;
        if (eventType === 'status') onStatus(JSON.parse(data) as AdvisorStreamStatus);
      }
      if (chunk.done) break;
    }
  } finally { await reader.cancel().catch(() => undefined); reader.releaseLock(); }
  if (!answer) throw { code: 'REQUEST_INTERRUPTED' };
  return answer;
}
