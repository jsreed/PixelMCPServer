import type { Palette } from './palette.js';
import type { Layer } from './layer.js';
import type { Frame } from './frame.js';
import type { Cel } from './cel.js';
import type { Tag } from './tag.js';

/**
 * Visual perspective configuration for an Asset.
 * Defines the drawing convention and unlocks projection-aware tools.
 * The design spec defines this as a free string with well-known values.
 */
export type Perspective = string;

/**
 * Anchor positions used for resizing canvas bounds.
 */
export type Anchor =
  | 'top_left'
  | 'top_center'
  | 'top_right'
  | 'center_left'
  | 'center'
  | 'center_right'
  | 'bottom_left'
  | 'bottom_center'
  | 'bottom_right';

// --- Tileset metadata types ---

/**
 * Physics layer configuration for a tileset.
 */
export interface TilePhysicsLayer {
  collision_layer: number;
  collision_mask: number;
}

/**
 * Physics data for an individual tile slot.
 * Polygons are in tile-local pixel coordinates.
 */
export interface TilePhysicsEntry {
  polygon?: [number, number][];
  navigation_polygon?: [number, number][];
}

/**
 * Per-tile collision and navigation polygon data for a tileset.
 * Populated by `tileset set_tile_physics`, consumed by `export godot_tileset`.
 */
export interface TilePhysics {
  physics_layers: TilePhysicsLayer[];
  tiles: Record<string, TilePhysicsEntry>;
}

/**
 * Peering bit assignments for a single tile slot.
 * Values are terrain IDs (0+) or -1 (no connection).
 * Direction keys map to Godot CellNeighbor constants.
 */
export interface TilePeeringBits {
  top: number;
  top_right: number;
  right: number;
  bottom_right: number;
  bottom: number;
  bottom_left: number;
  left: number;
  top_left: number;
}

/**
 * Autotile terrain metadata for a tileset.
 * Populated by `tileset autotile_generate`, consumed by `export godot_tileset`.
 */
export interface TileTerrain {
  pattern: 'blob47' | '4side' | '4corner';
  terrain_name: string;
  peering_bits: Record<string, TilePeeringBits>;
}

// --- Animated tile metadata types ---

/**
 * Animation metadata for a single animated tile slot.
 * Tile animation frames are laid out horizontally in the atlas,
 * starting from the tile's base position.
 */
export interface TileAnimationEntry {
  /** Number of animation frames (must be >= 1) */
  frame_count: number;
  /** Per-frame duration in milliseconds */
  frame_duration_ms: number;
  /** Horizontal pixel gap between animation frames in the atlas */
  separation: number;
}

/**
 * Per-tile animation metadata for a tileset.
 * Keys are tile slot index strings (e.g., "0", "3").
 * Populated by `tileset set_tile_animation`, consumed by `export godot_tileset`.
 */
export type TileAnimation = Record<string, TileAnimationEntry>;

// --- Tile custom data types ---

/**
 * Definition of a single custom data layer in the tileset.
 * Corresponds to a Godot TileSet custom_data_layer definition.
 */
export interface TileCustomDataLayer {
  name: string;
  type: 'string' | 'int' | 'float' | 'bool';
}

/**
 * Per-tile custom data storage for a tileset.
 * `layers` defines the schema (ordered list of named+typed layers).
 * `tiles` maps tile slot index strings to their custom data values,
 * keyed by data layer name.
 * Populated by `tileset set_tile_data`, consumed by `export godot_tileset`.
 */
export interface TileCustomData {
  layers: TileCustomDataLayer[];
  tiles: Record<string, Record<string, string | number | boolean>>;
}

// --- Nine-slice metadata types ---

/**
 * Nine-slice scaling margins for a UI panel asset.
 * All values are in pixels and define the inset from each edge.
 */
export interface NineSlice {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

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
  /** Per-tile collision and navigation polygon data */
  tile_physics?: TilePhysics;
  /** Autotile terrain bitmask metadata */
  tile_terrain?: TileTerrain;
  /** Per-tile animation metadata for animated tiles */
  tile_animation?: TileAnimation;
  /** Per-tile custom data for gameplay metadata */
  tile_custom_data?: TileCustomData;

  // --- Optional Fields (UI Art) ---

  /** Nine-slice scaling margins for UI panel export */
  nine_slice?: NineSlice;
}
