import { isValidNip, normalizeNip } from '@ksiegowy/shared-utils';

export interface CompanyRegistryResult {
  name: string;
  nip: string;
  addressLine1: string;
  addressLine2: string | null;
  vatStatus: 'ACTIVE' | 'EXEMPT' | 'NO_VAT';
}

export interface CompanyRegistryLookup extends CompanyRegistryResult {
  /** Time of the real upstream call; unchanged on cache hits. */
  checkedAt: string;
  requestId: string | null;
}

export class RegistryLimitError extends Error {
  constructor(
    public readonly code: 'RATE_LIMITED' | 'REGISTRY_DAILY_LIMIT' | 'REGISTRY_USER_DAILY_LIMIT',
    public readonly retryAfterSeconds: number,
  ) {
    super(code);
  }
}

export interface GusCompanyResult {
  name: string;
  nip: string;
  addressLine1: string;
  addressLine2: string | null;
}

interface WhiteListSubject {
  name?: string;
  nip?: string;
  residenceAddress?: string;
  workingAddress?: string;
  statusVat?: string;
}

interface WhiteListResponse {
  result?: {
    requestId?: string;
    subject?: WhiteListSubject;
  };
}

interface GusEnvelope {
  d?: string;
}

const REGISTRY_URL = 'https://wl-api.mf.gov.pl/api/search/nip';
const GUS_BASE = 'https://wyszukiwarkaregon.stat.gov.pl/api';
const UPSTREAM_TIMEOUT_MILLISECONDS = 5000;

function normalizeAddress(address: string | undefined): { addressLine1: string; addressLine2: string | null } {
  const cleaned = address?.trim() ?? '';

  if (!cleaned) {
    return { addressLine1: '', addressLine2: null };
  }

  const parts = cleaned.split(',').map((part) => part.trim()).filter((part) => part.length > 0);

  if (parts.length <= 1) {
    return { addressLine1: cleaned, addressLine2: null };
  }

  return {
    addressLine1: parts[0] ?? cleaned,
    addressLine2: parts.slice(1).join(', ') || null,
  };
}

function mapVatStatus(statusVat: string | undefined): 'ACTIVE' | 'EXEMPT' | 'NO_VAT' {
  if (statusVat === 'Czynny') {
    return 'ACTIVE';
  }

  if (statusVat === 'Zwolniony') {
    return 'EXEMPT';
  }

  return 'NO_VAT';
}

function decodeXmlValue(value: string | undefined): string {
  return (value ?? '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim();
}

function parseXmlTag(xml: string, tagName: string): string | null {
  const match = xml.match(new RegExp(`<${tagName}>(.*?)</${tagName}>`, 'i'));
  return match?.[1] ? decodeXmlValue(match[1]) : null;
}

async function fetchWhiteListCompanyByNip(nip: string, now = new Date()): Promise<CompanyRegistryResult & { requestId: string | null }> {
  const date = now.toISOString().slice(0, 10);
  const response = await fetch(`${REGISTRY_URL}/${nip}?date=${date}`, {
    method: 'GET',
    headers: {
      Accept: 'application/json',
    },
    signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MILLISECONDS),
  });

  if (response.status === 404) {
    throw new Error(`Company with NIP ${nip} was not found in the registry`);
  }

  if (!response.ok) {
    throw new Error(`Registry lookup failed with status ${response.status}`);
  }

  const payload = (await response.json()) as WhiteListResponse;
  const subject = payload.result?.subject;

  if (!subject?.name || !subject.nip) {
    throw new Error(`Company with NIP ${nip} was not found in the registry`);
  }

  const address = normalizeAddress(subject.workingAddress ?? subject.residenceAddress);

  return {
    name: subject.name,
    nip: normalizeNip(subject.nip),
    addressLine1: address.addressLine1,
    addressLine2: address.addressLine2,
    vatStatus: mapVatStatus(subject.statusVat),
    requestId: payload.result?.requestId ?? null,
  };
}

