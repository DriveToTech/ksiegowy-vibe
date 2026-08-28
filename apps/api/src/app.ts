import Fastify, { type FastifyInstance } from 'fastify';
import sensible from '@fastify/sensible';
import multipart from '@fastify/multipart';
import type { AuthConfig } from './lib/auth-config.js';
import { loadAuthConfig } from './lib/auth-config.js';
import { authPlugin } from './plugins/auth.js';
import { corsPlugin } from './plugins/cors.js';
import type { PrismaPluginOptions } from './plugins/prisma.js';
import { prismaPlugin } from './plugins/prisma.js';
import type { HouseholdDatabasePluginOptions } from './plugins/household-database.js';
import { householdDatabasePlugin } from './plugins/household-database.js';
import { authRoutes } from './routes/auth/google.js';
import { companiesRoutes } from './routes/companies.js';
import { companyBackupPolicyRoutes } from './routes/companies/backup-policy.js';
import { companyBackupStatusRoutes } from './routes/companies/backup-status.js';
import { contractorsRoutes } from './routes/contractors.js';
import { contractorServiceRatesRoutes } from './routes/contractor-service-rates.routes.js';
import { serviceTemplatesRoutes } from './routes/service-templates.js';
import { outgoingInvoiceRoutes } from './routes/invoices/outgoing.js';
import { incomingInvoiceRoutes } from './routes/invoices/incoming.js';
import { membersRoutes } from './routes/members.js';
import { ksefRoutes } from './routes/ksef.js';
import { reportsRoutes } from './routes/reports.js';
import { backupRoutes } from './routes/backup/index.js';
import { fileServeRoutes } from './routes/files/serve.js';
import { healthRoutes } from './routes/health.js';
import { readyRoutes } from './routes/ready.js';
import { householdsRoutes } from './routes/household/households.routes.js';
import { accountsRoutes } from './routes/household/accounts.routes.js';
import { categoriesRoutes } from './routes/household/categories.routes.js';
import { transactionsRoutes } from './routes/household/transactions.routes.js';
import { envelopesRoutes } from './routes/household/envelopes.routes.js';
import { commitmentsRoutes } from './routes/household/commitments.routes.js';
import { dashboardRoutes } from './routes/household/dashboard.routes.js';

export interface BuildAppOptions {
  logger?: boolean;
  prismaClient?: PrismaPluginOptions['client'];
  householdDatabaseClient?: HouseholdDatabasePluginOptions['client'];
  authConfig?: AuthConfig;
}

export const buildApp = async (options: BuildAppOptions = {}): Promise<FastifyInstance> => {
  const app = Fastify({
    logger: options.logger ?? true
  });

  const prismaPluginOptions = options.prismaClient === undefined ? {} : { client: options.prismaClient };
  const householdDatabasePluginOptions: HouseholdDatabasePluginOptions =
    options.householdDatabaseClient === undefined ? {} : { client: options.householdDatabaseClient };
  const authConfig = options.authConfig ?? loadAuthConfig(process.env);

  await app.register(sensible);
  await app.register(corsPlugin);
  await app.register(multipart, { limits: { fileSize: 20 * 1024 * 1024 } });
  await app.register(prismaPlugin, prismaPluginOptions);
  await app.register(householdDatabasePlugin, householdDatabasePluginOptions);
  await app.register(authPlugin, { config: authConfig });
  await app.register(authRoutes);
  await app.register(companiesRoutes);
  await app.register(householdsRoutes);
  await app.register(accountsRoutes);
  await app.register(categoriesRoutes);
  await app.register(transactionsRoutes);
  await app.register(envelopesRoutes);
  await app.register(commitmentsRoutes);
  await app.register(dashboardRoutes);
  await app.register(companyBackupPolicyRoutes);
  await app.register(companyBackupStatusRoutes);
  await app.register(contractorsRoutes);
  await app.register(contractorServiceRatesRoutes);
  await app.register(serviceTemplatesRoutes);
  await app.register(outgoingInvoiceRoutes);
  await app.register(incomingInvoiceRoutes);
  await app.register(membersRoutes);
  await app.register(ksefRoutes);
  await app.register(reportsRoutes);
  await app.register(backupRoutes);
  await app.register(fileServeRoutes);
  await app.register(healthRoutes);
  await app.register(readyRoutes);

  return app;
};
