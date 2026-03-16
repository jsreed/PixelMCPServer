import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { buildPaletteStep } from './palette-step.js';

/**
 * Resolves semantic layer names for a given layer count.
 */
function resolveLayerNames(count: number): string[] {
  if (count === 1) return ['background'];
  if (count === 2) return ['far_bg', 'near_fg'];
  if (count === 3) return ['far_bg', 'mid', 'near_fg'];
  if (count === 4) return ['far_bg', 'sky', 'mid', 'near_fg'];
  if (count === 5) return ['far_bg', 'sky', 'mid', 'hills', 'near_fg'];
  // 6+: mid layers go from 1 to count-3
  const midCount = count - 3;
  const mids = Array.from({ length: midCount }, (_, i) => `mid${String(i + 1)}`);
  return ['far_bg', 'sky', ...mids, 'near_fg'];
}

/**
 * Computes scroll speeds for each layer.
 * Farthest (index 0) = 0.10, nearest (last) = 1.00.
 */
function computeScrollSpeeds(count: number): number[] {
  if (count === 1) return [1.0];
  return Array.from({ length: count }, (_, i) => {
    const raw = 0.1 + (0.9 * i) / (count - 1);
    return Math.round(raw * 100) / 100;
  });
}

/**
 * Returns per-layer color treatment guidance based on depth position.
 */
function layerColorTreatment(i: number, count: number): string {
  if (i === 0) return 'desaturated, light, blue-shifted; large flat shapes';
  if (i === count - 1) return 'saturated, dark, high contrast; detailed foreground elements';
  const ratio = i / (count - 1);
  if (ratio <= 0.4) return 'slightly desaturated, light-mid values; soft shapes';
  if (ratio <= 0.6) return 'mid saturation, mid values; silhouette shapes';
  return 'moderately saturated, mid-dark values; defined shapes';
}

/**
 * Returns drawing guidance for a layer based on its depth position.
 */
function layerDrawingGuidance(i: number, count: number): string {
  if (i === 0) {
    return `Solid sky gradient or flat fill. Use indices 1–2 (lightest, desaturated). Large horizontal bands — sky top, haze near horizon. Very low detail, no distinct shapes.`;
  }
  if (i === count - 1) {
    return `Detailed foreground elements — grass tufts, rocks, branches, fences. Use indices 7–9. High contrast. Elements may be partially cut off at the bottom edge (they extend below the viewport).`;
  }
  const ratio = i / (count - 1);
  if (ratio <= 0.35) {
    return `Sparse cloud shapes using indices 1–3. Soft-edged blobs, minimal detail. Keep ~80% of pixels transparent (index 0).`;
  }
  return `Silhouette shapes — hills, trees, distant buildings. Use indices 4–6. Shapes fill the bottom 30–50% of the canvas. Flat color fills with no internal detail.`;
}

/**
 * Builds the step-by-step scaffold text for the `scaffold_parallax` prompt.
 * Extracted as a pure function so it can be unit tested independently of the MCP SDK.
 */