export async function fetchGusCompanyByNip(nipInput: string, apiKey: string): Promise<GusCompanyResult> {
  const nip = normalizeNip(nipInput);

  if (!isValidNip(nip)) {
    throw new Error('Invalid NIP');
  }

  if (!apiKey.trim()) {
    throw new Error('GUS API key is missing');
  }

  const loginRes = await fetch(`${GUS_BASE}/Login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ pKluczUzytkownika: apiKey }),
    signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MILLISECONDS)
  });

  if (!loginRes.ok) {
    throw new Error('GUS login failed');
  }

  const sessionKey = ((await loginRes.json()) as GusEnvelope).d?.trim() ?? '';

  if (!sessionKey) {
    throw new Error('GUS returned empty session key');
  }

  const searchRes = await fetch(`${GUS_BASE}/DaneSzukajPodmioty`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      sid: sessionKey
    },
    body: JSON.stringify({ pParametryWyszukiwania: { Nip: nip } }),
    signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MILLISECONDS)
  });

  if (!searchRes.ok) {
    throw new Error('GUS search failed');
  }

  const rawXml = ((await searchRes.json()) as GusEnvelope).d ?? '';
  const name = parseXmlTag(rawXml, 'Nazwa');

  if (!name) {
    throw new Error(`No GUS record found for NIP ${nip}`);
  }

  const street = parseXmlTag(rawXml, 'Ulica');
  const buildingNumber = parseXmlTag(rawXml, 'NrNieruchomosci');
  const apartmentNumber = parseXmlTag(rawXml, 'NrLokalu');
  const postalCode = parseXmlTag(rawXml, 'KodPocztowy');
  const city = parseXmlTag(rawXml, 'Miejscowosc');

  const addressLine1 = [
    street,
    [buildingNumber, apartmentNumber].filter(Boolean).join('/'),
  ].filter(Boolean).join(' ').trim();

  const addressLine2 = [postalCode, city].filter(Boolean).join(' ').trim() || null;

  return {
    name,
    nip,
    addressLine1,
    addressLine2,
  };
}

export async function fetchCompanyByNip(
  nipInput: string,
  options: { now?: Date; gusApiKey?: string } = {}
): Promise<CompanyRegistryLookup> {
  const nip = normalizeNip(nipInput);

  if (!isValidNip(nip)) {
    throw new Error('Invalid NIP');
  }

  const checkedAt = (options.now ?? new Date()).toISOString();
  const [whiteListCompany, gusCompany] = await Promise.all([
    fetchWhiteListCompanyByNip(nip, options.now),
    options.gusApiKey
      ? fetchGusCompanyByNip(nip, options.gusApiKey).catch(() => null)
      : Promise.resolve(null),
  ]);

  return {
    name: gusCompany?.name ?? whiteListCompany.name,
    nip: whiteListCompany.nip,
    addressLine1: gusCompany?.addressLine1 || whiteListCompany.addressLine1,
    addressLine2: gusCompany?.addressLine2 ?? whiteListCompany.addressLine2,
    vatStatus: whiteListCompany.vatStatus,
    checkedAt,
    requestId: whiteListCompany.requestId,
  };
}

// ── Lookup guards ────────────────────────────────────────────────────────────
// The MF white-list "search" quota is shared by every tenant (one egress IP), so lookups are throttled, cached and capped.
// ponytail: per-process state; adopt @fastify/rate-limit with a Redis store and replace all the Maps when the API runs more than one instance.

const USER_WINDOW_MILLISECONDS = 60_000;
const USER_WINDOW_LOOKUP_LIMIT = 10;
const CACHE_MAXIMUM_ENTRIES = 2000;
const DEFAULT_DAILY_REGISTRY_CALL_LIMIT = 80;
const DEFAULT_USER_DAILY_REGISTRY_CALL_LIMIT = 20;

type CachedLookup = { lookup: CompanyRegistryLookup } | { notFoundMessage: string };

const lookupsByUser = new Map<string, { windowStartedAt: number; count: number }>();
const cacheByNip = new Map<string, CachedLookup>();
const callsByUser = new Map<string, number>();
const inFlightByNip = new Map<string, Promise<CompanyRegistryLookup>>();
const dailyState = { day: '', registryCalls: 0, limitLogged: false };

const secondsUntilUtcMidnight = (now: Date): number =>
  Math.max(1, Math.ceil((Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1) - now.getTime()) / 1000));

export function reserveCompanyLookup(userId: string, now = new Date()): void {
  for (const [key, entry] of lookupsByUser) {
    if (now.getTime() - entry.windowStartedAt >= USER_WINDOW_MILLISECONDS) lookupsByUser.delete(key);
  }

  const entry = lookupsByUser.get(userId) ?? { windowStartedAt: now.getTime(), count: 0 };
  if (entry.count >= USER_WINDOW_LOOKUP_LIMIT) {
    throw new RegistryLimitError('RATE_LIMITED', Math.ceil((entry.windowStartedAt + USER_WINDOW_MILLISECONDS - now.getTime()) / 1000));
  }

  lookupsByUser.set(userId, { ...entry, count: entry.count + 1 });
}

/** Cached per NIP for the current UTC day (200 and 404); upstream errors are never cached. Cache hits consume no quota. */
export async function lookupCompanyByNip(
  nipInput: string,
  options: { userId: string; now?: Date; gusApiKey?: string; onDailyLimitReached?: () => void },
): Promise<CompanyRegistryLookup> {
  const now = options.now ?? new Date();
  const day = now.toISOString().slice(0, 10);
  const nip = normalizeNip(nipInput);

  // Checksum first: a garbage NIP must never reach the cache or spend any cap.
  if (!isValidNip(nip)) throw new Error('Invalid NIP');

  if (dailyState.day !== day) {
    cacheByNip.clear();
    callsByUser.clear();
    Object.assign(dailyState, { day, registryCalls: 0, limitLogged: false });
  }

  const cached = cacheByNip.get(nip);
  if (cached) {
    if ('lookup' in cached) return cached.lookup;
    throw new Error(cached.notFoundMessage);
  }

  // Concurrent lookups of one NIP share a single upstream call that counts once.
  const inFlight = inFlightByNip.get(nip);
  if (inFlight) return inFlight;

  const userDailyLimit = Number(process.env['REGISTRY_USER_DAILY_CALL_LIMIT']) || DEFAULT_USER_DAILY_REGISTRY_CALL_LIMIT;
  if ((callsByUser.get(options.userId) ?? 0) >= userDailyLimit) {
    throw new RegistryLimitError('REGISTRY_USER_DAILY_LIMIT', secondsUntilUtcMidnight(now));
  }

  const dailyLimit = Number(process.env['REGISTRY_DAILY_CALL_LIMIT']) || DEFAULT_DAILY_REGISTRY_CALL_LIMIT;
  if (dailyState.registryCalls >= dailyLimit) {
    if (!dailyState.limitLogged) {
      dailyState.limitLogged = true;
      options.onDailyLimitReached?.();
    }
    throw new RegistryLimitError('REGISTRY_DAILY_LIMIT', secondsUntilUtcMidnight(now));
  }

  dailyState.registryCalls += 1;
  callsByUser.set(options.userId, (callsByUser.get(options.userId) ?? 0) + 1);
  const remember = (entry: CachedLookup): void => {
    if (cacheByNip.size >= CACHE_MAXIMUM_ENTRIES) cacheByNip.delete(cacheByNip.keys().next().value as string);
    cacheByNip.set(nip, entry);
  };

  const upstreamLookup = fetchCompanyByNip(nip, { now, ...(options.gusApiKey ? { gusApiKey: options.gusApiKey } : {}) })
    .then((lookup) => {
      remember({ lookup });
      return lookup;
    })
    .catch((error: unknown) => {
      if (error instanceof Error && error.message.includes('was not found')) {
        remember({ notFoundMessage: error.message });
      }
      throw error;
    })
    .finally(() => inFlightByNip.delete(nip));

  inFlightByNip.set(nip, upstreamLookup);
  return upstreamLookup;
}
