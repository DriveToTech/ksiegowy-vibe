import { advisorAnswerTimeoutSeconds, type AdvisorAnswerStatus } from '../../../../packages/types/src/advisor';

export type AdvisorConversationPhase =
  | { phase: 'loading' | 'idle' | 'blocked' | 'revoked' | 'completed' }
  | { phase: 'sending' | 'waiting'; requestId: string; question: string; startedAt: number }
  | { phase: 'cancelled'; requestId: string; question: string; startedAt: number }
  | { phase: 'clarification'; turnId: string }
  | { phase: 'failed'; requestId: string; question: string; code: string; retryAfterSeconds?: number; startedAt: number; failedAt: number };

export type AdvisorConversationAction =
  | { type: 'settingsLoaded'; blocked: boolean }
  | { type: 'reset' }
  | { type: 'send'; requestId: string; question: string; now: number }
  | { type: 'statusReceived' }
  | { type: 'answered'; turnId: string; status: AdvisorAnswerStatus }
  | { type: 'cancelled' }
  | { type: 'failed'; code: string; retryAfterSeconds?: number; now: number };

const sendablePhases: AdvisorConversationPhase['phase'][] = ['idle', 'completed', 'clarification', 'cancelled', 'failed'];

export function advisorConversationReducer(state: AdvisorConversationPhase, action: AdvisorConversationAction): AdvisorConversationPhase {
  if (action.type === 'failed' && action.code === 'ACCESS_DENIED') return { phase: 'revoked' };
  if (state.phase === 'revoked') return state;

  if (action.type === 'reset') return { phase: 'idle' };
  if (action.type === 'settingsLoaded') {
    if (action.blocked) return { phase: 'blocked' };
    return state.phase === 'loading' || state.phase === 'blocked' ? { phase: 'idle' } : state;
  }
  if (action.type === 'send') {
    if (!sendablePhases.includes(state.phase)) return state;
    // Every attempt needs its own requestId; the API replays the stored terminal turn for a reused one.
    if ((state.phase === 'failed' || state.phase === 'cancelled') && state.requestId === action.requestId) return state;
    return { phase: 'sending', requestId: action.requestId, question: action.question, startedAt: action.now };
  }
  if (state.phase !== 'sending' && state.phase !== 'waiting') return state;

  if (action.type === 'statusReceived') return { ...state, phase: 'waiting' };
  if (action.type === 'answered') return action.status === 'needs_clarification' ? { phase: 'clarification', turnId: action.turnId } : { phase: 'completed' };
  if (action.type === 'cancelled') return { phase: 'cancelled', requestId: state.requestId, question: state.question, startedAt: state.startedAt };
  return { phase: 'failed', requestId: state.requestId, question: state.question, startedAt: state.startedAt, code: action.code, retryAfterSeconds: action.retryAfterSeconds, failedAt: action.now };
}

/** Client-side timer for a waiting request; `watchdogExpired` means the stream is stuck and should be aborted as REQUEST_INTERRUPTED. */
export function advisorWaitProgress(startedAt: number, now: number): { elapsedSeconds: number; limitSeconds: number; watchdogExpired: boolean } {
  const elapsedSeconds = Math.max(0, Math.floor((now - startedAt) / 1000));
  return { elapsedSeconds, limitSeconds: advisorAnswerTimeoutSeconds, watchdogExpired: elapsedSeconds >= advisorAnswerTimeoutSeconds + 5 };
}

export type AdvisorRecovery = 'retry' | 'settings' | 'billing' | 'refreshSettings' | 'newConversation' | 'composerNote' | 'revoked';

const recoveryByCode: Record<string, AdvisorRecovery> = {
  PROVIDER_UNAVAILABLE: 'retry', OLLAMA_UNREACHABLE: 'retry', REQUEST_INTERRUPTED: 'retry', INVALID_ANSWER: 'retry', INVALID_CITATION: 'retry',
  CONNECTION_CHANGED: 'retry', RATE_LIMITED: 'retry', REQUEST_IN_PROGRESS: 'retry', ADVISOR_ERROR: 'retry',
  PROVIDER_INVALID_CREDENTIALS: 'settings', PROVIDER_ERROR: 'settings',
  PROVIDER_QUOTA_EXCEEDED: 'billing',
  POLICY_DENIED: 'refreshSettings', ADVISOR_DISABLED: 'refreshSettings', CONNECTION_REQUIRED: 'refreshSettings',
  MODEL_CHANGED: 'newConversation', CONVERSATION_NOT_FOUND: 'newConversation', HISTORY_LIMIT: 'newConversation',
  TAX_SOURCES_UNAVAILABLE: 'composerNote', RECORDS_UNAVAILABLE: 'composerNote', DOCUMENT_NOT_FOUND: 'composerNote', CONTRACTOR_NOT_FOUND: 'composerNote', INVALID_REPLY: 'composerNote',
  ACCESS_DENIED: 'revoked',
};

/** Unknown codes fall back to retry, matching the API's ADVISOR_ERROR fallback. */
export function advisorErrorRecovery(code: string): { recovery: AdvisorRecovery; retryable: boolean; hint?: 'credentials' | 'billing' } {
  const recovery = recoveryByCode[code] ?? 'retry';
  return { recovery, retryable: recovery === 'retry', hint: recovery === 'settings' ? 'credentials' : recovery === 'billing' ? 'billing' : undefined };
}

export function advisorRetryRemainingSeconds(failed: { retryAfterSeconds?: number; failedAt: number }, now: number): number {
  return Math.max(0, Math.ceil((failed.retryAfterSeconds ?? 0) - (now - failed.failedAt) / 1000));
}
