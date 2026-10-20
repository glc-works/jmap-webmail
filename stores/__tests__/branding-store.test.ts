import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { useBrandingStore } from '../branding-store';

const HOST_BRAND = {
  name: 'Host Brand', logoUrl: null, faviconUrl: null,
  primaryColor: '#0055aa', loginMessage: null, supportEmail: null,
};
const DOMAIN_BRAND = { ...HOST_BRAND, name: 'Domain Brand', primaryColor: '#aa0000' };

function ok(body: unknown) {
  return Promise.resolve(new Response(JSON.stringify(body), { status: 200 }));
}

const initial = useBrandingStore.getState();

describe('branding store', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    useBrandingStore.setState(initial, true);
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  it('loads the host brand once', async () => {
    fetchMock.mockImplementation(() => ok({ enabled: true, branding: HOST_BRAND }));
    await useBrandingStore.getState().loadForHost();
    await useBrandingStore.getState().loadForHost();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe('/api/branding');
    expect(useBrandingStore.getState().branding?.name).toBe('Host Brand');
  });

  it('stops asking once the server says branding is disabled', async () => {
    fetchMock.mockImplementation(() => ok({ enabled: false, branding: null }));
    await useBrandingStore.getState().loadForHost();
    await useBrandingStore.getState().loadForEmail('a@pt-a.co.id');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(useBrandingStore.getState().branding).toBeNull();
  });

  it('prefers the account domain brand and falls back to the host brand', async () => {
    fetchMock.mockImplementationOnce(() => ok({ enabled: true, branding: HOST_BRAND }));
    await useBrandingStore.getState().loadForHost();

    fetchMock.mockImplementationOnce(() => ok({ enabled: true, branding: DOMAIN_BRAND }));
    await useBrandingStore.getState().loadForEmail('User@PT-A.co.id');
    expect(fetchMock.mock.calls[1][0]).toBe('/api/branding?domain=pt-a.co.id');
    expect(useBrandingStore.getState().branding?.name).toBe('Domain Brand');

    // Same domain again: no new request.
    await useBrandingStore.getState().loadForEmail('other@pt-a.co.id');
    expect(fetchMock).toHaveBeenCalledTimes(2);

    // Unknown domain -> host brand.
    fetchMock.mockImplementationOnce(() => ok({ enabled: true, branding: null }));
    await useBrandingStore.getState().loadForEmail('x@unknown.test');
    expect(useBrandingStore.getState().branding?.name).toBe('Host Brand');

    useBrandingStore.getState().clearDomain();
    expect(useBrandingStore.getState().branding?.name).toBe('Host Brand');
  });

  it('ignores inputs that are not email addresses', async () => {
    await useBrandingStore.getState().loadForEmail('justauser');
    await useBrandingStore.getState().loadForEmail('');
    await useBrandingStore.getState().loadForEmail(null);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('keeps the default look when the request fails', async () => {
    fetchMock.mockImplementationOnce(() => Promise.reject(new TypeError('offline')));
    await useBrandingStore.getState().loadForHost();
    expect(useBrandingStore.getState().branding).toBeNull();
    // A later retry is allowed.
    fetchMock.mockImplementationOnce(() => ok({ enabled: true, branding: HOST_BRAND }));
    await useBrandingStore.getState().loadForHost();
    expect(useBrandingStore.getState().branding?.name).toBe('Host Brand');
  });

  it('re-validates data from the API', async () => {
    fetchMock.mockImplementationOnce(() => ok({
      enabled: true,
      branding: { ...HOST_BRAND, logoUrl: 'javascript:alert(1)', primaryColor: 'red' },
    }));
    await useBrandingStore.getState().loadForHost();
    const b = useBrandingStore.getState().branding;
    expect(b?.logoUrl).toBeNull();
    expect(b?.primaryColor).toBeNull();
  });
});
