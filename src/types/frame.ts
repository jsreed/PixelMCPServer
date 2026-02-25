/**
 * Core types for Document Frames.
 *
 * Frames represent discrete points in time for animation.
 */

export interface Frame {
  /** 0-based index of this frame in the asset's animation timeline */
  index: number;
  /** Duration in milliseconds this frame should be displayed when animating */
  duration_ms: number;
}
