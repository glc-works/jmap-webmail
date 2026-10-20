"use client";

import { useEffect } from 'react';
import { useAuthStore } from '@/stores/auth-store';
import { useBrandingStore } from '@/stores/branding-store';
import { useThemeStore } from '@/stores/theme-store';
import { brandColorVars, BRAND_CSS_VARS } from '@/lib/branding';
import { getDefaultFaviconHref, getIconLinks } from '@/lib/favicon';

/** Points every <link rel="icon"> at the brand favicon, or back to the default. */
function applyFavicon(url: string | null) {
  getIconLinks().forEach((link) => {
    const fallback = getDefaultFaviconHref(link);
    link.href = url ?? fallback;
  });
}

/**
 * Applies white-label branding (opt-in via BRANDING_URL on the server):
 * loads the brand for the current hostname, switches to the account's
 * email-domain brand once signed in, and maps the primary colour onto the
 * theme's CSS variables (only where it keeps enough contrast).
 */
export function BrandingProvider({ children }: { children: React.ReactNode }) {
  const loadForHost = useBrandingStore((s) => s.loadForHost);
  const loadForEmail = useBrandingStore((s) => s.loadForEmail);
  const clearDomain = useBrandingStore((s) => s.clearDomain);
  const branding = useBrandingStore((s) => s.branding);
  const resolvedTheme = useThemeStore((s) => s.resolvedTheme);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const username = useAuthStore((s) => s.username);
  const identityEmail = useAuthStore((s) => s.primaryIdentity?.email);

  useEffect(() => {
    void loadForHost();
  }, [loadForHost]);

  useEffect(() => {
    if (isAuthenticated) {
      void loadForEmail(username?.includes('@') ? username : identityEmail);
    } else {
      clearDomain();
    }
  }, [isAuthenticated, username, identityEmail, loadForEmail, clearDomain]);

  const primaryColor = branding?.primaryColor ?? null;
  useEffect(() => {
    const root = document.documentElement;
    const vars = brandColorVars(primaryColor, resolvedTheme);
    BRAND_CSS_VARS.forEach((name) => root.style.removeProperty(name));
    if (vars) {
      Object.entries(vars).forEach(([name, value]) => root.style.setProperty(name, value));
    }
    return () => {
      BRAND_CSS_VARS.forEach((name) => root.style.removeProperty(name));
    };
  }, [primaryColor, resolvedTheme]);

  const faviconUrl = branding?.faviconUrl ?? null;
  useEffect(() => {
    applyFavicon(faviconUrl);
    return () => applyFavicon(null);
  }, [faviconUrl]);

  return <>{children}</>;
}
