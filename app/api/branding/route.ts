import { NextResponse } from 'next/server';
import { normalizeDomain, normalizeHost, type BrandingResponse } from '@/lib/branding';
import { isBrandingEnabled, resolveBranding, type BrandingLookup } from '@/lib/branding-server';

/**
 * White-label branding lookup.
 *
 *   GET /api/branding            -> brand for the request hostname
 *   GET /api/branding?domain=x   -> brand for an email domain
 *
 * Always answers 200 with { enabled, branding }; branding is null when the
 * feature is off (BRANDING_URL unset), the host/domain is unknown or invalid,
 * or the panel is unreachable. Only the hostname/domain is sent to the panel.
 */
export const dynamic = 'force-dynamic';

function json(body: BrandingResponse) {
  return NextResponse.json(body, {
    headers: {
      'Cache-Control': 'private, max-age=60',
      Vary: 'Host, X-Forwarded-Host',
    },
  });
}

export async function GET(request: Request) {
  if (!isBrandingEnabled()) {
    return json({ enabled: false, branding: null });
  }

  const { searchParams } = new URL(request.url);
  let lookup: BrandingLookup | null = null;

  if (searchParams.has('domain')) {
    const domain = normalizeDomain(searchParams.get('domain'));
    if (domain) lookup = { kind: 'domain', value: domain };
  } else {
    // Behind a reverse proxy the public hostname arrives in X-Forwarded-Host.
    const host = normalizeHost(
      request.headers.get('x-forwarded-host') || request.headers.get('host'),
    );
    if (host) lookup = { kind: 'host', value: host };
  }

  if (!lookup) {
    return json({ enabled: true, branding: null });
  }

  const branding = await resolveBranding(lookup);
  return json({ enabled: true, branding });
}
