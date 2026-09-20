import { PassThrough } from 'node:stream';
import type { FastifyPluginAsync } from 'fastify';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { requireExplicitKsefEnvironment } from '../lib/ksef-environment.js';
import { advisorSettingsRoutes } from './advisor-settings.js';
import { advisorConnectorRoutes } from './advisor-connectors.js';
import { AdvisorError, advisorProviderSchema, advisorScopeSchema } from '../services/advisor/advisor-contract.js';
import { requireAdvisorEnabled, requireAdvisorMembership, requireAdvisorOrigin, requireAdvisorPolicy, readAdvisorConnection } from '../services/advisor/advisor-access.js';
import { answerAdvisorQuestion } from '../services/advisor/advisor.service.js';

interface ConversationParameters { companyId: string; conversationId: string }
const messageSchema = z.object({ requestId: z.uuid(), question: z.string().trim().min(1).max(4000), scope: advisorScopeSchema }).strict();

export const advisorRoutes: FastifyPluginAsync = async (server) => {
  const activeRequests = new Set<AbortController>();
  server.addHook('onRequest', server.authenticate);
  server.addHook('onRequest', async (request, reply) => {
    reply.header('Cache-Control', 'no-store');
    requireAdvisorOrigin(request);
  });
  server.addHook('preHandler', async (request) => {
    if (request.routeOptions.url?.includes('/conversations')) requireAdvisorEnabled();
  });
  server.setErrorHandler((error, request, reply) => {
    if (error instanceof z.ZodError) return reply.code(400).send({ code: 'INVALID_REQUEST', message: 'Invalid advisor request' });
    if (error instanceof AdvisorError) return reply.code(error.statusCode).send({ code: error.code, message: error.message });
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2021') {
      return reply.code(503).send({ code: 'ADVISOR_MIGRATION_REQUIRED', message: 'Apply the tax advisor database migration first' });
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return reply.code(409).send({ code: 'REQUEST_IN_PROGRESS', message: 'An advisor request is already running' });
    }
    const statusCode = typeof error === 'object' && error !== null && 'statusCode' in error && typeof error.statusCode === 'number' ? error.statusCode : 500;
    request.log.error({ operation: 'advisor', requestId: request.id, statusCode }, 'Advisor request failed');
    return reply.code(statusCode >= 400 && statusCode <= 599 ? statusCode : 500).send({ code: 'ADVISOR_ERROR', message: 'Advisor request failed' });
  });
  server.addHook('onClose', async () => { for (const controller of activeRequests) controller.abort(); });
  await server.register(advisorSettingsRoutes);
  await server.register(advisorConnectorRoutes);

  server.get<{ Params: { companyId: string } }>('/conversations', async (request) => {
    const membership = await requireAdvisorMembership(request, request.params.companyId);
    const environment = requireExplicitKsefEnvironment(request);
    return server.prisma.advisorConversation.findMany({ where: { membershipId: membership.id, environment, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: 'desc' }, take: 50, select: { id: true, title: true, provider: true, model: true, createdAt: true } });
  });
  server.post<{ Params: { companyId: string } }>('/conversations', async (request) => {
    const membership = await requireAdvisorMembership(request, request.params.companyId);
    const environment = requireExplicitKsefEnvironment(request);
    const body = z.object({ provider: advisorProviderSchema, title: z.string().trim().min(1).max(120) }).strict().parse(request.body);
    const policy = requireAdvisorPolicy(membership, body.provider);
    const connection = await readAdvisorConnection(request, membership.id, body.provider);
    const count = await server.prisma.advisorConversation.count({ where: { membershipId: membership.id } });
    if (count >= 100) throw new AdvisorError(409, 'HISTORY_LIMIT', 'Delete an older conversation before creating another');
    return server.prisma.advisorConversation.create({ data: { membershipId: membership.id, environment, provider: body.provider,
      model: connection.model, title: body.title, expiresAt: new Date(Date.now() + policy.retentionDays * 86_400_000) },
      select: { id: true, title: true, provider: true, model: true, createdAt: true } });
  });
  server.get<{ Params: ConversationParameters }>('/conversations/:conversationId', async (request) => {
    const membership = await requireAdvisorMembership(request, request.params.companyId);
    const environment = requireExplicitKsefEnvironment(request);
    const conversation = await server.prisma.advisorConversation.findFirst({ where: { id: request.params.conversationId, membershipId: membership.id, environment, expiresAt: { gt: new Date() } },
      select: { id: true, title: true, provider: true, model: true, createdAt: true,
        turns: { orderBy: { createdAt: 'asc' }, take: 100, select: { id: true, question: true, status: true, answer: true, createdAt: true } } } });
    if (!conversation) throw new AdvisorError(404, 'CONVERSATION_NOT_FOUND', 'Conversation not found');
    return { ...conversation, turns: conversation.turns.map((turn) => ({ ...turn,
      status: turn.status === 'PENDING' && turn.createdAt.getTime() < Date.now() - 120_000 ? 'FAILED' : turn.status })) };
  });
  server.delete<{ Params: ConversationParameters }>('/conversations/:conversationId', async (request) => {
    const membership = await requireAdvisorMembership(request, request.params.companyId);
    const environment = requireExplicitKsefEnvironment(request);
    await server.prisma.advisorConversation.deleteMany({ where: { id: request.params.conversationId, membershipId: membership.id, environment } });
    return { deleted: true };
  });
  server.post<{ Params: ConversationParameters }>('/conversations/:conversationId/messages', { bodyLimit: 12_000 }, async (request, reply) => {
    const body = messageSchema.parse(request.body);
    const membership = await requireAdvisorMembership(request, request.params.companyId);
    const environment = requireExplicitKsefEnvironment(request);
    const conversation = await server.prisma.advisorConversation.findFirst({ where: { id: request.params.conversationId, membershipId: membership.id, environment, expiresAt: { gt: new Date() } } });
    if (!conversation) throw new AdvisorError(404, 'CONVERSATION_NOT_FOUND', 'Conversation not found');
    requireAdvisorPolicy(membership, conversation.provider);
    const turn = await server.prisma.$transaction(async (transaction) => {
      await transaction.$queryRaw`SELECT "id" FROM "CompanyMembership" WHERE "id" = ${membership.id} FOR UPDATE`;
      const existing = await transaction.advisorTurn.findUnique({ where: { conversationId_requestId: { conversationId: conversation.id, requestId: body.requestId } } });
      if (existing) {
        const storedScope = advisorScopeSchema.parse(existing.scope);
        if (existing.question !== body.question || Object.entries(body.scope).some(([key, value]) => storedScope[key as keyof typeof storedScope] !== value)
          || Object.keys(storedScope).length !== Object.keys(body.scope).length) throw new AdvisorError(409, 'REQUEST_CONFLICT', 'Request identifier was already used for different input');
        if (existing.status === 'PENDING' && existing.createdAt.getTime() < Date.now() - 120_000) {
          return transaction.advisorTurn.update({ where: { id: existing.id }, data: { status: 'FAILED', finishedAt: new Date() } });
        }
        return existing;
      }
      const memberScope = { conversation: { membershipId: membership.id } };
      await transaction.advisorTurn.updateMany({ where: { ...memberScope, status: 'PENDING', createdAt: { lt: new Date(Date.now() - 120_000) } }, data: { status: 'FAILED', finishedAt: new Date() } });
      const pending = await transaction.advisorTurn.count({ where: { ...memberScope, status: 'PENDING' } });
      const recent = await transaction.advisorTurn.count({ where: { ...memberScope, createdAt: { gt: new Date(Date.now() - 60_000) } } });
      const count = await transaction.advisorTurn.count({ where: { conversationId: conversation.id } });
      if (pending || recent >= 6 || count >= 100) throw new AdvisorError(429, 'RATE_LIMITED', 'Conversation or request limit reached');
      return transaction.advisorTurn.create({ data: { conversationId: conversation.id, requestId: body.requestId, question: body.question, scope: { ...body.scope } } });
    });
    if (turn.status !== 'PENDING' || turn.createdAt.getTime() < Date.now() - 120_000) {
      return reply.send({ status: turn.status, answer: turn.answer });
    }
    // Atomically claim a pending turn so concurrent retries cannot call the provider twice.
    const generationClaim = await server.prisma.advisorTurn.updateMany({ where: { id: turn.id, status: 'PENDING', startedAt: null }, data: { startedAt: new Date() } });
    if (!generationClaim.count) throw new AdvisorError(409, 'REQUEST_IN_PROGRESS', 'This request is already running');
    const controller = new AbortController();
    activeRequests.add(controller);
    const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(60_000)]);
    const stream = new PassThrough();
    const emit = (event: string, data: unknown) => { if (!stream.destroyed) stream.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`); };
    reply.raw.on('close', () => controller.abort());
    reply.header('Content-Type', 'text/event-stream').header('X-Accel-Buffering', 'no');
    emit('status', { stage: 'preparing' });
    const heartbeat = setInterval(() => emit('status', { stage: 'working' }), 10_000);
    request.log.info({ operation: 'advisor.answer', conversationId: conversation.id, requestId: request.id }, 'Advisor generation started');
    void answerAdvisorQuestion(request, { companyId: request.params.companyId, conversationId: conversation.id, turnId: turn.id,
      scope: body.scope, question: body.question, signal }).then((answer) => {
      emit('answer', answer);
      request.log.info({ operation: 'advisor.answer', conversationId: conversation.id, requestId: request.id }, 'Advisor generation completed');
    }).catch(async (error: unknown) => {
      await server.prisma.advisorTurn.updateMany({ where: { id: turn.id, status: 'PENDING' },
        data: { status: controller.signal.aborted ? 'CANCELLED' : 'FAILED', finishedAt: new Date() } }).catch(() => undefined);
      const code = error instanceof AdvisorError ? error.code : signal.aborted ? 'REQUEST_INTERRUPTED' : 'PROVIDER_ERROR';
      request.log.error({ operation: 'advisor.answer', requestId: request.id, code }, 'Advisor generation failed');
      emit('error', { code, message: error instanceof AdvisorError ? error.message : 'Advisor generation failed' });
    }).finally(() => { clearInterval(heartbeat); activeRequests.delete(controller); emit('done', {}); stream.end(); });
    return reply.send(stream);
  });
};
