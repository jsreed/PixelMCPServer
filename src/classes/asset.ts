import { type Asset, type Perspective, type Anchor } from '../types/asset.js';
import { PaletteClass } from './palette.js';
import * as errors from '../errors.js';
import { type Layer, type GroupLayer, type ShapeLayer, type ImageLayer, type TilemapLayer } from '../types/layer.js';
import { type Frame } from '../types/frame.js';
import { type Cel, packCelKey } from '../types/cel.js';
import { type Tag, type Facing } from '../types/tag.js';
import { type Shape } from '../types/shape.js';
import { type ShapeCel } from '../types/cel.js';

/**
 * Stateful wrapper for a loaded Asset.
 * Manages layers, frames, cels, tags, and shapes. 
 * Enforces data-model invariants and tracks mutation state for saving.
 */
export class AssetClass {
    /** Tracks whether the asset has unsaved changes */
    public isDirty: boolean = false;

    /** The wrapped Palette state */
    public palette: PaletteClass;

    /** The raw JSON-serializable data */
    private _data: Asset;

    /**
     * Initializes a new AssetClass from raw Asset data.
     * Use AssetClass.fromJSON() to instantiate from disk.
     */
    constructor(data: Asset) {
        // Deep copy the incoming data to prevent external mutation
        this._data = JSON.parse(JSON.stringify(data)) as Asset;

        // Wrap the palette in its stateful class
        this.palette = PaletteClass.fromJSON(this._data.palette);
    }

    // ------------------------------------------------------------------------
    // Getters
    // ------------------------------------------------------------------------

    get name(): string {
        return this._data.name;
    }

    get width(): number {
        return this._data.width;
    }

    get height(): number {
        return this._data.height;
    }

    get perspective(): Perspective {
        return this._data.perspective;
    }

    // Returns a copy of the layers array
    get layers(): Layer[] {
        return [...this._data.layers];
    }

    // Returns a copy of the frames array
    get frames(): Frame[] {
        return [...this._data.frames];
    }

    // Returns a copy of the tags array
    get tags(): Tag[] {
        return [...this._data.tags];
    }

    // Returns a reference to the cels record (treat as read-only)
    get cels(): Record<string, Cel> {
        return { ...this._data.cels };
    }

    // ------------------------------------------------------------------------
    // Layer CRUD
    // ------------------------------------------------------------------------

    /**
     * Adds a new group layer.
     */
    addGroup(name: string, parentId?: number, index?: number): number {
        return this.addLayer({ name, type: 'group', opacity: 255, visible: true }, parentId, index);
    }

    /**
     * Adds a new layer to the asset.
     * With the current type specification, parent/child relationships are tracked
     * by `parent_id`.
     * Returns the ID of the new layer.
     */
    addLayer(layer: Pick<Layer, 'name' | 'type' | 'opacity' | 'visible'> & Partial<{ physics_layer: number; role: string }>, parentId?: number, index?: number): number {
        if (parentId !== undefined) {
            const parentLayer = this.getLayer(parentId);
            if (!parentLayer) {
                throw new Error(errors.layerNotFound(parentId, this.name).content[0].text);
            }
            if (parentLayer.type !== 'group') {
                throw new Error(`Layer ${String(parentId)} is not a group layer`);
            }
        }

        // Find highest existing ID to generate a new one
        const maxId = this._data.layers.reduce((max, l) => Math.max(max, l.id), 0);
        const newId = maxId + 1;

        let newLayer: Layer;
        if (layer.type === 'group') {
            newLayer = {
                id: newId,
                name: layer.name,
                type: 'group',
                opacity: layer.opacity,
                visible: layer.visible
            } as GroupLayer;
        } else if (layer.type === 'image') {
            newLayer = {
                id: newId,
                name: layer.name,
                type: 'image',
                opacity: layer.opacity,
                visible: layer.visible
            } as ImageLayer;
        } else if (layer.type === 'tilemap') {
            newLayer = {
                id: newId,
                name: layer.name,
                type: 'tilemap',
                opacity: layer.opacity,
                visible: layer.visible
            } as TilemapLayer;
        } else {
            newLayer = {
                id: newId,
                name: layer.name,
                type: 'shape',
                opacity: layer.opacity,
                visible: layer.visible,
                role: layer.role ?? 'default',
                physics_layer: layer.physics_layer ?? 1
            } as ShapeLayer;
        }

        if (parentId !== undefined) {
            newLayer.parent_id = parentId;
        }

        if (index !== undefined && index >= 0 && index <= this._data.layers.length) {
            this._data.layers.splice(index, 0, newLayer);
        } else {
            this._data.layers.push(newLayer);
        }

        this.markDirty();
        return newId;
    }

