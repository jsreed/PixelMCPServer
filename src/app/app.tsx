import { render } from 'preact';
import { useState, useEffect, useRef, useCallback } from 'preact/hooks';
import { App } from '@modelcontextprotocol/ext-apps';
import { applyDocumentTheme, applyHostStyleVariables } from '@modelcontextprotocol/ext-apps';
import { CanvasRenderer } from './canvas.js';
import { Toolbar, useCanvasTool } from './toolbar.js';
import type { ToolType, DrawStrokeParams, FillParams } from './toolbar.js';
import { PalettePanel } from './palette.js';
import { LayerPanel } from './layers.js';
import { Timeline } from './timeline.js';
import {
  SelectionOverlay,
  useSelectionTool,
  SelectionBar,
  computeDominantColors,
} from './selection.js';
import type { SelectionRectParams, DragRect } from './selection.js';
import type { Palette, Color } from '../types/palette.js';
import type { Layer } from '../types/layer.js';
import type { Frame } from '../types/frame.js';
import type { FrameTag } from '../types/tag.js';
import type { SelectionMask } from '../types/selection.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Mirrors the structuredContent payload from buildAssetStateForFrame in editor.ts */
interface AssetState {
  asset_name: string;
  width: number;
  height: number;
  perspective: string;
  palette: Palette;
  layers: Layer[];
  frames: Frame[];
  tags: Array<{ type: string; name: string; start: number; end: number; direction: string }>;
  frame_index: number;
  cels: Record<string, unknown>;
}

/** Server-driven state replaced atomically on each refresh */
interface EditorState {
  assetName: string;
  width: number;
  height: number;
  palette: Palette;
  layers: Layer[];
  frames: Frame[];
  tags: FrameTag[];
  cels: Record<string, unknown>;
  activeFrameIndex: number;
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const rootStyle: Record<string, string> = {
  display: 'flex',
  flexDirection: 'column',
  height: '100vh',
  backgroundColor: '#1e1e2e',
  color: '#ccc',
  fontFamily: 'sans-serif',
  fontSize: '12px',
  overflow: 'hidden',
};

const topBarStyle: Record<string, string> = {
  display: 'flex',
  alignItems: 'center',
  borderBottom: '1px solid #333',
  flexShrink: '0',
};

const middleRowStyle: Record<string, string> = {
  display: 'flex',
  flex: '1',
  overflow: 'hidden',
};

const sidePanelStyle: Record<string, string> = {
  width: '120px',
  overflowY: 'auto',
  borderRight: '1px solid #333',
  flexShrink: '0',
};

const rightPanelStyle: Record<string, string> = {
  width: '160px',
  overflowY: 'auto',
  borderLeft: '1px solid #333',
  flexShrink: '0',
};

const canvasAreaStyle: Record<string, string> = {
  flex: '1',
  position: 'relative',
  overflow: 'hidden',
  backgroundColor: '#2a2a3a',
};

const bottomBarStyle: Record<string, string> = {
  borderTop: '1px solid #333',
  flexShrink: '0',
};

const statusBarStyle: Record<string, string> = {
  display: 'flex',
  alignItems: 'center',
  gap: '12px',
  padding: '2px 8px',
  fontSize: '11px',
  color: '#999',
  borderTop: '1px solid #333',
  flexShrink: '0',
};

const statusSwatchStyle: Record<string, string> = {
  width: '10px',
  height: '10px',
  border: '1px solid #555',
  display: 'inline-block',
};

const loadingStyle: Record<string, string> = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  height: '100vh',
  color: '#666',
  fontSize: '14px',
};

// ---------------------------------------------------------------------------
// Module-level App instance + bridge variables
// ---------------------------------------------------------------------------

const mcpApp = new App({ name: 'PixelMCP Editor', version: '1.0.0' }, {});

let stateCallback: ((state: AssetState) => void) | null = null;
let lastAIOpCallback: ((op: string) => void) | null = null;
let pendingState: AssetState | null = null;
let currentAssetName: string | null = null;
let currentFrameIndex = 0;
let rendererInstance: CanvasRenderer | null = null;
/** Counter > 0 suppresses ontoolresult-triggered auto-refresh (UI already refreshes). */
let pendingUIRefreshCount = 0;

