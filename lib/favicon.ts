/**
 * Shared helpers for the <link rel="icon"> element, which is mutated by both
 * the unread badge (hooks/use-favicon-badge) and white-label branding
 * (components/providers/branding-provider).
 */

export function getIconLinks(): HTMLLinkElement[] {
  if (typeof document === 'undefined') return [];
  return Array.from(document.querySelectorAll<HTMLLinkElement>("link[rel~='icon']"));
}

/**
 * The href the link had before anyone touched it. Recorded on the element the
 * first time it is asked for, so every caller restores the same pristine icon.
 */
export function getDefaultFaviconHref(link: HTMLLinkElement): string {
  if (link.dataset.defaultHref === undefined) {
    link.dataset.defaultHref = link.href;
  }
  return link.dataset.defaultHref;
}