    /**
     * Removes a layer and all nested children, along with all associated cels.
     */
    removeLayer(id: number): void {
        const layer = this.getLayer(id);
        if (!layer) return;

        const idsToRemove: number[] = [id];
        const addChildIds = (parentId: number) => {
            const children = this._data.layers.filter(l => l.parent_id === parentId);
            for (const child of children) {
                idsToRemove.push(child.id);
                addChildIds(child.id);
            }
        };
        addChildIds(id);

        // Remove layers
        this._data.layers = this._data.layers.filter((l: Layer) => !idsToRemove.includes(l.id));

        // Remove layer tags referencing this layer
        for (let i = this._data.tags.length - 1; i >= 0; i--) {
            const tag = this._data.tags[i];
            if (tag.type === 'layer') {
                const lTag = tag;
                lTag.layers = lTag.layers.filter((lid: number) => !idsToRemove.includes(lid));
                if (lTag.layers.length === 0) {
                    this._data.tags.splice(i, 1); // remove empty tag
                }
            }
        }

        // Remove cels in all frames
        for (let frameIndex = 0; frameIndex < this._data.frames.length; frameIndex++) {
            for (const lid of idsToRemove) {
                // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
                delete this._data.cels[packCelKey(lid, frameIndex)];
            }
        }

        this.markDirty();
    }

    /**
     * Reorders a layer and optionally reparents it.
     */
    reorderLayer(id: number, newParentId: number | undefined, newIndex: number): void {
        const layerIndex = this._data.layers.findIndex(l => l.id === id);
        if (layerIndex === -1) {
            throw new Error(errors.layerNotFound(id, this.name).content[0].text);
        }

        // Enforce acyclic graphs for groups
        if (newParentId !== undefined) {
            let curId: number | undefined = newParentId;
            while (curId !== undefined) {
                if (curId === id) {
                    throw new Error(errors.invalidArgument(`Cannot move layer ${String(id)} into its own descendant`).content[0].text);
                }
                const pLayer = this.getLayer(curId);
                if (!pLayer || pLayer.type !== 'group') {
                    throw new Error(errors.invalidArgument(`Invalid parent layer ${String(curId)}`).content[0].text);
                }
                curId = pLayer.parent_id;
            }
        }

        // Reorder in absolute layers array
        const layer = this._data.layers.splice(layerIndex, 1)[0];
        if (newParentId !== undefined) {
            layer.parent_id = newParentId;
        } else {
            delete layer.parent_id;
        }

        this._data.layers.splice(newIndex, 0, layer);

        this.markDirty();
    }

    // ------------------------------------------------------------------------
    // Frame CRUD
    // ------------------------------------------------------------------------

