import type { FastifyPluginAsync } from 'fastify';
import {
  createTransaction,
  createTransfer,
  deleteTransaction,
  getVisibleTransaction,
  listTransactions,
  recategorizeTransaction,
  updateTransaction,
  confirmStatementImport,
  previewStatementImport,
  type HouseholdTransaction
} from '@ksiegowy/household-service';
import type { AccessTokenPayload } from '../../lib/auth-config.js';
import { requireHouseholdMembership } from './household-membership-guard.js';

// ── Schemas ──────────────────────────────────────────────────────────────────

const transactionSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    id: { type: 'string' },
    householdId: { type: 'string' },
    accountId: { type: 'string' },
    categoryId: { type: ['string', 'null'] },
    payee: { type: 'string' },
    payerUserId: { type: ['string', 'null'] },
    bankDescription: { type: ['string', 'null'] },
    amount: { type: 'string' },
    date: { type: 'string', format: 'date' },
    tag: { type: ['string', 'null'] },
    note: { type: ['string', 'null'] },
    isRecurring: { type: 'boolean' },
    commitmentId: { type: ['string', 'null'] },
    categorizationSource: { type: 'string', enum: ['MANUAL', 'RULE', 'IMPORT'] },
    importBatchId: { type: ['string', 'null'] },
    transferGroupId: { type: ['string', 'null'] },
    createdAt: { type: 'string', format: 'date-time' },
    updatedAt: { type: 'string', format: 'date-time' }
  },
  required: [
    'id', 'householdId', 'accountId', 'categoryId', 'payee', 'payerUserId', 'bankDescription',
    'amount', 'date', 'tag', 'note', 'isRecurring', 'commitmentId', 'categorizationSource',
    'importBatchId', 'transferGroupId', 'createdAt', 'updatedAt'
  ]
} as const;

const householdParamsSchema = {
  type: 'object',
  properties: { householdId: { type: 'string', minLength: 1 } },
  required: ['householdId']
} as const;

const transactionParamsSchema = {
  type: 'object',
  properties: {
    householdId: { type: 'string', minLength: 1 },
    transactionId: { type: 'string', minLength: 1 }
  },
  required: ['householdId', 'transactionId']
} as const;

const listTransactionsQuerySchema = {
  type: 'object',
  properties: {
    accountId: { type: 'string' },
    categoryId: { type: 'string' },
    dateFrom: { type: 'string', format: 'date' },
    dateTo: { type: 'string', format: 'date' },
    tag: { type: 'string' },
    excludeTransfers: { type: 'boolean' },
    page: { type: 'integer', minimum: 1, default: 1 },
    limit: { type: 'integer', minimum: 1, maximum: 200, default: 50 }
  }
} as const;

const transactionListResponseSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    data: { type: 'array', items: transactionSchema },
    total: { type: 'integer' },
    page: { type: 'integer' },
    limit: { type: 'integer' },
    moneyIn: { type: 'string' },
    moneyOut: { type: 'string' }
  },
  required: ['data', 'total', 'page', 'limit', 'moneyIn', 'moneyOut']
} as const;

const createTransactionBodySchema = {
  type: 'object',
  additionalProperties: false,
  required: ['accountId', 'payee', 'amount', 'date'],
  properties: {
    accountId: { type: 'string', minLength: 1 },
    payee: { type: 'string', minLength: 1 },
    amount: { type: 'string', minLength: 1 },
    date: { type: 'string', format: 'date' },
    categoryId: { type: 'string' },
    payerUserId: { type: 'string' },
    bankDescription: { type: 'string' },
    tag: { type: 'string' },
    note: { type: 'string' },
    isRecurring: { type: 'boolean' }
  }
} as const;

const updateTransactionBodySchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    payee: { type: 'string', minLength: 1 },
    categoryId: { type: ['string', 'null'] },
    tag: { type: ['string', 'null'] },
    note: { type: ['string', 'null'] },
    date: { type: 'string', format: 'date' }
  }
} as const;

const recategorizeBodySchema = {
  type: 'object',
  additionalProperties: false,
  required: ['categoryId'],
  properties: {
    categoryId: { type: 'string', minLength: 1 },
    applyToFutureFromPayee: { type: 'boolean' },
    ruleMatchType: { type: 'string', enum: ['EXACT', 'SUBSTRING'] }
  }
} as const;

const createTransferBodySchema = {
  type: 'object',
  additionalProperties: false,
  required: ['fromAccountId', 'toAccountId', 'amount', 'date'],
  properties: {
    fromAccountId: { type: 'string', minLength: 1 },
    toAccountId: { type: 'string', minLength: 1 },
    amount: { type: 'string', minLength: 1 },
    date: { type: 'string', format: 'date' },
    payee: { type: 'string' },
    note: { type: 'string' }
  }
} as const;

