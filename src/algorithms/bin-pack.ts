export interface PackInput {
  id: string;
  width: number;
  height: number;
}

export interface PackPlacement {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface PackResult {
  width: number;
  height: number;
  placements: PackPlacement[];
}

/**
 * Packs a set of variable-sized rectangles into a single atlas using
 * the Shelf (Next Fit Decreasing Height) algorithm.
 *
 * @param rects Array of rectangles to pack, each with a unique `id`, `width`, and `height`.
 * @param padding Optional pixel spacing between items (default 0).
 * @returns The total atlas dimensions and the placed coordinates for each input rectangle.
 */
export function packRectangles(rects: PackInput[], padding: number = 0): PackResult {
  if (rects.length === 0) {
    return { width: 0, height: 0, placements: [] };
  }

  // Sort by height descending (tallest first) for optimal shelf utilization.
  // Secondary sort by width descending for tie-breaking.
  const sorted = [...rects].sort((a, b) => {
    if (b.height !== a.height) return b.height - a.height;
    return b.width - a.width;
  });

  const placements: PackPlacement[] = [];

  // Shelf state
  let shelfX = 0; // Current X cursor on the active shelf
  let shelfY = 0; // Y origin of the active shelf
  let shelfHeight = 0; // Height of the tallest item on the active shelf
  let maxWidth = 0; // Widest shelf encountered (determines atlas width)

  // We need a max width constraint to know when to wrap to a new shelf.
  // A good heuristic: use the ceiling of sqrt(total area) as the target width.
  let totalArea = 0;
  for (const r of sorted) {
    totalArea += (r.width + padding) * (r.height + padding);
  }
  const targetWidth = Math.max(
    Math.ceil(Math.sqrt(totalArea)),
    sorted[0].width + padding, // At minimum, must fit the widest rect
  );

  for (const rect of sorted) {
    const paddedW = rect.width + padding;
    const paddedH = rect.height + padding;

    // Does it fit on the current shelf?
    if (shelfX + paddedW > targetWidth && shelfX > 0) {
      // Close the current shelf, open a new one
      shelfY += shelfHeight + padding;
      shelfX = 0;
      shelfHeight = 0;
    }

    // Place the rect
    placements.push({
      id: rect.id,
      x: shelfX,
      y: shelfY,
      width: rect.width,
      height: rect.height,
    });

    // Update shelf state
    if (paddedH > shelfHeight) {
      shelfHeight = paddedH;
    }
    shelfX += paddedW;

    if (shelfX > maxWidth) {
      maxWidth = shelfX;
    }
  }

  // Final atlas height is the bottom of the last shelf
  const totalHeight = shelfY + shelfHeight;

  // Strip trailing padding from dimensions
  const atlasWidth = maxWidth > padding ? maxWidth - padding : maxWidth;
  const atlasHeight = totalHeight > padding ? totalHeight - padding : totalHeight;

  return {
    width: atlasWidth,
    height: atlasHeight,
    placements,
  };
}
