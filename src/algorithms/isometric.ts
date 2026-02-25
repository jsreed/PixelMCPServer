/**
 * Isometric projection helpers — dimetric 2:1 formula.
 *
 * Coordinate system:
 *   col  — grid column (increases to the right-down on screen)
 *   row  — grid row    (increases to the left-down on screen)
 *   elevation — vertical stack offset (increases upward on screen)
 *
 * The formula maps tile-grid coords to pixel coords such that each tile
 * appears as a rhombus (diamond) with width = tile_width and height = tile_height.
 *
 * From design.md §2.2.4:
 *   screen_x = (col − row) × (tile_width  / 2)
 *   screen_y = (col + row) × (tile_height / 2) − elevation × tile_height
 */

export interface IsoPoint {
  x: number;
  y: number;
}

/**
 * Project iso-grid (col, row, elevation) to pixel (x, y).
 * All results are rounded to integer pixels for crisp drawing.
 */
export function isoToPixel(
  col: number,
  row: number,
  elevation: number,
  tileWidth: number,
  tileHeight: number,
): IsoPoint {
  const x = Math.round((col - row) * (tileWidth / 2));
  const y = Math.round((col + row) * (tileHeight / 2) - elevation * tileHeight);
  return { x, y };
}

/**
 * Returns the pixel vertices of a flat isometric rhombus (tile top face).
 * Vertices go clockwise starting from the left tip:
 *   left → top → right → bottom
 *
 * @param origin  Pixel origin returned by isoToPixel (top-left of the rhombus bounding box)
 * @param tileWidth  Full pixel width  of one tile (the horizontal span of the rhombus)
 * @param tileHeight Full pixel height of one tile (the vertical span of the rhombus)
 */
export function isoRhombusVertices(
  origin: IsoPoint,
  tileWidth: number,
  tileHeight: number,
): [IsoPoint, IsoPoint, IsoPoint, IsoPoint] {
  const hw = Math.floor(tileWidth / 2);
  const hh = Math.floor(tileHeight / 2);

  return [
    { x: origin.x, y: origin.y + hh }, // left tip
    { x: origin.x + hw, y: origin.y }, // top tip
    { x: origin.x + tileWidth - 1, y: origin.y + hh }, // right tip
    { x: origin.x + hw, y: origin.y + tileHeight - 1 }, // bottom tip
  ];
}

/**
 * Rasterises a filled isometric rhombus (top face) into a list of {x, y} pixels
 * using horizontal scanline filling between the four rhombus edges.
 */
export function isoFillRhombus(
  origin: IsoPoint,
  tileWidth: number,
  tileHeight: number,
): IsoPoint[] {
  const hw = tileWidth / 2;
  const hh = tileHeight / 2;

  const pixels: IsoPoint[] = [];

  for (let dy = 0; dy < tileHeight; dy++) {
    // Horizontal half-width at this row (linear interpolation through the diamond)
    const halfW =
      dy < hh
        ? (dy + 1) * (hw / hh) // upper half: widening
        : (tileHeight - dy) * (hw / hh); // lower half: narrowing

    const startX = Math.round(origin.x + hw - halfW);
    const endX = Math.round(origin.x + hw + halfW) - 1;

    for (let px = startX; px <= endX; px++) {
      pixels.push({ x: px, y: origin.y + dy });
    }
  }

  return pixels;
}
