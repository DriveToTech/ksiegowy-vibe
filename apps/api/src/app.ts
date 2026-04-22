import Fastify, { type FastifyInstance } from 'fastify';
import sensible from '@fastify/sensible';
import multipart from '@fastify/multipart';
import type { AuthConfig } from './lib/auth-config.js';
import { loadAuthConfig } from './lib/auth-config.js';
import { authPlugin } from './plugins/auth.js';
import { corsPlugin } from './plugins/cors.js';
import type { PrismaPluginOptions } from './plugins/prisma.js';
import { prismaPlugin } from './plugins/prisma.js';
import { authRoutes } from './routes/auth/google.js';
import { companiesRoutes } from './routes/companies.js';
import { companyBackupPolicyRoutes } from './routes/companies/backup-policy.js';
import { companyBackupStatusRoutes } from './routes/companies/backup-status.js';
import { contractorsRoutes } from './routes/contractors.js';
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

export interface BuildAppOptions {
  logger?: boolean;
  prismaClient?: PrismaPluginOptions['client'];
  authConfig?: AuthConfig;
}

export const buildApp = async (options: BuildAppOptions = {}): Promise<FastifyInstance> => {
  const app = Fastify({
    logger: options.logger ?? true
  });

  const prismaPluginOptions = options.prismaClient === undefined ? {} : { client: options.prismaClient };
  const authConfig = options.authConfig ?? loadAuthConfig(process.env);

  await app.register(sensible);
  await app.register(corsPlugin);
  await app.register(multipart, { limits: { fileSize: 20 * 1024 * 1024 } });
  await app.register(prismaPlugin, prismaPluginOptions);
  await app.register(authPlugin, { config: authConfig });
  await app.register(authRoutes);
  await app.register(companiesRoutes);
  await app.register(companyBackupPolicyRoutes);
  await app.register(companyBackupStatusRoutes);
  await app.register(contractorsRoutes);
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
