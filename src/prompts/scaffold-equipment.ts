import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

/**
 * Equipment types supported by the scaffold.
 * Each type maps to a distinct layer structure recommendation.
 */
const EQUIPMENT_LAYER_PRESETS: Record<
  string,
  { layers: Array<{ type: 'image' | 'shape'; name: string; role?: string }>; drawHints: string[] }
> = {
  weapon: {
    layers: [
      { type: 'image', name: 'base' },
      { type: 'image', name: 'detail' },
      { type: 'shape', name: 'grip', role: 'interaction_point' },
    ],
    drawHints: [
      'Draw the blade/head of the weapon on the `base` layer — use index 1 for outline, index 3 for body fill.',
      'Add edge highlights, rivets, or engravings on the `detail` layer using lighter palette indices.',
      'Keep the blade/impact area within the upper portion of the canvas; leave room for the handle at the bottom.',
      'For a sword: head occupies ~60% of canvas height, grip ~40%.',
      'For an axe or hammer: the head should be heavier/wider; the shaft thinner.',
    ],
  },
  armor_head: {
    layers: [
      { type: 'image', name: 'base' },
      { type: 'image', name: 'visor' },
      { type: 'shape', name: 'attachment', role: 'attachment_point' },
    ],
    drawHints: [
      'Draw the helmet shell/rim on the `base` layer.',
      'Add visor, eye-slit, or face detail on the `visor` layer (drawn on top).',
      'Align the attachment shape to the head-top anchor pixel of the reference character (usually the topmost non-transparent pixel of its head region).',
      'Keep cheek guards and ear-pieces within the canvas bounds.',
    ],
  },
  armor_chest: {
    layers: [
      { type: 'image', name: 'base' },
      { type: 'image', name: 'overlay' },
      { type: 'shape', name: 'attachment', role: 'attachment_point' },
    ],
    drawHints: [
      'Draw the chest plate silhouette on the `base` layer — match the torso region of the reference character.',
      'Add padding seams, buckles, or decorative elements on the `overlay` layer.',
      'The attachment shape should cover the torso bounding box for physics or hit-detection.',
      'Shoulder guards, if any, should extend slightly beyond the canvas edge.',
    ],
  },
  cape: {
    layers: [
      { type: 'image', name: 'base' },
      { type: 'image', name: 'overlay' },
      { type: 'shape', name: 'attachment', role: 'attachment_point' },
    ],
    drawHints: [
      "Draw the cape body on the `base` layer — it should flow below the character's shoulder line.",
      'Add lining, trim, or emblem on the `overlay` layer.',
      'Capes are often wider than the character body — use the full canvas width.',
      'For animated capes, each frame of the animation should show a different flow position.',
    ],
  },
};

/**
 * Resolves the correct layer preset for the given equipment type string.
 * Falls back to a generic "base/detail/bounds" preset for unknown types.
 *
 * @param type - Equipment type string (e.g. "weapon", "armor_head", etc.)
 * @returns The layer preset object with layers and drawHints arrays.
 */
function resolvePreset(type: string): {
  layers: Array<{ type: 'image' | 'shape'; name: string; role?: string }>;
  drawHints: string[];
} {
  return (
    EQUIPMENT_LAYER_PRESETS[type] ?? {
      layers: [
        { type: 'image' as const, name: 'base' },
        { type: 'image' as const, name: 'detail' },
        { type: 'shape' as const, name: 'bounds', role: 'attachment_point' },
      ],
      drawHints: [
        `Draw the main ${type} sprite on the \`base\` layer — use index 1 for outline, index 3 for fill.`,
        'Add highlights, engravings, or trim on the `detail` layer.',
        'Set the `bounds` shape to cover the full opaque region for physics / hit-detection.',
      ],
    }
  );
}

