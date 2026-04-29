import fastifyHttpProxy from '@fastify/http-proxy';
import Fastify, { type FastifyInstance, type FastifyRequest, type RequestGenericInterface, type RawServerBase } from 'fastify';
import type { IncomingHttpHeaders } from 'node:http';
import type { IncomingHttpHeaders as Http2IncomingHttpHeaders } from 'node:http2';

const defaultDesktopGatewayHost = '127.0.0.1'; // Use IPv4 loopback to match Google OAuth redirect URI
const defaultDesktopGatewayPort = 3001; // Fixed port for Google OAuth compatibility
const defaultDesktopWebRuntimeUrl = 'http://localhost:3000';
const defaultDesktopApiUrl = 'http://localhost:3002';
const allowedLocalHostnames = new Set(['127.0.0.1', 'localhost', '::1']);
const desktopApiProxyPrefix = '/_desktop/api';
const desktopAuthProxyPrefix = '/auth';
const desktopAuthCallbackRoutePath = '/auth/desktop/callback';
const desktopGatewayOriginHeader = 'x-desktop-gateway-origin';

interface DesktopGatewayConfig {
  host: string;
  port: number;
  webRuntimeUrl: URL;
  apiUrl: URL;
  useBundledApi: boolean;
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

function getDesktopGatewayConfig(apiUrlOverride?: URL): DesktopGatewayConfig {
  return {
    host: defaultDesktopGatewayHost,
    port: getDesktopGatewayPort(),
    webRuntimeUrl: getDesktopWebRuntimeUrl(),
    apiUrl: apiUrlOverride ?? getDesktopApiUrl(),
    useBundledApi: apiUrlOverride !== undefined
  };
}

export function getBundledApiUrl(apiPort: number): URL {
  return new URL(`http://localhost:${apiPort}`);
}

const hopByHopResponseHeaders = new Set([
  'connection',
  'content-encoding',
  'content-length',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade'
]);

export function createDesktopGatewayServer(config: DesktopGatewayConfig): FastifyInstance {
  const server = Fastify({
    logger: false,
    disableRequestLogging: true,
    trustProxy: false
  });

  // Add global request logging for debugging
  server.addHook('onRequest', async (request) => {
    console.log(`[Gateway Request] ${request.method} ${request.url} - Host: ${request.headers.host}`);
  });

  server.addHook('onResponse', async (request, reply) => {
    console.log(`[Gateway Response] ${request.method} ${request.url} - Status: ${reply.statusCode}`);
  });

  server.addHook('onError', async (request, _reply, error) => {
    console.error(`[Gateway Error] ${request.method} ${request.url} - Error:`, error);
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

  server.get(desktopAuthCallbackRoutePath, async (request, reply) => {
    const upstreamUrl = new URL(request.raw.url ?? desktopAuthCallbackRoutePath, config.webRuntimeUrl);
    const upstreamResponse = await fetch(upstreamUrl, {
      headers: {
        accept: request.headers.accept ?? 'text/html',
        [desktopGatewayOriginHeader]: `http://${config.host}:${config.port}`,
        ...(request.headers.cookie ? { cookie: request.headers.cookie } : {})
      }
    });

    upstreamResponse.headers.forEach((value, key) => {
      if (!hopByHopResponseHeaders.has(key.toLowerCase())) {
        reply.header(key, value);
      }
    });

    const responseBody = Buffer.from(await upstreamResponse.arrayBuffer());
    return reply.code(upstreamResponse.status).send(responseBody);
  });

  return server;
}

export async function startDesktopGateway(
  apiUrlOverride?: URL
): Promise<StartedDesktopGateway> {
  const config = getDesktopGatewayConfig(apiUrlOverride);
  console.log(`[Desktop Gateway] Starting with config:`, {
    host: config.host,
    port: config.port,
    apiUrl: config.apiUrl.origin,
    webRuntimeUrl: config.webRuntimeUrl.origin,
    useBundledApi: config.useBundledApi
  });

  const server = createDesktopGatewayServer(config);

  // Consolidated auth routes proxy - handles all /auth/* routes
  // The OAuth2 plugin sets cookies for the gateway origin, so the API must see the gateway host
  await server.register(fastifyHttpProxy, {
    upstream: config.apiUrl.origin,
    prefix: desktopAuthProxyPrefix,
    rewritePrefix: desktopAuthProxyPrefix,
    http2: false,
    websocket: false,
    replyOptions: {
      // Preserve the original Host header so OAuth2 cookies are set for the gateway origin
      rewriteRequestHeaders: (
        _originalRequest: FastifyRequest<RequestGenericInterface, RawServerBase>,
        headers: IncomingHttpHeaders | Http2IncomingHttpHeaders
      ): IncomingHttpHeaders => ({
          ...headers,
          host: `${config.host}:${config.port}`
        })
    }
  });

  // Desktop API proxy for internal routes
  await server.register(fastifyHttpProxy, {
    upstream: config.apiUrl.origin,
    prefix: desktopApiProxyPrefix,
    rewritePrefix: '',
    http2: false,
    websocket: false,
    replyOptions: {
      rewriteRequestHeaders: (
        originalRequest: FastifyRequest<RequestGenericInterface, RawServerBase>,
        headers: IncomingHttpHeaders | Http2IncomingHttpHeaders
      ) => ({
        ...headers,
        host: `${config.host}:${config.port}`
      })
    }
  });

  // Default proxy for web runtime (must be last as catch-all)
  await server.register(fastifyHttpProxy, {
    upstream: config.webRuntimeUrl.origin,
    http2: false,
    websocket: false,
    replyOptions: {
      rewriteRequestHeaders: (
        _originalRequest: FastifyRequest<RequestGenericInterface, RawServerBase>,
        headers: IncomingHttpHeaders | Http2IncomingHttpHeaders
      ): IncomingHttpHeaders => ({
        ...headers,
        [desktopGatewayOriginHeader]: `http://${config.host}:${config.port}`
      })
    },
    preHandler: async (request) => {
      console.log(`[Gateway Web Runtime Proxy] Proxying to ${config.webRuntimeUrl.origin}: ${request.method} ${request.url}`);
    }
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
