export type JaggySeverity = 'low' | 'medium' | 'high';

export interface Jaggy {
  x: number;
  y: number;
  severity: JaggySeverity;
  suggestion: string;
}

// 8-connected neighbor offsets [dx, dy]
const NEIGHBORS_8: [number, number][] = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
  [1, 1],
  [-1, 1],
  [1, -1],
  [-1, -1],
];

// 4-connected neighbor offsets [dx, dy]
const NEIGHBORS_4: [number, number][] = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

interface Coord {
  x: number;
  y: number;
}

interface DirectionalRun {
  dx: number;
  dy: number;
  length: number;
  startX: number;
  startY: number;
}

/**
 * Returns true if a pixel at (x, y) is an edge pixel — non-null and borders at least one
 * orthogonally adjacent pixel of a different color (or null/transparent).
 */
function isEdgePixel(
  x: number,
  y: number,
  color: number,
  width: number,
  height: number,
  getPixel: (x: number, y: number) => number | null,
): boolean {
  for (const [dx, dy] of NEIGHBORS_4) {
    const nx = x + dx;
    const ny = y + dy;
    if (nx < 0 || nx >= width || ny < 0 || ny >= height) {
      // Out of bounds counts as a different boundary
      return true;
    }
    const neighbor = getPixel(nx, ny);
    if (neighbor !== color) {
      return true;
    }
  }
  return false;
}

/**
 * Traces a connected chain of same-color edge pixels starting from (startX, startY)
 * using 8-connected traversal. Marks visited pixels as it goes.
 * Prefers continuing in the current direction for coherent paths.
 */
function traceEdgeSegment(
  startX: number,
  startY: number,
  color: number,
  width: number,
  height: number,
  getPixel: (x: number, y: number) => number | null,
  visited: Set<string>,
): Coord[] {
  const segment: Coord[] = [];
  const key = (x: number, y: number) => `${String(x)},${String(y)}`;

  // BFS-like but preferring direction continuity
  // Use a queue for breadth-first traversal
  const queue: Coord[] = [{ x: startX, y: startY }];
  visited.add(key(startX, startY));

  while (queue.length > 0) {
    const curr = queue.shift();
    if (curr === undefined) break;
    segment.push(curr);

    // Try 8-connected neighbors
    for (const [dx, dy] of NEIGHBORS_8) {
      const nx = curr.x + dx;
      const ny = curr.y + dy;
      const nk = key(nx, ny);
      if (visited.has(nk)) continue;
      if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
      if (getPixel(nx, ny) !== color) continue;
      if (!isEdgePixel(nx, ny, color, width, height, getPixel)) continue;
      visited.add(nk);
      queue.push({ x: nx, y: ny });
    }
  }

  return segment;
}

/**
 * Decomposes a segment (ordered list of coords) into directional runs, then evaluates
 * run-length consistency to detect jaggies.
 */
