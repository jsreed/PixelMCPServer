import type { Shape } from './shape.js';

/**
 * Core types for Document Cels.
 *
 * A Cel is the intersection of a Layer and a Frame. It contains the actual
 * content (pixels, tiles, or shapes) for that specific point in time on that layer.
 */

/**
 * An Image Cel contains an indexed color pixel array and a local 2D offset.
 */
export interface ImageCel {
    /** X offset relative to the asset canvas origin */
    x: number;
    /** Y offset relative to the asset canvas origin */
    y: number;
    /**
     * 2D array of palette indices [y][x] representing the pixel data.
     * width = data[0].length (if data.length > 0)
     * height = data.length
     */
    data: number[][];
}

/**
 * A Tilemap Cel contains a grid of tile indices referring to a linked tileset.
 */
export interface TilemapCel {
    /**
     * 2D array of tile indices [y][x] representing the cell layout.
     * -1 represents an empty cell.
     * Note: The cel does not have an independent offset; it inherently aligns
     * to the asset's global tile grid.
     */
    grid: number[][];
}

/**
 * A Shape Cel contains collision geometry (rectangles and polygons).
 */
export interface ShapeCel {
    /** Array of geometric shapes defined on this layer/frame intersection */
    shapes: Shape[];
}

/**
 * A Linked Cel creates a reference to another cel on the same layer, allowing
 * properties to be shared across frames (e.g. static backgrounds).
 */
export interface LinkedCel {
    /**
     * The cel key of the referenced source cel, formatted as "{layer_id}/{source_frame_index}"
     */
    link: string;
}

/**
 * A Cel is a discriminated union of the four possible cel states.
 * We use the unique property keys ('data', 'grid', 'shapes', 'link') to discriminate.
 */
export type Cel = ImageCel | TilemapCel | ShapeCel | LinkedCel;

/**
 * Construct the string key used to index cels within an Asset.
 * Format is "{layerId}/{frameIndex}".
 */
export function packCelKey(layerId: number, frameIndex: number): string {
    return `${String(layerId)}/${String(frameIndex)}`;
}

/**
 * Parse a cel key string back into its layerId and frameIndex components.
 * Returns null if the key is structurally invalid.
 */
export function parseCelKey(key: string): { layerId: number; frameIndex: number } | null {
    const parts = key.split('/');
    if (parts.length !== 2) return null;

    const layerId = parseInt(parts[0], 10);
    const frameIndex = parseInt(parts[1], 10);

    if (Number.isNaN(layerId) || Number.isNaN(frameIndex)) return null;

    return { layerId, frameIndex };
}