const statementImportPreviewBodySchema = {
  type: 'object',
  additionalProperties: false,
  required: ['accountId', 'csvContent', 'columnMapping'],
  properties: {
    accountId: { type: 'string', minLength: 1 },
    csvContent: { type: 'string', minLength: 1 },
    columnMapping: {
      type: 'object',
      additionalProperties: false,
      required: ['dateColumnIndex', 'amountColumnIndex', 'payeeColumnIndex'],
      properties: {
        dateColumnIndex: { type: 'number', minimum: 0 },
        amountColumnIndex: { type: 'number', minimum: 0 },
        payeeColumnIndex: { type: 'number', minimum: 0 },
        descriptionColumnIndex: { type: 'number', minimum: 0 }
      }
    }
  }
} as const;

const statementImportConfirmBodySchema = {
  type: 'object',
  additionalProperties: false,
  required: ['accountId', 'rows'],
  properties: {
    accountId: { type: 'string', minLength: 1 },
    rows: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['date', 'amount', 'payee'],
        properties: {
          date: { type: 'string', format: 'date' },
          amount: { type: 'string' },
          payee: { type: 'string' },
          bankDescription: { type: 'string' },
          categoryId: { type: 'string' }
        }
      }
    }
  }
} as const;

// ── Types ────────────────────────────────────────────────────────────────────

interface HouseholdParams { householdId: string }
interface TransactionParams { householdId: string; transactionId: string }

interface ListTransactionsQuery {
  accountId?: string;
  categoryId?: string;
  dateFrom?: string;
  dateTo?: string;
  tag?: string;
  excludeTransfers?: boolean;
  page?: number;
  limit?: number;
}

interface CreateTransactionBody {
  accountId: string;
  payee: string;
  amount: string;
  date: string;
  categoryId?: string;
  payerUserId?: string;
  bankDescription?: string;
  tag?: string;
  note?: string;
  isRecurring?: boolean;
}

interface UpdateTransactionBody {
  payee?: string;
  categoryId?: string | null;
  tag?: string | null;
  note?: string | null;
  date?: string;
}

interface RecategorizeBody {
  categoryId: string;
  applyToFutureFromPayee?: boolean;
  ruleMatchType?: 'EXACT' | 'SUBSTRING';
}

interface CreateTransferBody {
  fromAccountId: string;
  toAccountId: string;
  amount: string;
  date: string;
  payee?: string;
  note?: string;
}

interface StatementImportPreviewBody {
  accountId: string;
  csvContent: string;
  columnMapping: { dateColumnIndex: number; amountColumnIndex: number; payeeColumnIndex: number; descriptionColumnIndex?: number };
}

