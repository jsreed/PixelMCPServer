import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

const FOUR_DIR_FACINGS = ['S', 'N', 'E', 'W'] as const;
const EIGHT_DIR_FACINGS = ['S', 'SW', 'W', 'NW', 'N', 'NE', 'E', 'SE'] as const;

export function buildScaffoldCharacterText(args: {
  name: string;
  directions?: '4' | '8';
  width?: number;
  height?: number;
  palette?: string;
}): string {
  const dirCount = args.directions ?? '4';
  const w = args.width ?? 16;
  const h = args.height ?? 24;
  const facings = dirCount === '8' ? EIGHT_DIR_FACINGS : FOUR_DIR_FACINGS;

  // Palette setup instructions
  let paletteStep: string;
  if (!args.palette) {
    paletteStep = `  - No palette was specified. Call \`palette info\` on the asset to check the current palette.
    If the project has a default palette configured, it was applied automatically.
    Otherwise, use \`palette set_bulk\` to add at least: index 0 = transparent [0,0,0,0],
    a skin tone, outline color, shadow, highlight, and eye/accent color.`;
  } else if (args.palette.includes('/') || args.palette.endsWith('.json')) {
    paletteStep = `  - Load the palette file: call \`palette load\` with \`path="${args.palette}"\` on asset \`"${args.name}"\`.`;
  } else {
    paletteStep = `  - Fetch the Lospec palette: call \`palette fetch_lospec\` with \`slug="${args.palette}"\` on asset \`"${args.name}"\`.`;
  }

  // Frame and tag layout
  // Layout: idle frame per direction + walk frames (4) per direction
  // idle_S at frame 0, walk_S at frames 1-4, idle_N at frame 5, walk_N at frames 6-9, etc.
  const framesPerDir = 5; // 1 idle + 4 walk
  const totalFrames = facings.length * framesPerDir;

  const tagLines: string[] = [];
  facings.forEach((facing, i) => {
    const idleFrame = i * framesPerDir;
    const walkStart = idleFrame + 1;
    const walkEnd = idleFrame + 4;
    tagLines.push(
      `    - \`asset add_tag\` name="idle", start=${String(idleFrame)}, end=${String(idleFrame)}, direction="forward", facing="${facing}"`,
    );
    tagLines.push(
      `    - \`asset add_tag\` name="walk", start=${String(walkStart)}, end=${String(walkEnd)}, direction="forward", facing="${facing}"`,
    );
  });

  const facingList = facings.map((f) => `"${f}"`).join(', ');

  // Build per-facing add_frame instructions (in frame order)
  const addFrameLines: string[] = [];
  facings.forEach((facing, i) => {
    if (i === 0) {
      // Frame 0 already exists — just note its duration
      addFrameLines.push(
        `    - Frame 0 (${facing} idle) already exists: call \`asset set_frame_duration\` frame_index=0, duration_ms=500`,
      );
    } else {
      addFrameLines.push(
        `    - \`asset add_frame\` duration_ms=500   → ${facing} idle (frame ${String(i * framesPerDir)})`,
      );
    }
    for (let w2 = 1; w2 <= 4; w2++) {
      addFrameLines.push(
        `    - \`asset add_frame\` duration_ms=150   → ${facing} walk frame ${String(w2)} (frame ${String(i * framesPerDir + w2)})`,
      );
    }
  });

  // Build step-6 idle frame guidance dynamically from facings
  const idleFrameLines = facings.map((facing, i) => {
    const frameNum = i * framesPerDir;
    const hints: Record<string, string> = {
      S: 'front-facing (this is the base pose from step 5)',
      N: 'facing away — flip or redraw torso/head pixels',
      E: 'side-view silhouette, profile pose',
      W: 'mirror of east, profile pose',
      SW: '3/4-angle blend of S and W',
      NW: '3/4-angle blend of N and W',
      NE: '3/4-angle blend of N and E',
      SE: '3/4-angle blend of S and E',
    };
    return `  - ${facing} idle (frame ${String(frameNum)}): ${hints[facing] ?? 'directional idle pose'}`;
  });

  return `Scaffold a ${dirCount}-directional character sprite asset named "${args.name}" (${String(w)}×${String(h)} px).

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

## Step 4 — Add frames and animation tags

This character will have ${String(totalFrames)} frames total: ${String(framesPerDir)} per facing direction (${facingList}).
Frame layout: 1 idle frame (500 ms) + 4 walk frames (150 ms each) per direction.

Add frames in this exact order so frame indices match the tag ranges below:
${addFrameLines.join('\n')}

Then create animation tags — one "idle" and one "walk" tag per facing:
${tagLines.join('\n')}

---

## Step 5 — Draw the base south-facing pose (frame 0)

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
  - Add highlight pixels on the topside using index 8

---

## Step 6 — Complete all animation frames

After the south idle pose is drawn, complete the remaining frames:

### Idle frames:
${idleFrameLines.join('\n')}

### Walk cycles (frames walk_start to walk_end per direction):
  For each direction, draw 4 walk frames:
  - Walk frame 1 (+1): right foot forward, arms opposite
  - Walk frame 2 (+2): both feet near center (passing position)
  - Walk frame 3 (+3): left foot forward, arms opposite
  - Walk frame 4 (+4): back to center / slight squat

  Use \`draw write_pixels\` with the full ${String(w)}×${String(h)} 2D array for efficiency on larger frames,
  or \`draw pixel\` for small targeted edits.

---

## Step 7 — Save

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
        'Guide through creating a base character sprite with directional walk/idle animations, structured layers, and a palette.',
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
      },
    },
    (args) => ({
      messages: [
        {
          role: 'user' as const,
          content: {
            type: 'text' as const,
            text: buildScaffoldCharacterText(args),
          },
        },
      ],
    }),
  );
}
