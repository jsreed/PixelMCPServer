import { describe, it, expect } from 'vitest';
import { rgbaToHsl, hslToRgba, generateHslRamp } from './color-utils.js';

describe('rgbaToHsl', () => {
  it('converts red correctly', () => {
    const result = rgbaToHsl(255, 0, 0, 255);
    expect(result.h).toBeCloseTo(0, 1);
    expect(result.s).toBeCloseTo(1, 5);
    expect(result.l).toBeCloseTo(0.5, 5);
    expect(result.a).toBe(255);
  });

  it('converts green correctly', () => {
    const result = rgbaToHsl(0, 255, 0, 255);
    expect(result.h).toBeCloseTo(120, 1);
    expect(result.s).toBeCloseTo(1, 5);
    expect(result.l).toBeCloseTo(0.5, 5);
    expect(result.a).toBe(255);
  });

  it('converts blue correctly', () => {
    const result = rgbaToHsl(0, 0, 255, 255);
    expect(result.h).toBeCloseTo(240, 1);
    expect(result.s).toBeCloseTo(1, 5);
    expect(result.l).toBeCloseTo(0.5, 5);
    expect(result.a).toBe(255);
  });

  it('converts white correctly', () => {
    const result = rgbaToHsl(255, 255, 255, 255);
    expect(result.h).toBeCloseTo(0, 1);
    expect(result.s).toBeCloseTo(0, 5);
    expect(result.l).toBeCloseTo(1, 5);
    expect(result.a).toBe(255);
  });

  it('converts black correctly', () => {
    const result = rgbaToHsl(0, 0, 0, 255);
    expect(result.h).toBeCloseTo(0, 1);
    expect(result.s).toBeCloseTo(0, 5);
    expect(result.l).toBeCloseTo(0, 5);
    expect(result.a).toBe(255);
  });

  it('passes alpha through unchanged', () => {
    const result = rgbaToHsl(255, 0, 0, 128);
    expect(result.a).toBe(128);
  });
});

describe('hslToRgba', () => {
  it('converts red correctly', () => {
    expect(hslToRgba(0, 1, 0.5, 255)).toEqual([255, 0, 0, 255]);
  });

  it('converts green correctly', () => {
    expect(hslToRgba(120, 1, 0.5, 255)).toEqual([0, 255, 0, 255]);
  });

  it('converts blue correctly', () => {
    expect(hslToRgba(240, 1, 0.5, 255)).toEqual([0, 0, 255, 255]);
  });

  it('converts white correctly', () => {
    expect(hslToRgba(0, 0, 1, 255)).toEqual([255, 255, 255, 255]);
  });

  it('converts black correctly', () => {
    expect(hslToRgba(0, 0, 0, 255)).toEqual([0, 0, 0, 255]);
  });

  it('treats H=360 same as H=0', () => {
    expect(hslToRgba(360, 1, 0.5, 255)).toEqual(hslToRgba(0, 1, 0.5, 255));
  });

  it('roundtrips several saturated colors within ±1', () => {
    const testCases: Array<[number, number, number, number]> = [
      [255, 0, 0, 255],
      [0, 255, 0, 255],
      [0, 0, 255, 255],
      [255, 128, 0, 255],
      [128, 0, 255, 255],
    ];
    for (const [r, g, b, a] of testCases) {
      const hsl = rgbaToHsl(r, g, b, a);
      const [rOut, gOut, bOut, aOut] = hslToRgba(hsl.h, hsl.s, hsl.l, hsl.a);
      expect(Math.abs(rOut - r)).toBeLessThanOrEqual(1);
      expect(Math.abs(gOut - g)).toBeLessThanOrEqual(1);
      expect(Math.abs(bOut - b)).toBeLessThanOrEqual(1);
      expect(aOut).toBe(a);
    }
  });
});

