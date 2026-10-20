/**
 * White-label branding: shared types and validation helpers.
 *
 * Branding data comes from an external panel (BRANDING_URL). Everything in
 * here treats that data as untrusted: values are type-checked, length-capped,
 * stripped of control characters, URLs are restricted to http(s) and colours
 * to hex notation. Anything invalid is dropped (set to null) rather than
 * rejected wholesale, so a single bad field never breaks the page.
 *
 * This module is isomorphic (used by the API route and the client store).
 */

export interface Branding {
  name: string;
  logoUrl: string | null;
  faviconUrl: string | null;
  /** Normalised 6-digit lowercase hex, e.g. "#0055aa". */
  primaryColor: string | null;
  /** Plain text only; never rendered as HTML. */
  loginMessage: string | null;
  supportEmail: string | null;
}

export interface BrandingResponse {
  /** false when BRANDING_URL is not configured on the server. */
  enabled: boolean;
  /** null means "use the default look". */
  branding: Branding | null;
}

export const MAX_NAME_LENGTH = 80;
export const MAX_LOGIN_MESSAGE_LENGTH = 500;
export const MAX_URL_LENGTH = 2048;

const HOSTNAME_RE = /^(?=.{1,253}$)(?!-)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)*[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
const DOMAIN_RE = /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;
const HEX_COLOR_RE = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;
const EMAIL_RE = /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]{1,64}@(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/i;
// C0/C1 control characters and bidi overrides; newlines are handled separately.
// eslint-disable-next-line no-control-regex
const CONTROL_RE = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F‪-‮⁦-⁩]/g;

/** Plain-text sanitiser: strips control chars, collapses whitespace, caps length. */
export function sanitizeText(value: unknown, maxLength: number, allowNewlines = false): string | null {
  if (typeof value !== 'string') return null;
  let text = value.replace(CONTROL_RE, '');
  text = allowNewlines
    ? text.replace(/\r\n?/g, '\n').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n')
    : text.replace(/\s+/g, ' ');
  text = text.trim();
  if (!text) return null;
  return text.length > maxLength ? text.slice(0, maxLength).trimEnd() : text;
}

/** Only absolute http(s) URLs without credentials are accepted. */
export function sanitizeUrl(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > MAX_URL_LENGTH) return null;
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
  if (url.username || url.password) return null;
  return url.toString();
}

/** Accepts #rgb or #rrggbb; returns normalised lowercase #rrggbb or null. */
export function sanitizeHexColor(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!HEX_COLOR_RE.test(trimmed)) return null;
  let hex = trimmed.slice(1).toLowerCase();
  if (hex.length === 3) hex = hex.split('').map((c) => c + c).join('');
  return `#${hex}`;
}

export function sanitizeEmail(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (trimmed.length > 254 || !EMAIL_RE.test(trimmed)) return null;
  return trimmed;
}

/**
 * Validates the panel's JSON payload. Returns null when it is not an object
 * or has no usable name (a brand without a name is treated as "unknown").
 */
export function sanitizeBranding(raw: unknown): Branding | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const data = raw as Record<string, unknown>;
  const name = sanitizeText(data.name, MAX_NAME_LENGTH);
  if (!name) return null;
  return {
    name,
    logoUrl: sanitizeUrl(data.logo_url),
    faviconUrl: sanitizeUrl(data.favicon_url),
    primaryColor: sanitizeHexColor(data.primary_color),
    loginMessage: sanitizeText(data.login_message, MAX_LOGIN_MESSAGE_LENGTH, true),
    supportEmail: sanitizeEmail(data.support_email),
  };
}

/** Lowercases a Host header value and strips the port; null if invalid. */
export function normalizeHost(value: string | null | undefined): string | null {
  if (!value) return null;
  // Host headers may carry a comma-separated list when forwarded; use the first.
  let host = value.split(',')[0].trim().toLowerCase();
  if (host.startsWith('[')) return null; // IPv6 literals never carry branding
  host = host.replace(/:\d+$/, '').replace(/\.$/, '');
  return HOSTNAME_RE.test(host) ? host : null;
}

/** Validates a bare domain (e.g. the part after "@"). */
export function normalizeDomain(value: string | null | undefined): string | null {
  if (!value) return null;
  const domain = value.trim().toLowerCase().replace(/\.$/, '');
  return DOMAIN_RE.test(domain) ? domain : null;
}

/** Extracts and validates the domain of an email address. */
export function domainFromEmail(email: string | null | undefined): string | null {
  if (!email) return null;
  const at = email.lastIndexOf('@');
  if (at < 1) return null;
  return normalizeDomain(email.slice(at + 1));
}

// ---------------------------------------------------------------------------
// Colour helpers (WCAG 2.x relative luminance / contrast ratio)
// ---------------------------------------------------------------------------

function channel(c: number): number {
  const s = c / 255;
  return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
}

export function relativeLuminance(hex: string): number {
  const n = sanitizeHexColor(hex);
  if (!n) return 0;
  const r = parseInt(n.slice(1, 3), 16);
  const g = parseInt(n.slice(3, 5), 16);
  const b = parseInt(n.slice(5, 7), 16);
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

/** Picks white or near-black text, whichever contrasts more with `bg`. */
export function readableForeground(bg: string): string {
  return contrastRatio(bg, '#ffffff') >= contrastRatio(bg, '#0f172a') ? '#ffffff' : '#0f172a';
}

/** Theme backgrounds from app/globals.css (:root and .dark). */
export const THEME_BACKGROUNDS = { light: '#ffffff', dark: '#0a0a0a' } as const;

/** WCAG 1.4.11 minimum contrast for UI components against adjacent colours. */
export const MIN_UI_CONTRAST = 3;

/**
 * CSS custom properties to apply for a brand colour in the given theme, or
 * null when the colour would not stand out enough from that theme's
 * background (the theme default is then kept).
 */
export function brandColorVars(
  color: string | null,
  theme: 'light' | 'dark',
): Record<string, string> | null {
  const hex = sanitizeHexColor(color);
  if (!hex) return null;
  if (contrastRatio(hex, THEME_BACKGROUNDS[theme]) < MIN_UI_CONTRAST) return null;
  return {
    '--color-primary': hex,
    '--color-primary-foreground': readableForeground(hex),
    '--color-ring': hex,
  };
}

export const BRAND_CSS_VARS = ['--color-primary', '--color-primary-foreground', '--color-ring'] as const;
