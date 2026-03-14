import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { buildPaletteStep } from './palette-step.js';

export function buildScaffoldUiFrameText(args: {
  name: string;
  width?: number;
  height?: number;
  palette?: string;
}): string {
  const w = args.width ?? 48;
  const h = args.height ?? 48;
  const margin = Math.floor(Math.min(w, h) / 6);

  const paletteStep = buildPaletteStep(
    args.name,
    args.palette,
    'border color, fill color, highlight, and shadow.',
  );

  return `Scaffold a nine-slice UI frame asset named "${args.name}" (${String(w)}×${String(h)} px).

Follow these steps in order, calling the tool actions exactly as described:

---

## Step 1 — Create the asset

Call \`asset create\` with:
  - name: "${args.name}"
  - width: ${String(w)}, height: ${String(h)}
  - perspective: "orthogonal"

Then add the pixel layer:
  - Call \`asset add_layer\` with type="image", name="frame"

---

## Step 2 — Set up the palette

${paletteStep}

Recommended minimum palette slots:
  - Index 0: transparent [0, 0, 0, 0]
  - Index 1: darkest border / outline
  - Index 2: mid-tone fill (darker)
  - Index 3: mid-tone fill (lighter)
  - Index 4: highlight (brightest edge)
  - Index 5: shadow (inner depth)

---

## Step 3 — Understand nine-slice regions

A nine-slice (9-slice) frame is divided into 9 regions by 4 margin values (top, right, bottom, left — all in pixels):

\`\`\`
┌──────────┬──────────────────┬──────────┐
│ top-left │   top edge       │ top-right│  ← top margin = ${String(margin)}px
│  corner  │  (scales horiz)  │  corner  │
├──────────┼──────────────────┼──────────┤
│   left   │                  │  right   │
│   edge   │     center       │   edge   │  ← scales in both axes
│  (vert)  │                  │  (vert)  │
├──────────┼──────────────────┼──────────┤
│ bot-left │  bottom edge     │ bot-right│  ← bottom margin = ${String(margin)}px
│  corner  │  (scales horiz)  │  corner  │
└──────────┴──────────────────┴──────────┘
  ←${String(margin)}px→                    ←${String(margin)}px→
\`\`\`

- **Corners** — fixed size, never scaled. Draw the border detail here.
- **Edges** — scale along one axis to fit any button width/height. Keep them tileable.
- **Center** — scales in both axes. Usually transparent or a subtle fill.

In Godot, \`StyleBoxTexture\` reads the nine_slice margins embedded in the asset and uses them
to stretch the frame to any target size without distorting the corners.

---

## Step 4 — Draw the frame

Target: asset="${args.name}", layer=frame layer id, frame_index=0

Draw in this recommended order:

**Corners** — use \`draw rect\` for each ${String(margin)}×${String(margin)} corner region:
  - Top-left:     x=0,            y=0,             width=${String(margin)}, height=${String(margin)}
  - Top-right:    x=${String(w - margin)}, y=0,             width=${String(margin)}, height=${String(margin)}
  - Bottom-left:  x=0,            y=${String(h - margin)}, width=${String(margin)}, height=${String(margin)}
  - Bottom-right: x=${String(w - margin)}, y=${String(h - margin)}, width=${String(margin)}, height=${String(margin)}

**Edges** — use \`draw rect\` for the four edge strips:
  - Top edge:    x=${String(margin)}, y=0,             width=${String(w - margin * 2)}, height=${String(margin)}
  - Bottom edge: x=${String(margin)}, y=${String(h - margin)}, width=${String(w - margin * 2)}, height=${String(margin)}
  - Left edge:   x=0,            y=${String(margin)}, width=${String(margin)}, height=${String(h - margin * 2)}
  - Right edge:  x=${String(w - margin)}, y=${String(margin)}, width=${String(margin)}, height=${String(h - margin * 2)}

**Center fill** — use \`draw fill\` or \`draw rect\` on the inner region:
  - x=${String(margin)}, y=${String(margin)}, width=${String(w - margin * 2)}, height=${String(h - margin * 2)}
  - Can be left transparent (index 0) for button backgrounds that show content behind them

**Highlights and shadows** — add depth with \`draw line\` or \`draw pixel\`:
  - Highlight: draw along the inner top and left edges of the border (index 4)
  - Shadow: draw along the inner bottom and right edges of the border (index 5)

Preview as you draw:
  pixel://view/asset/${args.name}

---

## Step 5 — Set nine-slice margins

Call \`asset set_nine_slice\` with:
  - asset_name: "${args.name}"
  - top: ${String(margin)}
  - right: ${String(margin)}
  - bottom: ${String(margin)}
  - left: ${String(margin)}

This stores the margin values in the asset so the export step can embed them in the Godot resource.

---

## Step 6 — Export for Godot

Call \`export godot_ui_frame\` with:
  - asset_name: "${args.name}"
  - path: "<output_dir>"

This writes:
  - \`${args.name}.png\` — the frame texture
  - \`${args.name}.png.import\` — Godot import sidecar
  - \`${args.name}.tres\` — a \`StyleBoxTexture\` resource with the nine-slice margins embedded

In Godot, assign \`${args.name}.tres\` to any \`StyleBox\` slot (Panel, Button, etc.) and it will
stretch correctly at any size.

---

## Step 7 — Save

Call \`workspace save\` when the frame is complete.
`;
}

export function registerScaffoldUiFramePrompt(server: McpServer): void {
  server.registerPrompt(
    'scaffold_ui_frame',
    {
      title: 'Scaffold UI Frame',
      description:
        'Guide through creating a nine-slice UI frame asset and exporting it as a Godot StyleBoxTexture resource.',
      argsSchema: {
        name: z.string().describe('Asset name for the UI frame'),
        width: z
          .number()
          .int()
          .positive()
          .optional()
          .describe('Canvas width in pixels, default 48'),
        height: z
          .number()
          .int()
          .positive()
          .optional()
          .describe('Canvas height in pixels, default 48'),
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
            text: buildScaffoldUiFrameText(args),
          },
        },
      ],
    }),
  );
}
