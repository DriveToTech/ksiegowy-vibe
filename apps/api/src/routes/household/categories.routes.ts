import type { FastifyPluginAsync } from 'fastify';
import {
  createCategory,
  deleteCategory,
  listCategories,
  updateCategory,
  createRule,
  deleteRule,
  listRules
} from '@ksiegowy/household-service';
import { requireHouseholdMembership } from './household-membership-guard.js';

// ── Schemas ──────────────────────────────────────────────────────────────────

const categorySchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    id: { type: 'string' },
    householdId: { type: 'string' },
    name: { type: 'string' },
    parentCategoryId: { type: ['string', 'null'] },
    createdAt: { type: 'string', format: 'date-time' },
    updatedAt: { type: 'string', format: 'date-time' }
  },
  required: ['id', 'householdId', 'name', 'parentCategoryId', 'createdAt', 'updatedAt']
} as const;

const ruleSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    id: { type: 'string' },
    householdId: { type: 'string' },
    matchType: { type: 'string', enum: ['EXACT', 'SUBSTRING'] },
    payeePattern: { type: 'string' },
    categoryId: { type: 'string' },
    createdAt: { type: 'string', format: 'date-time' },
    updatedAt: { type: 'string', format: 'date-time' }
  },
  required: ['id', 'householdId', 'matchType', 'payeePattern', 'categoryId', 'createdAt', 'updatedAt']
} as const;

const householdParamsSchema = {
  type: 'object',
  properties: { householdId: { type: 'string', minLength: 1 } },
  required: ['householdId']
} as const;

const categoryParamsSchema = {
  type: 'object',
  properties: {
    householdId: { type: 'string', minLength: 1 },
    categoryId: { type: 'string', minLength: 1 }
  },
  required: ['householdId', 'categoryId']
} as const;

const ruleParamsSchema = {
  type: 'object',
  properties: {
    householdId: { type: 'string', minLength: 1 },
    ruleId: { type: 'string', minLength: 1 }
  },
  required: ['householdId', 'ruleId']
} as const;

const createCategoryBodySchema = {
  type: 'object',
  additionalProperties: false,
  required: ['name'],
  properties: {
    name: { type: 'string', minLength: 1 },
    parentCategoryId: { type: 'string' }
  }
} as const;

const updateCategoryBodySchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    name: { type: 'string', minLength: 1 },
    parentCategoryId: { type: ['string', 'null'] }
  }
} as const;

const createRuleBodySchema = {
  type: 'object',
  additionalProperties: false,
  required: ['matchType', 'payeePattern', 'categoryId'],
  properties: {
    matchType: { type: 'string', enum: ['EXACT', 'SUBSTRING'] },
    payeePattern: { type: 'string', minLength: 1 },
    categoryId: { type: 'string', minLength: 1 }
  }
} as const;

// ── Types ────────────────────────────────────────────────────────────────────

interface HouseholdParams { householdId: string }
interface CategoryParams { householdId: string; categoryId: string }
interface RuleParams { householdId: string; ruleId: string }
interface CreateCategoryBody { name: string; parentCategoryId?: string }
interface UpdateCategoryBody { name?: string; parentCategoryId?: string | null }
interface CreateRuleBody { matchType: 'EXACT' | 'SUBSTRING'; payeePattern: string; categoryId: string }

// ── Helpers ──────────────────────────────────────────────────────────────────

const serializeCategory = (category: { id: string; householdId: string; name: string; parentCategoryId: string | null; createdAt: Date; updatedAt: Date }) => ({
  id: category.id,
  householdId: category.householdId,
  name: category.name,
  parentCategoryId: category.parentCategoryId,
  createdAt: category.createdAt.toISOString(),
  updatedAt: category.updatedAt.toISOString()
});

const serializeRule = (rule: { id: string; householdId: string; matchType: string; payeePattern: string; categoryId: string; createdAt: Date; updatedAt: Date }) => ({
  id: rule.id,
  householdId: rule.householdId,
  matchType: rule.matchType,
  payeePattern: rule.payeePattern,
  categoryId: rule.categoryId,
  createdAt: rule.createdAt.toISOString(),
  updatedAt: rule.updatedAt.toISOString()
});

