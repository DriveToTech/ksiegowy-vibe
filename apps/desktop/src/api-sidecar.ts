import { spawn, type ChildProcess } from 'node:child_process';
import { join } from 'node:path';
import { accessSync } from 'node:fs';
import { app } from 'electron';
import EventEmitter from 'node:events';

interface ApiSidecarOptions {
  databaseUrl: string;
  jwtSecret: string;
  jwtRefreshSecret: string;
  port?: number;
  googleClientId?: string;
  googleClientSecret?: string;
  googleRedirectUri?: string;
  desktopAuthCallbackUrl?: string;
}

interface ApiLogEntry {
  level: 'info' | 'error' | 'warn';
  message: string;
}

interface ApiHealthStatus {
  status: 'healthy' | 'unhealthy' | 'unknown';
  lastCheck: Date;
}

export class ApiSidecar extends EventEmitter {
  private process: ChildProcess | null = null;
  private port: number = 0;
  private healthCheckInterval: NodeJS.Timeout | null = null;
  private startupTimeout: NodeJS.Timeout | null = null;
  private healthStatus: ApiHealthStatus = { status: 'unknown', lastCheck: new Date() };
  private restartAttempts: number = 0;
  private maxRestartAttempts: number = 3;

  async start(options: ApiSidecarOptions): Promise<{ port: number }> {
    const apiEntry = this.getApiEntryPath();
    const assignedPort = options.port ?? 0;

    this.emit('log', { level: 'info', message: `Starting API sidecar from ${apiEntry}` });

    // Verify the API entry file exists
    try {
      accessSync(apiEntry);
      this.emit('log', { level: 'info', message: `API entry file exists: ${apiEntry}` });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.emit('log', { level: 'error', message: `API entry file not found: ${apiEntry}. Error: ${message}` });
      throw new Error(`API entry file not found: ${apiEntry}. Did you build the API app?`);
    }

    const env: NodeJS.ProcessEnv = {
      ...process.env,
      DATABASE_URL: options.databaseUrl,
      API_PORT: String(assignedPort),
      NODE_ENV: app.isPackaged ? 'production' : 'development',
      JWT_SECRET: options.jwtSecret,
      JWT_REFRESH_SECRET: options.jwtRefreshSecret,
      // Disable features that require cloud infrastructure in desktop mode
      KSEF_ENABLED: 'false'
    };

    // Add Google OAuth configuration if provided
    if (options.googleClientId) {
      env.GOOGLE_CLIENT_ID = options.googleClientId;
    }
    if (options.googleClientSecret) {
      env.GOOGLE_CLIENT_SECRET = options.googleClientSecret;
    }
    if (options.googleRedirectUri) {
      env.GOOGLE_REDIRECT_URI = options.googleRedirectUri;
    }

    if (options.desktopAuthCallbackUrl) {
      env.DESKTOP_AUTH_CALLBACK_URL = options.desktopAuthCallbackUrl;
    }

    // Set Prisma query engine path for packaged app if available
    const prismaEnginePath = this.getPrismaEnginePath();
    if (prismaEnginePath) {
      env.PRISMA_QUERY_ENGINE_LIBRARY = prismaEnginePath;
    }

    return new Promise((resolve, reject) => {
      this.process = spawn(process.execPath, [apiEntry], {
        env,
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: true
      });

      // Set startup timeout
      this.startupTimeout = setTimeout(() => {
        this.kill();
        reject(new Error('API startup timeout after 30s'));
      }, 30000);

      // Handle stdout
      this.process.stdout?.on('data', (data: Buffer) => {
        const message = data.toString().trim();
        this.emit('log', { level: 'info', message });

// Parse Fastify startup message
      // Expected format: "Server listening at http://localhost:PORT" or "http://127.0.0.1:PORT"
      const match = message.match(/Server listening at http:\/\/[^:]+:(\d+)/);
    if (match && this.startupTimeout) {
      clearTimeout(this.startupTimeout);
      this.startupTimeout = null;
      this.port = parseInt(match[1] ?? '0', 10);
          this.restartAttempts = 0;
          this.emit('log', { level: 'info', message: `API sidecar started on port ${this.port}` });
          this.startHealthChecks();
          resolve({ port: this.port });
        }
      });

      // Handle stderr
      this.process.stderr?.on('data', (data: Buffer) => {
        const message = data.toString().trim();
        this.emit('log', { level: 'error', message });
      });

      // Handle process errors
      this.process.on('error', (error) => {
        if (this.startupTimeout) {
          clearTimeout(this.startupTimeout);
          this.startupTimeout = null;
        }
        this.emit('log', { level: 'error', message: `API process error: ${error.message}` });
        reject(error);
      });

      // Handle unexpected exit
      this.process.on('exit', (code, signal) => {
        this.emit('log', { level: 'error', message: `API process exited with code ${code}, signal ${signal}` });
        this.cleanup();

        // Attempt restart if not shutting down
        if (code !== 0 && signal !== 'SIGTERM' && signal !== 'SIGKILL') {
          this.attemptRestart(options);
        }
      });
    });
  }

