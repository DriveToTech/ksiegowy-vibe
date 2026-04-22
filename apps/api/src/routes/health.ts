import type { FastifyPluginAsync } from 'fastify';

const healthRouteSchema = {
  response: {
    200: {
      type: 'object',
      additionalProperties: false,
      properties: {
        status: { type: 'string' },
        timestamp: { type: 'string', format: 'date-time' }
      },
      required: ['status', 'timestamp']
    }
  }
} as const;

export const healthRoutes: FastifyPluginAsync = async (fastify): Promise<void> => {
  fastify.get('/health', { schema: healthRouteSchema }, async () => {
    return {
      status: 'ok',
      timestamp: new Date().toISOString()
    };
  });
};
