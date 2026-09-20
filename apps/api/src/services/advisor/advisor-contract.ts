import { z } from 'zod';

export const advisorProviders = ['OPENROUTER', 'OPENAI', 'ANTHROPIC', 'OLLAMA'] as const;
export const advisorProviderSchema = z.enum(advisorProviders);
export const advisorScopeSchema = z.object({
  questionKind: z.enum(['records', 'tax']),
  period: z.string().regex(/^20\d{2}-(0[1-9]|1[0-2])$/),
  includeRecords: z.boolean(),
  documentId: z.string().min(1).max(100).optional(),
  documentKind: z.enum(['outgoing', 'incoming']).optional(),
}).strict().refine((scope) => Boolean(scope.documentId) === Boolean(scope.documentKind), {
  message: 'Document identifier and kind must be provided together',
});

export const advisorModelAnswerSchema = z.object({
  status: z.enum(['answered', 'needs_clarification', 'insufficient_evidence']),
  shortAnswer: z.string().min(1).max(1500),
  explanation: z.string().max(6000),
  assumptions: z.array(z.string().max(500)).max(8),
  questions: z.array(z.string().max(500)).max(5),
  evidenceIds: z.array(z.string().max(100)).max(40),
  sourceIds: z.array(z.string().max(100)).max(8),
  containsTaxGuidance: z.boolean(),
}).strict();

export class AdvisorError extends Error {
  constructor(public readonly statusCode: number, public readonly code: string, message: string) {
    super(message);
    this.name = 'AdvisorError';
  }
}
