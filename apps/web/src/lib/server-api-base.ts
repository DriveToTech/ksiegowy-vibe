import 'server-only';

import { headers } from 'next/headers';

const defaultApiBase = 'http://localhost:3001';
const desktopGatewayOriginHeader = 'x-desktop-gateway-origin';
const desktopApiProxyPrefix = '/_desktop/api';

function getDefaultServerBase(): string {
  return process.env.API_URL ?? process.env.NEXT_PUBLIC_API_URL ?? defaultApiBase;
}

async function getDesktopGatewayOrigin(): Promise<string | null> {
  const requestHeaders = await headers();
  const gatewayOrigin = requestHeaders.get(desktopGatewayOriginHeader);

  if (!gatewayOrigin) {
    return null;
  }

  try {
    return new URL(gatewayOrigin).origin;
  } catch {
    return null;
  }
}

export async function getServerAuthBase(): Promise<string> {
  const desktopGatewayOrigin = await getDesktopGatewayOrigin();
  return desktopGatewayOrigin ?? getDefaultServerBase();
}

export async function getServerApiBase(): Promise<string> {
  const desktopGatewayOrigin = await getDesktopGatewayOrigin();

  if (desktopGatewayOrigin) {
    return `${desktopGatewayOrigin}${desktopApiProxyPrefix}`;
  }

  return getDefaultServerBase();
}
