export type BandingSeverity = 'low' | 'medium' | 'high';

export interface BandingRegion {
  x: number;
  y: number;
  width: number;
  height: number;
  severity: BandingSeverity;
  description: string;
}

interface Run {
  color: number;
  length: number;
  start: number; // x for horizontal, y for vertical
}

/**
 * Scans a 2D image layer for "banding" artifacts (flat, un-dithered staircase color gradients).
 *
 * @param width The width of the image.
 * @param height The height of the image.
 * @param getPixel A function returning the palette index (or any numerical color ID) at `(x, y)`.
 * @returns An array of bounding boxes indicating regions with detected banding clusters.
 */
export function detectBanding(
  width: number,
  height: number,
  getPixel: (x: number, y: number) => number | null,
): BandingRegion[] {
  const regions: BandingRegion[] = [];

  // Banding heuristic configuration
  const MIN_BANDS_FOR_DETECTION = 3;
  const MIN_RUN_LENGTH = 2; // Single pixels don't constitute a flat "band"

  // To prevent reporting the exact same banding artifact multiple times (e.g. adjacent rows),
  // we'll track the bounding boxes of found artifacts and merge or ignore overlaps.
  const addRegion = (
    x: number,
    y: number,
    w: number,
    h: number,
    numBands: number,
    contrast: number,
    direction: 'horizontal' | 'vertical',
  ) => {
    let severity: BandingSeverity = 'low';

    // Base severity on both band count and index contrast distance
    if (numBands >= 6 || contrast >= 12) severity = 'high';
    else if (numBands >= 4 || contrast >= 6) severity = 'medium';

    // Check for overlaps (or adjacency) to merge
    let merged = false;
    for (const r of regions) {
      // Check if bounds touch or overlap (using <= to allow adjacency mapping)
      if (x <= r.x + r.width && x + w >= r.x && y <= r.y + r.height && y + h >= r.y) {
        // Expand the existing region bounding box
        const newX = Math.min(r.x, x);
        const newY = Math.min(r.y, y);
        r.width = Math.max(r.x + r.width, x + w) - newX;
        r.height = Math.max(r.y + r.height, y + h) - newY;
        r.x = newX;
        r.y = newY;

        // Upgrade severity if necessary
        if (severity === 'high' || (severity === 'medium' && r.severity === 'low')) {
          r.severity = severity;
        }

        merged = true;
        break;
      }
    }

    if (!merged) {
      regions.push({
        x,
        y,
        width: w,
        height: h,
        severity,
        description: `Detected ${numBands} flat ${direction} bands forming a rigid staircase gradient (contrast delta: ${contrast}).`,
      });
    }
  };

  /**
   * Reusable logic to evaluate an extracted sequence of runs for monotonic staircases.
   */
  const evaluateRuns = (runs: Run[], isHorizontal: boolean, staticCoord: number) => {
    if (runs.length < MIN_BANDS_FOR_DETECTION) return;

    let sequenceStartIdx = 0;
    let pDelta = 0; // The direction of the palette index change (+ or -)
    let lastRunLength = runs[0].length;

    for (let i = 1; i < runs.length; i++) {
      const prev = runs[i - 1];
      const curr = runs[i];

      // Ignore transparent or null pixels (assuming index 0 usually transparent, or null)
      // But we actually only care if it's a null boundary.
      if (curr.color === null || prev.color === null) {
        sequenceStartIdx = i; // Reset
        pDelta = 0;
        continue;
      }

      const currentDelta = curr.color - prev.color;
      const isMonotonic =
        (pDelta === 0 && currentDelta !== 0) || Math.sign(currentDelta) === Math.sign(pDelta);
      const isRigidStaircase =
        curr.length >= MIN_RUN_LENGTH &&
        prev.length >= MIN_RUN_LENGTH &&
        Math.abs(curr.length - lastRunLength) <= 2; // Allow slight jitter in width

      if (isMonotonic && isRigidStaircase && Math.abs(currentDelta) < 10) {
        // Enforce it's a gradient (colors are close in index value)
        if (pDelta === 0) pDelta = currentDelta;
      } else {
        // Sequence broke. Did we find one?
        const seqLength = i - sequenceStartIdx;
        if (seqLength >= MIN_BANDS_FOR_DETECTION) {
          const startRun = runs[sequenceStartIdx];
          const endRun = runs[i - 1];
          const runSpan = endRun.start + endRun.length - startRun.start;
          const contrast = Math.abs(endRun.color - startRun.color);

          if (isHorizontal) {
            addRegion(startRun.start, staticCoord, runSpan, 1, seqLength, contrast, 'horizontal');
          } else {
            addRegion(staticCoord, startRun.start, 1, runSpan, seqLength, contrast, 'vertical');
          }
        }

        // Reset for next sequence
        sequenceStartIdx = i;
        pDelta = 0;
      }
      lastRunLength = curr.length;
    }

    // Check end of array
    const seqLength = runs.length - sequenceStartIdx;
    if (seqLength >= MIN_BANDS_FOR_DETECTION) {
      const startRun = runs[sequenceStartIdx];
      const endRun = runs[runs.length - 1];
      const runSpan = endRun.start + endRun.length - startRun.start;
      const contrast = Math.abs(endRun.color - startRun.color);

      if (isHorizontal) {
        addRegion(startRun.start, staticCoord, runSpan, 1, seqLength, contrast, 'horizontal');
      } else {
        addRegion(staticCoord, startRun.start, 1, runSpan, seqLength, contrast, 'vertical');
      }
    }
  };

  // 1. Horizontal Sweep
  for (let y = 0; y < height; y++) {
    const runs: Run[] = [];
    let currentColor = getPixel(0, y);
    let currentLength = 1;

    for (let x = 1; x < width; x++) {
      const color = getPixel(x, y);
      if (color === currentColor) {
        currentLength++;
      } else {
        if (currentColor !== null) {
          runs.push({ color: currentColor, length: currentLength, start: x - currentLength });
        }
        currentColor = color;
        currentLength = 1;
      }
    }
    if (currentColor !== null) {
      runs.push({ color: currentColor, length: currentLength, start: width - currentLength });
    }

    evaluateRuns(runs, true, y);
  }

  // 2. Vertical Sweep
  for (let x = 0; x < width; x++) {
    const runs: Run[] = [];
    let currentColor = getPixel(x, 0);
    let currentLength = 1;

    for (let y = 1; y < height; y++) {
      const color = getPixel(x, y);
      if (color === currentColor) {
        currentLength++;
      } else {
        if (currentColor !== null) {
          runs.push({ color: currentColor, length: currentLength, start: y - currentLength });
        }
        currentColor = color;
        currentLength = 1;
      }
    }
    if (currentColor !== null) {
      runs.push({ color: currentColor, length: currentLength, start: height - currentLength });
    }

    evaluateRuns(runs, false, x);
  }

  return regions;
}
