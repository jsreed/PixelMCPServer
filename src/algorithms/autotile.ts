export type AutotilePattern = 'blob47' | '4side' | '4corner';

export interface PeeringBits {
  top?: number;
  top_right?: number;
  right?: number;
  bottom_right?: number;
  bottom?: number;
  bottom_left?: number;
  left?: number;
  top_left?: number;
}

const N = 1;
const NE = 2;
const E = 4;
const SE = 8;
const S = 16;
const SW = 32;
const W = 64;
const NW = 128;

/**
 * Computes canonical slot indices for a given autotile pattern.
 * A slot index directly corresponds to the bitmask of its neighbors.
 */
export function getCanonicalSlots(pattern: AutotilePattern): number[] {
  const slots: number[] = [];

  for (let i = 0; i < 256; i++) {
    let isValid = false;

    if (pattern === 'blob47') {
      // Must have orthogonal neighbors for each corner
      const hasNE = (i & NE) !== 0;
      const hasSE = (i & SE) !== 0;
      const hasSW = (i & SW) !== 0;
      const hasNW = (i & NW) !== 0;

      const validNE = !hasNE || ((i & N) !== 0 && (i & E) !== 0);
      const validSE = !hasSE || ((i & E) !== 0 && (i & S) !== 0);
      const validSW = !hasSW || ((i & S) !== 0 && (i & W) !== 0);
      const validNW = !hasNW || ((i & N) !== 0 && (i & W) !== 0);

      if (validNE && validSE && validSW && validNW) {
        isValid = true;
      }
    } else if (pattern === '4side') {
      // Only N, E, S, W bits are allowed
      isValid = (i & ~(N | E | S | W)) === 0;
    } else {
      // 4corner: Only NE, SE, SW, NW bits are allowed
      isValid = (i & ~(NE | SE | SW | NW)) === 0;
    }

    if (isValid) {
      slots.push(i);
    }
  }

  return slots;
}

/**
 * Assigns peering bits for Godot's CellNeighbor interface.
 * Omitted keys are considered missing (or unassigned by Godot's terrain logic).
 * A value of 0 means connected, -1 means not connected.
 */
export function assignPeeringBits(slotIndex: number, pattern: AutotilePattern): PeeringBits {
  const isConnected = (bit: number) => ((slotIndex & bit) !== 0 ? 0 : -1);
  const result: PeeringBits = {};

  if (pattern === 'blob47') {
    result.top = isConnected(N);
    result.top_right = isConnected(NE);
    result.right = isConnected(E);
    result.bottom_right = isConnected(SE);
    result.bottom = isConnected(S);
    result.bottom_left = isConnected(SW);
    result.left = isConnected(W);
    result.top_left = isConnected(NW);
  } else if (pattern === '4side') {
    result.top = isConnected(N);
    result.right = isConnected(E);
    result.bottom = isConnected(S);
    result.left = isConnected(W);
  } else {
    result.top_right = isConnected(NE);
    result.bottom_right = isConnected(SE);
    result.bottom_left = isConnected(SW);
    result.top_left = isConnected(NW);
  }

  return result;
}
