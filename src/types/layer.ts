/**
 * Core types for Document Layers.
 *
 * Layers represent the stacking planes within an Asset.
 * They are organized hierarchically (GroupLayers can optionally contain others,
 * though the parent/child relationship is recorded in the Asset's layer array order
 * rather than nesting objects directly in these types).
 */

/**
 * Common properties shared by all layer types.
 */
export interface BaseLayer {
    /** Unique identifier for the layer within the asset */
    id: number;
    /** Display name of the layer */
    name: string;
    /** The ID of the parent GroupLayer, if nested. */
    parent_id?: number;
    /** Whether the layer is currently visible in the editor/exports */
    visible: boolean;
    /** Opacity level (0 = transparent, 255 = fully opaque) */
    opacity: number;
}

/**
 * An Image Layer contains pixel data.
 */
export interface ImageLayer extends BaseLayer {
    type: 'image';
}

/**
 * A Tilemap Layer contains a grid of tile indices.
 */
export interface TilemapLayer extends BaseLayer {
    type: 'tilemap';
}

/**
 * A Shape Layer contains non-rendered collision geometry.
 * Stores named rect/polygon shapes per frame for hitboxes, hurtboxes,
 * navigation regions, etc.
 */
export interface ShapeLayer extends BaseLayer {
    type: 'shape';
    /** Free string classifying the purpose, e.g. "hitbox", "hurtbox" */
    role: string;
    /** Godot physics layer number (1-32) */
    physics_layer: number;
}

/**
 * A Group Layer acts as a folder to organize other layers.
 */
export interface GroupLayer extends BaseLayer {
    type: 'group';
}

/**
 * A Layer is a discriminated union of the four concrete layer types.
 */
export type Layer = ImageLayer | TilemapLayer | ShapeLayer | GroupLayer;
