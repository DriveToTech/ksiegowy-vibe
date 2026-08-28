import Fastify from 'fastify';
import { afterEach, describe, expect, it, vi } from 'vitest';

describe('household database plugin', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it('disconnects internally created household database client on close', async () => {
    const connect = vi.fn(async () => undefined);
    const disconnect = vi.fn(async () => undefined);

    vi.doMock('@ksiegowy/household-service', () => ({
      createHouseholdDatabase: vi.fn(() => ({ $connect: connect, $disconnect: disconnect }))
    }));

    const { householdDatabasePlugin } = await import('./household-database.js');

    const app = Fastify({ logger: false });
    await app.register(householdDatabasePlugin, { databaseUrl: 'postgresql://user:pass@localhost:5432/household_test' });
    await app.ready();

    expect(connect).toHaveBeenCalledTimes(1);
    expect(app.householdDatabase).toBeDefined();

    await app.close();

    expect(disconnect).toHaveBeenCalledTimes(1);
  });

  it('does not connect or disconnect an externally provided client', async () => {
    const connect = vi.fn(async () => undefined);
    const disconnect = vi.fn(async () => undefined);

    const { householdDatabasePlugin } = await import('./household-database.js');

    const app = Fastify({ logger: false });
    await app.register(householdDatabasePlugin, { client: { $connect: connect, $disconnect: disconnect } as never });
    await app.ready();

    expect(connect).not.toHaveBeenCalled();

    await app.close();

    expect(disconnect).not.toHaveBeenCalled();
  });
});
