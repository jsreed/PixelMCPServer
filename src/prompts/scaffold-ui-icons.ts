import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { buildPaletteStep } from './palette-step.js';

export function buildScaffoldUiIconsText(args: {
  name: string;
  icon_size?: number;
  count?: number;
  palette?: string;
}): string {
  const iconSize = args.icon_size ?? 16;
  const count = args.count ?? 1;

  // Build ordered list of asset names: {name}_01, {name}_02, ...
  const assetNames = Array.from({ length: count }, (_, i) => {
    const num = String(i + 1).padStart(2, '0');
    return `${args.name}_${num}`;
  });
  const assetNamesList = assetNames.map((n) => `"${n}"`).join(', ');
  const firstAsset = assetNames[0] ?? `${args.name}_01`;

  const paletteStep = buildPaletteStep(
    args.name,
    args.palette,
    'UI accent colors and a transparent index 0.',
  );

  const createSteps = assetNames
    .map(
      (n) =>
        `  - \`asset create\` with name="${n}", width=${String(iconSize)}, height=${String(iconSize)}, perspective="orthogonal"`,
    )
    .join('\n');

  return `Scaffold a UI icon set named "${args.name}" — ${String(count)} icon${count === 1 ? '' : 's'} at ${String(iconSize)}×${String(iconSize)} px each.

Follow these steps in order, calling the tool actions exactly as described:

---

## Step 1 — Create the assets

${createSteps}

Each asset is a separate ${String(iconSize)}×${String(iconSize)} canvas. They will be packed into a shared atlas in the export step.

---

## Step 2 — Set up the palette

${paletteStep}

Recommended minimum palette slots:
  - Index 0: transparent [0, 0, 0, 0]
  - Index 1: outline color (dark, high contrast)
  - Index 2–5: UI color ramp (dark → mid → light → bright)
  - Index 6: highlight / specular

Apply the same palette to all icons in the set so they share a consistent look.

---

## Step 3 — Draw each icon

For each asset, target it with the explicit \`asset_name\` parameter.

Use \`draw write_pixels\` to set the full ${String(iconSize)}×${String(iconSize)} pixel grid in one call, or use \`draw pixel\`, \`draw rect\`, and \`draw fill\` for incremental edits.

Pixel art tips for ${String(iconSize)}px icons:
  - Keep a clear, recognizable silhouette — the icon must read at small sizes
  - Use consistent 1–2px padding from all edges across every icon in the set
  - Outline every shape with index 1 (darkest) for contrast against any background
  - Use the same outline thickness and style across all icons for visual cohesion
  - Limit detail — at ${String(iconSize)}px, fewer colors and shapes read more clearly

After drawing each icon, preview it:
${assetNames.map((n) => `  pixel://view/asset/${n}`).join('\n')}

---

## Step 4 — Export as a Godot atlas

Call \`export godot_atlas\` with:
  - asset_names: [${assetNamesList}]
  - path: "<output_dir>"

This writes:
  - \`${args.name}.png\` — the packed atlas image
  - \`${args.name}.png.import\` — Godot import sidecar
  - \`${args.name}.tres\` — a Godot resource with a named \`AtlasTexture\` sub-resource for each icon

In Godot, reference each icon as \`${args.name}.tres::${firstAsset}\` (and similarly for each asset name).

---

## Step 5 — Save

Call \`workspace save\` when the icon set is complete.
`;
}

export function registerScaffoldUiIconsPrompt(server: McpServer): void {
  server.registerPrompt(
    'scaffold_ui_icons',
    {
      title: 'Scaffold UI Icons',
      description:
        'Guide through creating a set of UI icon assets and exporting them as a packed Godot atlas with named AtlasTexture sub-resources.',
      argsSchema: {
        name: z
          .string()
          .describe(
            'Base name for the icon set; individual icons are named {name}_01, {name}_02, etc.',
          ),
        icon_size: z
          .number()
          .int()
          .positive()
          .optional()
          .describe('Icon dimensions in pixels (square), default 16'),
        count: z
          .number()
          .int()
          .positive()
          .optional()
          .describe('Number of icons in the set, default 1'),
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
            text: buildScaffoldUiIconsText(args),
          },
        },
      ],
    }),
  );
}
