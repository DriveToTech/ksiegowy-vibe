import fp from 'fastify-plugin';
import { PrismaClient } from '@prisma/client';
import type { FastifyPluginAsync } from 'fastify';

declare module 'fastify' {
  interface FastifyInstance {
    prisma: PrismaClient;
  }
}

export interface PrismaPluginOptions {
  client?: PrismaClient;
}

const prismaPluginAsync: FastifyPluginAsync<PrismaPluginOptions> = async (fastify, options): Promise<void> => {
  const prisma = options.client ?? new PrismaClient();

  if (!options.client) {
    await prisma.$connect();
  }

  fastify.decorate('prisma', prisma);

  fastify.addHook('onClose', async (): Promise<void> => {
    if (!options.client) {
      await prisma.$disconnect();
    }
  });
};

export const prismaPlugin = fp(prismaPluginAsync, {
  name: 'prisma'
});
