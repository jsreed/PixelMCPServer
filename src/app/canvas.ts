import type { CompositeLayer, PaletteEntry } from '../algorithms/composite';
import { compositeFrame } from '../algorithms/composite';
import type { ImageCel } from '../types/cel';
import type { Layer } from '../types/layer';
import type { Palette } from '../types/palette';

/**
 * Converts a JSON palette array (from structuredContent) to the Map format
 * expected by compositeFrame().
 */
export function jsonPaletteToMap(palette: Palette): Map<number, PaletteEntry> {
  const map = new Map<number, PaletteEntry>();
  for (let i = 0; i < palette.length; i++) {
    const c = palette[i];
    if (c) {
      map.set(i, { r: c[0], g: c[1], b: c[2], a: c[3] });
    }
  }
  return map;
}

/**
 * Converts JSON layer and cel data (from structuredContent) to the CompositeLayer
 * tree expected by compositeFrame().
 *
 * Mirrors the server-side buildCompositeLayers() from src/utils/render.ts,
 * but operates on raw JSON types instead of AssetClass.
 */
export function jsonToCompositeLayers(
  layers: Layer[],
  cels: Record<string, unknown>,
): CompositeLayer[] {
  const compMap = new Map<number, CompositeLayer>();

  for (const layer of layers) {
    compMap.set(layer.id, {
      id: layer.id,
      type: layer.type,
      visible: layer.visible,
      opacity: layer.opacity,
      children: layer.type === 'group' ? [] : undefined,
      getPixel: (x: number, y: number, frame: number) => {
        const key = `${String(layer.id)}/${String(frame)}`;
        const cel = cels[key];
        if (!cel || typeof cel !== 'object' || !('data' in cel)) return null;
        const imgCel = cel as ImageCel;
        const cx = x - imgCel.x;
        const cy = y - imgCel.y;
        if (cy < 0 || cy >= imgCel.data.length) return null;
        const row = imgCel.data[cy];
        if (!row || cx < 0 || cx >= row.length) return null;
        const val = row[cx];
        return val === 0 ? null : val;
      },
    });
  }

  // Build tree — same logic as server-side buildCompositeLayers
  const rootLayers: CompositeLayer[] = [];
  for (const layer of layers) {
    const comp = compMap.get(layer.id)!;
    if (layer.parent_id !== undefined) {
      const parent = compMap.get(layer.parent_id);
      if (parent?.children) {
        parent.children.push(comp);
      } else {
        rootLayers.push(comp);
      }
    } else {
      rootLayers.push(comp);
    }
  }

  return rootLayers;
}

/**
 * Flattens a CompositeLayer tree into a bottom-to-top ordered list of visible
 * image/tilemap layers, respecting group visibility. Used by CanvasRenderer
 * to cache the flat layer list for getPixelAt() lookups.
 */
function flattenCompositeLayers(layers: CompositeLayer[]): CompositeLayer[] {
  const flat: CompositeLayer[] = [];
  const walk = (nodes: CompositeLayer[], parentVisible: boolean): void => {
    for (const layer of nodes) {
      const visible = parentVisible && layer.visible;
      if (layer.type === 'group') {
        if (layer.children) {
          walk(layer.children, visible);
        }
      } else if ((layer.type === 'image' || layer.type === 'tilemap') && visible && layer.opacity > 0) {
        flat.push(layer);
      }
    }
  };
  walk(layers, true);
  return flat;
}

// Checkerboard colors (light gray / white, 1 canvas-pixel cells)
const CHECK_LIGHT = 255;
const CHECK_DARK = 204;

/**
 * Blends composited RGBA pixels over a checkerboard background in-place.
 * Any pixel with alpha < 255 shows the checkerboard underneath.
 */
function blendCheckerboard(buffer: Uint8Array, width: number, height: number): void {
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      const a = buffer[idx + 3];
      if (a === 255) continue;

      const bg = (x + y) % 2 === 0 ? CHECK_LIGHT : CHECK_DARK;

      if (a === 0) {
        buffer[idx] = bg;
        buffer[idx + 1] = bg;
        buffer[idx + 2] = bg;
        buffer[idx + 3] = 255;
      } else {
        const aNorm = a / 255;
        buffer[idx] = Math.round(buffer[idx] * aNorm + bg * (1 - aNorm));
        buffer[idx + 1] = Math.round(buffer[idx + 1] * aNorm + bg * (1 - aNorm));
        buffer[idx + 2] = Math.round(buffer[idx + 2] * aNorm + bg * (1 - aNorm));
        buffer[idx + 3] = 255;
      }
    }
  }
}