/**
 * Builds the step-by-step scaffold text for the `scaffold_equipment` prompt.
 * Extracted as a pure function so it can be unit tested independently of the MCP SDK.
 *
 * @param args - Prompt arguments provided by the user.
 * @param args.name - Asset name for the equipment sprite.
 * @param args.type - Equipment category (e.g. "weapon", "armor_head", "cape"); defaults to "weapon".
 * @param args.reference_character - Optional asset name of the base body to match dimensions/tags from.
 * @returns Markdown-formatted step-by-step instructions for the LLM.
 */
export function buildScaffoldEquipmentText(args: {
  name: string;
  type?: string;
  reference_character?: string;
}): string {
  const equipType = args.type ?? 'weapon';
  const preset = resolvePreset(equipType);

  // ─── Palette step (same detection logic as scaffold_character / scaffold_tileset) ─
  // Equipment prompts don't accept a `palette` arg; they share with the reference character.
  const paletteStep = args.reference_character
    ? `  - This equipment will share the palette of the reference character.
    After creating the asset, call \`palette info\` on \`"${args.name}"\` to inspect its current palette.
    If the project default palette was applied, it is likely already aligned with \`"${args.reference_character}"\`.
    Otherwise, call \`palette load\` or \`palette set_bulk\` to match the reference character's colors.`
    : `  - No reference character was specified. Call \`palette info\` on \`"${args.name}"\` to check the current palette.
    If the project has a default palette configured, it was applied automatically.
    Otherwise, use \`palette set_bulk\` to add at least: index 0 = transparent [0,0,0,0],
    an outline color, a primary fill color, a shadow, and a highlight.`;

  // ─── Layer add_layer commands ─────────────────────────────────────────────
  const layerLines = preset.layers.map((l) => {
    const roleStr = l.role ? `, role="${l.role}"` : '';
    return `  - \`asset add_layer\` type="${l.type}", name="${l.name}"${roleStr}`;
  });

  // ─── Step 1 wording for dimensions ───────────────────────────────────────
  const dimensionStep = args.reference_character
    ? `Before creating the equipment asset, query the reference character's dimensions:
  - Call \`asset info\` on \`"${args.reference_character}"\` and note: \`width\`, \`height\`, and the tags array.

Then call \`asset create\` with:
  - name: "${args.name}"
  - width: <width from reference character info>
  - height: <height from reference character info>

Using matching canvas dimensions ensures equipment pixels align 1:1 with the character at runtime.`
    : `Call \`asset create\` with:
  - name: "${args.name}"
  - width: 32, height: 32

Adjust width/height if your game's equipment convention differs (e.g. 16×16 for small icons, 32×48 for full-body capes).`;

  // ─── Step 4 tag instructions ──────────────────────────────────────────────
  const tagStep = args.reference_character
    ? `Mirror the animation tags of \`"${args.reference_character}"\`:
  - From the \`asset info\` you retrieved in step 1, find all **frame tags** (not layer tags).
  - For each frame tag, replicate it on \`"${args.name}"\` using \`asset add_tag\` with the same
    \`name\`, \`start\`, \`end\`, \`direction\`, and \`facing\` values.
  - This ensures the equipment animation index aligns frame-for-frame with the character.

> **Important**: only replicate FrameTag entries (tags with \`start\`/\`end\` frame indices).
> Skip any LayerTag entries.`
    : `Add 4-directional idle tags (one still frame per facing):
  - \`asset add_tag\` name="idle", start=0, end=0, direction="forward", facing="S"
  - \`asset add_tag\` name="idle", start=0, end=0, direction="forward", facing="N"
  - \`asset add_tag\` name="idle", start=0, end=0, direction="forward", facing="E"
  - \`asset add_tag\` name="idle", start=0, end=0, direction="forward", facing="W"

Add more frames and walk/attack tags as needed for your specific animation set.`;

  // ─── Step 5 draw hints ────────────────────────────────────────────────────
  const drawHintLines = preset.drawHints.map((h) => `  - ${h}`).join('\n');

  // ─── Variant hint ─────────────────────────────────────────────────────────
  const variantHint =
    equipType === 'weapon' ||
    equipType === 'armor_head' ||
    equipType === 'armor_chest' ||
    equipType === 'cape'
      ? `
---

## Step 6 — Create fit variants (optional)

If this equipment has multiple visual variants (e.g. "iron", "steel", "enchanted"), create a recolor:
  - Call \`asset create_recolor\` with the variant name and a \`palette_entries\` map to swap colors.
  - The registry will store \`recolor_of: "${args.name}"\` for the variant.
  - For structural shape differences (not just recolors), repeat Steps 1–5 for each variant instead.`
      : '';

  return `Scaffold a \`${equipType}\` equipment sprite asset named "${args.name}".

Follow these steps in order, calling the tool actions exactly as described:

---

## Step 1 — Create the asset

${dimensionStep}

---

## Step 2 — Set up the palette

${paletteStep}

Recommended palette slots for equipment:
  - Index 0: transparent [0, 0, 0, 0]
  - Index 1: darkest outline color
  - Index 2–3: primary material ramp (dark → mid)
  - Index 4: primary material highlight
  - Index 5: secondary material or accent (gems, trim, etc.)
  - Index 6: specular / metallic highlight (pure white or near-white)

---

## Step 3 — Create layers

Call \`asset add_layer\` for each layer (bottom to top):
${layerLines.join('\n')}

---

## Step 4 — Create directional frame tags

${tagStep}

---

## Step 5 — Draw the equipment sprite

Use \`draw write_pixels\` (full 2D pixel array) for efficiency on larger canvases, or
\`draw pixel\` / \`draw rect\` / \`draw fill\` for smaller targeted edits.

Target: asset="${args.name}", layer=base layer id, frame_index=0

${drawHintLines}

General pixel art tips for equipment:
  - Use index 0 (transparent) for all pixels outside the equipment silhouette.
  - Outline the shape first with the darkest color (index 1), then fill interior with mid-tone (index 2–3).
  - Add a single highlight pixel or row on the side facing the light source (index 4 or 6).
${
  args.reference_character
    ? `  - Use \`pixel://view/asset/${args.reference_character}\` to visually preview the reference character
    and compare alignment with \`pixel://view/asset/${args.name}\`.`
    : `  - Preview at any time using the resource URI:
    pixel://view/asset/${args.name}`
}
${variantHint}

