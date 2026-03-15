import type { Color, Palette } from '../types/palette.js';

const SWATCH_SIZE = 16;

const gridStyle: Record<string, string> = {
  display: 'grid',
  gridTemplateColumns: `repeat(auto-fill, ${String(SWATCH_SIZE)}px)`,
  gap: '1px',
  padding: '4px',
};

const checkerboardBg: Record<string, string> = {
  backgroundImage: [
    'linear-gradient(45deg, #ccc 25%, transparent 25%)',
    'linear-gradient(-45deg, #ccc 25%, transparent 25%)',
    'linear-gradient(45deg, transparent 75%, #ccc 75%)',
    'linear-gradient(-45deg, transparent 75%, #ccc 75%)',
  ].join(', '),
  backgroundSize: '8px 8px',
  backgroundPosition: '0 0, 0 4px, 4px -4px, -4px 0',
};

const baseSwatchStyle: Record<string, string> = {
  width: `${String(SWATCH_SIZE)}px`,
  height: `${String(SWATCH_SIZE)}px`,
  boxSizing: 'border-box',
};

const activeBorder = '2px solid #fff';
const activeOutline = '1px solid #000';

interface SwatchProps {
  index: number;
  color: Color;
  active: boolean;
  onSelect: (index: number) => void;
}

function toHex(n: number): string {
  return n.toString(16).padStart(2, '0');
}

function swatchTooltip(index: number, [r, g, b, a]: Color): string {
  return `[${String(index)}] #${toHex(r)}${toHex(g)}${toHex(b)}${a < 255 ? toHex(a) : ''}`;
}

function Swatch({ index, color, active, onSelect }: SwatchProps) {
  const [r, g, b, a] = color;

  const activeStyle: Record<string, string> = active
    ? { border: activeBorder, outline: activeOutline }
    : {};

  const handleClick = () => {
    onSelect(index);
  };

  const title = swatchTooltip(index, color);

  if (index === 0) {
    return (
      <div
        title={title}
        style={{ ...baseSwatchStyle, ...checkerboardBg, ...activeStyle, cursor: 'pointer' }}
        onClick={handleClick}
      />
    );
  }

  if (a < 255) {
    return (
      <div
        title={title}
        style={{ ...baseSwatchStyle, ...checkerboardBg, ...activeStyle, cursor: 'pointer' }}
        onClick={handleClick}
      >
        <div
          style={{
            width: '100%',
            height: '100%',
            backgroundColor: `rgba(${String(r)}, ${String(g)}, ${String(b)}, ${String(a / 255)})`,
          }}
        />
      </div>
    );
  }

  return (
    <div
      title={title}
      style={{
        ...baseSwatchStyle,
        ...activeStyle,
        backgroundColor: `rgb(${String(r)}, ${String(g)}, ${String(b)})`,
        cursor: 'pointer',
      }}
      onClick={handleClick}
    />
  );
}

interface PalettePanelProps {
  palette: Palette;
  activeColorIndex: number;
  onSelectColor: (index: number) => void;
}

export function PalettePanel({ palette, activeColorIndex, onSelectColor }: PalettePanelProps) {
  return (
    <div style={gridStyle}>
      {palette.map((color, index) => {
        if (!color) return null;
        return (
          <Swatch
            key={index}
            index={index}
            color={color}
            active={index === activeColorIndex}
            onSelect={onSelectColor}
          />
        );
      })}
    </div>
  );
}
