/**
 * Core type for the active Workspace selection.
 *
 * The Workspace maintains at most one active selection at a time.
 * The selection acts as an operation mask for drawing and effects.
 */

export interface SelectionMask {
  /** The specific asset this selection applies to */
  asset_name: string;
  /** The specific layer this selection applies to */
  layer_id: number;
  /** The specific frame this selection applies to */
  frame_index: number;

  /** X coordinate of the top-left corner of the selection bounding box */
  x: number;
  /** Y coordinate of the top-left corner of the selection bounding box */
  y: number;
  /** Width of the selection bounding box in pixels */
  width: number;
  /** Height of the selection bounding box in pixels */
  height: number;

  /**
   * Dense 2D array of booleans representing the uncompressed selection mask
   * within the bounding box. `mask[row][col]` is `true` if the pixel at
   * `target_cel(x + col, y + row)` is actively selected.
   *
   * Dimensions are `height` rows by `width` columns.
   */
  mask: boolean[][];
}
