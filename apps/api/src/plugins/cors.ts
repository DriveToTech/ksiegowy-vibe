import cors from '@fastify/cors';
import fastifyPlugin from 'fastify-plugin';
import type { FastifyInstance } from 'fastify';
import { getConfiguredOrigin } from './mutation-origin-guard.js';

export const corsPlugin = fastifyPlugin(async (fastify: FastifyInstance) => {
  const origin = getConfiguredOrigin();

  await fastify.register(cors, {
    origin,
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'x-ksef-environment']
  });
});
