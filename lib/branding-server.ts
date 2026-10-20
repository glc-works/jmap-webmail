import { logger } from '@/lib/logger';
import { sanitizeBranding, type Branding } from '@/lib/branding';

/**
 * Server-side client for the white-label branding panel.
 *
 * Only the lookup key (request hostname or email domain) is sent upstream.
 * Results, including "unknown" (404) answers, are cached in memory for
 * BRANDING_CACHE_TTL seconds. Upstream failures fall back to the default
 * look and are cached briefly so a panel outage does not add latency to
 * every page load.
 */

export type BrandingLookup = { kind: 'host' | 'domain'; value: string };

export const DEFAULT_CACHE_TTL_SECONDS = 300;
export const FETCH_TIMEOUT_MS = 2000;
/** Failures are cached for at most this long, regardless of the TTL. */
export const FAILURE_CACHE_TTL_SECONDS = 30;
export const MAX_CACHE_ENTRIES = 1000;

interface CacheEntry {
  value: Branding | null;
  expiresAt: number;
}

const cache = new Map<string, CacheEntry>();
const inflight = new Map<string, Promise<Branding | null>>();

export function getBrandingUrl(): string | null {
  const raw = process.env.BRANDING_URL?.trim();
  if (!raw) return null;
  try {
    const url = new URL(raw);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
    return url.toString();
  } catch {
    return null;
  }
}

export function isBrandingEnabled(): boolean {
  return getBrandingUrl() !== null;
}

export function getCacheTtlSeconds(): number {
  const raw = process.env.BRANDING_CACHE_TTL;
  if (raw === undefined || raw.trim() === '') return DEFAULT_CACHE_TTL_SECONDS;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : DEFAULT_CACHE_TTL_SECONDS;
}

/** Test helper. */
export function clearBrandingCache(): void {
  cache.clear();
  inflight.clear();
}

function store(key: string, value: Branding | null, ttlSeconds: number): void {
  if (ttlSeconds <= 0) return;
  if (cache.size >= MAX_CACHE_ENTRIES && !cache.has(key)) {
    // Evict the oldest insertion (Map preserves insertion order).
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
  cache.set(key, { value, expiresAt: Date.now() + ttlSeconds * 1000 });
}

async function fetchUpstream(baseUrl: string, lookup: BrandingLookup): Promise<{ value: Branding | null; failed: boolean }> {
  const url = new URL(baseUrl);
  url.searchParams.set(lookup.kind, lookup.value);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal: controller.signal,
      cache: 'no-store',
      redirect: 'error',
    });
    if (res.status === 404) return { value: null, failed: false };
    if (!res.ok) {
      logger.warn('Branding lookup failed', { status: res.status, kind: lookup.kind });
      return { value: null, failed: true };
    }
    const json: unknown = await res.json();
    return { value: sanitizeBranding(json), failed: false };
  } catch (err) {
    logger.warn('Branding lookup error', {
      kind: lookup.kind,
      error: err instanceof Error ? err.name : 'unknown',
    });
    return { value: null, failed: true };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Resolves branding for a host or email domain. Never throws: any problem
 * yields null (default branding).
 */
export async function resolveBranding(lookup: BrandingLookup): Promise<Branding | null> {
  const baseUrl = getBrandingUrl();
  if (!baseUrl) return null;

  const key = `${lookup.kind}:${lookup.value}`;
  const hit = cache.get(key);
  if (hit) {
    if (hit.expiresAt > Date.now()) return hit.value;
    cache.delete(key);
  }

  const pending = inflight.get(key);
  if (pending) return pending;

  const promise = fetchUpstream(baseUrl, lookup)
    .then(({ value, failed }) => {
      const ttl = getCacheTtlSeconds();
      store(key, value, failed ? Math.min(ttl, FAILURE_CACHE_TTL_SECONDS) : ttl);
      return value;
    })
    .finally(() => {
      inflight.delete(key);
    });
  inflight.set(key, promise);
  return promise;
}
