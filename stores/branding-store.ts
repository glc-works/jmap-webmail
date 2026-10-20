import { create } from 'zustand';
import {
  domainFromEmail,
  sanitizeBranding,
  type Branding,
  type BrandingResponse,
} from '@/lib/branding';

/**
 * Client-side white-label branding state.
 *
 * Two lookups feed it: the brand of the hostname the webmail is served on
 * (custom domain per tenant) and the brand of the signed-in user's email
 * domain. The effective `branding` is the domain brand when known, else the
 * host brand, else null (default look). When the server reports the feature
 * is disabled, no further requests are made.
 */
interface BrandingState {
  /** Effective brand: domain brand, then host brand, then null. */
  branding: Branding | null;
  hostBranding: Branding | null;
  domainBranding: Branding | null;
  /** Domain the current domainBranding was requested for. */
  domain: string | null;
  hostRequested: boolean;
  /** null = unknown yet, false = BRANDING_URL not configured. */
  enabled: boolean | null;
  loadForHost: () => Promise<void>;
  loadForEmail: (email: string | null | undefined) => Promise<void>;
  /** Forgets the account brand (e.g. on logout); the host brand stays. */
  clearDomain: () => void;
}

/** Re-validates a branding object received from our own API (defence in depth). */
function revalidate(value: unknown): Branding | null {
  if (!value || typeof value !== 'object') return null;
  const b = value as Record<string, unknown>;
  // Map back to the panel field names and run the shared sanitiser.
  return sanitizeBranding({
    name: b.name,
    logo_url: b.logoUrl,
    favicon_url: b.faviconUrl,
    primary_color: b.primaryColor,
    login_message: b.loginMessage,
    support_email: b.supportEmail,
  });
}

async function fetchBranding(query: string): Promise<{ enabled: boolean; branding: Branding | null }> {
  const res = await fetch(`/api/branding${query}`, { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(String(res.status));
  const data = (await res.json()) as Partial<BrandingResponse>;
  return { enabled: data.enabled !== false, branding: revalidate(data.branding) };
}

const effective = (domainBranding: Branding | null, hostBranding: Branding | null) =>
  domainBranding ?? hostBranding;

let domainSeq = 0;

export const useBrandingStore = create<BrandingState>()((set, get) => ({
  branding: null,
  hostBranding: null,
  domainBranding: null,
  domain: null,
  hostRequested: false,
  enabled: null,

  loadForHost: async () => {
    if (get().enabled === false || get().hostRequested) return;
    set({ hostRequested: true });
    try {
      const { enabled, branding } = await fetchBranding('');
      set((s) => ({ enabled, hostBranding: branding, branding: effective(s.domainBranding, branding) }));
    } catch {
      set({ hostRequested: false }); // allow a retry later
    }
  },

  loadForEmail: async (email) => {
    const domain = domainFromEmail(email);
    if (!domain || get().enabled === false || get().domain === domain) return;
    const seq = ++domainSeq;
    set({ domain });
    try {
      const { enabled, branding } = await fetchBranding(`?domain=${encodeURIComponent(domain)}`);
      if (seq !== domainSeq) return; // superseded by a newer lookup
      set((s) => ({ enabled, domainBranding: branding, branding: effective(branding, s.hostBranding) }));
    } catch {
      if (seq !== domainSeq) return;
      set((s) => ({ domain: null, domainBranding: null, branding: s.hostBranding }));
    }
  },

  clearDomain: () => {
    domainSeq++;
    set((s) => ({ domain: null, domainBranding: null, branding: s.hostBranding }));
  },
}));
