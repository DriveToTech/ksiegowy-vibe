import { isValidNip, normalizeNip } from '@ksiegowy/shared-utils';

export interface CompanyRegistryResult {
  name: string;
  nip: string;
  addressLine1: string;
  addressLine2: string | null;
  vatStatus: 'ACTIVE' | 'EXEMPT' | 'NO_VAT';
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
    subject?: WhiteListSubject;
  };
}

interface GusEnvelope {
  d?: string;
}

const REGISTRY_URL = 'https://wl-api.mf.gov.pl/api/search/nip';
const GUS_BASE = 'https://wyszukiwarkaregon.stat.gov.pl/api';

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

async function fetchWhiteListCompanyByNip(nip: string, now = new Date()): Promise<CompanyRegistryResult> {
  const date = now.toISOString().slice(0, 10);
  const response = await fetch(`${REGISTRY_URL}/${nip}?date=${date}`, {
    method: 'GET',
    headers: {
      Accept: 'application/json',
    },
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
    body: JSON.stringify({ pKluczUzytkownika: apiKey })
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
    body: JSON.stringify({ pParametryWyszukiwania: { Nip: nip } })
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
): Promise<CompanyRegistryResult> {
  const nip = normalizeNip(nipInput);

  if (!isValidNip(nip)) {
    throw new Error('Invalid NIP');
  }

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
  };
}
