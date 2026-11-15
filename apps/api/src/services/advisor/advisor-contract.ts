import { z } from 'zod';

export const advisorProviders = ['OPENROUTER', 'OPENAI', 'ANTHROPIC', 'OLLAMA'] as const;
export const advisorProviderSchema = z.enum(advisorProviders);
export const advisorGrantRetentionDays = 30;
export const advisorModelPreviewDailyLimitPerUser = 30;
export const advisorModelPreviewDailyLimitPerCompany = 100;
export const advisorModelPreviewUsageRetentionDays = 7;
// Polish user-facing text (translation of: AI-generated answer, sources checked by an AI model only, not legal or tax advice; verify in sources or with an accountant/tax advisor).
export const advisorTaxDisclaimer = 'Odpowiedź wygenerowana przez AI. Źródła sprawdził wyłącznie model AI, nie doradca podatkowy. Nie stanowi porady prawnej ani podatkowej — zweryfikuj ją w źródłach lub u księgowego/doradcy podatkowego.';
export const advisorScopeSchema = z.object({
  questionKind: z.enum(['records', 'tax']),
  period: z.string().regex(/^20\d{2}-(0[1-9]|1[0-2])$/),
  includeRecords: z.boolean(),
  documentId: z.string().min(1).max(100).optional(),
  documentKind: z.enum(['outgoing', 'incoming']).optional(),
  contractorId: z.string().min(1).max(100).optional(),
}).strict().refine((scope) => Boolean(scope.documentId) === Boolean(scope.documentKind) && !(scope.contractorId && scope.documentId), {
  message: 'Select either a document or contractor; a document requires its kind',
});

export const advisorModelAnswerSchema = z.object({
  status: z.enum(['answered', 'needs_clarification', 'insufficient_evidence', 'declined']),
  shortAnswer: z.string().min(1).max(1500),
  explanation: z.string().max(6000),
  assumptions: z.array(z.string().max(500)).max(8),
  questions: z.array(z.string().max(500)).max(5),
  evidenceIds: z.array(z.string().max(100)).max(40),
  sourceIds: z.array(z.string().max(100)).max(8),
  containsTaxGuidance: z.boolean(),
}).strict().superRefine((answer, context) => {
  // Model output is rendered to users: links, HTML and markdown images are an exfiltration channel for injected document text.
  const linkPattern = /https?:\/\/|www\.|<|\]\(|!\[/i;
  if ([answer.shortAnswer, answer.explanation, ...answer.assumptions, ...answer.questions].some((text) => linkPattern.test(text))) {
    context.addIssue({ code: 'custom', message: 'Answer text must not contain links, HTML or markdown images' });
    return;
  }
  if (answer.status !== 'declined') return;
  // A decline is a bounded out-of-scope notice: shortAnswer = why, explanation = what the advisor can help with. No claims, no citations.
  const violations = [
    answer.shortAnswer.length > 400 && 'shortAnswer',
    (answer.explanation.length < 1 || answer.explanation.length > 600) && 'explanation',
    (answer.assumptions.length || answer.questions.length || answer.evidenceIds.length || answer.sourceIds.length) && 'lists',
    answer.containsTaxGuidance && 'containsTaxGuidance',
  ].filter(Boolean);
  if (violations.length) context.addIssue({ code: 'custom', message: `A declined answer must be short, explain the supported scope and carry no claims or citations: ${violations.join(', ')}` });
});

export class AdvisorError extends Error {
  constructor(public readonly statusCode: number, public readonly code: string, message: string, public readonly retryAfterSeconds?: number, public readonly upstreamStatus?: number, public readonly upstreamErrorType?: string) {
    super(message);
    this.name = 'AdvisorError';
  }
}
