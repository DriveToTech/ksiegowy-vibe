import Fastify from 'fastify';
import { afterEach, describe, expect, it, vi } from 'vitest';

describe('prisma plugin', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it('disconnects internally created prisma client on close', async () => {
    const connect = vi.fn(async () => undefined);
    const disconnect = vi.fn(async () => undefined);

    vi.doMock('@prisma/client', () => {
      class MockPrismaClient {
        $connect = connect;
        $disconnect = disconnect;
      }

      return { PrismaClient: MockPrismaClient };
    });

    const { prismaPlugin } = await import('./prisma.js');

    const app = Fastify({ logger: false });
    await app.register(prismaPlugin);
    await app.ready();

    expect(connect).toHaveBeenCalledTimes(1);

    await app.close();

    expect(disconnect).toHaveBeenCalledTimes(1);
  });
});
