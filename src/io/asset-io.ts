import * as fs from 'fs/promises';
import { type Asset } from '../types/asset.js';
import * as errors from '../errors.js';
import { type Cel } from '../types/cel.js';

export interface AssetFileEnvelope extends Asset {
  pixelmcp_version: string;
  created?: string;
  modified?: string;
}

/**
 * Validates that an object is structurally a valid Asset.
 */
function validateAssetStructure(data: any): data is AssetFileEnvelope {
  if (!data || typeof data !== 'object') return false;

  // Required fields
  if (typeof data.pixelmcp_version !== 'string') return false;
  if (typeof data.name !== 'string') return false;
  if (typeof data.width !== 'number' || typeof data.height !== 'number') return false;
  if (typeof data.perspective !== 'string') return false;

  if (!Array.isArray(data.palette)) return false;
  if (!Array.isArray(data.layers)) return false;
  if (!Array.isArray(data.frames)) return false;
  if (!Array.isArray(data.tags)) return false;

  if (!data.cels || typeof data.cels !== 'object') return false;

  // Validate cel formats
  for (const [key, cel] of Object.entries(data.cels as Record<string, any>)) {
    if (!cel || typeof cel !== 'object') return false;

    const isImage = 'data' in cel && Array.isArray(cel.data);
    const isTilemap = 'grid' in cel && Array.isArray(cel.grid);
    const isShape = 'shapes' in cel && Array.isArray(cel.shapes);
    const isLinked = 'link' in cel && typeof cel.link === 'string';

    if (!isImage && !isTilemap && !isShape && !isLinked) return false;
  }

  return true;
}

/**
 * Loads an asset from a JSON file.
 * Validates the structure and strips the on-disk envelope fields (version, timestamps).
 *
 * @param path - Absolute or project-relative path to the asset file
 * @returns The core Asset data ready for AssetClass.fromJSON
 */
export async function loadAssetFile(path: string): Promise<Asset> {
  try {
    const fileContent = await fs.readFile(path, 'utf8');
    let parsed: any;
    try {
      parsed = JSON.parse(fileContent);
    } catch (e: any) {
      throw new Error(`Invalid JSON in asset file: ${path}. ${e?.message ?? ''}`);
    }

    if (!validateAssetStructure(parsed)) {
      throw new Error(`File ${path} does not match the required Asset format.`);
    }

    // Strip the envelope fields to return a pure Asset
    const { pixelmcp_version, created, modified, ...coreAsset } = parsed;
    return coreAsset as Asset;
  } catch (error: any) {
    if (error.code === 'ENOENT') {
      throw new Error(errors.assetFileNotFound(path).content[0].text);
    }
    throw error;
  }
}

/**
 * Saves an asset to a JSON file.
 * Wraps the core Asset with the required on-disk envelope fields (version, timestamps).
 *
 * @param path - Absolute or project-relative path to the asset file
 * @param asset - The core Asset data (from asset.toJSON())
 * @param existingCreated - Optional existing created timestamp to preserve
 */
export async function saveAssetFile(
  path: string,
  asset: Asset,
  existingCreated?: string,
): Promise<void> {
  const now = new Date().toISOString();

  // Create the envelope
  const envelope: AssetFileEnvelope = {
    pixelmcp_version: '1.0',
    created: existingCreated ?? now,
    modified: now,
    ...asset,
  };

  // Ensure directory exists
  const lastSlash = path.lastIndexOf('/');
  if (lastSlash > -1) {
    const dir = path.substring(0, lastSlash);
    if (dir) {
      await fs.mkdir(dir, { recursive: true });
    }
  }

  // Write file
  await fs.writeFile(path, JSON.stringify(envelope, null, 2), 'utf8');
}
