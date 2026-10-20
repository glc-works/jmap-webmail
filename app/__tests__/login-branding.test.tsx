import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

vi.mock('@/i18n/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock('@/hooks/use-config', () => ({
  useConfig: () => ({
    appName: 'Default Webmail',
    jmapServerUrl: 'https://jmap.example.test',
    oauthEnabled: false,
    oauthClientId: '',
    oauthIssuerUrl: '',
    oauthScopes: '',
    oauthOnly: false,
    rememberMeEnabled: false,
    isLoading: false,
    error: null,
  }),
}));
vi.mock('@/stores/auth-store', () => ({
  useAuthStore: () => ({
    login: vi.fn(),
    isLoading: false,
    error: null,
    clearError: vi.fn(),
    isAuthenticated: false,
  }),
}));

import LoginPage from '../[locale]/login/page';
import { useBrandingStore } from '@/stores/branding-store';
import type { Branding } from '@/lib/branding';

const BRAND: Branding = {
  name: 'PT Contoh Mail',
  logoUrl: 'https://cdn.example.test/logo.svg',
  faviconUrl: null,
  primaryColor: '#0055aa',
  loginMessage: '<img src=x onerror=alert(1)>Selamat datang',
  supportEmail: 'support@contoh.co.id',
};

const initial = useBrandingStore.getState();

describe('login page white-label branding', () => {
  beforeEach(() => {
    useBrandingStore.setState(initial, true);
    vi.unstubAllGlobals();
  });

  it('shows the default name and icon without branding', () => {
    render(<LoginPage />);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Default Webmail');
    expect(screen.queryByRole('img')).toBeNull();
    expect(screen.queryByTestId('branding-login-message')).toBeNull();
    expect(screen.queryByTestId('branding-support')).toBeNull();
    expect(document.title).toBe('Default Webmail');
  });

  it('renders brand name, logo, plain-text message and support link', () => {
    useBrandingStore.setState({ branding: BRAND });
    const { container } = render(<LoginPage />);

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('PT Contoh Mail');
    expect(document.title).toBe('PT Contoh Mail');
    expect(screen.getByRole('img')).toHaveAttribute('src', BRAND.logoUrl);

    const message = screen.getByTestId('branding-login-message');
    expect(message.textContent).toBe(BRAND.loginMessage);
    // The HTML in the message is text, not markup.
    expect(container.querySelectorAll('img')).toHaveLength(1);

    const link = screen.getByRole('link', { name: 'support@contoh.co.id' });
    expect(link).toHaveAttribute('href', 'mailto:support@contoh.co.id');
  });

  it('falls back to the default icon when the logo fails to load', () => {
    useBrandingStore.setState({ branding: BRAND });
    render(<LoginPage />);
    fireEvent.error(screen.getByRole('img'));
    expect(screen.queryByRole('img')).toBeNull();
  });

  it('requests the brand for the email domain when the username field loses focus', async () => {
    const fetchMock = vi.fn(() =>
      Promise.resolve(new Response(JSON.stringify({ enabled: true, branding: BRAND }), { status: 200 })),
    );
    vi.stubGlobal('fetch', fetchMock);
    render(<LoginPage />);

    const input = document.getElementById('username') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'jane@Contoh.co.id' } });
    fireEvent.blur(input);

    await waitFor(() =>
      expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('PT Contoh Mail'),
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect((fetchMock.mock.calls[0] as unknown[])[0]).toBe('/api/branding?domain=contoh.co.id');
  });
});
