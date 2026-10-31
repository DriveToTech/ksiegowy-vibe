import { Builder } from 'builder-pattern';
import type { PrismaClient } from '@prisma/client';
import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildApp } from '../app.js';
import { loadAuthConfig } from '../lib/auth-config.js';

describe('advisorInsightRoutes()', () => {
  let application: FastifyInstance;
  let database: PrismaClient;
  let token: string;
  const headers = { 'x-ksef-environment': 'TEST' };
  beforeEach(async () => {
    vi.stubEnv('ADVISOR_ENABLED', 'true');
    vi.stubEnv('CORS_ORIGIN', 'http://localhost:3000');
    database = Builder<PrismaClient>()
      .companyMembership({ findUnique: vi.fn().mockResolvedValue({ id: 'membership', role: 'VIEWER', company: { advisorPolicy: null } }) } as never)
      .advisorInsightDismissal({ findMany: vi.fn().mockResolvedValue([]), upsert: vi.fn().mockResolvedValue({}) } as never)
      .invoice({ findFirst: vi.fn().mockResolvedValue({ id: 'issued', invoiceNumber: 'FV/1' }) } as never)
      .incomingInvoice({ findFirst: vi.fn().mockResolvedValue(null) } as never)
      .build();
    application = await buildApp({ logger: false, prismaClient: database,
      authConfig: loadAuthConfig({ NODE_ENV: 'test', JWT_SECRET: 'access-test-secret', JWT_REFRESH_SECRET: 'refresh-test-secret' }) });
    await application.ready();
    // The decorated Fastify JWT namespace contains the access signer at runtime.
    const jwt = application.jwt as unknown as { access: { sign: (payload: object) => string } };
    token = jwt.access.sign({ sub: 'user', email: 'user@example.com', companies: [] });
  });
  afterEach(async () => { await application.close(); vi.unstubAllEnvs(); vi.restoreAllMocks(); });

  it('returns document evidence for a VIEWER without exposing any action capable of changing accounts', async () => {
    const response = await application.inject({ method: 'GET', url: '/companies/company/advisor/insights?view=invoices', cookies: { auth_token: token }, headers });
    expect(response.json()).toEqual({ key: 'rejected-invoice', version: 1, title: 'Odrzucona faktura KSeF',
      description: 'Sprawdź przyczynę odrzucenia na dokumencie. Doradca nie zmienia ani nie wysyła faktur.',
      evidence: [{ kind: 'outgoing', id: 'issued', title: 'FV/1' }] });
    expect(database.invoice.findFirst).toHaveBeenCalledWith({
      where: { companyId: 'company', environment: 'TEST', status: 'ISSUED',
        ksefStates: { some: { environment: 'TEST', status: 'REJECTED' } } },
      orderBy: [{ issueDate: 'desc' }, { id: 'asc' }], select: { id: true, invoiceNumber: true },
    });
    expect(database.advisorInsightDismissal.upsert).not.toHaveBeenCalled();
  });

  it('persists only the current membership/environment/version and hides dismissed facts there', async () => {
    const dismissal = database.advisorInsightDismissal;
    const saved = await application.inject({ method: 'POST', url: '/companies/company/advisor/insights/rejected-invoice/dismiss',
      cookies: { auth_token: token }, headers: { ...headers, origin: 'http://localhost:3000' } });
    expect(saved.statusCode).toBe(200);
    expect(dismissal.upsert).toHaveBeenCalledWith({
      where: { membershipId_environment_insightKey_version: { membershipId: 'membership', environment: 'TEST', insightKey: 'rejected-invoice', version: 1 } },
      create: { membershipId: 'membership', environment: 'TEST', insightKey: 'rejected-invoice', version: 1 }, update: {},
    });
    vi.mocked(database.invoice.findFirst).mockResolvedValueOnce({ id: 'issued', invoiceNumber: 'FV/1' } as never);
    vi.mocked(dismissal.findMany).mockResolvedValueOnce([{ insightKey: 'rejected-invoice' }] as never);
    const hidden = await application.inject({ method: 'GET', url: '/companies/company/advisor/insights?view=invoices', cookies: { auth_token: token }, headers });
    expect(hidden.statusCode).toBe(200);
    expect(hidden.json()).toEqual({ key: 'not-submitted-invoice', version: 1, title: 'Faktura bez wysyłki do KSeF',
      description: 'Sprawdź stan wysyłki na dokumencie; doradca nie wysyła faktur.', evidence: [{ kind: 'outgoing', id: 'issued', title: 'FV/1' }] });
    expect(dismissal.findMany).toHaveBeenCalledWith({ where: { membershipId: 'membership', environment: 'TEST', version: 1 }, select: { insightKey: true } });
    const otherEnvironment = await application.inject({ method: 'GET', url: '/companies/company/advisor/insights?view=invoices',
      cookies: { auth_token: token }, headers: { 'x-ksef-environment': 'PRODUCTION' } });
    expect(otherEnvironment.json().key).toBe('rejected-invoice');
    expect(dismissal.findMany).toHaveBeenCalledWith({ where: { membershipId: 'membership', environment: 'PRODUCTION', version: 1 }, select: { insightKey: true } });
  });

  it('does not read financial records without current company membership', async () => {
    vi.mocked(database.companyMembership.findUnique).mockResolvedValue(null);
    const response = await application.inject({ method: 'GET', url: '/companies/other-company/advisor/insights?view=invoices', cookies: { auth_token: token }, headers });
    expect(response.statusCode).toBe(403);
    expect(database.invoice.findFirst).not.toHaveBeenCalled();
  });

  it('returns no insight and refuses dismissal while the operator has disabled the advisor', async () => {
    vi.stubEnv('ADVISOR_ENABLED', 'false');
    const insight = await application.inject({ method: 'GET', url: '/companies/company/advisor/insights?view=invoices', cookies: { auth_token: token }, headers });
    expect(insight.statusCode).toBe(200);
    expect(insight.json()).toBeNull();
    expect(database.invoice.findFirst).not.toHaveBeenCalled();
    const dismissed = await application.inject({ method: 'POST', url: '/companies/company/advisor/insights/rejected-invoice/dismiss',
      cookies: { auth_token: token }, headers: { ...headers, origin: 'http://localhost:3000' } });
    expect(dismissed.statusCode).toBe(503);
    expect(dismissed.json().code).toBe('ADVISOR_DISABLED');
  });
});