function isAssetState(obj: Record<string, unknown>): obj is Record<string, unknown> & { asset_name: string } {
  return typeof obj['asset_name'] === 'string';
}

async function refreshState(frameIndex?: number): Promise<void> {
  if (!currentAssetName) return;
  try {
    const result = await mcpApp.callServerTool({
      name: 'get_asset_state',
      arguments: { asset_name: currentAssetName, frame_index: frameIndex ?? currentFrameIndex },
    });
    if (result.structuredContent && stateCallback) {
      stateCallback(result.structuredContent as unknown as AssetState);
    }
  } catch (e: unknown) {
    console.error('refreshState failed:', e);
  }
}

// ---------------------------------------------------------------------------
// Register handlers BEFORE connect()
// ---------------------------------------------------------------------------

mcpApp.ontoolresult = (params) => {
  // Extract last AI operation text
  if (params.content) {
    for (const block of params.content) {
      if (block.type === 'text' && 'text' in block) {
        lastAIOpCallback?.(block.text);
        break;
      }
    }
  }

  if (params.structuredContent && isAssetState(params.structuredContent)) {
    const state = params.structuredContent as unknown as AssetState;
    currentAssetName = state.asset_name;
    currentFrameIndex = state.frame_index;
    if (stateCallback) {
      stateCallback(state);
    } else {
      pendingState = state;
    }
  } else if (currentAssetName && pendingUIRefreshCount === 0) {
    // AI called a mutating tool — refresh to sync
    void refreshState();
  }
};

mcpApp.onhostcontextchanged = (params) => {
  if (params.theme) {
    applyDocumentTheme(params.theme);
  }
  if (params.styles?.variables) {
    applyHostStyleVariables(params.styles.variables);
  }
};

mcpApp.onteardown = (_params, _extra) => {
  rendererInstance?.dispose();
  rendererInstance = null;
  return {};
};

// ---------------------------------------------------------------------------
// StatusBar Component (7.9.3)
// ---------------------------------------------------------------------------

interface StatusBarProps {
  activeTool: ToolType;
  activeLayerName: string | null;
  activeColorIndex: number;
  activeColor: Color | null;
  lastAIOp: string | null;
}

