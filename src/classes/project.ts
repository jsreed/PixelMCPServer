import { type ProjectConfig, type AssetRegistryEntry, type ProjectConventions, type ProjectDefaults } from '../types/project.js';
import * as errors from '../errors.js';
import * as path from 'node:path';

/**
 * Stateful wrapper for a loaded pixelmcp.json Project configuration.
 * Manages the asset registry, path resolution, and defaults.
 */
export class ProjectClass {
    /** Tracks whether the project configuration has unsaved changes */
    public isDirty: boolean = false;

    /** The raw JSON-serializable config data */
    private _data: ProjectConfig;

    /** The absolute path to the pixelmcp.json file */
    private _path: string;

    /**
     * Internal constructor. Use static create() or fromJSON().
     */
    private constructor(filePath: string, data: ProjectConfig) {
        this._path = filePath;
        // Deep copy incoming data
        this._data = JSON.parse(JSON.stringify(data)) as ProjectConfig;
    }

    // ------------------------------------------------------------------------
    // Getters & Meta
    // ------------------------------------------------------------------------

    get path(): string {
        return this._path;
    }

    get name(): string {
        return this._data.name;
    }

    get pixelmcp_version(): string {
        return this._data.pixelmcp_version;
    }

    get created(): string | undefined {
        return this._data.created;
    }

    get conventions(): ProjectConventions | undefined {
        // Return a copy if it exists to prevent external mutation
        return this._data.conventions ? { ...this._data.conventions } : undefined;
    }

    get defaults(): ProjectDefaults | undefined {
        return this._data.defaults ? { ...this._data.defaults } : undefined;
    }

    get assets(): Record<string, AssetRegistryEntry> {
        return { ...this._data.assets }; // Shallow copy of the record
    }

    /**
     * Returns a summary of the project state for the `project info` tool.
     */
    info() {
        return {
            path: this._path,
            name: this._data.name,
            pixelmcp_version: this._data.pixelmcp_version,
            created: this._data.created,
            conventions: this.conventions,
            defaults: this.defaults,
            assets: this._data.assets
        };
    }

    // ------------------------------------------------------------------------
    // Registry Management
    // ------------------------------------------------------------------------

    /**
     * Registers a new asset in the project registry.
     * Supports single-path assets, variant-based assets, and recolor tracking.
     */
    registerAsset(name: string, entry: AssetRegistryEntry): void {
        this._data.assets[name] = JSON.parse(JSON.stringify(entry)) as AssetRegistryEntry;
        this.markDirty();
    }

    /**
     * Removes an asset from the project registry.
     * Does not delete the file on disk — that is the caller's responsibility.
     */
    removeAsset(name: string): void {
        const entry = this._data.assets[name] as AssetRegistryEntry | undefined;
        if (entry === undefined) {
            throw new Error(errors.assetNotInRegistry(name).content[0].text);
        }
        // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
        delete this._data.assets[name];
        this.markDirty();
    }

    /**
     * Renames an asset's registry key. Updates the key but not the file path.
     */
    renameAsset(oldName: string, newName: string): void {
        const entry = this._data.assets[oldName] as AssetRegistryEntry | undefined;
        if (entry === undefined) {
            throw new Error(errors.assetNotInRegistry(oldName).content[0].text);
        }
        if (oldName === newName) return;
        const existingNew = this._data.assets[newName] as AssetRegistryEntry | undefined;
        if (existingNew !== undefined) {
            throw new Error(errors.invalidArgument(`Asset '${newName}' already exists in the registry`).content[0].text);
        }
        this._data.assets[newName] = entry;
        // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
        delete this._data.assets[oldName];
        this.markDirty();
    }

    /**
     * Resolves the physical, absolute filepath for a registered logical asset.
     * @param name The logical name of the asset in the registry.
     * @param variant Optional variant key if the entry uses a variants map.
     * @returns The resolved absolute path.
     */
    resolveAssetPath(name: string, variant?: string): string {
        const entry = this._data.assets[name] as AssetRegistryEntry | undefined;
        if (entry === undefined) {
            throw new Error(errors.assetNotInRegistry(name).content[0].text);
        }

        let relPath: string | undefined;

        if (entry.variants !== undefined) {
            if (variant !== undefined) {
                if (!(variant in entry.variants)) {
                    throw new Error(errors.invalidArgument(`Variant '${variant}' not found for asset '${name}'`).content[0].text);
                }
                relPath = entry.variants[variant];
            } else {
                // Return first variant if none specified
                const keys = Object.keys(entry.variants);
                if (keys.length === 0) {
                    throw new Error(errors.invalidArgument(`Asset '${name}' has empty variants map`).content[0].text);
                }
                const firstKey = keys[0];
                relPath = entry.variants[firstKey];
            }
        } else {
            if (variant !== undefined) {
                throw new Error(errors.invalidArgument(`Asset '${name}' does not use variants`).content[0].text);
            }
            if (entry.path === undefined) {
                throw new Error(errors.invalidArgument(`Asset '${name}' is missing path configuration`).content[0].text);
            }
            relPath = entry.path;
        }

        const projectDir = path.dirname(this._path);
        // We know relPath is set because all branches above assign it or throw
        return path.resolve(projectDir, relPath);
    }

    // ------------------------------------------------------------------------
    // Defaults & Helpers
    // ------------------------------------------------------------------------

    /**
     * Checks if the default palette string indicates a Lospec slug or a filepath.
     */
    getPaletteSource(): { type: 'slug' | 'file', value: string } | undefined {
        const pal = this._data.defaults?.palette;
        if (!pal) return undefined;

        if (pal.includes('/') || pal.endsWith('.json')) {
            return { type: 'file', value: pal };
        }
        return { type: 'slug', value: pal };
    }

    // ------------------------------------------------------------------------
    // Serialization
    // ------------------------------------------------------------------------

    /**
     * Returns the raw config data suitable for JSON serialization.
     */
    toJSON(): ProjectConfig {
        return JSON.parse(JSON.stringify(this._data)) as ProjectConfig;
    }

    /**
     * Creates a new, blank project representation in memory.
     * @param filePath The absolute path where the pixelmcp.json will be saved.
     * @param name The display name of the project.
     */
    static create(filePath: string, name: string): ProjectClass {
        const data: ProjectConfig = {
            pixelmcp_version: '1.0',
            name,
            created: new Date().toISOString(),
            assets: {}
        };
        const proj = new ProjectClass(filePath, data);
        proj.markDirty(); // newly created, needs saving
        return proj;
    }

    /**
     * Instantiates a ProjectClass from loaded JSON data.
     * @param filePath The absolute path of the loaded pixelmcp.json.
     * @param data The parsed JSON configuration.
     */
    static fromJSON(filePath: string, data: ProjectConfig): ProjectClass {
        return new ProjectClass(filePath, data);
    }

    // ------------------------------------------------------------------------
    // Private Helpers
    // ------------------------------------------------------------------------

    private markDirty(): void {
        this.isDirty = true;
    }
}
