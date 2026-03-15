import { useEffect, useRef } from 'preact/hooks';
import { bresenhamLine } from '../algorithms/bresenham.js';
import type { Palette } from '../types/palette.js';
import type { CanvasRenderer } from './canvas.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ToolType = 'pencil' | 'eraser' | 'eyedropper' | 'fill';

export interface DrawStrokeParams {
  assetName: string;
  layerId: number;
  frameIndex: number;
  operations: Array<{ action: 'pixel'; x: number; y: number; color: number }>;
}

export interface FillParams {
  assetName: string;
  layerId: number;
  frameIndex: number;
  x: number;
  y: number;
  color: number;
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const toolbarStyle: Record<string, string> = {
  display: 'flex',
  alignItems: 'center',
  gap: '2px',
  padding: '4px',
};

const toolButtonBase: Record<string, string> = {
  background: 'none',
  border: '1px solid #555',
  color: '#ccc',
  cursor: 'pointer',
  fontSize: '14px',
  width: '28px',
  height: '28px',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  borderRadius: '2px',
  padding: '0',
};

const activeToolBg = '#3a3a5c';
const activeToolBorder = '1px solid #7a7aff';

const separatorStyle: Record<string, string> = {
  width: '1px',
  height: '20px',
  backgroundColor: '#555',
  margin: '0 4px',
};

const disabledOpacity = '0.4';

// ---------------------------------------------------------------------------
// Toolbar Component
// ---------------------------------------------------------------------------

interface ToolbarProps {
  activeTool: ToolType;
  onSelectTool: (tool: ToolType) => void;
  onUndo: () => void;
  onRedo: () => void;
  canUndo: boolean;
  canRedo: boolean;
}

const tools: Array<{ type: ToolType; label: string; title: string }> = [
  { type: 'pencil', label: '\u270F', title: 'Pencil' },
  { type: 'eraser', label: '\u2327', title: 'Eraser' },
  { type: 'eyedropper', label: '\u25CE', title: 'Eyedropper' },
  { type: 'fill', label: '\u25A7', title: 'Fill' },
];

export function Toolbar({
  activeTool,
  onSelectTool,
  onUndo,
  onRedo,
  canUndo,
  canRedo,
}: ToolbarProps) {
  return (
    <div style={toolbarStyle}>
      {tools.map((tool) => (
        <button
          key={tool.type}
          style={{
            ...toolButtonBase,
            ...(activeTool === tool.type
              ? { backgroundColor: activeToolBg, border: activeToolBorder }
              : {}),
          }}
          onClick={() => {
            onSelectTool(tool.type);
          }}
          title={tool.title}
        >
          {tool.label}
        </button>
      ))}
      <div style={separatorStyle} />
      <button
        style={{
          ...toolButtonBase,
          ...(canUndo ? {} : { opacity: disabledOpacity, cursor: 'default' }),
        }}
        onClick={onUndo}
        disabled={!canUndo}
        title="Undo"
      >
        {'\u21A9'}
      </button>
      <button
        style={{
          ...toolButtonBase,
          ...(canRedo ? {} : { opacity: disabledOpacity, cursor: 'default' }),
        }}
        onClick={onRedo}
        disabled={!canRedo}
        title="Redo"
      >
        {'\u21AA'}
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// useCanvasTool Hook
// ---------------------------------------------------------------------------

interface UseCanvasToolOptions {
  renderer: CanvasRenderer | null;
  activeTool: ToolType;
  activeColorIndex: number;
  activeLayerId: number | null;
  activeFrameIndex: number;
  assetName: string | null;
  artWidth: number;
  artHeight: number;
  palette: Palette;
  onDrawStroke: (params: DrawStrokeParams) => void;
  onFill: (params: FillParams) => void;
  onPickColor: (colorIndex: number) => void;
}

export function useCanvasTool(options: UseCanvasToolOptions): void {
  const { renderer, activeTool, onDrawStroke, onFill, onPickColor } = options;

  // Refs for values that change frequently — avoids re-attaching listeners
  const activeColorIndexRef = useRef(options.activeColorIndex);
  const activeLayerIdRef = useRef(options.activeLayerId);
  const activeFrameIndexRef = useRef(options.activeFrameIndex);
  const assetNameRef = useRef(options.assetName);
  const artWidthRef = useRef(options.artWidth);
  const artHeightRef = useRef(options.artHeight);
  const paletteRef = useRef(options.palette);
  const onDrawStrokeRef = useRef(onDrawStroke);
  const onFillRef = useRef(onFill);
  const onPickColorRef = useRef(onPickColor);

  // Keep refs in sync
  activeColorIndexRef.current = options.activeColorIndex;
  activeLayerIdRef.current = options.activeLayerId;
  activeFrameIndexRef.current = options.activeFrameIndex;
  assetNameRef.current = options.assetName;
  artWidthRef.current = options.artWidth;
  artHeightRef.current = options.artHeight;
  paletteRef.current = options.palette;
  onDrawStrokeRef.current = onDrawStroke;
  onFillRef.current = onFill;
  onPickColorRef.current = onPickColor;

  useEffect(() => {
    if (!renderer) return;

    const container = renderer.canvasContainer;

    // Stroke state (pencil / eraser)
    let isDrawing = false;
    let strokeMap: Map<string, { x: number; y: number }> = new Map();
    let lastArtX = -1;
    let lastArtY = -1;

    const addStrokePoint = (x: number, y: number): void => {
      const w = artWidthRef.current;
      const h = artHeightRef.current;
      if (x < 0 || x >= w || y < 0 || y >= h) return;

      const key = `${String(x)},${String(y)}`;
      if (strokeMap.has(key)) return;
      strokeMap.set(key, { x, y });

      // Optimistic rendering for pencil (not eraser — eraser result depends on layers below)
      if (activeTool === 'pencil') {
        const color = paletteRef.current[activeColorIndexRef.current];
        if (color) {
          renderer.drawPixel(x, y, color[0], color[1], color[2], color[3]);
        }
      }
    };

    const handleMouseDown = (e: MouseEvent): void => {
      if (e.button !== 0 || renderer.spaceHeld) return;

      const assetName = assetNameRef.current;
      const layerId = activeLayerIdRef.current;
      if (!assetName || layerId === null) return;

      if (activeTool === 'pencil' || activeTool === 'eraser') {
        const pixel = renderer.getPixelAt(e.clientX, e.clientY);
        if (!pixel) return;
        e.preventDefault();
        isDrawing = true;
        strokeMap = new Map();
        lastArtX = pixel.x;
        lastArtY = pixel.y;
        addStrokePoint(pixel.x, pixel.y);
      } else if (activeTool === 'eyedropper') {
        e.preventDefault();
        const pixel = renderer.getPixelAt(e.clientX, e.clientY);
        if (pixel && pixel.colorIndex !== null) {
          onPickColorRef.current(pixel.colorIndex);
        }
      } else if (activeTool === 'fill') {
        e.preventDefault();
        const pixel = renderer.getPixelAt(e.clientX, e.clientY);
        if (pixel) {
          onFillRef.current({
            assetName,
            layerId,
            frameIndex: activeFrameIndexRef.current,
            x: pixel.x,
            y: pixel.y,
            color: activeColorIndexRef.current,
          });
        }
      }
    };

    const handleMouseMove = (e: MouseEvent): void => {
      if (!isDrawing) return;

      const pixel = renderer.getPixelAt(e.clientX, e.clientY);
      if (!pixel) return;

      // Interpolate between last point and current point
      const points = bresenhamLine(lastArtX, lastArtY, pixel.x, pixel.y);
      // Skip first point (already added as lastArt)
      for (let i = 1; i < points.length; i++) {
        addStrokePoint(points[i].x, points[i].y);
      }

      lastArtX = pixel.x;
      lastArtY = pixel.y;
    };

    const handleMouseUp = (e: MouseEvent): void => {
      if (!isDrawing || e.button !== 0) return;
      isDrawing = false;

      const assetName = assetNameRef.current;
      const layerId = activeLayerIdRef.current;
      if (!assetName || layerId === null || strokeMap.size === 0) return;

      const colorIndex = activeTool === 'eraser' ? 0 : activeColorIndexRef.current;

      const operations: Array<{ action: 'pixel'; x: number; y: number; color: number }> = [];
      for (const pt of strokeMap.values()) {
        operations.push({ action: 'pixel', x: pt.x, y: pt.y, color: colorIndex });
      }

      onDrawStrokeRef.current({
        assetName,
        layerId,
        frameIndex: activeFrameIndexRef.current,
        operations,
      });

      strokeMap = new Map();
    };

    // Attach mousedown to container, mousemove/mouseup to window
    container.addEventListener('mousedown', handleMouseDown);
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);

    return () => {
      container.removeEventListener('mousedown', handleMouseDown);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [renderer, activeTool]);
}
