import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { buildPaletteStep } from './palette-step.js';

export function buildScaffoldTilesetText(args: {
  name: string;
  tile_size?: number;
  terrain_name?: string;
  palette?: string;
}): string {
  const tileSize = args.tile_size ?? 16;
  const terrainName = args.terrain_name ?? args.name;
  const canvasW = tileSize * 8;
  const canvasH = tileSize * 6;

  const paletteStep = buildPaletteStep(
    args.name,
    args.palette,
    'an outline color, and a terrain color ramp.',
  );

  return `Scaffold a blob47 autotile tileset asset named "${args.name}" (${String(tileSize)}px tiles, ${String(canvasW)}×${String(canvasH)} canvas).

Follow these steps in order, calling the tool actions exactly as described:

---

## Step 1 — Create the asset

Call \`asset create\` with:
  - name: "${args.name}"
  - width: ${String(canvasW)}, height: ${String(canvasH)}
  - tile_width: ${String(tileSize)}, tile_height: ${String(tileSize)}

This canvas (8×6 grid of tile slots) provides room for all 47 blob47 canonical tiles plus one spare row.

---

## Step 2 — Set up the palette

${paletteStep}

Recommended minimum palette slots:
  - Index 0: transparent [0, 0, 0, 0]
  - Index 1: darkest outline color
  - Index 2–4: terrain color ramp (dark → mid → light)
  - Index 5: accent / detail color (cracks, highlights, etc.)

---

## Step 3 — Understand the blob47 layout

The blob47 system encodes each tile's neighborhood as an 8-bit bitmask where each bit represents one neighbor:

  N=1, NE=2, E=4, SE=8, S=16, SW=32, W=64, NW=128

**Corner constraint**: a corner bit is valid only when both its orthogonal neighbors are set:
  - NE (bit 2) requires N (bit 1) AND E (bit 4)
  - SE (bit 8) requires E (bit 4) AND S (bit 16)
  - SW (bit 32) requires S (bit 16) AND W (bit 64)
  - NW (bit 128) requires N (bit 1) AND W (bit 64)

This constraint reduces 256 possible bitmask values to exactly 47 valid ones.

**Canvas grid layout**: each tile slot maps to a pixel offset using the bitmask value \`v\`:
  - x offset = (v % 8) * ${String(tileSize)}
  - y offset = floor(v / 8) * ${String(tileSize)}

Only 47 of the 48 grid positions will contain tiles; the rest stay transparent.

Key bitmask values:
  - 0   = fully isolated tile (no neighbors) — all edges exposed
  - 255 = fully surrounded interior tile — no exposed edges
  - 1, 4, 16, 64 = single exposed edge (N/E/S/W only neighbors)

---

## Step 4 — Draw all 47 tile variants

Use \`draw write_pixels\` (full tile pixel array) for each tile slot, specifying the \`x\` and \`y\` pixel offset for that bitmask value's grid position.

Tile appearance guide based on bitmask:
  - **Isolated (0)**: complete standalone tile — all 4 edges shown with border detail
  - **Interior (255)**: flat fill, no edge borders — tile is fully surrounded
  - **Single-edge variants** (1=N, 4=E, 16=S, 64=W): show the one exposed edge, other three sides blend into neighbors
  - **Corner variants** (e.g., 5=N+E, 20=E+S, 80=S+W, 65=N+W): show two exposed perpendicular edges
  - **T-junction variants**: three sides exposed, one blended
  - **Straight-edge variants**: two parallel sides exposed (e.g., 17=N+S, 68=E+W)

Recommended drawing order (most impactful first):
  1. Fully interior (255) — flat fill, used most often
  2. Fully isolated (0) — complete tile with all edges
  3. Single-edge variants: 1 (N only), 4 (E only), 16 (S only), 64 (W only)
  4. Corner variants: 5 (NE corner), 20 (SE corner), 80 (SW corner), 65 (NW corner)
  5. Remaining 38 variants filling in T-junctions, straights, and partial-corner combinations

Preview the grid as you draw using the resource URI:
  pixel://view/tileset/${args.name}

---

## Step 5 — Register tiles and generate autotile data

First, do a dry run to verify which slots are occupied:
  - Call \`tileset autotile_generate\` with \`asset_name="${args.name}"\`, \`pattern="blob47"\` (omit terrain_name)
  - This returns a report of occupied vs missing canonical slots

Then assign terrain peering bits:
  - Call \`tileset autotile_generate\` with \`asset_name="${args.name}"\`, \`pattern="blob47"\`, \`terrain_name="${terrainName}"\`
  - This scans the occupied grid positions, assigns Godot peering bits to each canonical slot, and populates \`tile_terrain\`

---

## Step 6 — Set tile physics (optional)

For tiles that should have collision geometry, call \`tileset set_tile_physics\`:

Solid tiles (e.g., interior tile at bitmask 255):
  - \`tileset set_tile_physics\` with \`tile_index=255\`, full-tile rectangle polygon:
    \`physics_polygon: [[0,0],[${String(tileSize)},0],[${String(tileSize)},${String(tileSize)}],[0,${String(tileSize)}]]\`

Edge tiles (partial collision — e.g., top-edge tile at bitmask 16 exposes the south edge):
  - Use a partial rectangle covering the solid portion of the tile

Isolated and most interior tiles should be solid. Transparent/empty slots need no physics.

---

## Step 7 — Export for Godot and save

Export the tileset:
  - Call \`export godot_tileset\` with \`asset_name="${args.name}"\` and \`path="<output_dir>"\`
  - This writes \`${args.name}.png\`, \`${args.name}.png.import\`, and \`${args.name}.tres\` with terrain and collision data embedded

Save the workspace:
  - Call \`workspace save\` when done

Final preview:
  pixel://view/tileset/${args.name}
`;
}

export function registerScaffoldTilesetPrompt(server: McpServer): void {
  server.registerPrompt(
    'scaffold_tileset',
    {
      title: 'Scaffold Tileset',
      description:
        'Guide through creating a tileset asset with a terrain layer, autotile slots, and a physics collision layer.',
      argsSchema: {
        name: z.string().describe('Asset name for the tileset'),
        tile_size: z
          .number()
          .int()
          .positive()
          .optional()
          .describe('Tile size in pixels (square), default 16'),
        terrain_name: z
          .string()
          .optional()
          .describe('Name for the primary terrain type (e.g. "grass", "stone")'),
        palette: z
          .string()
          .optional()
          .describe('Lospec palette slug or path to a .json palette file'),
      },
    },
    (args) => ({
      messages: [
        {
          role: 'user' as const,
          content: {
            type: 'text' as const,
            text: buildScaffoldTilesetText(args),
          },
        },
      ],
    }),
  );
}
