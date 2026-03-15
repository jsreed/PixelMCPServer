/**
 * Pure HSL color conversion utilities for palette ramp generation.
 * No imports from classes/, tools/, or types/ — fully standalone.
 */

export interface HslColor {
  h: number; // 0-360 degrees
  s: number; // 0-1
  l: number; // 0-1
  a: number; // 0-255 (alpha preserved as integer)
}

/**
 * Converts RGBA (each 0-255) to HSL.
 * H: 0-360, S: 0-1, L: 0-1, A: passed through as 0-255.
 */
export function rgbaToHsl(r: number, g: number, b: number, a: number): HslColor {
  const rN = r / 255;
  const gN = g / 255;
  const bN = b / 255;

  const max = Math.max(rN, gN, bN);
  const min = Math.min(rN, gN, bN);
  const delta = max - min;

  const l = (max + min) / 2;

  let h = 0;
  let s = 0;

  if (delta !== 0) {
    s = delta / (1 - Math.abs(2 * l - 1));

    if (max === rN) {
      h = 60 * (((gN - bN) / delta) % 6);
    } else if (max === gN) {
      h = 60 * ((bN - rN) / delta + 2);
    } else {
      h = 60 * ((rN - gN) / delta + 4);
    }

    if (h < 0) {
      h += 360;
    }
  }

  return { h, s, l, a };
}

/**
 * Converts HSL back to RGBA integers 0-255.
 */
export function hslToRgba(
  h: number,
  s: number,
  l: number,
  a: number,
): [number, number, number, number] {
  // Normalize H to [0, 360) — handles negative values and values >= 360
  const hNorm = ((h % 360) + 360) % 360;

  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((hNorm / 60) % 2) - 1));
  const m = l - c / 2;

  let r1 = 0;
  let g1 = 0;
  let b1 = 0;

  if (hNorm < 60) {
    r1 = c;
    g1 = x;
    b1 = 0;
  } else if (hNorm < 120) {
    r1 = x;
    g1 = c;
    b1 = 0;
  } else if (hNorm < 180) {
    r1 = 0;
    g1 = c;
    b1 = x;
  } else if (hNorm < 240) {
    r1 = 0;
    g1 = x;
    b1 = c;
  } else if (hNorm < 300) {
    r1 = x;
    g1 = 0;
    b1 = c;
  } else {
    r1 = c;
    g1 = 0;
    b1 = x;
  }

  const rOut = Math.min(255, Math.max(0, Math.round((r1 + m) * 255)));
  const gOut = Math.min(255, Math.max(0, Math.round((g1 + m) * 255)));
  const bOut = Math.min(255, Math.max(0, Math.round((b1 + m) * 255)));

  return [rOut, gOut, bOut, a];
}

/**
 * Generates array of RGBA colors for an HSL ramp.
 * Applies hue shifts to endpoints, interpolates in HSL space with shortest-arc hue.
 * @param c1 Start color [r,g,b,a]
 * @param c2 End color [r,g,b,a]
 * @param count Total number of entries (including endpoints)
 * @param hueShiftStart Degrees to rotate start hue
 * @param hueShiftEnd Degrees to rotate end hue
 * @returns Array of [r,g,b,a] length=count
 */
export function generateHslRamp(
  c1: [number, number, number, number],
  c2: [number, number, number, number],
  count: number,
  hueShiftStart: number,
  hueShiftEnd: number,
): Array<[number, number, number, number]> {
  const hsl1 = rgbaToHsl(c1[0], c1[1], c1[2], c1[3]);
  const hsl2 = rgbaToHsl(c2[0], c2[1], c2[2], c2[3]);

  // Apply hue shifts and normalize to [0, 360)
  const h1 = (((hsl1.h + hueShiftStart) % 360) + 360) % 360;
  const h2 = (((hsl2.h + hueShiftEnd) % 360) + 360) % 360;

  const s1 = hsl1.s;
  const s2 = hsl2.s;
  const l1 = hsl1.l;
  const l2 = hsl2.l;
  const a1 = hsl1.a;
  const a2 = hsl2.a;

  // Shortest-arc hue difference
  let diff = h2 - h1;
  if (diff > 180) {
    diff -= 360;
  } else if (diff < -180) {
    diff += 360;
  }

  const result: Array<[number, number, number, number]> = [];

  for (let i = 0; i < count; i++) {
    const t = count === 1 ? 0 : i / (count - 1);

    const h = (((h1 + diff * t) % 360) + 360) % 360;
    const s = s1 + (s2 - s1) * t;
    const l = l1 + (l2 - l1) * t;
    const a = Math.round(a1 + (a2 - a1) * t);

    result.push(hslToRgba(h, s, l, a));
  }

  return result;
}