/**
 * Renders composited pixel art frames onto an HTML canvas element.
 *
 * Accepts asset state as JSON (from structuredContent) and uses compositeFrame()
 * to flatten visible layers into RGBA pixels. Renders at 1:1 pixel scale;
 * zoom is applied via CSS `transform: scale()` with `image-rendering: pixelated`
 * for nearest-neighbor upscaling.
 */
export class CanvasRenderer {
  private container: HTMLElement;
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private _zoom = 1;
  private _offsetX = 0;
  private _offsetY = 0;
  private _isPanning = false;
  private _spaceHeld = false;
  private _panStartX = 0;
  private _panStartY = 0;
  private _panStartOffsetX = 0;
  private _panStartOffsetY = 0;
  private _flatLayers: CompositeLayer[] = [];
  private _artWidth = 0;
  private _artHeight = 0;
  private _frameIndex = 0;
  private abortController = new AbortController();
  private _onViewChange: (() => void) | null = null;

  constructor(container: HTMLElement) {
    this.container = container;

    // Configure container as viewport
    container.style.overflow = 'hidden';
    container.style.position = 'relative';

    // Create canvas inside container
    const canvas = document.createElement('canvas');
    canvas.style.imageRendering = 'pixelated';
    canvas.style.transformOrigin = '0 0';
    container.appendChild(canvas);
    this.canvas = canvas;

    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D context not available');
    this.ctx = ctx;

    this.applyTransform();
    this.attachWheelListener();
    this.attachPanListeners();
  }

  private applyTransform(): void {
    this.canvas.style.transform =
      `translate(${String(this._offsetX)}px, ${String(this._offsetY)}px) scale(${String(this._zoom)})`;
    this._onViewChange?.();
  }

  private attachWheelListener(): void {
    this.container.addEventListener(
      'wheel',
      (e: WheelEvent) => {
        e.preventDefault();

        const rect = this.container.getBoundingClientRect();
        const cursorX = e.clientX - rect.left;
        const cursorY = e.clientY - rect.top;

        const delta = e.deltaY > 0 ? -1 : 1;
        this.setZoom(this._zoom + delta, cursorX, cursorY);
      },
      { passive: false, signal: this.abortController.signal },
    );
  }

  private updateCursor(): void {
    if (this._isPanning) {
      this.container.style.cursor = 'grabbing';
    } else if (this._spaceHeld) {
      this.container.style.cursor = 'grab';
    } else {
      this.container.style.cursor = '';
    }
  }

  private attachPanListeners(): void {
    const signal = this.abortController.signal;

    // Middle-click or space+left-click starts pan
    this.container.addEventListener(
      'mousedown',
      (e: MouseEvent) => {
        if (e.button === 1 || (e.button === 0 && this._spaceHeld)) {
          e.preventDefault();
          this._isPanning = true;
          this._panStartX = e.clientX;
          this._panStartY = e.clientY;
          this._panStartOffsetX = this._offsetX;
          this._panStartOffsetY = this._offsetY;
          this.updateCursor();
        }
      },
      { signal },
    );

    // Suppress context menu on middle-click (some browsers)
    this.container.addEventListener('contextmenu', (e: MouseEvent) => { e.preventDefault(); }, {
      signal,
    });

    // Track drag on window so panning works outside container
    window.addEventListener(
      'mousemove',
      (e: MouseEvent) => {
        if (!this._isPanning) return;
        this._offsetX = this._panStartOffsetX + (e.clientX - this._panStartX);
        this._offsetY = this._panStartOffsetY + (e.clientY - this._panStartY);
        this.applyTransform();
      },
      { signal },
    );

    window.addEventListener(
      'mouseup',
      (e: MouseEvent) => {
        if (!this._isPanning) return;
        if (e.button === 1 || e.button === 0) {
          this._isPanning = false;
          this.updateCursor();
        }
      },
      { signal },
    );

    // Space key toggles pan mode for left-click
    window.addEventListener(
      'keydown',
      (e: KeyboardEvent) => {
        if (e.code === 'Space' && !e.repeat) {
          e.preventDefault();
          this._spaceHeld = true;
          this.updateCursor();
        }
      },
      { signal },
    );

    window.addEventListener(
      'keyup',
      (e: KeyboardEvent) => {
        if (e.code === 'Space') {
          this._spaceHeld = false;
          if (this._isPanning) {
            this._isPanning = false;
          }
          this.updateCursor();
        }
      },
      { signal },
    );
  }

  get zoom(): number {
    return this._zoom;
  }

