import Fastify from 'fastify';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { corsPlugin } from './cors.js';

afterEach(() => vi.unstubAllEnvs());

describe('corsPlugin()', () => {
  it('refuses to start in production without an explicit CORS_ORIGIN', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('CORS_ORIGIN', '');
    await expect(Fastify().register(corsPlugin).ready()).rejects.toThrow('CORS_ORIGIN must be set in production');
  });

  it('keeps the localhost fallback outside production', async () => {
    vi.stubEnv('NODE_ENV', 'test');
    vi.stubEnv('CORS_ORIGIN', '');
    const application = Fastify();
    await application.register(corsPlugin).ready();
    await application.close();
  });
});
