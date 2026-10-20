"use client";

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useBrandingStore } from '@/stores/branding-store';
import { cn } from '@/lib/utils';

interface BrandMarkProps {
  className?: string;
  /** Hide the name and show only the logo (e.g. collapsed sidebar). */
  compact?: boolean;
}

/**
 * Tenant logo + name from white-label branding. Renders nothing when no
 * brand is active, so the default layout is unchanged.
 */
export function BrandMark({ className, compact = false }: BrandMarkProps) {
  const branding = useBrandingStore((s) => s.branding);
  const t = useTranslations('branding');
  const [failedLogo, setFailedLogo] = useState<string | null>(null);

  if (!branding) return null;
  const showLogo = branding.logoUrl && failedLogo !== branding.logoUrl;
  if (compact && !showLogo) return null;

  return (
    <div className={cn('flex items-center gap-2 min-w-0', className)} data-testid="brand-mark">
      {showLogo && (
        <img
          src={branding.logoUrl!}
          alt={t('logo_alt', { name: branding.name })}
          className="h-7 w-auto max-w-[8rem] object-contain flex-shrink-0"
          referrerPolicy="no-referrer"
          onError={() => setFailedLogo(branding.logoUrl)}
        />
      )}
      {!compact && (
        <span className="font-semibold text-sm text-foreground truncate" title={branding.name}>
          {branding.name}
        </span>
      )}
    </div>
  );
}