  get offset(): { x: number; y: number } {
    return { x: this._offsetX, y: this._offsetY };
  }

  get isPanning(): boolean {
    return this._isPanning;
  }

  get spaceHeld(): boolean {
    return this._spaceHeld;
  }

  get canvasContainer(): HTMLElement {
    return this.container;
  }

  /** Register a callback that fires whenever zoom or pan changes. */
  set onViewChange(cb: (() => void) | null) {
    this._onViewChange = cb;
  }

  /**
   * Draws a single pixel directly on the canvas for optimistic rendering.
   * Coordinates are in art-space (1:1 pixel).
   */
  drawPixel(x: number, y: number, r: number, g: number, b: number, a: number): void {
    this.ctx.fillStyle = `rgba(${String(r)},${String(g)},${String(b)},${String(a / 255)})`;
    this.ctx.fillRect(x, y, 1, 1);
  }

  setPan(dx: number, dy: number): void {
    this._offsetX = dx;
    this._offsetY = dy;
    this.applyTransform();
  }

  setZoom(level: number, anchorX?: number, anchorY?: number): void {
    const newZoom = Math.max(1, Math.min(16, Math.round(level)));
    if (newZoom === this._zoom) return;

    const oldZoom = this._zoom;

    if (anchorX !== undefined && anchorY !== undefined) {
      // Keep the art pixel under the cursor fixed in screen space
      const artX = (anchorX - this._offsetX) / oldZoom;
      const artY = (anchorY - this._offsetY) / oldZoom;
      this._offsetX = anchorX - artX * newZoom;
      this._offsetY = anchorY - artY * newZoom;
    }

    this._zoom = newZoom;
    this.applyTransform();
  }

  zoomToFit(artWidth: number, artHeight: number): void {
    const containerRect = this.container.getBoundingClientRect();
    const scaleX = containerRect.width / artWidth;
    const scaleY = containerRect.height / artHeight;
    const fitZoom = Math.max(1, Math.min(16, Math.floor(Math.min(scaleX, scaleY))));

    // Center the art in the container
    this._offsetX = (containerRect.width - artWidth * fitZoom) / 2;
    this._offsetY = (containerRect.height - artHeight * fitZoom) / 2;
    this._zoom = fitZoom;
    this.applyTransform();
  }

  dispose(): void {
    this.abortController.abort();
    this.container.removeChild(this.canvas);
  }

  /**
   * Maps screen coordinates to art-space pixel and returns the topmost
   * visible palette index. Returns null if outside art bounds.
   */
  getPixelAt(
    clientX: number,
    clientY: number,
  ): { x: number; y: number; colorIndex: number | null } | null {
    const rect = this.container.getBoundingClientRect();
    const artX = Math.floor((clientX - rect.left - this._offsetX) / this._zoom);
    const artY = Math.floor((clientY - rect.top - this._offsetY) / this._zoom);

    if (artX < 0 || artX >= this._artWidth || artY < 0 || artY >= this._artHeight) return null;

    // Walk layers top-to-bottom (reverse of bottom-to-top render order)
    for (let i = this._flatLayers.length - 1; i >= 0; i--) {
      const idx = this._flatLayers[i].getPixel(artX, artY, this._frameIndex);
      if (idx !== null) return { x: artX, y: artY, colorIndex: idx };
    }

    return { x: artX, y: artY, colorIndex: null };
  }

  /**
   * Composites all visible image layers and draws to canvas.
   */
  render(
    width: number,
    height: number,
    cels: Record<string, unknown>,
    layers: Layer[],
    palette: Palette,
    frameIndex: number,
  ): void {
    // Resize canvas if needed (resets content)
    if (this.canvas.width !== width) this.canvas.width = width;
    if (this.canvas.height !== height) this.canvas.height = height;

    // Build adapter structures
    const compositeLayers = jsonToCompositeLayers(layers, cels);
    const paletteMap = jsonPaletteToMap(palette);

    // Cache for getPixelAt() lookups
    this._artWidth = width;
    this._artHeight = height;
    this._frameIndex = frameIndex;
    this._flatLayers = flattenCompositeLayers(compositeLayers);

    // Composite frame → RGBA buffer
    const buffer = compositeFrame(width, height, compositeLayers, paletteMap, frameIndex);

    // Blend over checkerboard for transparent pixels
    blendCheckerboard(buffer, width, height);

    // Draw to canvas
    const imageData = new ImageData(
      new Uint8ClampedArray(buffer.buffer, buffer.byteOffset, buffer.length),
      width,
      height,
    );
    this.ctx.putImageData(imageData, 0, 0);
  }
}