function analyzeRunLengths(
  segment: Coord[],
  getPixel: (x: number, y: number) => number | null,
): Jaggy[] {
  if (segment.length < 4) return [];

  // Sort segment by a consistent traversal order (left-to-right, top-to-bottom)
  const sorted = [...segment].sort((a, b) => (a.y !== b.y ? a.y - b.y : a.x - b.x));

  // Build directional runs by scanning the sorted sequence.
  // Only step between 8-adjacent pixels (|rawDx|≤1, |rawDy|≤1); non-adjacent jumps reset state.
  const runs: DirectionalRun[] = [];

  const flushRun = (dx: number, dy: number, len: number, sx: number, sy: number) => {
    if (len > 0 && (dx !== 0 || dy !== 0)) {
      runs.push({ dx, dy, length: len, startX: sx, startY: sy });
    }
  };

  let runStart = sorted[0];
  let runDx = 0;
  let runDy = 0;
  let runLength = 0;

  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1];
    const curr = sorted[i];
    const rawDx = curr.x - prev.x;
    const rawDy = curr.y - prev.y;

    // If pixels are not 8-adjacent, flush and reset — this is a non-contiguous jump in the sort
    if (Math.abs(rawDx) > 1 || Math.abs(rawDy) > 1) {
      flushRun(runDx, runDy, runLength, runStart.x, runStart.y);
      runStart = curr;
      runDx = 0;
      runDy = 0;
      runLength = 0;
      continue;
    }

    const dx = Math.sign(rawDx);
    const dy = Math.sign(rawDy);

    if (runLength === 0) {
      // Starting a new run
      runStart = prev;
      runDx = dx;
      runDy = dy;
      runLength = 1;
    } else if (dx === runDx && dy === runDy) {
      // Same direction, extend run
      runLength++;
    } else {
      // Direction changed — flush and start new run
      flushRun(runDx, runDy, runLength, runStart.x, runStart.y);
      runStart = prev;
      runDx = dx;
      runDy = dy;
      runLength = 1;
    }
  }

  // Flush final run
  flushRun(runDx, runDy, runLength, runStart.x, runStart.y);

  if (runs.length < 2) return [];

  // Perfect lines (purely horizontal, vertical, or 45-degree) are never jaggies
  const uniqueDirections = new Set(runs.map((r) => `${String(r.dx)},${String(r.dy)}`));
  if (uniqueDirections.size === 1) return [];

  // Check for pure 2:1 consistency (all runs at same step counts, same direction pair)
  const lengths = runs.map((r) => r.length);
  const lengthCounts = new Map<number, number>();
  for (const l of lengths) {
    lengthCounts.set(l, (lengthCounts.get(l) ?? 0) + 1);
  }

  // Find mode (most common run length)
  let modeLength = 1;
  let modeCount = 0;
  for (const [len, count] of lengthCounts) {
    if (count > modeCount || (count === modeCount && len > modeLength)) {
      modeCount = count;
      modeLength = len;
    }
  }

  const jaggies: Jaggy[] = [];

  // Check if the direction pattern is consistent 2:1 (only 2 alternating dirs)
  if (uniqueDirections.size === 2 && lengths.every((l) => l === modeLength)) {
    // Perfectly consistent slope — not a jaggy
    return [];
  }

  // Analyze each run for deviations from the mode
  for (let i = 0; i < runs.length; i++) {
    const run = runs[i];
    const deviation = Math.abs(run.length - modeLength);
    if (deviation === 0) continue;

    // Get the pixel at this run's transition point for context
    const px = run.startX;
    const py = run.startY;

    // Gather neighbor color info for suggestion
    let neighborColor: number | null = null;
    for (const [dx, dy] of NEIGHBORS_4) {
      const nc = getPixel(px + dx, py + dy);
      if (nc !== null && nc !== getPixel(px, py)) {
        neighborColor = nc;
        break;
      }
    }

    const selfColor = getPixel(px, py);
    const selfColorStr = selfColor !== null ? String(selfColor) : 'null';
    const neighborColorStr = neighborColor !== null ? String(neighborColor) : 'transparent';

    let severity: JaggySeverity;
    let suggestion: string;

    // High severity: abrupt direction change (run of 1 among runs of 4+)
    if (run.length === 1 && modeLength >= 4) {
      severity = 'high';
      suggestion = `Single-pixel staircase at (${String(px)},${String(py)}); consider adding an intermediate pixel between color indices ${selfColorStr} and ${neighborColorStr}.`;
    } else if (
      // High severity: 1-pixel notch on otherwise smooth edge
      run.length === 1 &&
      i > 0 &&
      i < runs.length - 1 &&
      runs[i - 1].length >= 3 &&
      runs[i + 1].length >= 3
    ) {
      severity = 'high';
      suggestion = `Single-pixel notch at (${String(px)},${String(py)}); remove the notch pixel or add a bridging pixel between color indices ${selfColorStr} and ${neighborColorStr}.`;
    } else if (
      deviation >= 2 ||
      (i > 0 &&
        Math.abs(runs[i - 1].length - modeLength) > 0 &&
        Math.abs(run.length - modeLength) > 0)
    ) {
      severity = 'medium';
      suggestion = `Run length ${String(run.length)} deviates from expected ${String(modeLength)} at (${String(px)},${String(py)}); color between indices ${selfColorStr} and ${neighborColorStr} may help smooth the transition.`;
    } else {
      severity = 'low';
      suggestion = `Minor step inconsistency at (${String(px)},${String(py)}); expected run length ${String(modeLength)}, got ${String(run.length)}. Color between indices ${selfColorStr} and ${neighborColorStr} may help.`;
    }

    jaggies.push({ x: px, y: py, severity, suggestion });
  }

  return jaggies;
}

/**
 * Scans a 2D image for jaggy artifacts using edge run-length analysis.
 *
 * @param width The width of the image.
 * @param height The height of the image.
 * @param getPixel Returns the palette index at (x, y), or null for transparent.
 * @returns An array of detected jaggy points with severity and suggestions.
 */