    addFrame(frame: Frame, index?: number): number {
        const insertAt = index !== undefined && index >= 0 && index <= this._data.frames.length
            ? index
            : this._data.frames.length;

        // Make sure index matches position
        const newFrame = { ...frame, index: insertAt };
        this._data.frames.splice(insertAt, 0, newFrame);

        // Shift up all frames after it correctly
        for (let i = insertAt + 1; i < this._data.frames.length; i++) {
            this._data.frames[i].index = i;
        }

        // Shift frame tags
        for (const tag of this._data.tags) {
            if (tag.type === 'frame') {
                const ftag = tag;
                if (ftag.start >= insertAt) ftag.start++;
                if (ftag.end >= insertAt) ftag.end++;
            }
        }

        // Shift cels (from back to front to avoid overwriting)
        for (let i = this._data.frames.length - 1; i > insertAt; i--) {
            for (const layer of this._data.layers) {
                const oldKey = packCelKey(layer.id, i - 1);
                const newKey = packCelKey(layer.id, i);
                const oldCel = this._data.cels[oldKey];
                this._data.cels[newKey] = oldCel as NonNullable<Cel>;
                // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
                delete this._data.cels[oldKey];
            }
        }

        // Update all link references that point to shifted frames
        for (const celKey of Object.keys(this._data.cels)) {
            const cel = this._data.cels[celKey] as Cel | undefined;
            if (cel !== undefined && 'link' in cel) {
                const parts = cel.link.split('/');
                if (parts[0] && parts[1]) {
                    const srcLayer = parseInt(parts[0], 10);
                    const srcFrame = parseInt(parts[1], 10);
                    if (srcFrame >= insertAt) {
                        cel.link = `${String(srcLayer)}/${String(srcFrame + 1)}`;
                    }
                }
            }
        }

        this.markDirty();
        return insertAt;
    }

    removeFrame(index: number): void {
        if (index < 0 || index >= this._data.frames.length) {
            throw new Error(errors.frameOutOfRange(index, this.name, this._data.frames.length).content[0].text);
        }

        this._data.frames.splice(index, 1);

        // Fix remaining frame indices
        for (let i = index; i < this._data.frames.length; i++) {
            this._data.frames[i].index = i;
        }

        // Update frame tags
        for (let i = this._data.tags.length - 1; i >= 0; i--) {
            const tag = this._data.tags[i];
            if (tag.type === 'frame') {
                const ftag = tag;
                if (ftag.start === index && ftag.end === index) {
                    // Tag only covered this frame, remove it
                    this._data.tags.splice(i, 1);
                } else {
                    if (ftag.start > index) ftag.start--;
                    if (ftag.end >= index) ftag.end--;
                }
            }
        }

        // Remove cels for this frame and shift down later cels
        for (const layer of this._data.layers) {
            // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
            delete this._data.cels[packCelKey(layer.id, index)];
        }

        for (let i = index + 1; i <= this._data.frames.length; i++) {
            for (const layer of this._data.layers) {
                const oldKey = packCelKey(layer.id, i);
                const newKey = packCelKey(layer.id, i - 1);
                const oldCel = this._data.cels[oldKey];
                this._data.cels[newKey] = oldCel as NonNullable<Cel>;
                // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
                delete this._data.cels[oldKey];
            }
        }

        // Update all link references that point to shifted frames
        const toDelete: string[] = [];
        for (const celKey of Object.keys(this._data.cels)) {
            const cel = this._data.cels[celKey] as Cel | undefined;
            if (cel !== undefined && 'link' in cel) {
                const parts = cel.link.split('/');
                if (parts[0] && parts[1]) {
                    const srcLayer = parseInt(parts[0], 10);
                    const srcFrame = parseInt(parts[1], 10);
                    if (srcFrame > index) {
                        cel.link = `${String(srcLayer)}/${String(srcFrame - 1)}`;
                    } else if (srcFrame === index) {
                        // It pointed to the deleted frame, so the link is broken string-wise
                        toDelete.push(celKey);
                    }
                }
            }
        }
        for (const celKey of toDelete) {
            // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
            delete this._data.cels[celKey];
        }

        this.markDirty();
    }

    setFrameDuration(index: number, duration: number): void {
        if (index < 0 || index >= this._data.frames.length) {
            throw new Error(errors.frameOutOfRange(index, this.name, this._data.frames.length).content[0].text);
        }
        this._data.frames[index].duration_ms = duration;
        this.markDirty();
    }

    // ------------------------------------------------------------------------
    // Cel Access
    // ------------------------------------------------------------------------

    getCel(layerId: number, frameIndex: number): Cel | undefined {
        const cel = this._data.cels[packCelKey(layerId, frameIndex)] as Cel | undefined;
        if (cel !== undefined && 'link' in cel) {
            let current: Cel = cel;
            let depth = 0;
            while ('link' in current && depth < 10) {
                const parts = current.link.split('/');
                if (parts.length !== 2 || !parts[0] || !parts[1]) return undefined;

                const srcLayer = parseInt(parts[0], 10);
                const srcFrame = parseInt(parts[1], 10);

                const next = this._data.cels[packCelKey(srcLayer, srcFrame)] as Cel | undefined;
                if (next === undefined) return undefined;
                current = next;
                depth++;
            }
            return current;
        }

        return cel;
    }

