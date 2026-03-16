import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { buildPaletteStep } from './palette-step.js';

type PropType = 'destructible' | 'interactable' | 'decoration';

interface PropState {
  name: string;
  frames: number;
  duration_ms: number;
  hint: string;
}

interface PropPreset {
  states: PropState[];
  layers: Array<{ type: 'image' | 'shape'; name: string; role?: string; description: string }>;
  drawHints: string[];
  paletteGuidance: string;
  scaleHint: string;
}

const PROP_PRESETS: Record<PropType, PropPreset> = {
  destructible: {
    states: [
      {
        name: 'normal',
        frames: 1,
        duration_ms: 500,
        hint: 'Idle/intact state — draw the complete, undamaged prop with clean lines and full color.',
      },
      {
        name: 'breaking',
        frames: 3,
        duration_ms: 80,
        hint: 'Impact/destruction animation — progressively add cracks and fragments to the debris layer each frame. First frame: first crack appears; second frame: major fractures; third frame: structure crumbling.',
      },
      {
        name: 'broken',
        frames: 1,
        duration_ms: 500,
        hint: 'Final debris state — show only scattered fragments. The base layer should be mostly transparent; debris layer shows the remnants.',
      },
    ],
    layers: [
      { type: 'image', name: 'base', description: 'intact prop body' },
      { type: 'image', name: 'debris', description: 'breakage fragments' },
      { type: 'shape', name: 'hitbox', role: 'hitbox', description: 'collision box' },
    ],
    drawHints: [
      'Draw the intact prop on `base`; leave `debris` transparent for the normal state.',
      'For breaking frames, progressively add cracks/fragments to `debris` each frame.',
      'For the broken state, show only scattered debris on `debris`; clear `base` to mostly transparent.',
      'Keep debris fragments within the original bounding box so physics transitions are seamless.',
    ],
    paletteGuidance:
      'sturdy material colors (wood brown/stone gray), crack/damage highlight, dark shading, debris dust color',
    scaleHint: 'Props like crates and pots are typically 0.5×–1× character height',
  },
  interactable: {
    states: [
      {
        name: 'closed',
        frames: 1,
        duration_ms: 500,
        hint: 'Default state — draw the prop fully closed. Lid/door flush with body on the detail layer.',
      },
      {
        name: 'opening',
        frames: 2,
        duration_ms: 100,
        hint: 'Transition animation — add lid/door movement on the detail layer. Frame 0: slight lift; Frame 1: halfway open.',
      },
      {
        name: 'open',
        frames: 1,
        duration_ms: 500,
        hint: 'Activated state — draw fully open position. Detail layer shows lid/door at full open angle; interior shadow visible.',
      },
    ],
    layers: [
      { type: 'image', name: 'base', description: 'prop body' },
      { type: 'image', name: 'detail', description: 'state overlays like lids' },
      { type: 'shape', name: 'hitbox', role: 'hitbox', description: 'collision' },
      {
        type: 'shape',
        name: 'interaction_area',
        role: 'interaction_area',
        description: 'trigger zone',
      },
    ],
    drawHints: [
      'Draw the closed prop body on `base`; this layer stays static across all states.',
      'For the opening/open states, add lid/door movement on `detail` — this layer changes each state.',
      'The interaction_area shape should extend 2–4 px beyond the hitbox on all sides.',
      'Use a slightly lighter interior color on the open state to suggest depth inside the container.',
    ],
    paletteGuidance:
      'material base color ramp (wood/metal), hinge/accent color, interior shadow, glow/highlight for activated state',
    scaleHint: 'Chests and doors are typically 0.75×–1.5× character width',
  },
  decoration: {
    states: [
      {
        name: 'idle',
        frames: 2,
        duration_ms: 300,
        hint: 'Subtle ambient animation — draw static prop on base; add 1–2 px movement on detail between frames (e.g. leaf sway, candle flicker). Keep animation subtle so it does not distract.',
      },
    ],
    layers: [
      { type: 'image', name: 'base', description: 'prop body' },
      { type: 'image', name: 'detail', description: 'animated overlay for subtle movement' },
    ],
    drawHints: [
      'Draw the static prop body on `base` — this layer does not change between frames.',
      'Add 1–2 px positional shift on `detail` between frames for ambient movement.',
      'Keep the animation loop smooth: frame 1 should return naturally to the frame 0 position.',
      'Use muted palette indices so decoration does not distract from gameplay elements.',
    ],
    paletteGuidance:
      'natural/environment colors, subtle highlight for animation accent, keep muted to not distract from gameplay elements',
    scaleHint: 'Decorations vary widely — flowers at 0.25× character height, furniture at 0.5×–1×',
  },
};

