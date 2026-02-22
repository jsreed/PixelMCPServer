import * as fs from 'fs/promises';
import { type ProjectConfig } from '../types/project.js';
import * as errors from '../errors.js';

/**
 * Validates that an object is structurally a valid ProjectConfig.
 */
function validateProjectStructure(data: any): data is ProjectConfig {
    if (!data || typeof data !== 'object') return false;

    if (typeof data.pixelmcp_version !== 'string') return false;
    if (typeof data.name !== 'string') return false;
    if (!data.assets || typeof data.assets !== 'object') return false;

    // Optional fields
    if (data.conventions && typeof data.conventions !== 'object') return false;
    if (data.defaults && typeof data.defaults !== 'object') return false;

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
        let parsed: any;
        try {
            parsed = JSON.parse(fileContent);
        } catch (e: any) {
            throw new Error(`Invalid JSON in project file: ${path}. ${e?.message ?? ''}`);
        }

        if (!validateProjectStructure(parsed)) {
            throw new Error(`File ${path} does not match the required Project format.`);
        }

        return parsed;
    } catch (error: any) {
        if (error.code === 'ENOENT') {
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
