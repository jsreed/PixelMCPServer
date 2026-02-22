import { type Asset } from '../types/asset.js';
import { type SelectionMask } from '../types/selection.js';
import { type Command, CommandHistory } from '../commands/command.js';
import { AssetClass } from './asset.js';
import { ProjectClass } from './project.js';
import * as errors from '../errors.js';

/**
 * Clipboard data: a rectangular chunk of palette-indexed pixel data.
 */
export interface ClipboardData {
    data: number[][];
    width: number;
    height: number;
}

/**
 * In-memory editing session singleton.
 * Holds loaded assets, undo/redo stacks, clipboard, and selection state.
 * Not persisted to disk — exists only for the duration of the server session.
 */
export class WorkspaceClass {
    private static _instance: WorkspaceClass | null = null;

    /** The active project configuration, or null if no project is loaded. */
    public project: ProjectClass | null = null;

    /** Loaded assets keyed by their logical registry name. */
    public readonly loadedAssets: Map<string, AssetClass> = new Map();

    /** Tracks which variant was loaded for each asset (undefined if no variant). */
    private readonly _loadedVariants: Map<string, string | undefined> = new Map();

    /** Clipboard contents from a copy/cut operation. */
    public clipboard: ClipboardData | null = null;

    /** Active selection mask, or null if no selection. */
    public selection: SelectionMask | null = null;

    /** Command history for undo/redo. */
    private _history = new CommandHistory();

    private constructor() {
        // Singleton — use WorkspaceClass.instance()
    }

    /**
     * Returns the singleton WorkspaceClass instance.
     */
    static instance(): WorkspaceClass {
        if (WorkspaceClass._instance === null) {
            WorkspaceClass._instance = new WorkspaceClass();
        }
        return WorkspaceClass._instance;
    }

    /**
     * Resets the singleton for testing. Clears all state.
     */
    static reset(): void {
        WorkspaceClass._instance = null;
    }

    // ------------------------------------------------------------------------
    // Project Management
    // ------------------------------------------------------------------------

    /**
     * Sets the active project.
     */
    setProject(project: ProjectClass): void {
        this.project = project;
    }

    // ------------------------------------------------------------------------
    // Asset Lifecycle
    // ------------------------------------------------------------------------

    /**
     * Returns a loaded asset by name. Throws if not loaded.
     */
    getAsset(name: string): AssetClass {
        const asset = this.loadedAssets.get(name);
        if (asset === undefined) {
            throw new Error(errors.assetNotLoaded(name).content[0].text);
        }
        return asset;
    }

    /**
     * Loads an asset into the workspace from parsed Asset data.
     * The actual file I/O (reading from disk) is handled by the io/ layer in Phase 1.4.
     * @param variant The variant key that was used to resolve this asset, if any.
     */
    loadAsset(name: string, data: Asset, variant?: string): void {
        const asset = AssetClass.fromJSON(data);
        this.loadedAssets.set(name, asset);
        this._loadedVariants.set(name, variant);
    }

    /**
     * Removes an asset from the workspace.
     * Returns whether the asset had unsaved changes (for warning the caller).
     */
    unloadAsset(name: string): { hadUnsavedChanges: boolean } {
        const asset = this.loadedAssets.get(name);
        if (asset === undefined) {
            throw new Error(errors.assetNotLoaded(name).content[0].text);
        }
        const hadUnsavedChanges = asset.isDirty;
        this.loadedAssets.delete(name);
        this._loadedVariants.delete(name);

        // Clear selection if it was targeting this asset
        if (this.selection !== null && this.selection.asset_name === name) {
            this.selection = null;
        }

        return { hadUnsavedChanges };
    }

    // ------------------------------------------------------------------------
    // Persistence
    // ------------------------------------------------------------------------

    /**
     * Serializes a loaded asset and clears its dirty flag.
     * The actual file write is handled by the io/ layer in Phase 1.4.
     * @returns The serialized Asset data.
     */
    save(name: string): Asset {
        const asset = this.getAsset(name);
        const data = asset.toJSON();
        asset.isDirty = false;
        return data;
    }

    /**
     * Saves all loaded assets that have unsaved changes.
     * @returns Array of { name, data } for each saved asset.
     */
    saveAll(): Array<{ name: string; data: Asset }> {
        const saved: Array<{ name: string; data: Asset }> = [];
        for (const [name, asset] of this.loadedAssets) {
            if (asset.isDirty) {
                const data = asset.toJSON();
                asset.isDirty = false;
                saved.push({ name, data });
            }
        }
        return saved;
    }

    // ------------------------------------------------------------------------
    // Undo/Redo
    // ------------------------------------------------------------------------

    /**
     * Executes a command and pushes it onto the undo stack.
     * Tool handlers construct the command, then call this method.
     */
    pushCommand(cmd: Command): void {
        this._history.push(cmd);
    }

    /**
     * Undoes the last command.
     */
    undo(): void {
        this._history.undo();
    }

    /**
     * Redoes the last undone command.
     */
    redo(): void {
        this._history.redo();
    }

    /** Returns the current undo stack depth. */
    get undoDepth(): number {
        return this._history.undoDepth;
    }

    /** Returns the current redo stack depth. */
    get redoDepth(): number {
        return this._history.redoDepth;
    }

    // ------------------------------------------------------------------------
    // Session Info
    // ------------------------------------------------------------------------

    /**
     * Returns a summary of the current workspace state.
     * Matches the expected shape for the `workspace info` MCP tool action.
     */
    info() {
        const assetEntries: Array<{ name: string; isDirty: boolean; variant?: string }> = [];
        for (const [name, asset] of this.loadedAssets) {
            const variant = this._loadedVariants.get(name);
            const entry: { name: string; isDirty: boolean; variant?: string } = { name, isDirty: asset.isDirty };
            if (variant !== undefined) {
                entry.variant = variant;
            }
            assetEntries.push(entry);
        }

        return {
            project: this.project
                ? { name: this.project.name, path: this.project.path }
                : null,
            loadedAssets: assetEntries,
            undoDepth: this.undoDepth,
            redoDepth: this.redoDepth,
            selection: this.selection
                ? {
                    asset_name: this.selection.asset_name,
                    layer_id: this.selection.layer_id,
                    frame_index: this.selection.frame_index,
                }
                : null,
        };
    }
}

/**
 * Module-level accessor for the workspace singleton.
 * Tool handlers import this function to get the workspace.
 */
export function getWorkspace(): WorkspaceClass {
    return WorkspaceClass.instance();
}