    setCel(layerId: number, frameIndex: number, cel: Cel): void {
        const key = packCelKey(layerId, frameIndex);
        const existing = this._data.cels[key] as Cel | undefined;
        if (existing !== undefined && 'link' in existing) {
            // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
            delete this._data.cels[key];
        }
        this._data.cels[key] = Object.assign({}, cel);
        this.markDirty();
    }

    removeCel(layerId: number, frameIndex: number): void {
        const key = packCelKey(layerId, frameIndex);
        if (key in this._data.cels) {
            // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
            delete this._data.cels[key];
            this.markDirty();
        }
    }

    // ------------------------------------------------------------------------
    // Tag CRUD
    // ------------------------------------------------------------------------

    addTag(tag: Tag): void {
        if (tag.type === 'frame') {
            const ftag = tag;
            if (ftag.start < 0 || ftag.end >= this._data.frames.length || ftag.start > ftag.end) {
                throw new Error(errors.invalidArgument('Frame tag bounds are out of range').content[0].text);
            }
            // Check for name/facing collision
            const collision = this._data.tags.find(t => t.type === 'frame' && t.name === ftag.name && t.facing === ftag.facing);
            if (collision) {
                throw new Error(errors.invalidArgument(`Frame tag with name '${ftag.name}' and facing '${ftag.facing ?? 'none'}' already exists`).content[0].text);
            }
        }
        this._data.tags.push(Object.assign({}, tag));
        this.markDirty();
    }

    removeTag(name: string, facing?: Facing): void {
        this._data.tags = this._data.tags.filter(t => {
            if (t.name !== name) return true;
            if (t.type === 'frame' && facing !== undefined) {
                const ftag = t;
                if (ftag.facing !== facing) return true;
            }
            return false;
        });
        this.markDirty();
    }

    // ------------------------------------------------------------------------
    // Shape CRUD
    // ------------------------------------------------------------------------

    getShapes(layerId: number, frameIndex: number): Shape[] {
        const layer = this.getLayer(layerId);
        if (!layer) return [];
        if (layer.type !== 'shape') return [];

        const cel = this.getCel(layerId, frameIndex);
        if (!cel || !('shapes' in cel)) return [];

        return [...cel.shapes] as Shape[];
    }

    addShape(layerId: number, frameIndex: number, shape: Shape): void {
        const layer = this.getLayer(layerId);
        if (!layer) throw new Error(errors.layerNotFound(layerId, this.name).content[0].text);
        if (layer.type !== 'shape') throw new Error(errors.notAShapeLayer(layerId).content[0].text);

        const cel = this.getCel(layerId, frameIndex);
        if (cel === undefined) {
            const newCel: ShapeCel = { shapes: [] };
            this.setCel(layerId, frameIndex, newCel);
            const refetchCel = this.getCel(layerId, frameIndex);
            if (refetchCel !== undefined && 'shapes' in refetchCel) {
                refetchCel.shapes.push({ ...shape });
            }
        } else if (!('shapes' in cel)) {
            return;
        } else {
            cel.shapes.push({ ...shape });
        }

        this.markDirty();
    }

    removeShape(layerId: number, frameIndex: number, shapeName: string): void {
        const layer = this.getLayer(layerId);
        if (!layer || layer.type !== 'shape') return;

        const cel = this.getCel(layerId, frameIndex);
        if (cel && 'shapes' in cel) {
            cel.shapes = cel.shapes.filter((s: Shape) => s.name !== shapeName);
            this.markDirty();
        }
    }

    updateShape(layerId: number, frameIndex: number, shapeName: string, shape: Shape): void {
        const layer = this.getLayer(layerId);
        if (!layer || layer.type !== 'shape') return;

        const cel = this.getCel(layerId, frameIndex);
        if (cel && 'shapes' in cel) {
            const idx = cel.shapes.findIndex((s: Shape) => s.name === shapeName);
            if (idx !== -1) {
                cel.shapes[idx] = { ...shape };
                this.markDirty();
            }
        }
    }