---

## Final step — Save

Call \`workspace save\` (or \`workspace save_all\`) when the asset is complete.

Preview the finished equipment:
  pixel://view/asset/${args.name}
`;
}

/**
 * Registers the `scaffold_equipment` MCP prompt with the server.
 *
 * This prompt guides the LLM through creating an equipment or item sprite that
 * is correctly sized, layered, and tagged to align with a reference character asset.
 *
 * @param server - The MCP server instance to register the prompt on.
 */
export function registerScaffoldEquipmentPrompt(server: McpServer): void {
  server.registerPrompt(
    'scaffold_equipment',
    {
      title: 'Scaffold Equipment',
      description:
        'Guide through creating an equipment or item sprite sized and layered to match a reference character. Supports weapons, armor, capes, and custom types with type-specific layer structures and directional tag alignment.',
      argsSchema: {
        name: z.string().describe('Asset name for the equipment sprite'),
        type: z
          .string()
          .optional()
          .describe(
            'Equipment category: "weapon", "armor_head", "armor_chest", "cape", or any custom string. Determines the default layer structure. Defaults to "weapon".',
          ),
        reference_character: z
          .string()
          .optional()
          .describe(
            "Asset name of the base character this equipment is designed for. When provided, the scaffold queries the character's dimensions and tags so the equipment canvas and animation frame indices align.",
          ),
      },
    },
    (args) => ({
      messages: [
        {
          role: 'user' as const,
          content: {
            type: 'text' as const,
            text: buildScaffoldEquipmentText(args),
          },
        },
      ],
    }),
  );
}
