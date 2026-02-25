import * as fs from 'fs/promises';
import { type Palette, isValidColor } from '../types/palette.js';
import * as errors from '../errors.js';

export interface PaletteFileData {
  name: string;
  colors: Palette;
}

/**
 * Validates that an object structurally matches PaletteFileData.
 * Also strictly validates the color array up to 256 entries.
 */
function validatePaletteStructure(data: any): data is PaletteFileData {
  if (!data || typeof data !== 'object') return false;
  if (typeof data.name !== 'string') return false;

  // Check colors array
  if (!Array.isArray(data.colors)) return false;
  if (data.colors.length > 256) return false;

  // Validate each color tuple
  return data.colors.every((color: unknown) => {
    // Sparse palettes allow null
    if (color === null) return true;
    // Otherwise it must be a valid 0-255 [r, g, b, a] tuple
    return isValidColor(color);
  });
}

/**
 * Loads a palette from a JSON file.
 * Validates the structure: { name: string, colors: Array<Color | null> (max 256) }.
 *
 * @param path - Absolute path to the palette JSON file
 * @returns The parsed and validated palette data
 */
export async function loadPaletteFile(path: string): Promise<PaletteFileData> {
  try {
    const fileContent = await fs.readFile(path, 'utf8');
    let parsed: any;
    try {
      parsed = JSON.parse(fileContent);
    } catch (e: any) {
      throw new Error(`Invalid JSON in palette file: ${path}. ${e?.message ?? ''}`);
    }

    if (!validatePaletteStructure(parsed)) {
      // Because error generation expects an MCP format object, we throw a string message
      // which tool handlers will catch and return as invalidArgument. Or we throw directly.
      // Using a standard domain error format since we have access to it.
      throw new Error(
        "File does not match the required Palette format. Must have 'name' and up to 256 valid [r,g,b,a] 'colors' entries.",
      );
    }

    return parsed;
  } catch (error: any) {
    if (error.code === 'ENOENT') {
      // Ideally we'd have a specific error for 'paletteFileNotFound' in errors.ts
      // but we can just use a standard Error and the tool handler will wrap it.
      throw new Error(`Palette file not found: ${path}`);
    }
    throw error;
  }
}

/**
 * Saves a palette to a JSON file.
 *
 * @param path - Absolute path to the palette JSON file
 * @param name - The palette identifier name
 * @param colors - The palette color array
 */
export async function savePaletteFile(path: string, name: string, colors: Palette): Promise<void> {
  const dataToSave: PaletteFileData = { name, colors };

  // Ensure directory exists
  const lastSlash = path.lastIndexOf('/');
  if (lastSlash > -1) {
    const dir = path.substring(0, lastSlash);
    if (dir) {
      await fs.mkdir(dir, { recursive: true });
    }
  }

  await fs.writeFile(path, JSON.stringify(dataToSave, null, 2), 'utf8');
}
