import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { buildPaletteStep } from './palette-step.js';

const FOUR_DIR_FACINGS = ['S', 'N', 'E', 'W'] as const;
const EIGHT_DIR_FACINGS = ['S', 'SW', 'W', 'NW', 'N', 'NE', 'E', 'SE'] as const;

export const ANIMATION_MENU = [
  { category: 'Movement', name: 'idle', frames: 1, duration_ms: 500 },
  { category: 'Movement', name: 'walk', frames: 4, duration_ms: 150 },
  { category: 'Movement', name: 'run', frames: 4, duration_ms: 100 },
  { category: 'Movement', name: 'crouch', frames: 2, duration_ms: 150 },
  { category: 'Movement', name: 'jump', frames: 3, duration_ms: 100 },
  { category: 'Combat', name: 'attack', frames: 3, duration_ms: 100 },
  { category: 'Combat', name: 'hurt', frames: 2, duration_ms: 150 },
  { category: 'Combat', name: 'death', frames: 4, duration_ms: 200 },
  { category: 'Combat', name: 'block', frames: 1, duration_ms: 500 },
  { category: 'Combat', name: 'dash', frames: 2, duration_ms: 80 },
  { category: 'Interaction', name: 'interact', frames: 2, duration_ms: 300 },
  { category: 'Interaction', name: 'talk', frames: 2, duration_ms: 200 },
  { category: 'Interaction', name: 'idle_variant', frames: 4, duration_ms: 200 },
  { category: 'Special', name: 'cast', frames: 3, duration_ms: 150 },
  { category: 'Special', name: 'emote', frames: 3, duration_ms: 200 },
] as const;

