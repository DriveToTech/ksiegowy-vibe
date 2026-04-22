import { buildApp } from './app.js';
import { scheduleDailyBackup } from './lib/cron.js';

const API_DEFAULT_PORT = 3001;

const start = async (): Promise<void> => {
  const app = await buildApp({ logger: true });
  const portFromEnv = Number.parseInt(process.env.API_PORT ?? `${API_DEFAULT_PORT}`, 10);
  const port = Number.isNaN(portFromEnv) ? API_DEFAULT_PORT : portFromEnv;

  const shutdown = async (signal: NodeJS.Signals): Promise<void> => {
    app.log.info({ signal }, 'Shutting down API');
    await app.close();
    process.exit(0);
  };

  process.on('SIGINT', () => {
    void shutdown('SIGINT');
  });

  process.on('SIGTERM', () => {
    void shutdown('SIGTERM');
  });

  try {
    await app.listen({
      host: '0.0.0.0',
      port
    });
  } catch (error: unknown) {
    app.log.error({ error }, 'Failed to start API');
    process.exit(1);
  }

  const storageBase = process.env['STORAGE_BASE_PATH'] ?? './storage';
  scheduleDailyBackup(app.prisma, app.log, storageBase);
};

void start();