function StatusBar({ activeTool, activeLayerName, activeColorIndex, activeColor, lastAIOp }: StatusBarProps) {
  const swatchColor = activeColor
    ? `rgb(${String(activeColor[0])}, ${String(activeColor[1])}, ${String(activeColor[2])})`
    : 'transparent';

  return (
    <div style={statusBarStyle}>
      <span>Tool: {activeTool}</span>
      <span>Layer: {activeLayerName ?? 'none'}</span>
      <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
        Color:
        <span style={{ ...statusSwatchStyle, backgroundColor: swatchColor }} />
        [{String(activeColorIndex)}]
      </span>
      {lastAIOp && (
        <span style={{ marginLeft: 'auto', opacity: '0.7', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '300px' }}>
          AI: {lastAIOp}
        </span>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Editor Component (7.9.1 + 7.9.2)
// ---------------------------------------------------------------------------

function parseAssetState(raw: AssetState): EditorState {
  const frameTags: FrameTag[] = [];
  for (const tag of raw.tags) {
    if (tag.type === 'frame') {
      frameTags.push(tag as unknown as FrameTag);
    }
  }
  return {
    assetName: raw.asset_name,
    width: raw.width,
    height: raw.height,
    palette: raw.palette,
    layers: raw.layers,
    frames: raw.frames,
    tags: frameTags,
    cels: raw.cels,
    activeFrameIndex: raw.frame_index,
  };
}

function Editor() {
  // -- Server-driven state --
  const [editorState, setEditorState] = useState<EditorState | null>(null);

  // -- UI-driven state --
  const [activeTool, setActiveTool] = useState<ToolType>('pencil');
  const [activeLayerId, setActiveLayerId] = useState<number | null>(null);
  const [activeColorIndex, setActiveColorIndex] = useState(1);
  const [selection, setSelection] = useState<SelectionMask | null>(null);
  const [dragPreview, setDragPreview] = useState<DragRect | null>(null);
  const [lastAIOp, setLastAIOp] = useState<string | null>(null);
  const [viewZoom, setViewZoom] = useState(1);
  const [viewOffset, setViewOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  // -- Refs --
  const rendererRef = useRef<CanvasRenderer | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const hasZoomedToFit = useRef(false);
  /** Tracks locally-toggled layer visibility overrides (layerId → visible). */
  const visibilityOverrides = useRef<Map<number, boolean>>(new Map());

  // -- Bridge: connect module-level callbacks to component state --
  useEffect(() => {
    stateCallback = (raw: AssetState) => {
      const parsed = parseAssetState(raw);
      // Apply local visibility overrides so user-toggled layers survive server refresh
      const overrides = visibilityOverrides.current;
      if (overrides.size > 0) {
        parsed.layers = parsed.layers.map((l) => {
          const vis = overrides.get(l.id);
          return vis !== undefined ? { ...l, visible: vis } : l;
        });
      }
      setEditorState(parsed);
    };
    lastAIOpCallback = (op: string) => {
      setLastAIOp(op);
    };

    // Apply any state that arrived before mount
    if (pendingState) {
      const state = pendingState;
      pendingState = null;
      setEditorState(parseAssetState(state));
    }

    return () => {
      stateCallback = null;
      lastAIOpCallback = null;
    };
  }, []);

  // -- Auto-select first image layer on first state arrival --
  useEffect(() => {
    if (editorState && activeLayerId === null && editorState.layers.length > 0) {
      const firstImage = editorState.layers.find((l) => l.type === 'image');
      if (firstImage) {
        setActiveLayerId(firstImage.id);
      }
    }
  }, [editorState, activeLayerId]);

  // -- Canvas renderer lifecycle --
  useEffect(() => {
    if (!editorState || !containerRef.current) return;

    if (!rendererRef.current) {
      rendererRef.current = new CanvasRenderer(containerRef.current);
      rendererInstance = rendererRef.current;
      rendererRef.current.onViewChange = () => {
        const r = rendererRef.current;
        if (r) {
          setViewZoom(r.zoom);
          setViewOffset(r.offset);
        }
      };
    }

    rendererRef.current.render(
      editorState.width,
      editorState.height,
      editorState.cels,
      editorState.layers,
      editorState.palette,
      editorState.activeFrameIndex,
    );

    if (!hasZoomedToFit.current) {
      rendererRef.current.zoomToFit(editorState.width, editorState.height);
      setViewZoom(rendererRef.current.zoom);
      setViewOffset(rendererRef.current.offset);
      hasZoomedToFit.current = true;
    }
  }, [editorState]);

  // -- Global styles --
  useEffect(() => {
    document.body.style.margin = '0';
    document.body.style.padding = '0';
    document.body.style.overflow = 'hidden';
    document.documentElement.style.margin = '0';
    document.documentElement.style.padding = '0';
    document.documentElement.style.overflow = 'hidden';
  }, []);

  // -- Callback handlers --

  /** Calls a server tool, suppresses auto-refresh from ontoolresult, then refreshes manually. */
  const callToolAndRefresh = useCallback(async (name: string, args: Record<string, unknown>) => {
    pendingUIRefreshCount++;
    try {
      await mcpApp.callServerTool({ name, arguments: args });
      await refreshState();
    } catch (e: unknown) {
      console.error(`callServerTool(${name}) failed:`, e);
    } finally {
      pendingUIRefreshCount--;
    }
  }, []);

  const handleDrawStroke = useCallback(async (params: DrawStrokeParams) => {
    await callToolAndRefresh('draw', {
      asset_name: params.assetName,
      layer_id: params.layerId,
      frame_index: params.frameIndex,
      operations: params.operations,
    });
  }, [callToolAndRefresh]);

  const handleFill = useCallback(async (params: FillParams) => {
    await callToolAndRefresh('draw', {
      asset_name: params.assetName,
      layer_id: params.layerId,
      frame_index: params.frameIndex,
      operations: [{ action: 'fill', x: params.x, y: params.y, color: params.color }],
    });
  }, [callToolAndRefresh]);

  const handlePickColor = useCallback((colorIndex: number) => {
    setActiveColorIndex(colorIndex);
  }, []);

  const handleUndo = useCallback(async () => {
    await callToolAndRefresh('workspace', { action: 'undo' });
  }, [callToolAndRefresh]);

  const handleRedo = useCallback(async () => {
    await callToolAndRefresh('workspace', { action: 'redo' });
  }, [callToolAndRefresh]);

  const handleToggleVisibility = useCallback((layerId: number, visible: boolean) => {
    // Track override so it survives server state refreshes
    visibilityOverrides.current.set(layerId, visible);
    // Local-only: update layer visibility in state for re-render
    setEditorState((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        layers: prev.layers.map((l) => (l.id === layerId ? { ...l, visible } : l)),
      };
    });
  }, []);

  const handleSelectionRect = useCallback(async (params: SelectionRectParams) => {
    // Set selection optimistically
    setSelection({
      asset_name: params.assetName,
      layer_id: params.layerId,
      frame_index: params.frameIndex,
      x: params.x,
      y: params.y,
      width: params.width,
      height: params.height,
      mask: Array.from({ length: params.height }, () =>
        Array.from({ length: params.width }, () => true),
      ),
    });

    try {
      await mcpApp.callServerTool({
        name: 'selection',
        arguments: {
          action: 'rect',
          asset_name: params.assetName,
          layer_id: params.layerId,
          frame_index: params.frameIndex,
          x: params.x,
          y: params.y,
          width: params.width,
          height: params.height,
        },
      });
    } catch (e: unknown) {
      console.error('selection rect failed:', e);
    }
  }, []);

  const handleSelectAll = useCallback(async () => {
    if (!editorState || activeLayerId === null) return;
    setSelection({
      asset_name: editorState.assetName,
      layer_id: activeLayerId,
      frame_index: editorState.activeFrameIndex,
      x: 0,
      y: 0,
      width: editorState.width,
      height: editorState.height,
      mask: Array.from({ length: editorState.height }, () =>
        Array.from({ length: editorState.width }, () => true),
      ),
    });

    try {
      await mcpApp.callServerTool({
        name: 'selection',
        arguments: {
          action: 'all',
          asset_name: editorState.assetName,
          layer_id: activeLayerId,
          frame_index: editorState.activeFrameIndex,
        },
      });
    } catch (e: unknown) {
      console.error('selection all failed:', e);
    }
  }, [editorState, activeLayerId]);

  const handleClearSelection = useCallback(async () => {
    setSelection(null);
    try {
      await mcpApp.callServerTool({
        name: 'selection',
        arguments: { action: 'clear' },
      });
    } catch (e: unknown) {
      console.error('selection clear failed:', e);
    }
  }, []);

  const handleReferenceInAI = useCallback(async () => {
    if (!editorState || !selection || activeLayerId === null) return;

    const dominantColors = computeDominantColors(
      editorState.cels,
      activeLayerId,
      editorState.activeFrameIndex,
      selection,
      editorState.palette,
    );

    const yaml = [
      '---',
      'type: pixel_selection',
      `asset: ${editorState.assetName}`,
      `layer_id: ${String(activeLayerId)}`,
      `frame_index: ${String(editorState.activeFrameIndex)}`,
      `region: { x: ${String(selection.x)}, y: ${String(selection.y)}, w: ${String(selection.width)}, h: ${String(selection.height)} }`,
      'dominant_colors:',
      ...dominantColors.map(
        (c) =>
          `  - { index: ${String(c.index)}, count: ${String(c.count)}, hex: "${c.hex}" }`,
      ),
      '---',
    ].join('\n');

    try {
      await mcpApp.updateModelContext({
        content: [{ type: 'text', text: yaml }],
      });
    } catch (e: unknown) {
      console.error('updateModelContext failed:', e);
    }
  }, [editorState, selection, activeLayerId]);

  const handleSelectFrame = useCallback(async (frameIndex: number) => {
    currentFrameIndex = frameIndex;
    await refreshState(frameIndex);
  }, []);

  // -- Hook wiring --

  useCanvasTool({
    renderer: rendererRef.current,
    activeTool,
    activeColorIndex,
    activeLayerId,
    activeFrameIndex: editorState?.activeFrameIndex ?? 0,
    assetName: editorState?.assetName ?? null,
    artWidth: editorState?.width ?? 0,
    artHeight: editorState?.height ?? 0,
    palette: editorState?.palette ?? [],
    onDrawStroke: handleDrawStroke,
    onFill: handleFill,
    onPickColor: handlePickColor,
  });

  useSelectionTool({
    renderer: rendererRef.current,
    activeTool,
    assetName: editorState?.assetName ?? null,
    activeLayerId,
    activeFrameIndex: editorState?.activeFrameIndex ?? 0,
    artWidth: editorState?.width ?? 0,
    artHeight: editorState?.height ?? 0,
    onSelectionRect: handleSelectionRect,
    onDragPreview: setDragPreview,
  });

  // -- Derived values --

  const activeLayer = editorState?.layers.find((l) => l.id === activeLayerId) ?? null;
  const activeColor: Color | null =
    editorState?.palette[activeColorIndex] ?? null;

  // -- Render --

  if (!editorState) {
    return <div style={loadingStyle}>Waiting for asset data...</div>;
  }

  return (
    <div style={rootStyle}>
      {/* Top bar: Toolbar + SelectionBar */}
      <div style={topBarStyle}>
        <Toolbar
          activeTool={activeTool}
          onSelectTool={setActiveTool}
          onUndo={handleUndo}
          onRedo={handleRedo}
          canUndo={true}
          canRedo={true}
        />
        <div style={{ marginLeft: 'auto' }}>
          <SelectionBar
            hasSelection={selection !== null}
            onSelectAll={handleSelectAll}
            onClear={handleClearSelection}
            onReferenceInAI={handleReferenceInAI}
          />
        </div>
      </div>

      {/* Middle: Palette | Canvas | Layers */}
      <div style={middleRowStyle}>
        <div style={sidePanelStyle}>
          <PalettePanel
            palette={editorState.palette}
            activeColorIndex={activeColorIndex}
            onSelectColor={setActiveColorIndex}
          />
        </div>
        <div style={canvasAreaStyle} ref={containerRef}>
          <SelectionOverlay
            selection={selection}
            dragPreview={dragPreview}
            zoom={viewZoom}
            offset={viewOffset}
            artWidth={editorState.width}
            artHeight={editorState.height}
          />
        </div>
        <div style={rightPanelStyle}>
          <LayerPanel
            layers={editorState.layers}
            activeLayerId={activeLayerId}
            onSelectLayer={setActiveLayerId}
            onToggleVisibility={handleToggleVisibility}
          />
        </div>
      </div>

      {/* Bottom: Timeline */}
      <div style={bottomBarStyle}>
        <Timeline
          frames={editorState.frames}
          tags={editorState.tags}
          activeFrameIndex={editorState.activeFrameIndex}
          onSelectFrame={handleSelectFrame}
        />
      </div>

      {/* Status bar */}
      <StatusBar
        activeTool={activeTool}
        activeLayerName={activeLayer?.name ?? null}
        activeColorIndex={activeColorIndex}
        activeColor={activeColor}
        lastAIOp={lastAIOp}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Connect + mount
// ---------------------------------------------------------------------------

void mcpApp.connect().then(() => {
  const ctx = mcpApp.getHostContext();
  if (ctx?.theme) {
    applyDocumentTheme(ctx.theme);
  }
  if (ctx?.styles?.variables) {
    applyHostStyleVariables(ctx.styles.variables);
  }

  render(<Editor />, document.getElementById('app')!);
});
