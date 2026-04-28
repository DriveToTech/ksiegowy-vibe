import { createHash, randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  createClientAuthHandoff,
  exchangeClientAuthHandoff
} from './google-client-handoff.service.js';

const integrationDatabaseUrl = process.env.API_INTEGRATION_DATABASE_URL ?? process.env.DATABASE_URL;
const shouldRunIntegration = process.env.RUN_POSTGRES_INTEGRATION_TESTS === '1';

if (shouldRunIntegration && !integrationDatabaseUrl) {
  throw new Error('RUN_POSTGRES_INTEGRATION_TESTS=1 requires API_INTEGRATION_DATABASE_URL or DATABASE_URL');
}

const describeIntegration = shouldRunIntegration ? describe : describe.skip;

describeIntegration('google-client-handoff PostgreSQL integration', () => {
  const prismaOptions = integrationDatabaseUrl
    ? {
        datasources: {
          db: {
            url: integrationDatabaseUrl
          }
        }
      }
    : undefined;

  const setupPrisma = new PrismaClient(prismaOptions);
  const firstExchangePrisma = new PrismaClient(prismaOptions);
  const secondExchangePrisma = new PrismaClient(prismaOptions);

  beforeAll(async () => {
    await Promise.all([
      setupPrisma.$connect(),
      firstExchangePrisma.$connect(),
      secondExchangePrisma.$connect()
    ]);
  });

  afterAll(async () => {
    await Promise.all([
      setupPrisma.$disconnect(),
      firstExchangePrisma.$disconnect(),
      secondExchangePrisma.$disconnect()
    ]);
  });

  describe('exchangeClientAuthHandoff()', () => {
    it(
      'allows exactly one concurrent exchange to consume the handoff',
      async () => {
        const testRunId = randomUUID();
        const userEmail = `client-auth-handoff-integration-${testRunId}@example.com`;
        const transactionId = `client-handoff-${testRunId}`;
        const codeVerifier = 'client-code-verifier-1234567890123456789012345678901234567890123';
        const codeChallenge = createHash('sha256').update(codeVerifier).digest('base64url');

        let userId: string | null = null;

        try {
          const user = await setupPrisma.user.create({
            data: {
              email: userEmail
            }
          });

          userId = user.id;

          const handoffCode = await createClientAuthHandoff(setupPrisma, user.id, {
            transactionId,
            codeChallenge
          });

          const [firstResult, secondResult] = await Promise.all([
            exchangeClientAuthHandoff(firstExchangePrisma, {
              handoffCode,
              transactionId,
              codeVerifier
            }),
            exchangeClientAuthHandoff(secondExchangePrisma, {
              handoffCode,
              transactionId,
              codeVerifier
            })
          ]);

          expect([firstResult, secondResult].filter((value) => value === user.id)).toHaveLength(1);
          expect([firstResult, secondResult].filter((value) => value === null)).toHaveLength(1);

          const handoffCodeHash = createHash('sha256').update(handoffCode).digest('hex');

          const storedHandoff = await setupPrisma.clientAuthHandoff.findUnique({
            where: {
              handoffCodeHash
            },
            select: {
              userId: true,
              consumedAt: true
            }
          });

          expect(storedHandoff?.userId).toBe(user.id);
          expect(storedHandoff?.consumedAt).toBeInstanceOf(Date);
        } finally {
          if (userId) {
            await setupPrisma.user.delete({
              where: {
                id: userId
              }
            });
          }
        }
      },
      15_000
    );
  });
});