  async stop(): Promise<void> {
    this.emit('log', { level: 'info', message: 'Stopping API sidecar' });
    this.cleanup();

    if (this.process && !this.process.killed) {
      // Try graceful shutdown first
      this.process.kill('SIGTERM');

      // Wait up to 5 seconds for graceful shutdown
      await this.waitForExit(5000);

      // Force kill if still running
      if (this.process && !this.process.killed) {
        this.emit('log', { level: 'warn', message: 'API did not shut down gracefully, forcing kill' });
        this.process.kill('SIGKILL');
      }
    }
  }

  getPort(): number {
    return this.port;
  }

  isHealthy(): boolean {
    return this.healthStatus.status === 'healthy';
  }

  private getApiEntryPath(): string {
    if (app.isPackaged) {
      // In packaged app: resources/api/dist/main.js
      return join(process.resourcesPath, 'api', 'dist', 'main.js');
    }

    // In development: relative to desktop dist folder
    // __dirname = apps/desktop/dist
    // Need to go to apps/api/dist/main.js
    return join(__dirname, '..', '..', 'api', 'dist', 'main.js');
  }

private getPrismaEnginePath(): string | undefined {
    const platform = process.platform;
    const arch = process.arch;

    // Prisma query engine binary naming convention
    const binaryName = platform === 'win32'
      ? 'libquery_engine-windows.dll.node'
      : platform === 'darwin'
      ? 'libquery_engine-darwin.dylib.node'
      : `libquery_engine-linux-${arch === 'arm64' ? 'arm64' : 'debian-openssl-3.0.x'}.so.node`;

    if (app.isPackaged) {
      // In packaged app, the Prisma client is in extraResources
      const enginePath = join(process.resourcesPath, 'api', 'prisma-client', binaryName);
      // Only set if file exists, otherwise let Prisma find it automatically
      try {
        require('fs').accessSync(enginePath);
        return enginePath;
      } catch {
        // Engine not bundled, Prisma will use default resolution
        return undefined;
      }
    }

    // In development, let Prisma resolve automatically
    return undefined;
  }

  private startHealthChecks(): void {
    // Clear any existing interval
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
    }

    // Check health every 30 seconds
    this.healthCheckInterval = setInterval(async () => {
      try {
        const response = await fetch(`http://localhost:${this.port}/health`);
        if (response.ok) {
          this.healthStatus = { status: 'healthy', lastCheck: new Date() };
        } else {
          this.healthStatus = { status: 'unhealthy', lastCheck: new Date() };
          this.emit('unhealthy');
        }
      } catch {
        this.healthStatus = { status: 'unhealthy', lastCheck: new Date() };
        this.emit('unhealthy');
      }
    }, 30000);
  }

  private cleanup(): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
    }

    if (this.startupTimeout) {
      clearTimeout(this.startupTimeout);
      this.startupTimeout = null;
    }
  }

  private async waitForExit(timeoutMs: number): Promise<void> {
    return new Promise((resolve) => {
      const checkInterval = setInterval(() => {
        if (!this.process || this.process.killed) {
          clearInterval(checkInterval);
          resolve();
        }
      }, 100);

      setTimeout(() => {
        clearInterval(checkInterval);
        resolve();
      }, timeoutMs);
    });
  }

  private kill(): void {
    if (this.process && !this.process.killed) {
      this.process.kill('SIGKILL');
    }
  }

  private async attemptRestart(options: ApiSidecarOptions): Promise<void> {
    if (this.restartAttempts >= this.maxRestartAttempts) {
      this.emit('log', { level: 'error', message: `Max restart attempts (${this.maxRestartAttempts}) reached` });
      this.emit('failed');
      return;
    }

    this.restartAttempts++;
    this.emit('log', { level: 'warn', message: `Attempting restart ${this.restartAttempts}/${this.maxRestartAttempts}` });

    // Exponential backoff: 1s, 2s, 4s
    const backoffMs = Math.pow(2, this.restartAttempts - 1) * 1000;
    await new Promise(resolve => setTimeout(resolve, backoffMs));

    try {
      await this.start(options);
      this.emit('log', { level: 'info', message: 'API restarted successfully' });
    } catch (error) {
      this.emit('log', { level: 'error', message: `Restart failed: ${error instanceof Error ? error.message : String(error)}` });
      this.attemptRestart(options);
    }
  }
}
