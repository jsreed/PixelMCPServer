/**
 * Core types for Document Tags.
 *
 * Tags label ranges of frames (for animation sequences) or sets of layers
 * (for organization/export groups).
 */

/**
 * Playback direction for a frame tag animation sequence.
 */
export type Direction = 'forward' | 'reverse' | 'ping_pong';

/**
 * Screen-facing direction for directional character sprites (e.g., isometric/top-down).
 * Maps to substitution tokens during export.
 */
export type Facing = 'N' | 'NE' | 'E' | 'SE' | 'S' | 'SW' | 'W' | 'NW';

/**
 * A label applied to a contiguous sequence of frames.
 */
export interface FrameTag {
    type: 'frame';
    /** Name of the sequence (e.g. "idle", "walk") */
    name: string;
    /** 0-based index of the first frame in the sequence */
    start: number;
    /** 0-based index of the last frame in the sequence (inclusive) */
    end: number;
    /** Playback progression */
    direction: Direction;
    /** Optional orientation indicator for directional sprites */
    facing?: Facing;
}

/**
 * A label applied to an arbitrary set of layers.
 */
export interface LayerTag {
    type: 'layer';
    /** Name of the layer group (e.g. "armor", "base_body") */
    name: string;
    /** Array of layer IDs included in this tag */
    layers: number[];
}

/**
 * A Tag is a discriminated union of Frame and Layer tags.
 */
export type Tag = FrameTag | LayerTag;
