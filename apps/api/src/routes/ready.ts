import type { FastifyPluginAsync } from 'fastify';

const readyRouteSchema = {
  response: {
    200: {
      type: 'object',
      additionalProperties: false,
      properties: {
        status: { type: 'string' },
        database: { type: 'string' },
        timestamp: { type: 'string', format: 'date-time' }
      },
      required: ['status', 'database', 'timestamp']
    }
  }
} as const;

export const readyRoutes: FastifyPluginAsync = async (fastify): Promise<void> => {
  fastify.get('/ready', { schema: readyRouteSchema }, async () => {
    await fastify.prisma.$queryRaw`SELECT 1`;

    return {
      status: 'ok',
      database: 'ok',
      timestamp: new Date().toISOString()
    };
  });
};
