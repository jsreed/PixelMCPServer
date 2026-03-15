import type { Layer } from '../types/layer.js';

const listStyle: Record<string, string> = {
  display: 'flex',
  flexDirection: 'column',
  padding: '4px 0',
};

const rowStyle: Record<string, string> = {
  display: 'flex',
  alignItems: 'center',
  gap: '4px',
  padding: '2px 4px',
  cursor: 'pointer',
};

const activeRowBg = '#3a3a5c';

const typeLabelStyle: Record<string, string> = {
  fontSize: '9px',
  fontFamily: 'monospace',
  opacity: '0.6',
  width: '28px',
  flexShrink: '0',
  textAlign: 'center',
};

const nameStyle: Record<string, string> = {
  flex: '1',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  fontSize: '12px',
};

const toggleStyle: Record<string, string> = {
  cursor: 'pointer',
  fontSize: '12px',
  flexShrink: '0',
  width: '16px',
  textAlign: 'center',
};

function typeLabel(type: Layer['type']): string {
  switch (type) {
    case 'image':
      return 'IMG';
    case 'tilemap':
      return 'TILE';
    case 'shape':
      return 'SHP';
    case 'group':
      return 'GRP';
  }
}

function layerDepth(layer: Layer, layers: Layer[]): number {
  let depth = 0;
  let currentId = layer.parent_id;
  while (currentId !== undefined) {
    const parent = layers.find((l) => l.id === currentId);
    if (!parent) break;
    currentId = parent.parent_id;
    depth++;
  }
  return depth;
}

interface LayerRowProps {
  layer: Layer;
  depth: number;
  active: boolean;
  onSelect: (layerId: number) => void;
  onToggleVisibility: (layerId: number, visible: boolean) => void;
}

function LayerRow({ layer, depth, active, onSelect, onToggleVisibility }: LayerRowProps) {
  const handleClick = () => {
    onSelect(layer.id);
  };

  const handleToggle = (e: MouseEvent) => {
    e.stopPropagation();
    onToggleVisibility(layer.id, !layer.visible);
  };

  return (
    <div
      style={{
        ...rowStyle,
        paddingLeft: `${String(4 + depth * 16)}px`,
        ...(active ? { backgroundColor: activeRowBg } : {}),
      }}
      onClick={handleClick}
    >
      <span style={typeLabelStyle}>{typeLabel(layer.type)}</span>
      <span style={nameStyle}>{layer.name}</span>
      <span style={toggleStyle} onClick={handleToggle} title={layer.visible ? 'Hide layer' : 'Show layer'}>
        {layer.visible ? '\u25C9' : '\u25CB'}
      </span>
    </div>
  );
}

interface LayerPanelProps {
  layers: Layer[];
  activeLayerId: number | null;
  onSelectLayer: (layerId: number) => void;
  onToggleVisibility: (layerId: number, visible: boolean) => void;
}

export function LayerPanel({
  layers,
  activeLayerId,
  onSelectLayer,
  onToggleVisibility,
}: LayerPanelProps) {
  return (
    <div style={listStyle}>
      {layers.map((layer) => (
        <LayerRow
          key={layer.id}
          layer={layer}
          depth={layerDepth(layer, layers)}
          active={layer.id === activeLayerId}
          onSelect={onSelectLayer}
          onToggleVisibility={onToggleVisibility}
        />
      ))}
    </div>
  );
}