// ── Plugin ───────────────────────────────────────────────────────────────────

export const categoriesRoutes: FastifyPluginAsync = async (fastify): Promise<void> => {
  fastify.get<{ Params: HouseholdParams }>('/households/:householdId/categories', {
    onRequest: [fastify.authenticate],
    schema: { params: householdParamsSchema, response: { 200: { type: 'array', items: categorySchema } } }
  }, async (request) => {
    await requireHouseholdMembership(fastify, request, request.params.householdId);
    const categories = await listCategories(fastify.householdDatabase, request.params.householdId);
    return categories.map(serializeCategory);
  });

  fastify.post<{ Params: HouseholdParams; Body: CreateCategoryBody }>('/households/:householdId/categories', {
    onRequest: [fastify.authenticate],
    schema: { params: householdParamsSchema, body: createCategoryBodySchema, response: { 201: categorySchema } }
  }, async (request, reply) => {
    await requireHouseholdMembership(fastify, request, request.params.householdId);
    const category = await createCategory(fastify.householdDatabase, { householdId: request.params.householdId, ...request.body });
    return reply.code(201).send(serializeCategory(category));
  });

  fastify.patch<{ Params: CategoryParams; Body: UpdateCategoryBody }>('/households/:householdId/categories/:categoryId', {
    onRequest: [fastify.authenticate],
    schema: { params: categoryParamsSchema, body: updateCategoryBodySchema, response: { 200: categorySchema } }
  }, async (request) => {
    await requireHouseholdMembership(fastify, request, request.params.householdId);
    const category = await updateCategory(fastify.householdDatabase, request.params.householdId, request.params.categoryId, request.body);
    return serializeCategory(category);
  });

  fastify.delete<{ Params: CategoryParams }>('/households/:householdId/categories/:categoryId', {
    onRequest: [fastify.authenticate],
    schema: { params: categoryParamsSchema, response: { 204: { type: 'null' } } }
  }, async (request, reply) => {
    await requireHouseholdMembership(fastify, request, request.params.householdId);
    await deleteCategory(fastify.householdDatabase, request.params.householdId, request.params.categoryId);
    return reply.code(204).send();
  });

  // ── Categorization rules ─────────────────────────────────────────────────

  fastify.get<{ Params: HouseholdParams }>('/households/:householdId/categorization-rules', {
    onRequest: [fastify.authenticate],
    schema: { params: householdParamsSchema, response: { 200: { type: 'array', items: ruleSchema } } }
  }, async (request) => {
    await requireHouseholdMembership(fastify, request, request.params.householdId);
    const rules = await listRules(fastify.householdDatabase, request.params.householdId);
    return rules.map(serializeRule);
  });

  /**
   * Explicit opt-in creation only — never triggered automatically by a
   * recategorize call (see transactions.routes.ts's recategorize endpoint,
   * which calls the package's own opt-in flow instead of this endpoint).
   */
  fastify.post<{ Params: HouseholdParams; Body: CreateRuleBody }>('/households/:householdId/categorization-rules', {
    onRequest: [fastify.authenticate],
    schema: { params: householdParamsSchema, body: createRuleBodySchema, response: { 201: ruleSchema } }
  }, async (request, reply) => {
    await requireHouseholdMembership(fastify, request, request.params.householdId);
    const rule = await createRule(fastify.householdDatabase, { householdId: request.params.householdId, ...request.body });
    return reply.code(201).send(serializeRule(rule));
  });

  fastify.delete<{ Params: RuleParams }>('/households/:householdId/categorization-rules/:ruleId', {
    onRequest: [fastify.authenticate],
    schema: { params: ruleParamsSchema, response: { 204: { type: 'null' } } }
  }, async (request, reply) => {
    await requireHouseholdMembership(fastify, request, request.params.householdId);
    await deleteRule(fastify.householdDatabase, request.params.householdId, request.params.ruleId);
    return reply.code(204).send();
  });
};
