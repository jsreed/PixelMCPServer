import { useEffect, useRef } from 'preact/hooks';
import type { ImageCel } from '../types/cel.js';
import type { Palette } from '../types/palette.js';
import type { SelectionMask } from '../types/selection.js';
import type { CanvasRenderer } from './canvas.js';
import type { ToolType } from './toolbar.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SelectionRectParams {
  assetName: string;
  layerId: number;
  frameIndex: number;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface DragRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const MARCHING_ANTS_STYLE_ID = 'pixelmcp-marching-ants';

const selectionBarStyle: Record<string, string> = {
  display: 'flex',
  alignItems: 'center',
  gap: '4px',
  padding: '4px',
};

const selectionButtonBase: Record<string, string> = {
  background: 'none',
  border: '1px solid #555',
  color: '#ccc',
  cursor: 'pointer',
  fontSize: '11px',
  height: '24px',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  borderRadius: '2px',
  padding: '0 6px',
  whiteSpace: 'nowrap',
};

const disabledOpacity = '0.4';

// ---------------------------------------------------------------------------
// Marching ants CSS injection
// ---------------------------------------------------------------------------

function ensureMarchingAntsStyle(): void {
  if (document.getElementById(MARCHING_ANTS_STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = MARCHING_ANTS_STYLE_ID;
  style.textContent = `
    @keyframes marchingAnts {
      to { stroke-dashoffset: -8; }
    }
  `;
  document.head.appendChild(style);
}

// ---------------------------------------------------------------------------
// SelectionOverlay Component
// ---------------------------------------------------------------------------

interface SelectionOverlayProps {
  selection: SelectionMask | null;
  dragPreview: DragRect | null;
  zoom: number;
  offset: { x: number; y: number };
  artWidth: number;
  artHeight: number;
}

export function SelectionOverlay({
  selection,
  dragPreview,
  zoom,
  offset,
  artWidth,
  artHeight,
}: SelectionOverlayProps) {
  useEffect(() => {
    ensureMarchingAntsStyle();
  }, []);

  if (!selection && !dragPreview) return null;
  if (artWidth <= 0 || artHeight <= 0) return null;

  const svgStyle: Record<string, string> = {
    position: 'absolute',
    top: '0',
    left: '0',
    width: `${String(artWidth)}px`,
    height: `${String(artHeight)}px`,
    transform: `translate(${String(offset.x)}px, ${String(offset.y)}px) scale(${String(zoom)})`,
    transformOrigin: '0 0',
    pointerEvents: 'none',
    overflow: 'visible',
  };

  return (
    <svg
      style={svgStyle}
      viewBox={`0 0 ${String(artWidth)} ${String(artHeight)}`}
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* Confirmed selection — marching ants */}
      {selection && (
        <>
          <rect
            x={selection.x}
            y={selection.y}
            width={selection.width}
            height={selection.height}
            fill="none"
            stroke="black"
            stroke-width="1"
            vector-effect="non-scaling-stroke"
            stroke-dasharray="4 4"
            style={{ animation: 'marchingAnts 0.4s linear infinite' }}
          />
          <rect
            x={selection.x}
            y={selection.y}
            width={selection.width}
            height={selection.height}
            fill="none"
            stroke="white"
            stroke-width="1"
            vector-effect="non-scaling-stroke"
            stroke-dasharray="4 4"
            stroke-dashoffset="4"
            style={{ animation: 'marchingAnts 0.4s linear infinite' }}
          />
        </>
      )}

      {/* Drag preview — static dashed rect */}
      {dragPreview && (
        <rect
          x={dragPreview.x}
          y={dragPreview.y}
          width={dragPreview.width}
          height={dragPreview.height}
          fill="none"
          stroke="white"
          stroke-width="1"
          vector-effect="non-scaling-stroke"
          stroke-dasharray="4 4"
          stroke-opacity="0.8"
        />
      )}
    </svg>
  );
}

// ---------------------------------------------------------------------------
// useSelectionTool Hook
// ---------------------------------------------------------------------------

interface UseSelectionToolOptions {
  renderer: CanvasRenderer | null;
  activeTool: ToolType;
  assetName: string | null;
  activeLayerId: number | null;
  activeFrameIndex: number;
  artWidth: number;
  artHeight: number;
  onSelectionRect: (params: SelectionRectParams) => void;
  onDragPreview: (rect: DragRect | null) => void;
}

export function useSelectionTool(options: UseSelectionToolOptions): void {
  const { renderer, activeTool, onSelectionRect, onDragPreview } = options;

  const assetNameRef = useRef(options.assetName);
  const activeLayerIdRef = useRef(options.activeLayerId);
  const activeFrameIndexRef = useRef(options.activeFrameIndex);
  const artWidthRef = useRef(options.artWidth);
  const artHeightRef = useRef(options.artHeight);
  const onSelectionRectRef = useRef(onSelectionRect);
  const onDragPreviewRef = useRef(onDragPreview);

  // Keep refs in sync
  assetNameRef.current = options.assetName;
  activeLayerIdRef.current = options.activeLayerId;
  activeFrameIndexRef.current = options.activeFrameIndex;
  artWidthRef.current = options.artWidth;
  artHeightRef.current = options.artHeight;
  onSelectionRectRef.current = onSelectionRect;
  onDragPreviewRef.current = onDragPreview;

  useEffect(() => {
    if (!renderer || activeTool !== 'select') return;

    const container = renderer.canvasContainer;
    const prevCursor = container.style.cursor;
    container.style.cursor = 'crosshair';

    let isDragging = false;
    let startX = 0;
    let startY = 0;

    const clampArtCoords = (clientX: number, clientY: number): { x: number; y: number } => {
      const rect = container.getBoundingClientRect();
      const zoom = renderer.zoom;
      const off = renderer.offset;
      const artX = Math.max(
        0,
        Math.min(artWidthRef.current - 1, Math.floor((clientX - rect.left - off.x) / zoom)),
      );
      const artY = Math.max(
        0,
        Math.min(artHeightRef.current - 1, Math.floor((clientY - rect.top - off.y) / zoom)),
      );
      return { x: artX, y: artY };
    };

    const normalizeRect = (
      ax: number,
      ay: number,
      bx: number,
      by: number,
    ): { x: number; y: number; width: number; height: number } => {
      const x = Math.min(ax, bx);
      const y = Math.min(ay, by);
      const width = Math.abs(bx - ax) + 1;
      const height = Math.abs(by - ay) + 1;
      return { x, y, width, height };
    };

    const handleMouseDown = (e: MouseEvent): void => {
      if (e.button !== 0 || renderer.spaceHeld) return;

      const pixel = renderer.getPixelAt(e.clientX, e.clientY);
      if (!pixel) return;

      e.preventDefault();
      isDragging = true;
      startX = pixel.x;
      startY = pixel.y;
      onDragPreviewRef.current({ x: pixel.x, y: pixel.y, width: 1, height: 1 });
    };

    const handleMouseMove = (e: MouseEvent): void => {
      if (!isDragging) return;

      const { x, y } = clampArtCoords(e.clientX, e.clientY);
      onDragPreviewRef.current(normalizeRect(startX, startY, x, y));
    };

    const handleMouseUp = (e: MouseEvent): void => {
      if (!isDragging || e.button !== 0) return;
      isDragging = false;

      const assetName = assetNameRef.current;
      const layerId = activeLayerIdRef.current;
      if (!assetName || layerId === null) {
        onDragPreviewRef.current(null);
        return;
      }

      const { x, y } = clampArtCoords(e.clientX, e.clientY);
      const rect = normalizeRect(startX, startY, x, y);

      onDragPreviewRef.current(null);
      onSelectionRectRef.current({
        assetName,
        layerId,
        frameIndex: activeFrameIndexRef.current,
        ...rect,
      });
    };

    container.addEventListener('mousedown', handleMouseDown);
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);

    return () => {
      container.style.cursor = prevCursor;
      container.removeEventListener('mousedown', handleMouseDown);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [renderer, activeTool]);
}

// ---------------------------------------------------------------------------
// SelectionBar Component
// ---------------------------------------------------------------------------

interface SelectionBarProps {
  hasSelection: boolean;
  onSelectAll: () => void;
  onClear: () => void;
  onReferenceInAI: () => void;
}

export function SelectionBar({ hasSelection, onSelectAll, onClear, onReferenceInAI }: SelectionBarProps) {
  return (
    <div style={selectionBarStyle}>
      <button style={selectionButtonBase} onClick={onSelectAll} title="Select All">
        Select All
      </button>
      <button
        style={{
          ...selectionButtonBase,
          ...(hasSelection ? {} : { opacity: disabledOpacity, cursor: 'default' }),
        }}
        onClick={onClear}
        disabled={!hasSelection}
        title="Clear Selection"
      >
        Clear
      </button>
      <button
        style={{
          ...selectionButtonBase,
          ...(hasSelection ? {} : { opacity: disabledOpacity, cursor: 'default' }),
        }}
        onClick={onReferenceInAI}
        disabled={!hasSelection}
        title="Reference selected region in AI conversation"
      >
        Reference in AI
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Dominant Color Histogram
// ---------------------------------------------------------------------------

function toHex(n: number): string {
  return n.toString(16).padStart(2, '0');
}

export function computeDominantColors(
  cels: Record<string, unknown>,
  layerId: number,
  frameIndex: number,
  selection: { x: number; y: number; width: number; height: number },
  palette: Palette,
): Array<{ index: number; count: number; hex: string }> {
  const key = `${String(layerId)}/${String(frameIndex)}`;
  const cel = cels[key];
  if (!cel || typeof cel !== 'object' || !('data' in cel)) return [];

  const data = (cel as ImageCel).data;
  const counts = new Map<number, number>();

  for (let dy = 0; dy < selection.height; dy++) {
    for (let dx = 0; dx < selection.width; dx++) {
      const py = selection.y + dy;
      const px = selection.x + dx;
      const row = data[py];
      if (!row) continue;
      const colorIndex = row[px];
      if (colorIndex === undefined || colorIndex === 0) continue; // 0 = transparent
      counts.set(colorIndex, (counts.get(colorIndex) ?? 0) + 1);
    }
  }

  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([index, count]) => {
      const c = palette[index];
      const hex = c ? `#${toHex(c[0])}${toHex(c[1])}${toHex(c[2])}` : '#000000';
      return { index, count, hex };
    });
}
