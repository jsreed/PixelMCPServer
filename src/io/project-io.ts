import * as fs from 'fs/promises';
import { type ProjectConfig } from '../types/project.js';
import * as errors from '../errors.js';

/**
 * Validates that an object is structurally a valid ProjectConfig.
 */
function validateProjectStructure(data: unknown): data is ProjectConfig {
  if (!data || typeof data !== 'object') return false;

  const obj = data as Record<string, unknown>;

  if (typeof obj.pixelmcp_version !== 'string') return false;
  if (typeof obj.name !== 'string') return false;
  if (!obj.assets || typeof obj.assets !== 'object') return false;

  // Optional fields
  if (obj.conventions && typeof obj.conventions !== 'object') return false;
  if (obj.defaults && typeof obj.defaults !== 'object') return false;

  return true;
}

/**
 * Loads a project configuration from a JSON file.
 *
 * @param path - Absolute path to the pixelmcp.json file
 * @returns The parsed ProjectConfig data
 */
export async function loadProjectFile(path: string): Promise<ProjectConfig> {
  try {
    const fileContent = await fs.readFile(path, 'utf8');
    let parsed: unknown;
    try {
      parsed = JSON.parse(fileContent) as unknown;
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : '';
      throw new Error(`Invalid JSON in project file: ${path}. ${message}`);
    }

    if (!validateProjectStructure(parsed)) {
      throw new Error(`File ${path} does not match the required Project format.`);
    }

    return parsed;
  } catch (error: unknown) {
    if (
      error instanceof Error &&
      'code' in error &&
      (error as NodeJS.ErrnoException).code === 'ENOENT'
    ) {
      throw new Error(errors.projectFileNotFound(path).content[0].text);
    }
    throw error;
  }
}

/**
 * Saves a project configuration to a JSON file.
 * Automatically adds or preserves the creation timestamp.
 *
 * @param path - Absolute path to the pixelmcp.json file
 * @param project - The ProjectConfig data to save
 */
export async function saveProjectFile(path: string, project: ProjectConfig): Promise<void> {
  const dataToSave = { ...project };
  if (!dataToSave.created) {
    dataToSave.created = new Date().toISOString();
  }

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