export function buildScaffoldParallaxText(args: {
  name: string;
  layer_count?: number;
  viewport_width?: number;
  height?: number;
  palette?: string;
}): string {
  const layerCount = args.layer_count ?? 4;
  const viewportWidth = args.viewport_width ?? 320;
  const height = args.height ?? 180;
  const canvasWidth = viewportWidth * 2;

  const layerNames = resolveLayerNames(layerCount);
  const speeds = computeScrollSpeeds(layerCount);

  const paletteStep = buildPaletteStep(
    args.name,
    args.palette,
    'a sky color, horizon fade colors, ground tones, and foliage/detail colors.',
  );

  // Step 3 — layer creation lines
  const layerLines = layerNames
    .map((n) => `  - \`asset add_layer\` type="image", name="${n}"`)
    .join('\n');

  // Step 4 — scroll speed table
  const tableRows = layerNames
    .map((n, i) => {
      const speed = speeds[i] ?? 1.0;
      const speedStr = speed.toFixed(2);
      return `| ${n} | ${speedStr}× | ${layerColorTreatment(i, layerCount)} |`;
    })
    .join('\n');

  // Step 6 — per-layer draw subsections
  const drawSections = layerNames
    .map((n, i) => {
      const speed = speeds[i] ?? 1.0;
      const speedStr = speed.toFixed(2);
      const guidance = layerDrawingGuidance(i, layerCount);
      return `### Layer: ${n} (scroll: ${speedStr}×)

  Target: asset="${args.name}", layer=<${n} layer id>, frame_index=0

  ${guidance}

  Use \`draw write_pixels\` with the full ${String(canvasWidth)}×${String(height)} 2D array for efficiency, or \`draw rect\`/\`draw fill\` for large regions.`;
    })
    .join('\n\n');

  return `Scaffold a parallax background named "${args.name}" (${String(canvasWidth)}×${String(height)} px, ${String(layerCount)} depth layers).

Follow these steps in order, calling the tool actions exactly as described:

---

## Step 1 — Create the asset

Call \`asset create\` with:
  - name: "${args.name}"
  - width: ${String(canvasWidth)}, height: ${String(height)}
  - perspective: "side_view"

---

## Step 2 — Set up the palette

${paletteStep}

Atmospheric perspective color guidance:
  - Far layers: desaturated, light values, blue-shifted (sky, haze), low contrast
  - Near layers: saturated, dark values, more detail, higher contrast

Recommended palette slots:
  - Index 0: transparent [0, 0, 0, 0]
  - Index 1–3: sky/atmosphere ramp (light, desaturated blues/whites)
  - Index 4–6: mid-ground terrain ramp (muted greens/grays/browns)
  - Index 7–9: foreground detail ramp (saturated, dark)
  - Index 10: highlight/accent

---

## Step 3 — Create layers

Call \`asset add_layer\` for each depth layer (bottom of stack = farthest, slowest scroll):
${layerLines}
  - \`asset add_layer\` type="shape", name="camera_bounds"

The bottom layer in the stack is the farthest (slowest scroll); the top layer is the nearest (fastest scroll).

---

## Step 4 — Scroll speeds and atmospheric depth

Assign scroll speeds in your engine. In Godot, scroll speed maps to \`ParallaxLayer.motion_scale.x\`.

| Layer | Scroll Speed | Color treatment |
|-------|-------------|-----------------|
${tableRows}

---

## Step 5 — Seamless tiling guidance

Canvas width is ${String(canvasWidth)} px = 2 × viewport width (${String(viewportWidth)} px).
This allows one full horizontal scroll cycle before the tile repeats.

For seamless tiling: pixels in column 0 must match pixels in column ${String(canvasWidth - 1)} for each row.

Drawing approaches:
  - (A) Draw full-width content then fix seam pixels with \`draw pixel\`
  - (B) Ensure both edges use the same background color (sky/ground fill)

Verify seamlessness: check that \`data[y][0] === data[y][${String(canvasWidth - 1)}]\` for every row \`y\`.

---

## Step 6 — Draw each layer

Draw from bottom (farthest) to top (nearest):

${drawSections}

---

## Step 7 — Animation tag

Call \`asset add_tag\` name="scroll", start=0, end=0, direction="forward"

For animated elements (water shimmer, blowing leaves), add 2–4 extra frames and use direction="ping_pong".

---

## Step 8 — Save

Call \`workspace save\` (or \`workspace save_all\`) when the asset is complete.

After each significant drawing step, you can preview with the resource URI:
  pixel://view/asset/${args.name}
`;
}

export function registerScaffoldParallaxPrompt(server: McpServer): void {
  server.registerPrompt(
    'scaffold_parallax',
    {
      title: 'Scaffold Parallax Background',
      description:
        'Guide through creating a multi-layer parallax background with depth ordering, atmospheric perspective color guidance, and seamless horizontal tiling.',
      argsSchema: {
        name: z.string().describe('Asset name for the parallax background'),
        layer_count: z
          .number()
          .int()
          .min(1)
          .optional()
          .describe('Number of parallax depth layers, default 4'),
        viewport_width: z
          .number()
          .int()
          .positive()
          .optional()
          .describe(
            'Viewport width in pixels (canvas will be 2x this for seamless tiling), default 320',
          ),
        height: z
          .number()
          .int()
          .positive()
          .optional()
          .describe('Canvas height in pixels, default 180'),
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
            text: buildScaffoldParallaxText(args),
          },
        },
      ],
    }),
  );
}
