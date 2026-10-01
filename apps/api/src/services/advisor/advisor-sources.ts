import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import type { AdvisorTaxSource } from '@ksiegowy/types';
import { advisorSourceTopics, classifyAdvisorQuestionTopics, type AdvisorSourceTopic } from './advisor-source-topics.js';

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
  topics: z.array(z.enum(advisorSourceTopics)).min(1).max(6).refine((topics) => new Set(topics).size === topics.length).optional(),
}).strict().refine((source) => source.effectiveFrom <= source.effectiveUntil && source.reviewedAt <= source.reviewExpiresAt);

type LoadedAdvisorSource = AdvisorTaxSource & { topics?: AdvisorSourceTopic[] | undefined };

export async function loadAdvisorSources(): Promise<{ sources: LoadedAdvisorSource[]; version: string }> {
  const sourcePath = process.env['ADVISOR_TAX_SOURCES_PATH'];
  if (!sourcePath) return { sources: [], version: 'unreviewed' };
  const contents = await readFile(sourcePath, 'utf8');
  if (Buffer.byteLength(contents) > 128_000) throw new Error('Advisor source corpus exceeds 128 KB');
  const sources = z.array(sourceSchema).max(40).parse(JSON.parse(contents));
  if (new Set(sources.map((source) => source.id)).size !== sources.length) throw new Error('Duplicate advisor source identifier');
  return { sources, version: createHash('sha256').update(contents).digest('hex') };
}

/**
 * Keeps sources covering the whole month with a current review, then ranks by matched question topics and
 * recency of the effective period. Sources without topics stay eligible as general entries (score 0). When the
 * question maps to topics, sources tagged only with other topics are excluded, so a missing topic fails closed.
 * A question without any topic keeps every eligible source and ranks by recency only.
 */
export function selectAdvisorSources(sources: LoadedAdvisorSource[], period: string, now = new Date(), question = ''): AdvisorTaxSource[] {
  const start = `${period}-01`;
  const end = new Date(Date.UTC(Number(period.slice(0, 4)), Number(period.slice(5)), 0)).toISOString().slice(0, 10);
  const today = now.toISOString().slice(0, 10);
  const questionTopics = classifyAdvisorQuestionTopics(question);
  return sources
    .filter((source) => source.effectiveFrom <= start && source.effectiveUntil >= end && source.reviewedAt <= today && source.reviewExpiresAt >= today)
    .map((source) => ({ source, score: source.topics?.filter((topic) => questionTopics.includes(topic)).length ?? 0 }))
    .filter(({ source, score }) => !questionTopics.length || score > 0 || !source.topics)
    .sort((left, right) => right.score - left.score
      || right.source.effectiveFrom.localeCompare(left.source.effectiveFrom)
      || right.source.effectiveUntil.localeCompare(left.source.effectiveUntil))
    .slice(0, 8)
    .map(({ source: { topics: _topics, ...source } }) => source);
}
