import { type AssetClass } from '../classes/asset.js';
import { type PaletteClass } from '../classes/palette.js';
import { type CompositeLayer, type PaletteEntry } from '../algorithms/composite.js';

export function buildCompositeLayers(asset: AssetClass): CompositeLayer[] {
  const compLayers: Record<number, CompositeLayer> = {};

  for (const layer of asset.layers) {
    compLayers[layer.id] = {
      id: layer.id,
      type: layer.type,
      visible: layer.visible,
      opacity: layer.opacity,
      children: layer.type === 'group' ? [] : undefined,
      getPixel: (x, y, frame) => {
        const cel = asset.getCel(layer.id, frame);
        if (!cel || !('data' in cel)) return null;
        const cx = x - cel.x;
        const cy = y - cel.y;
        if (cy >= 0 && cy < cel.data.length && cx >= 0 && cx < (cel.data[0]?.length ?? 0)) {
          const val = cel.data[cy][cx];
          return val === 0 ? null : val;
        }
        return null;
      },
    };
  }

  const rootLayers: CompositeLayer[] = [];
  for (const layer of asset.layers) {
    const comp = compLayers[layer.id];
    if (layer.parent_id !== undefined) {
      const parent = compLayers[layer.parent_id];
      if (parent.type === 'group') {
        (parent.children as CompositeLayer[]).push(comp);
      } else {
        rootLayers.push(comp);
      }
    } else {
      rootLayers.push(comp);
    }
  }

  return rootLayers;
}

export function buildPaletteMap(palette: PaletteClass): Map<number, PaletteEntry> {
  const map = new Map<number, PaletteEntry>();
  for (let i = 0; i < 256; i++) {
    const [r, g, b, a] = palette.get(i);
    map.set(i, { r, g, b, a });
  }
  return map;
}
