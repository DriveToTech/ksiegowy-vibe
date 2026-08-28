import fp from 'fastify-plugin';
import { createHouseholdDatabase, type HouseholdDatabase } from '@ksiegowy/household-service';
import type { FastifyPluginAsync } from 'fastify';

declare module 'fastify' {
  interface FastifyInstance {
    householdDatabase: HouseholdDatabase;
  }
}

export interface HouseholdDatabasePluginOptions {
  client?: HouseholdDatabase;
  databaseUrl?: string;
}

const householdDatabasePluginAsync: FastifyPluginAsync<HouseholdDatabasePluginOptions> = async (fastify, options): Promise<void> => {
  const householdDatabase = options.client ?? createHouseholdDatabase(options.databaseUrl ?? process.env['HOUSEHOLD_DATABASE_URL']!);

  if (!options.client) {
    await householdDatabase.$connect();
  }

  fastify.decorate('householdDatabase', householdDatabase);

  fastify.addHook('onClose', async (): Promise<void> => {
    if (!options.client) {
      await householdDatabase.$disconnect();
    }
  });
};

export const householdDatabasePlugin = fp(householdDatabasePluginAsync, {
  name: 'householdDatabase'
});
