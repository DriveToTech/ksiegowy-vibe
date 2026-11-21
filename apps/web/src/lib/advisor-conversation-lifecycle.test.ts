import { describe, expect, it } from 'vitest';
import { advisorConversationReducer, advisorErrorRecovery, advisorRetryRemainingSeconds, advisorWaitProgress, type AdvisorConversationPhase } from './advisor-conversation-lifecycle';

describe('advisorConversationReducer()', () => {
  const waiting: AdvisorConversationPhase = { phase: 'waiting', requestId: 'one', question: 'Q', startedAt: 1000 };

  it('walks send, status and answer', () => {
    let state = advisorConversationReducer({ phase: 'idle' }, { type: 'send', requestId: 'one', question: 'Q', now: 1000 });
    expect(state).toEqual({ phase: 'sending', requestId: 'one', question: 'Q', startedAt: 1000 });
    state = advisorConversationReducer(state, { type: 'statusReceived' });
    expect(state).toEqual(waiting);
    expect(advisorConversationReducer(state, { type: 'answered', turnId: 't', status: 'answered' })).toEqual({ phase: 'completed' });
  });

  it('enters clarification for a needs_clarification answer', () => {
    expect(advisorConversationReducer(waiting, { type: 'answered', turnId: 't', status: 'needs_clarification' })).toEqual({ phase: 'clarification', turnId: 't' });
  });

  it('keeps the question on cancel and failure, and requires a new requestId to retry', () => {
    const failed = advisorConversationReducer(waiting, { type: 'failed', code: 'RATE_LIMITED', retryAfterSeconds: 10, now: 5000 });
    expect(failed).toEqual({ phase: 'failed', requestId: 'one', question: 'Q', code: 'RATE_LIMITED', retryAfterSeconds: 10, startedAt: 1000, failedAt: 5000 });
    expect(advisorConversationReducer(failed, { type: 'send', requestId: 'one', question: 'Q', now: 6000 })).toBe(failed);
    expect(advisorConversationReducer(failed, { type: 'send', requestId: 'two', question: 'Q', now: 6000 }).phase).toBe('sending');
    expect(advisorConversationReducer(waiting, { type: 'cancelled' })).toEqual({ phase: 'cancelled', requestId: 'one', question: 'Q', startedAt: 1000 });
  });

  it('resets to idle for a new conversation but never leaves revoked', () => {
    expect(advisorConversationReducer({ phase: 'cancelled', requestId: 'one', question: 'Q', startedAt: 1000 }, { type: 'reset' })).toEqual({ phase: 'idle' });
    expect(advisorConversationReducer({ phase: 'revoked' }, { type: 'reset' })).toEqual({ phase: 'revoked' });
  });

  it('refuses a second send while a request is in flight or blocked', () => {
    expect(advisorConversationReducer(waiting, { type: 'send', requestId: 'two', question: 'Q', now: 2 })).toBe(waiting);
    expect(advisorConversationReducer({ phase: 'blocked' }, { type: 'send', requestId: 'two', question: 'Q', now: 2 })).toEqual({ phase: 'blocked' });
  });

  it('treats ACCESS_DENIED as terminal revoked from any phase', () => {
    const revoked = advisorConversationReducer(waiting, { type: 'failed', code: 'ACCESS_DENIED', now: 2 });
    expect(revoked).toEqual({ phase: 'revoked' });
    expect(advisorConversationReducer(revoked, { type: 'settingsLoaded', blocked: false })).toBe(revoked);
  });

  it('moves between loading, blocked and idle on settings', () => {
    expect(advisorConversationReducer({ phase: 'loading' }, { type: 'settingsLoaded', blocked: true })).toEqual({ phase: 'blocked' });
    expect(advisorConversationReducer({ phase: 'blocked' }, { type: 'settingsLoaded', blocked: false })).toEqual({ phase: 'idle' });
  });
});

describe('advisorWaitProgress()', () => {
  it('counts seconds against the shared timeout and trips the watchdog at +5 s', () => {
    expect(advisorWaitProgress(0, 12_500)).toEqual({ elapsedSeconds: 12, limitSeconds: 60, watchdogExpired: false });
    expect(advisorWaitProgress(0, 65_000).watchdogExpired).toBe(true);
  });
});

describe('advisorErrorRecovery()', () => {
  it('marks retryable codes', () => {
    for (const code of ['INVALID_ANSWER', 'INVALID_CITATION', 'REQUEST_INTERRUPTED', 'RATE_LIMITED', 'ADVISOR_ERROR', 'PROVIDER_UNAVAILABLE', 'SOMETHING_NEW']) {
      expect(advisorErrorRecovery(code)).toEqual({ recovery: 'retry', retryable: true, hint: undefined });
    }
  });

  it('gives billing and credentials hints without retry', () => {
    expect(advisorErrorRecovery('PROVIDER_QUOTA_EXCEEDED')).toEqual({ recovery: 'billing', retryable: false, hint: 'billing' });
    expect(advisorErrorRecovery('PROVIDER_INVALID_CREDENTIALS')).toEqual({ recovery: 'settings', retryable: false, hint: 'credentials' });
    expect(advisorErrorRecovery('PROVIDER_ERROR').retryable).toBe(false);
  });

  it('routes INVALID_REPLY to the composer note without retry', () => {
    expect(advisorErrorRecovery('INVALID_REPLY')).toEqual({ recovery: 'composerNote', retryable: false, hint: undefined });
  });

  it('routes RECORDS_UNAVAILABLE to the composer note', () => {
    expect(advisorErrorRecovery('RECORDS_UNAVAILABLE')).toEqual({ recovery: 'composerNote', retryable: false, hint: undefined });
  });
});

describe('advisorRetryRemainingSeconds()', () => {
  it('counts down retryAfterSeconds', () => {
    expect(advisorRetryRemainingSeconds({ retryAfterSeconds: 10, failedAt: 0 }, 4000)).toBe(6);
    expect(advisorRetryRemainingSeconds({ failedAt: 0 }, 4000)).toBe(0);
  });
});