export function detectJaggies(
  width: number,
  height: number,
  getPixel: (x: number, y: number) => number | null,
): Jaggy[] {
  if (width === 0 || height === 0) return [];

  // Phase 1: Identify edge pixels
  const edgePixels = new Set<string>();
  const key = (x: number, y: number) => `${String(x)},${String(y)}`;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const color = getPixel(x, y);
      if (color === null) continue;
      if (isEdgePixel(x, y, color, width, height, getPixel)) {
        edgePixels.add(key(x, y));
      }
    }
  }

  if (edgePixels.size === 0) return [];

  // Phase 2: Trace edge segments (same-color connected chains)
  const visited = new Set<string>();
  const segments: Array<{ color: number; coords: Coord[] }> = [];

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const k = key(x, y);
      if (!edgePixels.has(k) || visited.has(k)) continue;

      const color = getPixel(x, y);
      if (color === null) continue;

      visited.add(k);
      const coords = traceEdgeSegment(x, y, color, width, height, getPixel, visited);
      if (coords.length >= 4) {
        segments.push({ color, coords });
      }
    }
  }

  // Phase 3: Analyze run-length consistency per segment
  const jaggyMap = new Map<string, Jaggy>();

  for (const { coords } of segments) {
    const found = analyzeRunLengths(coords, getPixel);
    for (const jaggy of found) {
      const k = key(jaggy.x, jaggy.y);
      const existing = jaggyMap.get(k);
      if (!existing) {
        jaggyMap.set(k, jaggy);
      } else {
        // Keep highest severity
        const severityRank = { low: 0, medium: 1, high: 2 };
        if (severityRank[jaggy.severity] > severityRank[existing.severity]) {
          jaggyMap.set(k, jaggy);
        }
      }
    }
  }

  // Phase 4: Detect notch pixels — single-pixel protrusions off an otherwise smooth edge.
  // A notch pixel is a dead-end (exactly 1 orthogonal edge neighbor) where that connection
  // is PERPENDICULAR to the parent's main run direction. This distinguishes notches from
  // legitimate line endpoints (which connect along the run direction).
  for (const { color, coords } of segments) {
    if (coords.length < 5) continue;
    const segSet = new Set(coords.map((c) => key(c.x, c.y)));

    // Record orthogonal edge neighbor positions (not just count) for each pixel
    const orthoNeighbors = new Map<
      string,
      Array<{ x: number; y: number; dx: number; dy: number }>
    >();
    for (const { x, y } of coords) {
      const neighbors: Array<{ x: number; y: number; dx: number; dy: number }> = [];
      for (const [dx, dy] of NEIGHBORS_4) {
        if (segSet.has(key(x + dx, y + dy))) {
          neighbors.push({ x: x + dx, y: y + dy, dx, dy });
        }
      }
      orthoNeighbors.set(key(x, y), neighbors);
    }

    for (const { x, y } of coords) {
      const myNeighbors = orthoNeighbors.get(key(x, y)) ?? [];
      // Dead-end: exactly 1 orthogonal edge neighbor
      if (myNeighbors.length !== 1) continue;

      // myNeighbors.length === 1 is guaranteed by the check above
      const first = myNeighbors[0];
      const toDx = first.dx;
      const toDy = first.dy;
      const parentK = key(x + toDx, y + toDy);
      const parentNeighbors = orthoNeighbors.get(parentK) ?? [];
      if (parentNeighbors.length < 2) continue;

      // Determine the parent's "run axis": check if its neighbors are along the same axis
      // (indicating a horizontal or vertical run), vs perpendicular.
      // If all parent neighbors lie along the axis perpendicular to the connection, it's a notch.
      // Connection axis: toDx/toDy. Parent run axis = perpendicular to connection.
      // If connection is vertical (dy≠0), parent should run horizontally (neighbors have dx≠0, dy=0).
      // If connection is horizontal (dx≠0), parent should run vertically (neighbors have dx=0, dy≠0).
      const connectionIsVertical = toDy !== 0;
      const otherParentNeighbors = parentNeighbors.filter(
        (n) => !(n.x === x && n.y === y), // exclude the notch pixel itself
      );
      if (otherParentNeighbors.length === 0) continue;

      // Check that the parent's other neighbors are along the perpendicular axis
      const parentRunsPerpendicular = otherParentNeighbors.every((n) =>
        connectionIsVertical ? n.dy === 0 : n.dx === 0,
      );
      if (!parentRunsPerpendicular) continue;

      const k = key(x, y);
      let neighborColor: number | null = null;
      for (const [dx, dy] of NEIGHBORS_4) {
        const nc = getPixel(x + dx, y + dy);
        if (nc !== null && nc !== color) {
          neighborColor = nc;
          break;
        }
      }
      const selfColorStr = String(color);
      const neighborColorStr = neighborColor !== null ? String(neighborColor) : 'transparent';
      const jaggy: Jaggy = {
        x,
        y,
        severity: 'high',
        suggestion: `Single-pixel notch at (${String(x)},${String(y)}); remove the isolated pixel or add a bridging pixel between color indices ${selfColorStr} and ${neighborColorStr}.`,
      };

      const existing = jaggyMap.get(k);
      if (!existing || existing.severity !== 'high') {
        jaggyMap.set(k, jaggy);
      }
    }
  }

  return Array.from(jaggyMap.values());
}
