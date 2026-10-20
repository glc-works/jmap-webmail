import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { BrandMark } from '../brand-mark';
import { useBrandingStore } from '@/stores/branding-store';
import type { Branding } from '@/lib/branding';

const BRAND: Branding = {
  name: 'PT Contoh <b>Mail</b>',
  logoUrl: 'https://cdn.example.test/logo.png',
  faviconUrl: null,
  primaryColor: null,
  loginMessage: null,
  supportEmail: null,
};

describe('BrandMark', () => {
  beforeEach(() => {
    useBrandingStore.setState({ branding: null });
  });

  it('renders nothing without branding (default layout unchanged)', () => {
    const { container } = render(<BrandMark />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders the logo and the name as plain text', () => {
    useBrandingStore.setState({ branding: BRAND });
    const { container } = render(<BrandMark />);
    expect(screen.getByText('PT Contoh <b>Mail</b>')).toBeInTheDocument();
    expect(container.querySelector('b')).toBeNull();
    const img = screen.getByRole('img');
    expect(img).toHaveAttribute('src', BRAND.logoUrl);
    expect(img).toHaveAttribute('referrerpolicy', 'no-referrer');
  });

  it('hides a logo that fails to load, keeping the name', () => {
    useBrandingStore.setState({ branding: BRAND });
    render(<BrandMark />);
    fireEvent.error(screen.getByRole('img'));
    expect(screen.queryByRole('img')).toBeNull();
    expect(screen.getByText(BRAND.name)).toBeInTheDocument();
  });

  it('compact mode shows only the logo, and nothing without one', () => {
    useBrandingStore.setState({ branding: BRAND });
    const { rerender, container } = render(<BrandMark compact />);
    expect(screen.getByRole('img')).toBeInTheDocument();
    expect(screen.queryByText(BRAND.name)).toBeNull();

    useBrandingStore.setState({ branding: { ...BRAND, logoUrl: null } });
    rerender(<BrandMark compact />);
    expect(container).toBeEmptyDOMElement();
  });
});