interface StatementImportConfirmBody {
  accountId: string;
  rows: Array<{ date: string; amount: string; payee: string; bankDescription?: string; categoryId?: string }>;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

const serializeTransaction = (transaction: HouseholdTransaction) => ({
  id: transaction.id,
  householdId: transaction.householdId,
  accountId: transaction.accountId,
  categoryId: transaction.categoryId,
  payee: transaction.payee,
  payerUserId: transaction.payerUserId,
  bankDescription: transaction.bankDescription,
  amount: transaction.amount.toString(),
  date: transaction.date.toISOString().slice(0, 10),
  tag: transaction.tag,
  note: transaction.note,
  isRecurring: transaction.isRecurring,
  commitmentId: transaction.commitmentId,
  categorizationSource: transaction.categorizationSource,
  importBatchId: transaction.importBatchId,
  transferGroupId: transaction.transferGroupId,
  createdAt: transaction.createdAt.toISOString(),
  updatedAt: transaction.updatedAt.toISOString()
});

// ── Plugin ───────────────────────────────────────────────────────────────────

export const transactionsRoutes: FastifyPluginAsync = async (fastify): Promise<void> => {
  fastify.get<{ Params: HouseholdParams; Querystring: ListTransactionsQuery }>('/households/:householdId/transactions', {
    onRequest: [fastify.authenticate],
    schema: { params: householdParamsSchema, querystring: listTransactionsQuerySchema, response: { 200: transactionListResponseSchema } }
  }, async (request) => {
    const user = request.user as AccessTokenPayload;
    await requireHouseholdMembership(fastify, request, request.params.householdId);

    const result = await listTransactions(fastify.householdDatabase, request.params.householdId, user.sub, request.query);
    return { ...result, data: result.data.map(serializeTransaction) };
  });

  fastify.post<{ Params: HouseholdParams; Body: CreateTransactionBody }>('/households/:householdId/transactions', {
    onRequest: [fastify.authenticate],
    schema: { params: householdParamsSchema, body: createTransactionBodySchema, response: { 201: transactionSchema } }
  }, async (request, reply) => {
    await requireHouseholdMembership(fastify, request, request.params.householdId);

    const transaction = await createTransaction(fastify.householdDatabase, { householdId: request.params.householdId, ...request.body });
    return reply.code(201).send(serializeTransaction(transaction));
  });

  fastify.post<{ Params: HouseholdParams; Body: CreateTransferBody }>('/households/:householdId/transfers', {
    onRequest: [fastify.authenticate],
    schema: { params: householdParamsSchema, body: createTransferBodySchema, response: { 201: { type: 'array', items: transactionSchema, minItems: 2, maxItems: 2 } } }
  }, async (request, reply) => {
    await requireHouseholdMembership(fastify, request, request.params.householdId);

    const transfer = await createTransfer(fastify.householdDatabase, { householdId: request.params.householdId, ...request.body });
    return reply.code(201).send(transfer.map(serializeTransaction));
  });

  fastify.get<{ Params: TransactionParams }>('/households/:householdId/transactions/:transactionId', {
    onRequest: [fastify.authenticate],
    schema: { params: transactionParamsSchema, response: { 200: transactionSchema } }
  }, async (request) => {
    const user = request.user as AccessTokenPayload;
    await requireHouseholdMembership(fastify, request, request.params.householdId);

    const transaction = await getVisibleTransaction(fastify.householdDatabase, request.params.householdId, user.sub, request.params.transactionId);
    if (!transaction) {
      throw fastify.httpErrors.notFound('Transaction not found');
    }

    return serializeTransaction(transaction);
  });

  fastify.patch<{ Params: TransactionParams; Body: UpdateTransactionBody }>('/households/:householdId/transactions/:transactionId', {
    onRequest: [fastify.authenticate],
    schema: { params: transactionParamsSchema, body: updateTransactionBodySchema, response: { 200: transactionSchema } }
  }, async (request) => {
    await requireHouseholdMembership(fastify, request, request.params.householdId);

    const transaction = await updateTransaction(fastify.householdDatabase, request.params.householdId, request.params.transactionId, request.body);
    return serializeTransaction(transaction);
  });

  /**
   * PATCH .../recategorize — the only way a categorization rule gets created:
   * explicit opt-in via applyToFutureFromPayee, never automatic.
   */
  fastify.patch<{ Params: TransactionParams; Body: RecategorizeBody }>('/households/:householdId/transactions/:transactionId/recategorize', {
    onRequest: [fastify.authenticate],
    schema: { params: transactionParamsSchema, body: recategorizeBodySchema, response: { 200: transactionSchema } }
  }, async (request) => {
    await requireHouseholdMembership(fastify, request, request.params.householdId);

    const transaction = await recategorizeTransaction(fastify.householdDatabase, request.params.householdId, request.params.transactionId, request.body);
    return serializeTransaction(transaction);
  });

  fastify.delete<{ Params: TransactionParams }>('/households/:householdId/transactions/:transactionId', {
    onRequest: [fastify.authenticate],
    schema: { params: transactionParamsSchema, response: { 204: { type: 'null' } } }
  }, async (request, reply) => {
    await requireHouseholdMembership(fastify, request, request.params.householdId);

    await deleteTransaction(fastify.householdDatabase, request.params.householdId, request.params.transactionId);
    return reply.code(204).send();
  });

  // ── Statement import (preview/confirm two-step) ──────────────────────────

  fastify.post<{ Params: HouseholdParams; Body: StatementImportPreviewBody }>('/households/:householdId/statement-imports/preview', {
    onRequest: [fastify.authenticate],
    schema: {
      params: householdParamsSchema,
      body: statementImportPreviewBodySchema,
      response: {
        200: {
          type: 'array',
          items: {
            type: 'object',
            additionalProperties: false,
            properties: {
              date: { type: 'string' },
              amount: { type: 'string' },
              payee: { type: 'string' },
              bankDescription: { type: ['string', 'null'] },
              isDuplicate: { type: 'boolean' }
            },
            required: ['date', 'amount', 'payee', 'bankDescription', 'isDuplicate']
          }
        }
      }
    }
  }, async (request) => {
    await requireHouseholdMembership(fastify, request, request.params.householdId);

    return previewStatementImport(
      fastify.householdDatabase,
      request.params.householdId,
      request.body.accountId,
      request.body.csvContent,
      request.body.columnMapping
    );
  });

  fastify.post<{ Params: HouseholdParams; Body: StatementImportConfirmBody }>('/households/:householdId/statement-imports/confirm', {
    onRequest: [fastify.authenticate],
    schema: {
      params: householdParamsSchema,
      body: statementImportConfirmBodySchema,
      response: {
        201: {
          type: 'object',
          additionalProperties: false,
          properties: {
            importBatchId: { type: 'string' },
            createdCount: { type: 'number' },
            transactions: { type: 'array', items: transactionSchema }
          },
          required: ['importBatchId', 'createdCount', 'transactions']
        }
      }
    }
  }, async (request, reply) => {
    await requireHouseholdMembership(fastify, request, request.params.householdId);

    const result = await confirmStatementImport(fastify.householdDatabase, request.params.householdId, request.body.accountId, request.body.rows);

    return reply.code(201).send({
      importBatchId: result.importBatchId,
      createdCount: result.createdCount,
      transactions: result.transactions.map(serializeTransaction)
    });
  });
};
