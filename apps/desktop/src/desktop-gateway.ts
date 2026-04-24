import fastifyHttpProxy from '@fastify/http-proxy';
import Fastify, { type FastifyInstance } from 'fastify';

const defaultDesktopGatewayHost = '127.0.0.1';
const defaultDesktopGatewayPort = 0;
const defaultDesktopWebRuntimeUrl = 'http://127.0.0.1:3000';
const defaultDesktopApiUrl = 'http://127.0.0.1:3001';
const allowedLocalHostnames = new Set(['127.0.0.1', 'localhost', '::1']);
const desktopApiProxyPrefix = '/_desktop/api';
const desktopAuthProxyPrefix = '/auth';
const desktopAuthApiProxyRoutes = [
  '/auth/google',
  '/auth/google/callback',
  '/auth/me',
  '/auth/logout',
  '/auth/refresh'
] as const;

interface DesktopGatewayConfig {
  host: string;
  port: number;
  webRuntimeUrl: URL;
  apiUrl: URL;
}

export interface StartedDesktopGateway {
  origin: string;
  close: () => Promise<void>;
}

function getDesktopGatewayPort(): number {
  const rawPort = process.env.DESKTOP_GATEWAY_PORT;

  if (rawPort === undefined) {
    return defaultDesktopGatewayPort;
  }

  const port = Number(rawPort);

  if (!Number.isInteger(port) || port < 0 || port > 65_535) {
    throw new Error(`DESKTOP_GATEWAY_PORT must be an integer between 0 and 65535. Received: ${rawPort}`);
  }

  return port;
}

function getDesktopWebRuntimeUrl(): URL {
  const webRuntimeUrl = new URL(process.env.DESKTOP_WEB_RUNTIME_URL ?? defaultDesktopWebRuntimeUrl);
  const usesAllowedProtocol = webRuntimeUrl.protocol === 'http:' || webRuntimeUrl.protocol === 'https:';
  const usesAllowedHostname = allowedLocalHostnames.has(webRuntimeUrl.hostname);
  const usesRootPath = webRuntimeUrl.pathname === '/' || webRuntimeUrl.pathname === '';
  const usesEmptySearch = webRuntimeUrl.search === '';
  const usesEmptyHash = webRuntimeUrl.hash === '';

  if (!usesAllowedProtocol || !usesAllowedHostname || !usesRootPath || !usesEmptySearch || !usesEmptyHash) {
    throw new Error(
      `DESKTOP_WEB_RUNTIME_URL must point to a localhost origin without path, query, or hash. Received: ${webRuntimeUrl.toString()}`
    );
  }

  return new URL(webRuntimeUrl.origin);
}

export function getDesktopApiUrl(): URL {
  const apiUrl = new URL(
    process.env.DESKTOP_API_URL ??
      process.env.API_URL ??
      process.env.NEXT_PUBLIC_API_URL ??
      defaultDesktopApiUrl
  );
  const usesAllowedProtocol = apiUrl.protocol === 'http:' || apiUrl.protocol === 'https:';
  const usesRootPath = apiUrl.pathname === '/' || apiUrl.pathname === '';
  const usesEmptySearch = apiUrl.search === '';
  const usesEmptyHash = apiUrl.hash === '';
  const usesCredentials = apiUrl.username !== '' || apiUrl.password !== '';

  if (!usesAllowedProtocol || !usesRootPath || !usesEmptySearch || !usesEmptyHash || usesCredentials) {
    throw new Error(
      `DESKTOP_API_URL must point to an origin without path, query, hash, or credentials. Received: ${apiUrl.toString()}`
    );
  }

  return new URL(apiUrl.origin);
}

function getDesktopGatewayConfig(): DesktopGatewayConfig {
  return {
    host: defaultDesktopGatewayHost,
    port: getDesktopGatewayPort(),
    webRuntimeUrl: getDesktopWebRuntimeUrl(),
    apiUrl: getDesktopApiUrl()
  };
}

export function createDesktopGatewayServer(config: DesktopGatewayConfig): FastifyInstance {
  const server = Fastify({
    logger: false,
    disableRequestLogging: true,
    trustProxy: false
  });

  server.get(
    '/_desktop/health',
    {
      schema: {
        response: {
          200: {
            type: 'object',
            additionalProperties: false,
            required: ['status', 'webRuntimeUpstream', 'apiUpstream', 'apiProxyPrefix', 'authProxyPrefix'],
            properties: {
              status: { type: 'string' },
              webRuntimeUpstream: { type: 'string' },
              apiUpstream: { type: 'string' },
              apiProxyPrefix: { type: 'string' },
              authProxyPrefix: { type: 'string' }
            }
          }
        }
      }
    },
    async () => ({
      status: 'ok',
      webRuntimeUpstream: config.webRuntimeUrl.origin,
      apiUpstream: config.apiUrl.origin,
      apiProxyPrefix: desktopApiProxyPrefix,
      authProxyPrefix: desktopAuthProxyPrefix
    })
  );

  return server;
}

export async function startDesktopGateway(): Promise<StartedDesktopGateway> {
  const config = getDesktopGatewayConfig();
  const server = createDesktopGatewayServer(config);

  for (const route of desktopAuthApiProxyRoutes) {
    await server.register(fastifyHttpProxy, {
      upstream: config.apiUrl.origin,
      prefix: route,
      rewritePrefix: route,
      http2: false,
      websocket: false
    });
  }

  await server.register(fastifyHttpProxy, {
    upstream: config.apiUrl.origin,
    prefix: '/auth/desktop/exchange',
    rewritePrefix: '/auth/desktop/exchange',
    httpMethods: ['POST'],
    http2: false,
    websocket: false
  });

  await server.register(fastifyHttpProxy, {
    upstream: config.apiUrl.origin,
    prefix: desktopApiProxyPrefix,
    rewritePrefix: '',
    http2: false,
    websocket: false
  });

  await server.register(fastifyHttpProxy, {
    upstream: config.webRuntimeUrl.origin,
    http2: false,
    websocket: false
  });

  const address = await server.listen({
    host: config.host,
    port: config.port
  });

  return {
    origin: new URL(address).origin,
    close: () => server.close()
  };
}
