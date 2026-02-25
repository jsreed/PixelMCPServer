/**
 * Core types for Shape Geometry.
 *
 * Shapes are stored in ShapeLayers (via ShapeCels) to define
 * non-rendered collision geometry like hitboxes, hurtboxes,
 * or navigation regions.
 */

/**
 * A 2D coordinate pair [x, y], relative to the asset canvas origin.
 */
export type Point = [number, number];

/**
 * Common properties for all geometric shapes.
 */
export interface BaseShape {
  /** Identifier/label for the shape (e.g., "head_hitbox") */
  name: string;
}

/**
 * An axis-aligned bounding box.
 */
export interface RectShape extends BaseShape {
  type: 'rect';
  /** X coordinate of the top-left corner */
  x: number;
  /** Y coordinate of the top-left corner */
  y: number;
  /** Width in pixels */
  width: number;
  /** Height in pixels */
  height: number;
}

/**
 * An arbitrary polygon defined by a sequence of points.
 */
export interface PolygonShape extends BaseShape {
  type: 'polygon';
  /** Array of [x, y] vertices defining the polygon outline */
  points: Point[];
}

/**
 * A Shape is a discriminated union of supported geometry types.
 */
export type Shape = RectShape | PolygonShape;
