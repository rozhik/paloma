/** WCAG 2 contrast maths for theme colors written as hex (`#rgb`, `#rgba`, `#rrggbb`, `#rrggbbaa`). */

export interface Rgba {
  r: number;
  g: number;
  b: number;
  /** 0..1 */
  a: number;
}

/** A hex color as RGBA (channels 0..255), or null when it is not a hex color. */
export function parseHex(hex: string): Rgba | null {
  const m = /^#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.exec(hex.trim());
  if (!m) return null;
  let digits = m[1];
  if (digits.length <= 4) digits = [...digits].map((d) => d + d).join('');
  const n = (i: number) => parseInt(digits.slice(i, i + 2), 16);
  return { r: n(0), g: n(2), b: n(4), a: digits.length === 8 ? n(6) / 255 : 1 };
}

/** A color drawn over an opaque background. */
export function composite(fg: Rgba, bg: Rgba): Rgba {
  const mix = (f: number, b: number) => f * fg.a + b * (1 - fg.a);
  return { r: mix(fg.r, bg.r), g: mix(fg.g, bg.g), b: mix(fg.b, bg.b), a: 1 };
}

/** WCAG relative luminance of an opaque color. */
export function luminance({ r, g, b }: Rgba): number {
  const lin = (c: number) => {
    const s = c / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

export const BLACK: Rgba = { r: 0, g: 0, b: 0, a: 1 };
export const WHITE: Rgba = { r: 255, g: 255, b: 255, a: 1 };

/**
 * WCAG contrast ratio (1..21) of a foreground over a background. A translucent background is laid over black
 * and over white, a translucent foreground over the result, and the worse ratio counts.
 */
export function contrast(fg: Rgba, bg: Rgba): number {
  const ratio = (a: Rgba, b: Rgba) => {
    const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
    return (hi + 0.05) / (lo + 0.05);
  };
  const grounds = bg.a < 1 ? [composite(bg, BLACK), composite(bg, WHITE)] : [bg];
  return Math.min(...grounds.map((ground) => ratio(composite(fg, ground), ground)));
}

/** Contrast of two hex colors; throws on anything else, so a theme must use hex. */
export function hexContrast(fg: string, bg: string): number {
  const f = parseHex(fg);
  const b = parseHex(bg);
  if (!f || !b) throw new Error(`Not a hex color: ${f ? bg : fg}`);
  return contrast(f, b);
}

/** `r, g, b` of a hex color, for Bootstrap's `--bs-*-rgb` variables. */
export function rgbTriple(hex: string): string | null {
  const c = parseHex(hex);
  return c ? `${c.r}, ${c.g}, ${c.b}` : null;
}
