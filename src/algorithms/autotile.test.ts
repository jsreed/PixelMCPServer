import { describe, it, expect } from 'vitest';
import { getCanonicalSlots, assignPeeringBits } from './autotile.js';

describe('Autotile Algorithms', () => {
  describe('getCanonicalSlots', () => {
    it('should generate 47 slots for blob47', () => {
      const slots = getCanonicalSlots('blob47');
      expect(slots.length).toBe(47);

      // Known slot indices
      expect(slots).toContain(0); // Isolated
      expect(slots).toContain(255); // Interior
      expect(slots).toContain(85); // Orthogonal interior (N+E+S+W, no corners: 1+4+16+64=85)
      expect(slots).toContain(21); // N+E+S peninsula (1+4+16)

      // Check an invalid one (e.g. diagonal without orthogonals)
      // NE (2) but no N (1) or E (4)
      expect(slots).not.toContain(2);
      // All corners set (NE+SE+SW+NW=170) but no orthogonals — invalid
      expect(slots).not.toContain(170);
    });

    it('should generate 16 slots for 4side', () => {
      const slots = getCanonicalSlots('4side');
      expect(slots.length).toBe(16);

      expect(slots).toContain(0);
      expect(slots).toContain(1); // N
      expect(slots).toContain(85); // N+E+S+W

      // No diagonals
      expect(slots).not.toContain(2);
    });

    it('should generate 16 slots for 4corner', () => {
      const slots = getCanonicalSlots('4corner');
      expect(slots.length).toBe(16);

      expect(slots).toContain(0);
      expect(slots).toContain(2); // NE
      expect(slots).toContain(170); // NE+SE+SW+NW (2+8+32+128=170)

      // No orthogonals
      expect(slots).not.toContain(1);
    });
  });

  describe('assignPeeringBits', () => {
    it('should correctly assign bits for blob47 isolated tile', () => {
      const bits = assignPeeringBits(0, 'blob47');
      expect(bits).toEqual({
        top: -1,
        top_right: -1,
        right: -1,
        bottom_right: -1,
        bottom: -1,
        bottom_left: -1,
        left: -1,
        top_left: -1,
      });
    });

    it('should correctly assign bits for blob47 interior tile', () => {
      const bits = assignPeeringBits(255, 'blob47');
      expect(bits).toEqual({
        top: 0,
        top_right: 0,
        right: 0,
        bottom_right: 0,
        bottom: 0,
        bottom_left: 0,
        left: 0,
        top_left: 0,
      });
    });

    it('should correctly assign bits for blob47 orthogonal interior tile', () => {
      const bits = assignPeeringBits(85, 'blob47');
      expect(bits).toEqual({
        top: 0,
        top_right: -1,
        right: 0,
        bottom_right: -1,
        bottom: 0,
        bottom_left: -1,
        left: 0,
        top_left: -1,
      });
    });

    it('should correctly assign bits for 4side interior tile', () => {
      const bits = assignPeeringBits(85, '4side');
      expect(bits).toEqual({
        top: 0,
        right: 0,
        bottom: 0,
        left: 0,
      });
    });

    it('should correctly assign bits for 4side N-only tile (slot 1)', () => {
      // N=1: only top is connected
      const bits = assignPeeringBits(1, '4side');
      expect(bits).toEqual({
        top: 0,
        right: -1,
        bottom: -1,
        left: -1,
      });
    });

    it('should correctly assign bits for 4corner interior tile', () => {
      const bits = assignPeeringBits(170, '4corner');
      expect(bits).toEqual({
        top_right: 0,
        bottom_right: 0,
        bottom_left: 0,
        top_left: 0,
      });
    });

    it('should correctly assign bits for 4corner NE-only tile (slot 2)', () => {
      // NE=2: only top_right is connected
      const bits = assignPeeringBits(2, '4corner');
      expect(bits).toEqual({
        top_right: 0,
        bottom_right: -1,
        bottom_left: -1,
        top_left: -1,
      });
    });
  });
});
