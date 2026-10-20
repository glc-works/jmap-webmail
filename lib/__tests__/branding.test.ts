import { describe, it, expect } from 'vitest';
import {
  brandColorVars,
  contrastRatio,
  domainFromEmail,
  normalizeDomain,
  normalizeHost,
  readableForeground,
  sanitizeBranding,
  sanitizeHexColor,
  sanitizeText,
  sanitizeUrl,
} from '../branding';

describe('branding validation', () => {
  it('accepts #rgb and #rrggbb only, normalising to lowercase 6 digits', () => {
    expect(sanitizeHexColor('#0055AA')).toBe('#0055aa');
    expect(sanitizeHexColor(' #0af ')).toBe('#00aaff');
    for (const bad of ['0055aa', '#0055aa80', '#ggg', 'red', 'rgb(0,0,0)', '#05a;x', '', null, 42]) {
      expect(sanitizeHexColor(bad)).toBeNull();
    }
  });

  it('accepts only http(s) URLs without credentials', () => {
    expect(sanitizeUrl('https://cdn.test/logo.png')).toBe('https://cdn.test/logo.png');
    expect(sanitizeUrl('http://cdn.test/logo.svg')).toBe('http://cdn.test/logo.svg');
    for (const bad of [
      'javascript:alert(1)',
      'data:image/svg+xml,<svg/>',
      '//cdn.test/x.png',
      '/relative.png',
      'https://user:pw@cdn.test/x.png',
      'ftp://cdn.test/x.png',
      'https://' + 'a'.repeat(3000) + '.test',
      123,
    ]) {
      expect(sanitizeUrl(bad)).toBeNull();
    }
  });

  it('keeps text plain: strips control and bidi characters and caps length', () => {
    expect(sanitizeText('  a\u0000b‮c  ', 10)).toBe('abc');
    expect(sanitizeText('line1\n\n\n\nline2', 50, true)).toBe('line1\n\nline2');
    expect(sanitizeText('line1\nline2', 50)).toBe('line1 line2');
    expect(sanitizeText('x'.repeat(20), 5)).toBe('xxxxx');
    expect(sanitizeText('<b>hi</b>', 50)).toBe('<b>hi</b>'); // rendered as text, not HTML
  });

  it('sanitizeBranding rejects non-objects and nameless payloads', () => {
    expect(sanitizeBranding(null)).toBeNull();
    expect(sanitizeBranding([])).toBeNull();
    expect(sanitizeBranding('x')).toBeNull();
    expect(sanitizeBranding({ name: 5 })).toBeNull();
    expect(sanitizeBranding({ name: 'Acme' })).toEqual({
      name: 'Acme',
      logoUrl: null,
      faviconUrl: null,
      primaryColor: null,
      loginMessage: null,
      supportEmail: null,
    });
  });

  it('normalises hosts and domains', () => {
    expect(normalizeHost('WebMail.Example.COM:8443')).toBe('webmail.example.com');
    expect(normalizeHost('a.test, b.test')).toBe('a.test');
    expect(normalizeHost('localhost')).toBe('localhost');
    expect(normalizeHost('[::1]:3000')).toBeNull();
    expect(normalizeHost('bad_host!')).toBeNull();
    expect(normalizeDomain('Example.co.id.')).toBe('example.co.id');
    expect(normalizeDomain('localhost')).toBeNull();
    expect(domainFromEmail('User@PT-A.co.id')).toBe('pt-a.co.id');
    expect(domainFromEmail('no-at-sign')).toBeNull();
    expect(domainFromEmail('@x.test')).toBeNull();
  });
});

describe('branding colours', () => {
  it('computes WCAG contrast', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 0);
    expect(contrastRatio('#ffffff', '#ffffff')).toBeCloseTo(1, 5);
  });

  it('picks a readable foreground for the primary colour', () => {
    expect(readableForeground('#0055aa')).toBe('#ffffff');
    expect(readableForeground('#ffdd00')).toBe('#0f172a');
  });

  it('applies the colour only where it contrasts with the theme background', () => {
    expect(brandColorVars('#0055aa', 'light')).toEqual({
      '--color-primary': '#0055aa',
      '--color-primary-foreground': '#ffffff',
      '--color-ring': '#0055aa',
    });
    // Dark navy is invisible on the dark background -> keep theme default.
    expect(brandColorVars('#0055aa', 'dark')).toBeNull();
    // Very light yellow is invisible on white -> keep theme default there.
    expect(brandColorVars('#fff7cc', 'light')).toBeNull();
    expect(brandColorVars('#fff7cc', 'dark')).not.toBeNull();
    expect(brandColorVars('not-a-colour', 'light')).toBeNull();
    expect(brandColorVars(null, 'light')).toBeNull();
  });
});