/**
 * Builds the step-by-step scaffold text for the `scaffold_props` prompt.
 * Extracted as a pure function so it can be unit tested independently of the MCP SDK.
 */
export function buildScaffoldPropsText(args: {
  name: string;
  prop_type?: PropType;
  width?: number;
  height?: number;
  palette?: string;
  reference_character?: string;
}): string {
  const propType: PropType = args.prop_type ?? 'decoration';
  const w = args.width ?? 16;
  const h = args.height ?? 16;
  const preset = PROP_PRESETS[propType];

  // --- Step 1: asset creation ---
  const dimensionStep = args.reference_character
    ? `Before creating the prop asset, query the reference character's dimensions:
  - Call \`asset info\` on \`"${args.reference_character}"\` and note: \`width\` and \`height\`.

Then call \`asset create\` with:
  - name: "${args.name}"
  - width: ${String(w)}, height: ${String(h)} (or adjust based on the reference character's dimensions)
  - perspective: "side_view"`
    : `Call \`asset create\` with:
  - name: "${args.name}"
  - width: ${String(w)}, height: ${String(h)}
  - perspective: "side_view"`;

  // --- Step 2: palette ---
  const paletteStep = buildPaletteStep(
    args.name,
    args.palette,
    'an outline color, primary material ramp, shadow, and highlight.',
  );

  // --- Step 3: layer creation lines ---
  const layerLines = preset.layers
    .map((l) => {
      const roleStr = l.role ? `, role="${l.role}"` : '';
      return `  - \`asset add_layer\` type="${l.type}", name="${l.name}"${roleStr}  — ${l.description}`;
    })
    .join('\n');

  // --- Step 4: frame layout ---
  const totalFrames = preset.states.reduce((sum, s) => sum + s.frames, 0);

  const frameLines: string[] = [];
  let frameIdx = 0;
  for (const state of preset.states) {
    for (let f = 0; f < state.frames; f++) {
      if (frameIdx === 0) {
        frameLines.push(
          `    - Frame 0 (${state.name}) already exists: call \`asset set_frame_duration\` frame_index=0, duration_ms=${String(state.duration_ms)}`,
        );
      } else {
        frameLines.push(
          `    - \`asset add_frame\` duration_ms=${String(state.duration_ms)}   → ${state.name} (frame ${String(frameIdx)})`,
        );
      }
      frameIdx++;
    }
  }

  // Build state tags with computed start/end indices
  const tagLines: string[] = [];
  let tagFrameIdx = 0;
  for (const state of preset.states) {
    const start = tagFrameIdx;
    const end = tagFrameIdx + state.frames - 1;
    tagLines.push(
      `    - \`asset add_tag\` name="${state.name}", start=${String(start)}, end=${String(end)}, direction="forward"`,
    );
    tagFrameIdx += state.frames;
  }

  // --- Step 5: per-state draw sections ---
  const drawSections: string[] = [];
  let drawFrameIdx = 0;
  for (const state of preset.states) {
    const frameRange =
      state.frames === 1
        ? `frame ${String(drawFrameIdx)}`
        : `frames ${String(drawFrameIdx)}–${String(drawFrameIdx + state.frames - 1)}`;
    drawSections.push(`### State: ${state.name} (${frameRange})`);
    drawSections.push(`  ${state.hint}`);
    drawFrameIdx += state.frames;
  }

  const drawHintLines = preset.drawHints.map((h) => `  - ${h}`).join('\n');

  // --- Step 6: scale consistency (only if reference_character provided) ---
  const scaleStep = args.reference_character
    ? `---

## Step 6 — Scale consistency check

Compare the prop against the reference character:
  - Preview reference: \`pixel://view/asset/${args.reference_character}\`
  - Preview this prop: \`pixel://view/asset/${args.name}\`

Scale guidance: ${preset.scaleHint}

Adjust pixel dimensions or redraw if the prop feels out of scale relative to the reference character.

---

`
    : '';

  const finalStepNumber = args.reference_character ? 7 : 6;

  return `Scaffold a ${propType} environment prop named "${args.name}" (${String(w)}×${String(h)} px).

Follow these steps in order, calling the tool actions exactly as described:

---

## Step 1 — Create the asset

${dimensionStep}

---

## Step 2 — Set up the palette

${paletteStep}

Color guidance for ${propType} props: ${preset.paletteGuidance}

Recommended palette slots:
  - Index 0: transparent [0, 0, 0, 0]
  - Index 1: darkest outline/shadow
  - Index 2–4: primary material ramp (dark → mid → light)
  - Index 5–6: secondary material or accent ramp
  - Index 7: highlight / specular

---

## Step 3 — Create layers

Call \`asset add_layer\` for each layer (bottom to top):
${layerLines}

---

## Step 4 — Add frames and state tags

This prop will have ${String(totalFrames)} frame${totalFrames === 1 ? '' : 's'} total across ${String(preset.states.length)} state${preset.states.length === 1 ? '' : 's'}.

Add frames in this exact order so frame indices match the tag ranges below:
${frameLines.join('\n')}

Then create one tag per state:
${tagLines.join('\n')}

---

## Step 5 — Draw each state

Target: asset="${args.name}", layers as indicated.

${drawSections.join('\n')}

General draw guidance:
${drawHintLines}

Use \`draw write_pixels\` with the full ${String(w)}×${String(h)} 2D array for efficiency,
or \`draw pixel\` / \`draw rect\` / \`draw fill\` for targeted edits.

---

${scaleStep}## Step ${String(finalStepNumber)} — Save

Call \`workspace save\` (or \`workspace save_all\`) when the asset is complete.

After each significant drawing step, you can preview with the resource URI:
  pixel://view/asset/${args.name}
`;
}

