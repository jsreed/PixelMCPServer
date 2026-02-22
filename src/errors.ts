/**
 * Shared Error Factory for PixelMCPServer domain errors.
 *
 * Implements the error catalog defined in design.md §2.6.
 * All functions are pure and return the structured MCP error response shape directly,
 * allowing tool handlers to do:
 *   return errors.assetNotLoaded(name);
 */

/**
 * The standard MCP error response shape for domain errors.
 * Tool handlers return this object. The LLM reads the text and can self-correct.
 */
export interface DomainErrorResponse {
    isError: true;
    content: Array<{ type: 'text'; text: string }>;
}

/**
 * Base helper to construct a DomainErrorResponse from a message string.
 */
export function domainError(message: string): DomainErrorResponse {
    return {
        isError: true,
        content: [{ type: 'text', text: message }],
    };
}

export function invalidArgument(message: string): DomainErrorResponse {
    return domainError(`Invalid argument: ${message}`);
}

// ----------------------------------------------------------------------------
// project
// ----------------------------------------------------------------------------

export function noProjectLoaded(): DomainErrorResponse {
    return domainError('No project loaded. Call project init or project open first.');
}

export function projectFileNotFound(path: string): DomainErrorResponse {
    return domainError(`Project file not found: ${path}`);
}

// ----------------------------------------------------------------------------
// workspace
// ----------------------------------------------------------------------------

export function assetNotInRegistry(name: string): DomainErrorResponse {
    return domainError(`Asset '${name}' not found in project registry.`);
}

export function assetFileNotFound(path: string): DomainErrorResponse {
    return domainError(`Asset file not found: ${path}`);
}

// Applies to both workspace and asset tools
export function assetNotLoaded(name: string): DomainErrorResponse {
    return domainError(`Asset '${name}' is not loaded in the workspace.`);
}

// ----------------------------------------------------------------------------
// asset
// ----------------------------------------------------------------------------

export function layerIsShapeLayer(id: number): DomainErrorResponse {
    return domainError(`Layer ${String(id)} is a shape layer. Use asset get_shapes to read shape data.`);
}

export function layerNotFound(id: number, name: string): DomainErrorResponse {
    return domainError(`Layer ${String(id)} does not exist in asset '${name}'.`);
}

export function frameOutOfRange(index: number, name: string, count: number): DomainErrorResponse {
    return domainError(`Frame ${String(index)} is out of range. Asset '${name}' has ${String(count)} frame(s).`);
}

export function notAGroupLayer(id: number): DomainErrorResponse {
    return domainError(`Layer ${String(id)} is not a group layer and cannot be a parent.`);
}

export function notAnImageLayer(id: number): DomainErrorResponse {
    return domainError(`Layer ${String(id)} is not an image layer. Provide an image layer as the pixel source.`);
}

export function noShapeLayerFound(name: string): DomainErrorResponse {
    return domainError(`No target shape layer specified and no hitbox shape layer found in asset '${name}'.`);
}

export function notAShapeLayer(id: number): DomainErrorResponse {
    return domainError(`Layer ${String(id)} is not a shape layer.`);
}

export function noRecolorPaletteSource(): DomainErrorResponse {
    return domainError(`At least one palette source (palette_file, palette_slug, or palette_entries) is required for create_recolor.`);
}

// ----------------------------------------------------------------------------
// draw & effect
// ----------------------------------------------------------------------------

export function colorOutOfRange(color: number): DomainErrorResponse {
    return domainError(`Color index ${String(color)} is out of range (0–255).`);
}

export function writePixelsDimensionMismatch(dw: number, dh: number, w: number, h: number): DomainErrorResponse {
    return domainError(`write_pixels data dimensions (${String(dw)}×${String(dh)}) do not match declared width×height (${String(w)}×${String(h)}).`);
}

// ----------------------------------------------------------------------------
// palette
// ----------------------------------------------------------------------------

export function paletteIndexOutOfRange(index: number): DomainErrorResponse {
    return domainError(`Palette index ${String(index)} is out of range (0–255).`);
}

export function invalidColor(): DomainErrorResponse {
    return domainError('Invalid RGBA color. Expected [r, g, b, a] with each channel 0–255.');
}

export function paletteIndexNoColor(index: number): DomainErrorResponse {
    return domainError(`Palette index ${String(index)} has no color defined. Set it before generating a ramp.`);
}

export function generateRampInvalidOrder(): DomainErrorResponse {
    return domainError('generate_ramp requires color1 < color2.');
}

export function lospecNotFound(slug: string): DomainErrorResponse {
    return domainError(`Lospec palette '${slug}' not found or API unavailable.`);
}

export function paletteFileNotFound(path: string): DomainErrorResponse {
    return domainError(`Palette file not found: ${path}`);
}

export function invalidPaletteFile(path: string): DomainErrorResponse {
    return domainError(`Invalid palette file: ${path}. Expected { name, colors } with colors as [[r,g,b,a], ...].`);
}

// ----------------------------------------------------------------------------
// tileset
// ----------------------------------------------------------------------------

export function notATileset(name: string): DomainErrorResponse {
    return domainError(`Asset '${name}' has no tile dimensions. Create the asset with tile_width/tile_height via asset create.`);
}

export function autotilePatternRequired(): DomainErrorResponse {
    return domainError('autotile_generate requires a pattern (blob47, 4side, or 4corner).');
}

export function tileIndexNotFound(index: number, name: string): DomainErrorResponse {
    return domainError(`Tile index ${String(index)} does not exist in tileset '${name}'.`);
}

// ----------------------------------------------------------------------------
// export
// ----------------------------------------------------------------------------

export function cannotWritePath(path: string): DomainErrorResponse {
    return domainError(`Cannot write to path: ${path}`);
}

// ----------------------------------------------------------------------------
// selection
// ----------------------------------------------------------------------------

export function clipboardEmpty(): DomainErrorResponse {
    return domainError('Clipboard is empty. Copy or cut a selection first.');
}

export function targetAssetNotLoaded(name: string): DomainErrorResponse {
    return domainError(`Target asset '${name}' is not loaded in the workspace.`);
}
