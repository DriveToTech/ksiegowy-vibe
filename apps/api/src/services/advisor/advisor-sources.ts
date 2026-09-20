import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import type { AdvisorTaxSource } from '@ksiegowy/types';

const dateSchema = z.iso.date();
const sourceSchema = z.object({
  id: z.string().min(1).max(100),
  title: z.string().min(1).max(300),
  url: z.url().refine((value) => {
    const address = new URL(value);
    return address.protocol === 'https:' && address.hostname.endsWith('.gov.pl') && !address.username && !address.password;
  }),
  section: z.string().min(1).max(200),
  effectiveFrom: dateSchema,
  effectiveUntil: dateSchema,
  reviewedAt: dateSchema,
  reviewExpiresAt: dateSchema,
  reviewedBy: z.string().min(1).max(200),
  excerpt: z.string().min(1).max(2000),
}).strict().refine((source) => source.effectiveFrom <= source.effectiveUntil && source.reviewedAt <= source.reviewExpiresAt);

export async function loadAdvisorSources(): Promise<{ sources: AdvisorTaxSource[]; version: string }> {
  const sourcePath = process.env['ADVISOR_TAX_SOURCES_PATH'];
  if (!sourcePath) return { sources: [], version: 'unreviewed' };
  const contents = await readFile(sourcePath, 'utf8');
  if (Buffer.byteLength(contents) > 128_000) throw new Error('Advisor source corpus exceeds 128 KB');
  const sources = z.array(sourceSchema).max(40).parse(JSON.parse(contents));
  if (new Set(sources.map((source) => source.id)).size !== sources.length) throw new Error('Duplicate advisor source identifier');
  return { sources, version: createHash('sha256').update(contents).digest('hex') };
}

export function selectAdvisorSources(sources: AdvisorTaxSource[], period: string, now = new Date()): AdvisorTaxSource[] {
  const start = `${period}-01`;
  const end = new Date(Date.UTC(Number(period.slice(0, 4)), Number(period.slice(5)), 0)).toISOString().slice(0, 10);
  const today = now.toISOString().slice(0, 10);
  return sources.filter((source) => source.effectiveFrom <= start && source.effectiveUntil >= end
    && source.reviewedAt <= today && source.reviewExpiresAt >= today).slice(0, 8);
}
