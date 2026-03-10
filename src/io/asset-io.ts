import * as fs from 'fs/promises';
import { type Asset } from '../types/asset.js';
import * as errors from '../errors.js';

export interface AssetFileEnvelope extends Asset {
  pixelmcp_version: string;
  created?: string;
  modified?: string;
}

/**
 * Validates that an object is structurally a valid Asset.
 */
function validateAssetStructure(data: unknown): data is AssetFileEnvelope {
  if (!data || typeof data !== 'object') return false;

  const obj = data as Record<string, unknown>;

  // Required fields
  if (typeof obj.pixelmcp_version !== 'string') return false;
  if (typeof obj.name !== 'string') return false;
  if (typeof obj.width !== 'number' || typeof obj.height !== 'number') return false;
  if (typeof obj.perspective !== 'string') return false;

  if (!Array.isArray(obj.palette)) return false;
  if (!Array.isArray(obj.layers)) return false;
  if (!Array.isArray(obj.frames)) return false;
  if (!Array.isArray(obj.tags)) return false;

  if (!obj.cels || typeof obj.cels !== 'object') return false;

  // Validate cel formats
  for (const cel of Object.values(obj.cels as Record<string, unknown>)) {
    if (!cel || typeof cel !== 'object') return false;

    const celObj = cel as Record<string, unknown>;
    const isImage = 'data' in celObj && Array.isArray(celObj.data);
    const isTilemap = 'grid' in celObj && Array.isArray(celObj.grid);
    const isShape = 'shapes' in celObj && Array.isArray(celObj.shapes);
    const isLinked = 'link' in celObj && typeof celObj.link === 'string';

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
    let parsed: unknown;
    try {
      parsed = JSON.parse(fileContent) as unknown;
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : '';
      throw new Error(`Invalid JSON in asset file: ${path}. ${message}`);
    }

    if (!validateAssetStructure(parsed)) {
      throw new Error(`File ${path} does not match the required Asset format.`);
    }

    // Strip the envelope fields to return a pure Asset
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const {
      pixelmcp_version: _version,
      created: _created,
      modified: _modified,
      ...coreAsset
    } = parsed;
    return coreAsset as Asset;
  } catch (error: unknown) {
    if (
      error instanceof Error &&
      'code' in error &&
      (error as NodeJS.ErrnoException).code === 'ENOENT'
    ) {
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