export function buildScaffoldCharacterText(args: {
  name: string;
  directions?: '4' | '8';
  width?: number;
  height?: number;
  palette?: string;
  description?: string;
  animations?: string[];
}): string {
  const dirCount = args.directions ?? '4';
  const w = args.width ?? 16;
  const h = args.height ?? 24;
  const facings = dirCount === '8' ? EIGHT_DIR_FACINGS : FOUR_DIR_FACINGS;

  const paletteStep = buildPaletteStep(
    args.name,
    args.palette,
    'a skin tone, outline color, shadow, highlight, and eye/accent color.',
  );

  const facingList = facings.map((f) => `"${f}"`).join(', ');

  // --- Step 4: animation selection ---
  let step4: string;
  if (args.animations && args.animations.length > 0) {
    // Path A: animations provided
    const bulletLines = args.animations.map((animName) => {
      const entry = ANIMATION_MENU.find((a) => a.name === animName);
      if (entry) {
        return `  - ${animName} — ${String(entry.frames)} frame${entry.frames === 1 ? '' : 's'}, ${String(entry.duration_ms)} ms each`;
      }
      return `  - ${animName} — custom`;
    });

    step4 = `## Step 4 — Select animations

Use this animation set for "${args.name}":

${bulletLines.join('\n')}

Proceed to Step 5 to lay out the frames.`;
  } else {
    // Path B: no animations — show full menu
    const menuRows = ANIMATION_MENU.map(
      (a) =>
        `| ${a.category} | \`${a.name}\` | ${String(a.frames)} | ${String(a.duration_ms)} ms |`,
    );

    const descriptionLine = args.description
      ? `\nCharacter description: "${args.description}" — use this to guide your animation selection.\n`
      : '';
    const descriptionClause = args.description ? ' and the description above' : '';

    step4 = `## Step 4 — Select animations
${descriptionLine}
Choose the animations this character needs. Always include \`idle\`. Select others based on the character's role${descriptionClause}.

| Category | Animation | Frames | Duration/frame |
|---|---|---|---|
${menuRows.join('\n')}

After selecting, list your chosen animations before proceeding to Step 5.`;
  }

  // --- Step 5: frame layout algorithm ---
  const step5 = `## Step 5 — Lay out frames and create animation tags

Use the frame layout algorithm below to determine frame indices before calling any tools.

### Algorithm

  framesPerDir = sum of frame counts for your selected animations
  totalFrames = framesPerDir × ${String(facings.length)} directions

For each facing direction (${facingList}), for each animation in selection order:
  - start = (dir_index × framesPerDir) + sum of preceding animation frame counts
  - end = start + frames − 1
  - Create one tag: \`asset add_tag\` name="<anim>", start=<start>, end=<end>, direction="forward", facing="<facing>"

### Worked example

Suppose you chose: idle (1 frame), walk (4 frames), attack (3 frames)
  framesPerDir = 1 + 4 + 3 = 8
  totalFrames = 8 × 4 = 32

| Dir | Animation | Start | End |
|-----|-----------|-------|-----|
| S   | idle      | 0     | 0   |
| S   | walk      | 1     | 4   |
| S   | attack    | 5     | 7   |
| N   | idle      | 8     | 8   |
| N   | walk      | 9     | 12  |
| N   | attack    | 13    | 15  |
| E   | idle      | 16    | 16  |
| E   | walk      | 17    | 20  |
| E   | attack    | 21    | 23  |
| W   | idle      | 24    | 24  |
| W   | walk      | 25    | 28  |
| W   | attack    | 29    | 31  |

### Add frames

Frame 0 already exists — call \`asset set_frame_duration\` frame_index=0, duration_ms=<idle_duration>.
For every subsequent frame, call \`asset add_frame\` duration_ms=<matching_animation_duration>.
Add frames in index order (all ${facings[0]} frames, then all ${facings[1]} frames, etc.).

### Add tags

After all frames are added, create one tag per animation per direction using your computed indices.`;

  // --- Step 6: draw base south-facing pose ---
  const step6 = `## Step 6 — Draw the base south-facing pose

Target: asset="${args.name}", layer=body layer id, frame_index=0

Use \`draw\` operations to paint the idle south pose:
  - Use \`draw rect\` or \`draw fill\` to block in the body silhouette
  - Use \`draw pixel\` or \`draw rect\` for the head, torso, and legs
  - Stay within ${String(w)}×${String(h)} bounds; index 0 is transparent

Then switch to the eyes layer and use \`draw pixel\` to add eye details.

Pixel art tips for a ${String(w)}×${String(h)} character:
  - Head: roughly top 1/3 of canvas
  - Torso: middle 1/3
  - Legs/feet: bottom 1/3
  - Outline with darkest color (index 1), fill interior with mid-tone (index 3)
  - Add shadow pixels on the underside of each form using index 2
  - Add highlight pixels on the topside using index 8`;

  // --- Step 7: complete remaining frames ---
  const step7 = `## Step 7 — Complete remaining frames

After the south idle frame is complete, draw the remaining frames:

### Idle frames (one per direction)
  - S idle (frame 0): front-facing (base pose from step 6)
  - N idle: facing away — flip or redraw torso/head pixels
  - E idle: side-view silhouette, profile pose
  - W idle: mirror of east
  - Diagonal idles (if 8-dir): 3/4-angle blends

### Walk cycles (if selected)
  For each direction, draw 4 walk frames:
  - Frame +1: right foot forward, arms opposite
  - Frame +2: both feet near center (passing position)
  - Frame +3: left foot forward, arms opposite
  - Frame +4: back to center / slight squat

### Other animations (if selected)
  Draw frames according to the action. Use \`draw write_pixels\` with the full ${String(w)}×${String(h)} 2D array for efficiency, or \`draw pixel\` for targeted edits.`;

  // --- Assemble header ---
  const descriptionLine = args.description ? `\n\nCharacter: "${args.description}"` : '';

  return `Scaffold a ${dirCount}-directional character sprite asset named "${args.name}" (${String(w)}×${String(h)} px).${descriptionLine}

Follow these steps in order, calling the tool actions exactly as described:

---

## Step 1 — Create the asset

Call \`asset create\` with:
  - name: "${args.name}"
  - width: ${String(w)}, height: ${String(h)}
  - perspective: "top_down_3/4"

This creates the asset and registers it in the active project.

---

## Step 2 — Set up the palette

${paletteStep}

Recommended minimum palette slots:
  - Index 0: transparent [0, 0, 0, 0]
  - Index 1: darkest outline/shadow
  - Index 2–4: skin or body color ramp (dark → mid → light)
  - Index 5–7: secondary color ramp (clothing, hair, etc.)
  - Index 8: highlight / specular
  - Index 9: accent color (eyes, accents)

---

## Step 3 — Create layers

Call \`asset add_layer\` three times to set up the layer stack (bottom to top):
  1. type="image", name="body"      — base silhouette fill colors
  2. type="image", name="eyes"      — eye/detail overlay (drawn on top of body)
  3. type="shape", name="hitbox"    — collision shape layer (role="hitbox")

---

${step4}

---

${step5}

---

${step6}

---

${step7}

---

## Step 8 — Save

Call \`workspace save\` (or \`workspace save_all\`) when the asset is complete.

After each significant drawing step, you can preview with the resource URI:
  pixel://view/asset/${args.name}
`;
}

export function registerScaffoldCharacterPrompt(server: McpServer): void {
  server.registerPrompt(
    'scaffold_character',
    {
      title: 'Scaffold Character',
      description:
        'Guide through creating a base character sprite with directional animations, structured layers, and a palette.',
      argsSchema: {
        name: z.string().describe('Asset name for the character sprite'),
        directions: z
          .enum(['4', '8'])
          .optional()
          .describe('Number of directional facings: "4" or "8", default "4"'),
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
          .describe('Canvas height in pixels, default 24'),
        palette: z
          .string()
          .optional()
          .describe('Lospec palette slug or path to a .json palette file'),
        description: z
          .string()
          .optional()
          .describe(
            'Free-text character description (e.g., "shopkeeper NPC who sweeps"); helps the LLM choose appropriate animations',
          ),
        animations: z
          .string()
          .optional()
          .describe(
            'Comma-separated animation names (e.g., "idle,walk,attack"); skips the animation menu',
          ),
      },
    },
    (args) => ({
      messages: [
        {
          role: 'user' as const,
          content: {
            type: 'text' as const,
            text: buildScaffoldCharacterText({
              ...args,
              animations: args.animations
                ? args.animations
                    .split(',')
                    .map((s) => s.trim())
                    .filter(Boolean)
                : undefined,
            }),
          },
        },
      ],
    }),
  );
}
