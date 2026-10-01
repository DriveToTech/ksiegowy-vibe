import type { FastifyRequest } from 'fastify';
import type { Prisma } from '@prisma/client';
import type { AdvisorAnswer, AdvisorEnvironment, AdvisorProvider, AdvisorScope } from '@ksiegowy/types';
import { AdvisorError } from './advisor-contract.js';
import { buildAdvisorContext } from './advisor-context.js';
import { readAdvisorConnection, requireAdvisorEnabled, requireAdvisorMembership, requireAdvisorPolicy, reserveAdvisorProviderRequest } from './advisor-access.js';
import { generateAdvisorResponse } from './advisor-provider.js';
import { loadAdvisorSources, selectAdvisorSources } from './advisor-sources.js';
import { isAdvisorQuestionOutOfScope } from './advisor-source-topics.js';

// Polish user-facing text (translation of: out of scope / what the advisor can help with), shown without any model call.
const declinedShortAnswer = 'To pytanie wykracza poza zakres doradcy: obsługuję wyłącznie VAT, faktury i KSeF.';
const declinedExplanation = 'Mogę wyjaśnić zasady wystawiania faktur, stawki VAT, korekty, terminy i KSeF oraz objaśnić ewidencję w aplikacji. W sprawach podatku dochodowego, ZUS, opinii prawnych i składania dokumentów skonsultuj się z księgowym, doradcą podatkowym lub radcą prawnym.';

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
  const answer = isAdvisorQuestionOutOfScope(options.question)
    ? declineAdvisorQuestion(companyId, conversation.environment, scope, connection)
    : await generateAdvisorAnswer(request, { ...options, environment: conversation.environment, connection });
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

// Out-of-scope questions are declined deterministically: no context is loaded and no paid provider call is made.
function declineAdvisorQuestion(companyId: string, environment: AdvisorEnvironment, scope: AdvisorScope, connection: { provider: AdvisorProvider; model: string }): AdvisorAnswer {
  return { status: 'declined', shortAnswer: declinedShortAnswer, explanation: declinedExplanation, assumptions: [], questions: [], evidence: [], calculations: [], sources: [],
    provenance: { companyId, environment, period: scope.period, provider: connection.provider, model: connection.model, generatedAt: new Date().toISOString(),
      recordsIncluded: false, evidenceTruncated: false, sourceVersion: 'not-applicable' } };
}

async function generateAdvisorAnswer(request: FastifyRequest, options: {
  companyId: string; conversationId: string; environment: AdvisorEnvironment; scope: AdvisorScope; question: string; signal: AbortSignal;
  connection: Awaited<ReturnType<typeof readAdvisorConnection>>;
}): Promise<AdvisorAnswer> {
  const { companyId, conversationId, scope, signal, connection, environment } = options;
  const [context, corpus, previousTurns] = await Promise.all([
    buildAdvisorContext(request.server.prisma, companyId, environment, scope),
    loadAdvisorSources(),
    request.server.prisma.advisorTurn.findMany({ where: { conversationId, status: 'COMPLETED' }, orderBy: { createdAt: 'desc' }, take: 4, select: { question: true } }),
  ]);
  const sources = selectAdvisorSources(corpus.sources, scope.period, new Date(), options.question);
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
    assumptions: result.assumptions, questions: result.questions, calculations: result.status === 'declined' ? [] : context.calculations,
    evidence: context.evidence.filter((record) => result.evidenceIds.includes(record.id)),
    sources: sources.filter((source) => result.sourceIds.includes(source.id)),
    provenance: { companyId, environment: environment, period: scope.period, provider: connection.provider,
      model: connection.model, generatedAt: new Date().toISOString(), recordsIncluded: scope.includeRecords,
      evidenceTruncated: context.evidenceTruncated, sourceVersion: corpus.version } };
  return answer;
}
