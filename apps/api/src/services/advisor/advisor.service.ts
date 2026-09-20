import type { FastifyRequest } from 'fastify';
import type { Prisma } from '@prisma/client';
import type { AdvisorAnswer, AdvisorScope } from '@ksiegowy/types';
import { AdvisorError } from './advisor-contract.js';
import { buildAdvisorContext } from './advisor-context.js';
import { readAdvisorConnection, requireAdvisorEnabled, requireAdvisorMembership, requireAdvisorPolicy, reserveAdvisorProviderRequest } from './advisor-access.js';
import { generateAdvisorResponse } from './advisor-provider.js';
import { loadAdvisorSources, selectAdvisorSources } from './advisor-sources.js';

export async function answerAdvisorQuestion(request: FastifyRequest, options: {
  companyId: string; conversationId: string; turnId: string; scope: AdvisorScope; question: string; signal: AbortSignal;
}): Promise<AdvisorAnswer> {
  const { companyId, conversationId, scope, signal } = options;
  requireAdvisorEnabled();
  const membership = await requireAdvisorMembership(request, companyId);
  const conversation = await request.server.prisma.advisorConversation.findFirst({ where: { id: conversationId, membershipId: membership.id, expiresAt: { gt: new Date() } } });
  if (!conversation) throw new AdvisorError(404, 'CONVERSATION_NOT_FOUND', 'Conversation not found');
  requireAdvisorPolicy(membership, conversation.provider);
  const connection = await readAdvisorConnection(request, membership.id, conversation.provider);
  if (connection.model !== conversation.model) throw new AdvisorError(409, 'MODEL_CHANGED', 'Start a new conversation after changing the model');
  const [context, corpus, previousTurns] = await Promise.all([
    buildAdvisorContext(request.server.prisma, companyId, conversation.environment, scope),
    loadAdvisorSources(),
    request.server.prisma.advisorTurn.findMany({ where: { conversationId, status: 'COMPLETED' }, orderBy: { createdAt: 'desc' }, take: 4, select: { question: true } }),
  ]);
  const sources = selectAdvisorSources(corpus.sources, scope.period);
  if (scope.questionKind === 'tax' && !sources.length) {
    throw new AdvisorError(422, 'TAX_SOURCES_UNAVAILABLE', 'No reviewed tax sources cover this period. Ask about accounting records or consult your accountant.');
  }
  signal.throwIfAborted();
  await reserveAdvisorProviderRequest(request, connection.id);
  const result = await generateAdvisorResponse(connection, JSON.stringify({ question: options.question, scope,
    previousQuestions: scope.includeRecords ? previousTurns.reverse().map((turn) => turn.question) : [],
    accounting: context, legalSources: sources,
    limitations: ['No bank balance or payment-event history', 'No deduction entitlement or tax-return calculation', 'Formal corrections excluded from totals; cancellation amounts included', 'Evidence documents are a bounded sample; totals cover the whole selected month'],
  }), signal);
  if (result.evidenceIds.some((identifier) => !context.evidence.some((record) => record.id === identifier))
    || result.sourceIds.some((identifier) => !sources.some((source) => source.id === identifier))) {
    throw new AdvisorError(502, 'INVALID_CITATION', 'Provider referenced evidence outside the supplied context');
  }
  if ((result.containsTaxGuidance || (scope.questionKind === 'tax' && result.status === 'answered')) && !result.sourceIds.length) {
    throw new AdvisorError(422, 'TAX_SOURCES_UNAVAILABLE', 'The answer lacks reviewed legal evidence');
  }
  const answer: AdvisorAnswer = { status: result.status, shortAnswer: result.shortAnswer, explanation: result.explanation,
    assumptions: result.assumptions, questions: result.questions, calculations: context.calculations,
    evidence: context.evidence.filter((record) => result.evidenceIds.includes(record.id)),
    sources: sources.filter((source) => result.sourceIds.includes(source.id)),
    provenance: { companyId, environment: conversation.environment, period: scope.period, provider: connection.provider,
      model: connection.model, generatedAt: new Date().toISOString(), recordsIncluded: scope.includeRecords,
      evidenceTruncated: context.evidenceTruncated, sourceVersion: corpus.version } };
  signal.throwIfAborted();
  await request.accessJwtVerify();
  requireAdvisorPolicy(await requireAdvisorMembership(request, companyId), conversation.provider);
  const stillConnected = await request.server.prisma.advisorConnection.findUnique({ where: { id: connection.id } });
  if (!stillConnected || stillConnected.model !== connection.model || stillConnected.credentialEncrypted !== connection.credentialEncrypted) {
    throw new AdvisorError(409, 'CONNECTION_CHANGED', 'Connection changed during generation');
  }
  const stored = await request.server.prisma.advisorTurn.updateMany({ where: { id: options.turnId, status: 'PENDING' },
    data: { status: 'COMPLETED', finishedAt: new Date(), answer: JSON.parse(JSON.stringify(answer)) as Prisma.InputJsonValue } });
  if (!stored.count) throw new AdvisorError(409, 'REQUEST_INTERRUPTED', 'Request was interrupted');
  return answer;
}