    // ------------------------------------------------------------------------
    // Meta / Global
    // ------------------------------------------------------------------------

    setPerspective(perspective: Perspective): void {
        this._data.perspective = perspective;
        this.markDirty();
    }

    resize(width: number, height: number, anchor: Anchor = 'top_left'): void {
        const oldW = this._data.width;
        const oldH = this._data.height;

        let shiftX = 0;
        let shiftY = 0;

        switch (anchor) {
            case 'top_left': break;
            case 'top_center': shiftX = Math.floor((width - oldW) / 2); break;
            case 'top_right': shiftX = width - oldW; break;
            case 'center_left': shiftY = Math.floor((height - oldH) / 2); break;
            case 'center':
                shiftX = Math.floor((width - oldW) / 2);
                shiftY = Math.floor((height - oldH) / 2);
                break;
            case 'center_right':
                shiftX = width - oldW;
                shiftY = Math.floor((height - oldH) / 2);
                break;
            case 'bottom_left': shiftY = height - oldH; break;
            case 'bottom_center':
                shiftX = Math.floor((width - oldW) / 2);
                shiftY = height - oldH;
                break;
            case 'bottom_right':
                shiftX = width - oldW;
                shiftY = height - oldH;
                break;
        }

        this._data.width = width;
        this._data.height = height;

        for (const key of Object.keys(this._data.cels)) {
            const cel = this._data.cels[key];

            if ('x' in cel && 'y' in cel && 'data' in cel) {
                const imgCel = cel;
                let cx = imgCel.x + shiftX;
                let cy = imgCel.y + shiftY;
                const dHeight = imgCel.data.length;
                const dWidth = dHeight > 0 ? (imgCel.data[0]?.length ?? 0) : 0;

                if (dWidth > 0 && dHeight > 0) {
                    let startX = 0;
                    let startY = 0;
                    let endX = dWidth;
                    let endY = dHeight;

                    if (cx < 0) { startX = -cx; cx = 0; }
                    if (cy < 0) { startY = -cy; cy = 0; }
                    if (cx + (endX - startX) > width) { endX = startX + (width - cx); }
                    if (cy + (endY - startY) > height) { endY = startY + (height - cy); }

                    if (startX >= dWidth || startY >= dHeight || endX <= startX || endY <= startY) {
                        imgCel.x = 0;
                        imgCel.y = 0;
                        imgCel.data = [];
                    } else if (startX > 0 || startY > 0 || endX < dWidth || endY < dHeight) {
                        const newData: number[][] = [];
                        for (let r = startY; r < endY; r++) {
                            newData.push(imgCel.data[r].slice(startX, endX));
                        }
                        imgCel.x = cx;
                        imgCel.y = cy;
                        imgCel.data = newData;
                    } else {
                        imgCel.x = cx;
                        imgCel.y = cy;
                    }
                } else {
                    imgCel.x = cx;
                    imgCel.y = cy;
                }
            } else if ('shapes' in cel) {
                const shapeCel = cel;
                for (const shape of shapeCel.shapes) {
                    if (shape.type === 'rect') {
                        shape.x += shiftX;
                        shape.y += shiftY;
                    } else {
                        for (const pt of shape.points) {
                            pt[0] += shiftX;
                            pt[1] += shiftY;
                        }
                    }
                }
            }
        }

        this.markDirty();
    }

    // ------------------------------------------------------------------------
    // Serialization
    // ------------------------------------------------------------------------

    toJSON(): Asset {
        return {
            ...this._data,
            palette: this.palette.toJSON()
        };
    }

    static fromJSON(data: Asset): AssetClass {
        return new AssetClass(data);
    }

    // ------------------------------------------------------------------------
    // Private Helpers
    // ------------------------------------------------------------------------

    private getLayer(id: number): Layer | undefined {
        return this._data.layers.find(l => l.id === id);
    }

    private markDirty(): void {
        this.isDirty = true;
    }
}