export function registerScaffoldPropsPrompt(server: McpServer): void {
  server.registerPrompt(
    'scaffold_props',
    {
      title: 'Scaffold Environment Props',
      description:
        'Guide through creating a destructible, interactable, or decorative environment prop with state-based frame layout, typed layer structure, and optional scale consistency against a reference character.',
      argsSchema: {
        name: z.string().describe('Asset name for the prop sprite'),
        prop_type: z
          .enum(['destructible', 'interactable', 'decoration'])
          .optional()
          .describe(
            'Prop archetype: "destructible" (breakable objects), "interactable" (chests, doors), or "decoration" (ambient scenery). Defaults to "decoration".',
          ),
        width: z
          .number()
          .int()
          .positive()
          .optional()
          .describe('Canvas width in pixels, default 16'),
        height: z
          .number()
          .int()
          .positive()
          .optional()
          .describe('Canvas height in pixels, default 16'),
        palette: z
          .string()
          .optional()
          .describe('Lospec palette slug or path to a .json palette file'),
        reference_character: z
          .string()
          .optional()
          .describe(
            "Asset name of the player or NPC character this prop is designed for. When provided, the scaffold queries the character's dimensions and includes a scale consistency step.",
          ),
      },
    },
    (args) => ({
      messages: [
        {
          role: 'user' as const,
          content: {
            type: 'text' as const,
            text: buildScaffoldPropsText(args),
          },
        },
      ],
    }),
  );
}
