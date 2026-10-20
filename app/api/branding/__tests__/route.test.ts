import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

vi.mock('@/lib/logger', () => ({
  logger: { debug: vi.fn(), error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

import { GET } from '../route';
import { clearBrandingCache, FETCH_TIMEOUT_MS } from '@/lib/branding-server';

const PANEL = 'https://panel.example.test/api/public/branding';

const VALID = {
  name: 'PT Contoh Mail',
  logo_url: 'https://cdn.example.test/logo.svg',
  favicon_url: null,
  primary_color: '#0055aa',
  login_message: 'Selamat datang',
  support_email: 'support@contoh.co.id',
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function req(path = '/api/branding', headers: Record<string, string> = { host: 'webmail.pt-a.co.id' }) {
  return new Request(`http://localhost${path}`, { headers });
}

async function call(path?: string, headers?: Record<string, string>) {
  const res = await GET(req(path, headers));
  return { status: res.status, body: await res.json() };
}

describe('GET /api/branding', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    clearBrandingCache();
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
    process.env.BRANDING_URL = PANEL;
    delete process.env.BRANDING_CACHE_TTL;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
    delete process.env.BRANDING_URL;
    delete process.env.BRANDING_CACHE_TTL;
  });

  it('is disabled and never calls the panel when BRANDING_URL is unset', async () => {
    delete process.env.BRANDING_URL;
    const { status, body } = await call();
    expect(status).toBe(200);
    expect(body).toEqual({ enabled: false, branding: null });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('looks up the brand by request host (port stripped) and maps fields', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(VALID));
    const { body } = await call('/api/branding', { host: 'WebMail.PT-A.co.id:443' });

    const calledUrl = new URL(String(fetchMock.mock.calls[0][0]));
    expect(calledUrl.origin + calledUrl.pathname).toBe(PANEL);
    expect([...calledUrl.searchParams.keys()]).toEqual(['host']);
    expect(calledUrl.searchParams.get('host')).toBe('webmail.pt-a.co.id');
    expect(body).toEqual({
      enabled: true,
      branding: {
        name: 'PT Contoh Mail',
        logoUrl: 'https://cdn.example.test/logo.svg',
        faviconUrl: null,
        primaryColor: '#0055aa',
        loginMessage: 'Selamat datang',
        supportEmail: 'support@contoh.co.id',
      },
    });
  });

  it('prefers X-Forwarded-Host over Host', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(VALID));
    await call('/api/branding', { host: 'internal:3000', 'x-forwarded-host': 'webmail.pt-b.co.id' });
    expect(new URL(String(fetchMock.mock.calls[0][0])).searchParams.get('host')).toBe('webmail.pt-b.co.id');
  });

  it('looks up by email domain and sends nothing else', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(VALID));
    await call('/api/branding?domain=Contoh.co.id');
    const calledUrl = new URL(String(fetchMock.mock.calls[0][0]));
    expect([...calledUrl.searchParams.entries()]).toEqual([['domain', 'contoh.co.id']]);
    const init = fetchMock.mock.calls[0][1] as { method?: string; body?: unknown };
    expect(init.method).toBe('GET');
    expect(init.body).toBeUndefined();
  });

  it('rejects an invalid domain without calling the panel', async () => {
    const { body } = await call('/api/branding?domain=' + encodeURIComponent('evil.com/../x?y=1'));
    expect(body).toEqual({ enabled: true, branding: null });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('caches results for the TTL, including 404 answers', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(VALID));
    await call();
    await call();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    fetchMock.mockResolvedValueOnce(new Response(null, { status: 404 }));
    const first = await call('/api/branding?domain=unknown.test');
    const second = await call('/api/branding?domain=unknown.test');
    expect(first.body.branding).toBeNull();
    expect(second.body.branding).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('refetches after the TTL expires', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    process.env.BRANDING_CACHE_TTL = '10';
    fetchMock.mockResolvedValue(jsonResponse(VALID));
    await call();
    vi.setSystemTime(Date.now() + 11_000);
    fetchMock.mockResolvedValue(jsonResponse({ ...VALID, name: 'Renamed' }));
    const { body } = await call();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(body.branding.name).toBe('Renamed');
  });

  it('BRANDING_CACHE_TTL=0 disables caching', async () => {
    process.env.BRANDING_CACHE_TTL = '0';
    fetchMock.mockImplementation(() => Promise.resolve(jsonResponse(VALID)));
    await call();
    await call();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('falls back to default on upstream 5xx', async () => {
    fetchMock.mockResolvedValueOnce(new Response('boom', { status: 500 }));
    const { status, body } = await call();
    expect(status).toBe(200);
    expect(body).toEqual({ enabled: true, branding: null });
  });

  it('falls back to default on network error or invalid JSON', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('fetch failed'));
    expect((await call()).body.branding).toBeNull();

    clearBrandingCache();
    fetchMock.mockResolvedValueOnce(new Response('<html>', { status: 200 }));
    expect((await call()).body.branding).toBeNull();
  });

  it('aborts a slow panel after the timeout and falls back to default', async () => {
    vi.useFakeTimers();
    fetchMock.mockImplementation((_url: string, init: { signal?: AbortSignal }) =>
      new Promise((_resolve, reject) => {
        init.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
      }),
    );
    const pending = call();
    await vi.advanceTimersByTimeAsync(FETCH_TIMEOUT_MS + 10);
    const { body } = await pending;
    expect(FETCH_TIMEOUT_MS).toBeLessThanOrEqual(2000);
    expect(body).toEqual({ enabled: true, branding: null });
  });

  it('drops invalid colour and non-http(s) URLs but keeps the rest', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({
      ...VALID,
      primary_color: 'red; background:url(x)',
      logo_url: 'javascript:alert(1)',
      favicon_url: 'data:image/png;base64,AAAA',
      support_email: 'not an email',
    }));
    const { body } = await call();
    expect(body.branding).toMatchObject({
      name: 'PT Contoh Mail',
      primaryColor: null,
      logoUrl: null,
      faviconUrl: null,
      supportEmail: null,
    });
  });

  it('treats a payload without a name as unknown', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ ...VALID, name: '   ' }));
    expect((await call()).body.branding).toBeNull();
  });
});
