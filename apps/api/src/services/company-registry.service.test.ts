import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { lookupCompanyByNip, RegistryLimitError, reserveCompanyLookup } from './company-registry.service.js';

const validNip = '5260250995';
const otherValidNip = '5252248481';

const registryResponse = (requestId: string) => new Response(JSON.stringify({
  result: { requestId, subject: { name: 'Acme', nip: validNip, workingAddress: 'Main 1, 00-001 Warsaw', statusVat: 'Czynny' } },
}), { status: 200 });

describe('lookupCompanyByNip()', () => {
  beforeEach(() => {
    delete process.env['REGISTRY_DAILY_CALL_LIMIT'];
    delete process.env['REGISTRY_USER_DAILY_CALL_LIMIT'];
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('serves repeated lookups from the cache and keeps the original checkedAt and requestId', async () => {
    const fetchMock = vi.fn(async () => registryResponse('req-1'));
    vi.stubGlobal('fetch', fetchMock);

    const first = await lookupCompanyByNip(validNip, { userId: 'user-1', now: new Date('2031-01-01T10:00:00.000Z') });
    const second = await lookupCompanyByNip(validNip, { userId: 'user-1', now: new Date('2031-01-01T15:00:00.000Z') });

    expect(second).toEqual(first);
    expect(first).toEqual({
      name: 'Acme', nip: validNip, addressLine1: 'Main 1', addressLine2: '00-001 Warsaw', vatStatus: 'ACTIVE',
      checkedAt: '2031-01-01T10:00:00.000Z', requestId: 'req-1',
    });
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it('caches a 404 for the UTC day and refreshes on the next day', async () => {
    const fetchMock = vi.fn(async () => new Response('', { status: 404 }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(lookupCompanyByNip(validNip, { userId: 'user-1', now: new Date('2031-02-01T10:00:00.000Z') })).rejects.toThrow('was not found');
    await expect(lookupCompanyByNip(validNip, { userId: 'user-1', now: new Date('2031-02-01T11:00:00.000Z') })).rejects.toThrow('was not found');
    expect(fetchMock).toHaveBeenCalledOnce();

    await expect(lookupCompanyByNip(validNip, { userId: 'user-1', now: new Date('2031-02-02T00:00:01.000Z') })).rejects.toThrow('was not found');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('rejects cache misses beyond the daily cap while still serving cached NIPs', async () => {
    process.env['REGISTRY_DAILY_CALL_LIMIT'] = '1';
    vi.stubGlobal('fetch', vi.fn(async () => registryResponse('req-1')));
    const onDailyLimitReached = vi.fn();
    const now = new Date('2031-03-01T23:00:00.000Z');

    await lookupCompanyByNip(validNip, { userId: 'user-1', now });
    const rejection = await lookupCompanyByNip(otherValidNip, { userId: 'user-1', now, onDailyLimitReached }).catch((error: unknown) => error);

    expect(rejection).toBeInstanceOf(RegistryLimitError);
    expect(rejection).toMatchObject({ code: 'REGISTRY_DAILY_LIMIT', retryAfterSeconds: 3600 });
    await expect(lookupCompanyByNip(validNip, { userId: 'user-1', now })).resolves.toMatchObject({ requestId: 'req-1' });
    expect(onDailyLimitReached).toHaveBeenCalledOnce();
  });

  it('does not cache upstream errors', async () => {
    const fetchMock = vi.fn(async () => new Response('', { status: 500 }));
    vi.stubGlobal('fetch', fetchMock);
    const now = new Date('2031-04-01T10:00:00.000Z');

    await expect(lookupCompanyByNip(validNip, { userId: 'user-1', now })).rejects.toThrow('status 500');
    await expect(lookupCompanyByNip(validNip, { userId: 'user-1', now })).rejects.toThrow('status 500');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe('lookupCompanyByNip() guards', () => {
  beforeEach(() => {
    delete process.env['REGISTRY_DAILY_CALL_LIMIT'];
    delete process.env['REGISTRY_USER_DAILY_CALL_LIMIT'];
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('rejects a bad-checksum NIP without spending the daily cap', async () => {
    process.env['REGISTRY_DAILY_CALL_LIMIT'] = '1';
    const fetchMock = vi.fn(async () => registryResponse('req-1'));
    vi.stubGlobal('fetch', fetchMock);
    const now = new Date('2031-06-01T10:00:00.000Z');

    await expect(lookupCompanyByNip('1234567890', { userId: 'user-1', now })).rejects.toThrow('Invalid NIP');
    await expect(lookupCompanyByNip(validNip, { userId: 'user-1', now })).resolves.toMatchObject({ requestId: 'req-1' });
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it('shares one upstream call between concurrent lookups of the same NIP', async () => {
    process.env['REGISTRY_DAILY_CALL_LIMIT'] = '2';
    const fetchMock = vi.fn(async () => registryResponse('req-1'));
    vi.stubGlobal('fetch', fetchMock);
    const now = new Date('2031-07-01T10:00:00.000Z');

    const [first, second] = await Promise.all([
      lookupCompanyByNip(validNip, { userId: 'user-1', now }),
      lookupCompanyByNip(validNip, { userId: 'user-2', now }),
    ]);
    await lookupCompanyByNip(otherValidNip, { userId: 'user-1', now });

    expect(second).toEqual(first);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('limits cache misses per user per day without charging cache hits and keeps other users working', async () => {
    process.env['REGISTRY_USER_DAILY_CALL_LIMIT'] = '1';
    vi.stubGlobal('fetch', vi.fn(async () => registryResponse('req-1')));
    const now = new Date('2031-08-01T23:00:00.000Z');

    await lookupCompanyByNip(validNip, { userId: 'user-1', now });
    await expect(lookupCompanyByNip(validNip, { userId: 'user-1', now })).resolves.toMatchObject({ requestId: 'req-1' });
    const rejection = await lookupCompanyByNip(otherValidNip, { userId: 'user-1', now }).catch((error: unknown) => error);

    expect(rejection).toBeInstanceOf(RegistryLimitError);
    expect(rejection).toMatchObject({ code: 'REGISTRY_USER_DAILY_LIMIT', retryAfterSeconds: 3600 });
    await expect(lookupCompanyByNip(otherValidNip, { userId: 'user-2', now })).resolves.toMatchObject({ requestId: 'req-1' });
  });
});

describe('reserveCompanyLookup()', () => {
  it('allows 10 lookups per user per minute and then reports Retry-After', () => {
    const now = new Date('2031-05-01T10:00:00.000Z');
    for (let attempt = 0; attempt < 10; attempt += 1) reserveCompanyLookup('user-1', now);

    expect(() => reserveCompanyLookup('user-1', new Date(now.getTime() + 20_000))).toThrow(
      expect.objectContaining({ code: 'RATE_LIMITED', retryAfterSeconds: 40 }),
    );
    expect(() => reserveCompanyLookup('user-2', now)).not.toThrow();
    expect(() => reserveCompanyLookup('user-1', new Date(now.getTime() + 60_000))).not.toThrow();
  });
});
