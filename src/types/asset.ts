import type { Palette } from './palette.js';
import type { Layer } from './layer.js';
import type { Frame } from './frame.js';
import type { Cel } from './cel.js';
import type { Tag } from './tag.js';

/**
 * Visual perspective configuration for an Asset.
 * Defines the drawing convention and unlocks projection-aware tools.
 */
export type Perspective = 'flat' | 'top_down' | 'top_down_3/4' | 'isometric';

/**
 * Anchor positions used for resizing canvas bounds.
 */
export type Anchor = 'top_left' | 'top_center' | 'top_right' | 'center_left' | 'center' | 'center_right' | 'bottom_left' | 'bottom_center' | 'bottom_right';


/**
 * Core type for a complete Asset document.
 * Represents a single art file loaded in the workspace.
 */
export interface Asset {
    /** Logical name of the asset within the project */
    name: string;
    /** Canvas width in pixels */
    width: number;
    /** Canvas height in pixels */
    height: number;
    /** Projection orientation used for tool helpers */
    perspective: Perspective;

    /** Indexed color swatches */
    palette: Palette;
    /** Ordered list of layer definitions (back to front) */
    layers: Layer[];
    /** Ordered list of timeline frames */
    frames: Frame[];
    /** Dense or sparse mapping of Cel keys ("{layerId}/{frameIndex}") to content data */
    cels: Record<string, Cel>;
    /** Animation sequences and layer groups */
    tags: Tag[];

    // --- Optional Fields (primarily for Tilesets) ---

    /** Pixel width of an individual tile */
    tile_width?: number;
    /** Pixel height of an individual tile */
    tile_height?: number;
    /** Total number of allocated tiles in the source image */
    tile_count?: number;
    /** Whether the tileset includes physics metadata (reserved for export features) */
    tile_physics?: boolean;
    /** Whether the tileset includes terrain bitmasking (reserved for auto-tiling features) */
    tile_terrain?: boolean;
}