describe('generateHslRamp', () => {
  it('produces correct count of entries', () => {
    const ramp = generateHslRamp([255, 0, 0, 255], [0, 0, 255, 255], 5, 0, 0);
    expect(ramp.length).toBe(5);
  });

  it('with no shift, count=3 between red and blue passes through purple/magenta range', () => {
    const ramp = generateHslRamp([255, 0, 0, 255], [0, 0, 255, 255], 3, 0, 0);
    // Midpoint hue is 300 (going the short way: red=0, blue=240 → shortest arc diff = -120 → mid = 300 = magenta)
    // h1=0, h2=240, diff = 240-0=240 > 180 → diff becomes 240-360=-120 → h = 0 + (-120)*0.5 = -60 → normalize = 300
    expect(ramp.length).toBe(3);
    // Spread into a fixed tuple so TypeScript treats the elements as defined
    const [, mid] = ramp;
    expect(mid).toBeDefined();
    // Magenta (h=300) has both red and blue channels
    expect(mid[0]).toBeGreaterThan(100); // red channel
    expect(mid[2]).toBeGreaterThan(100); // blue channel
  });

  it('with hueShiftStart=30, start shifts hue before interpolating', () => {
    // Red (h=0) shifted by 30 → yellow-orange (h=30)
    const rampShifted = generateHslRamp([255, 0, 0, 255], [0, 0, 255, 255], 3, 30, 0);
    const rampPlain = generateHslRamp([255, 0, 0, 255], [0, 0, 255, 255], 3, 0, 0);
    // First entry should differ because start hue was rotated
    expect(rampShifted[0]).not.toEqual(rampPlain[0]);
  });

  it('with count=2 returns shifted endpoints only', () => {
    const ramp = generateHslRamp([255, 0, 0, 255], [0, 0, 255, 255], 2, 0, 0);
    expect(ramp.length).toBe(2);
    // Spread to access elements as defined tuples
    const [first, last] = ramp;
    // First should be red (no shift)
    expect(first[0]).toBeGreaterThan(200);
    expect(first[2]).toBeLessThan(50);
    expect(first[1]).toBeLessThan(50);
    // Last should be blue (no shift)
    expect(last[2]).toBeGreaterThan(200);
    expect(last[0]).toBeLessThan(50);
    expect(last[1]).toBeLessThan(50);
  });

  it('endpoints match the source colors within ±1 when no hue shift applied', () => {
    const ramp = generateHslRamp([255, 0, 0, 255], [0, 255, 0, 255], 5, 0, 0);
    // Access via destructuring to get TypeScript to see these as defined
    const [start, , , , end] = ramp;
    expect(start[0]).toBeGreaterThan(254); // red ≈ 255
    expect(start[1]).toBeLessThan(1); // green ≈ 0
    expect(start[2]).toBeLessThan(1); // blue ≈ 0
    expect(start[3]).toBe(255);
    expect(end[0]).toBeLessThan(1); // red ≈ 0
    expect(end[1]).toBeGreaterThan(254); // green ≈ 255
    expect(end[2]).toBeLessThan(1); // blue ≈ 0
    expect(end[3]).toBe(255);
  });

  it('handles count=1 edge case without error', () => {
    const ramp = generateHslRamp([255, 0, 0, 255], [0, 0, 255, 255], 1, 0, 0);
    expect(ramp.length).toBe(1);
    // t=0, so result should be the start color
    const [first] = ramp;
    expect(first[0]).toBeGreaterThan(200);
    expect(first[3]).toBe(255);
  });

  it('hue shift of 120 on red yields green-ish start', () => {
    const ramp = generateHslRamp([255, 0, 0, 255], [255, 0, 0, 255], 1, 120, 120);
    // Red shifted 120° → green
    const [first] = ramp;
    expect(first[1]).toBeGreaterThan(200); // green channel dominant
    expect(first[0]).toBeLessThan(50); // red channel low
    expect(first[2]).toBeLessThan(50); // blue channel low
  });
});
