import cors from '@fastify/cors';
import fastifyPlugin from 'fastify-plugin';
import type { FastifyInstance } from 'fastify';

export const corsPlugin = fastifyPlugin(async (fastify: FastifyInstance) => {
  const origin = process.env['CORS_ORIGIN'] ?? 'http://localhost:3000';

  await fastify.register(cors, {
    origin,
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'x-ksef-environment']
  });
});
