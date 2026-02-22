/**
 * Core types for the pixelmcp.json Project configuration file.
 *
 * This represents the structural layout and conventions of the user's workspace
 * on disk, mapping logical asset names to physical files.
 */

/**
 * An entry in the project's asset registry.
 * Maps a logical name to either a single file or a dictionary of fit variants.
 */
export interface AssetRegistryEntry {
    /** Free string classifying the asset (e.g., "character", "weapon", "tileset") */
    type: string;

    /** Physical filepath relative to pixelmcp.json. Used if there are no variants. */
    path?: string;
    /** Map of variant names (e.g., "standard", "slim") to physical filepaths */
    variants?: Record<string, string>;

    /** Optional tracking field noting this asset is a palette-swap of another logical asset */
    recolor_of?: string;
}

/**
 * Naming conventions and generation rules for the project.
 */
export interface ProjectConventions {
    /** Template string controlling generated export filenames (e.g., "{name}_{tag}_{direction}") */
    export_pattern?: string;
}

/**
 * Default settings applied when creating new assets.
 */
export interface ProjectDefaults {
    /** Default width for new tilesets */
    tile_width?: number;
    /** Default height for new tilesets */
    tile_height?: number;
    /** Default scale multiplier for exports */
    export_scale?: number;
    /** Default palette (Lospec slug or relative filepath) mapped to index 0-255 */
    palette?: string;
}

/**
 * The complete structure of the pixelmcp.json file.
 */
export interface ProjectConfig {
    /** Schema version, e.g., "1.0" */
    pixelmcp_version: string;
    /** Display name of the project */
    name: string;
    /** ISO 8601 creation timestamp */
    created?: string;

    /** Project-wide rules and patterns */
    conventions?: ProjectConventions;
    /** Fallback properties for new structural elements */
    defaults?: ProjectDefaults;

    /** Dictionary mapping logical asset names to their registry entries */
    assets: Record<string, AssetRegistryEntry>;
}
