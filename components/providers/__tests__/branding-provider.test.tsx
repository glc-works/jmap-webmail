import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, waitFor, act } from '@testing-library/react';
import { BrandingProvider } from '../branding-provider';
import { useBrandingStore } from '@/stores/branding-store';
import { useThemeStore } from '@/stores/theme-store';
import { useAuthStore } from '@/stores/auth-store';

const BRAND = {
  name: 'PT Contoh', logoUrl: null, faviconUrl: 'https://cdn.example.test/fav.png',
  primaryColor: '#0055aa', loginMessage: null, supportEmail: null,
};

const initialBranding = useBrandingStore.getState();

function respond(body: unknown) {
  return Promise.resolve(new Response(JSON.stringify(body), { status: 200 }));
}

describe('BrandingProvider', () => {
  const fetchMock = vi.fn();
  const root = document.documentElement;

  beforeEach(() => {
    useBrandingStore.setState(initialBranding, true);
    useThemeStore.setState({ resolvedTheme: 'light' });
    useAuthStore.setState({ isAuthenticated: false, username: null, primaryIdentity: null });
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
    root.removeAttribute('style');
    document.head.innerHTML = '<link rel="icon" href="/icon.svg">';
  });
  afterEach(() => vi.unstubAllGlobals());

  it('keeps the default theme when branding is disabled', async () => {
    fetchMock.mockImplementation(() => respond({ enabled: false, branding: null }));
    render(<BrandingProvider><div /></BrandingProvider>);
    await waitFor(() => expect(useBrandingStore.getState().enabled).toBe(false));
    expect(root.style.getPropertyValue('--color-primary')).toBe('');
    expect(document.querySelector('link[rel="icon"]')?.getAttribute('href')).toBe('/icon.svg');
  });

  it('applies the host brand colour and favicon, and restores them when cleared', async () => {
    fetchMock.mockImplementation(() => respond({ enabled: true, branding: BRAND }));
    render(<BrandingProvider><div /></BrandingProvider>);

    await waitFor(() => expect(root.style.getPropertyValue('--color-primary')).toBe('#0055aa'));
    expect(root.style.getPropertyValue('--color-primary-foreground')).toBe('#ffffff');
    expect(document.querySelector('link[rel="icon"]')?.getAttribute('href')).toBe(BRAND.faviconUrl);

    act(() => useBrandingStore.setState({ branding: null }));
    expect(root.style.getPropertyValue('--color-primary')).toBe('');
    expect(document.querySelector('link[rel="icon"]')?.getAttribute('href')).toBe('/icon.svg');
  });

  it('skips a primary colour without enough contrast in dark mode', async () => {
    useThemeStore.setState({ resolvedTheme: 'dark' });
    fetchMock.mockImplementation(() => respond({ enabled: true, branding: BRAND }));
    render(<BrandingProvider><div /></BrandingProvider>);
    await waitFor(() => expect(useBrandingStore.getState().branding?.name).toBe('PT Contoh'));
    expect(root.style.getPropertyValue('--color-primary')).toBe('');
  });

  it('switches to the account domain brand after login and back on logout', async () => {
    fetchMock.mockImplementation((url: string) =>
      url.includes('domain=')
        ? respond({ enabled: true, branding: { ...BRAND, name: 'Tenant A', primaryColor: '#aa0000' } })
        : respond({ enabled: true, branding: null }),
    );
    render(<BrandingProvider><div /></BrandingProvider>);
    await waitFor(() => expect(useBrandingStore.getState().enabled).toBe(true));

    act(() => useAuthStore.setState({ isAuthenticated: true, username: 'jane@pt-a.co.id' }));
    await waitFor(() => expect(useBrandingStore.getState().branding?.name).toBe('Tenant A'));
    expect(fetchMock).toHaveBeenCalledWith('/api/branding?domain=pt-a.co.id', expect.anything());
    expect(root.style.getPropertyValue('--color-primary')).toBe('#aa0000');

    act(() => useAuthStore.setState({ isAuthenticated: false, username: null }));
    await waitFor(() => expect(useBrandingStore.getState().branding).toBeNull());
    expect(root.style.getPropertyValue('--color-primary')).toBe('');
  });
});
