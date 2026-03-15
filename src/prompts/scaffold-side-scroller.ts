import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { buildPaletteStep } from './palette-step.js';

interface AnimationConfig {
  frames: number;
  duration_ms: number;
  description: string;
}

const ANIMATION_DEFAULTS: Record<string, AnimationConfig> = {
  idle: {
    frames: 4,
    duration_ms: 200,
    description: 'Breathing/bob loop — subtle vertical shift or blink',
  },
  run: {
    frames: 6,
    duration_ms: 100,
    description: 'Full run cycle: contact, recoil, passing, high-point, contact2, passing2',
  },
  jump_rise: {
    frames: 1,
    duration_ms: 150,
    description: 'Ascending: arms up, body stretched, legs tucked',
  },
  jump_fall: {
    frames: 1,
    duration_ms: 150,
    description: 'Descending: arms back, body curled, bracing for landing',
  },
  land: {
    frames: 2,
    duration_ms: 80,
    description: 'Squash recovery: compressed on contact, spring back to standing',
  },
  attack: {
    frames: 4,
    duration_ms: 100,
    description: 'Quick melee: wind-up, swing, impact, recover',
  },
};

const DEFAULT_ANIMATIONS = ['idle', 'run', 'jump_rise', 'jump_fall', 'land', 'attack'];

/**
 * Builds per-animation drawing guidance text.
 */
function buildAnimationGuidance(animName: string, startFrame: number, frameCount: number): string {
  const frameRange =
    frameCount === 1
      ? `frame ${String(startFrame)}`
      : `frames ${String(startFrame)}–${String(startFrame + frameCount - 1)}`;

  switch (animName) {
    case 'idle':
      return `### idle (${frameRange})
  Breathing/bob loop — draw ${String(frameCount)} frames of subtle animation:
  - Each frame shifts the body 1px up/down or blinks the eyes
  - Keep limbs in the same rest position; only the torso and head shift
  - Loop should feel continuous: last frame returns to same position as first`;

    case 'run':
      return `### run (${frameRange})
  Full run cycle — draw ${String(frameCount)} frames following the classic 6-phase pattern:
  - Frame +0 (contact): front foot strikes ground, back leg extended behind
  - Frame +1 (recoil): body dips, knee bends, absorbing impact
  - Frame +2 (passing): feet pass each other, body at lowest point
  - Frame +3 (high-point): back leg swings forward, body at highest point
  - Frame +4 (contact2): opposite foot strikes, mirrored from frame +0
  - Frame +5 (passing2): second passing position, completing the cycle
  Arms swing opposite to legs: right arm forward when left leg is forward.
  Use \`draw write_pixels\` for each full-frame repaint.`;

    case 'jump_rise':
      return `### jump_rise (${frameRange})
  Ascending phase — draw ${String(frameCount)} frame(s):
  - Arms raised above head or outstretched for balance
  - Body stretched vertically, legs tucked or trailing behind
  - Hair/cape pixels trail downward (inertia)`;

    case 'jump_fall':
      return `### jump_fall (${frameRange})
  Descending phase — draw ${String(frameCount)} frame(s):
  - Arms swept back or outstretched for balance
  - Body curled forward slightly, bracing for landing
  - Legs extended downward, ready to absorb impact`;

    case 'land':
      return `### land (${frameRange})
  Landing — draw ${String(frameCount)} frame(s) using squash-and-stretch:
  - Frame +0 (squash): deep knee bend on contact, body compressed, feet flat
  - Frame +1 (recovery): spring back toward standing pose — body elongates
  The squash frame should visibly compress the character height by 2–4px.
  Use \`draw write_pixels\` for each frame.`;

    case 'attack':
      return `### attack (${frameRange})
  Quick melee attack — draw ${String(frameCount)} frames:
  - Frame +0 (anticipation): arm/weapon pulled back, body leaning into strike
  - Frame +1 (swing): weapon arc at maximum speed — apply \`effect smear_frame\` on the weapon layer
  - Frame +2 (impact): weapon fully extended at strike point, hold pose
  - Frame +3 (recover): arm returns, body settles back to idle stance
  Use \`effect smear_frame\` on the swing frame to convey speed.`;

    default:
      return `### ${animName} (${frameRange})
  Draw ${String(frameCount)} frame(s) for the "${animName}" animation:
  - Refer to your game's animation spec for this custom animation
  - Use \`draw write_pixels\` for full-frame repaints or \`draw pixel\` for targeted edits
  - Ensure the last frame loops cleanly back to the first if this is a looping animation`;
  }
}

/**
 * Builds the step-by-step scaffold text for the `scaffold_side_scroller` prompt.
 * Extracted as a pure function so it can be unit tested independently of the MCP SDK.
 */
export function buildScaffoldSideScrollerText(args: {
  name: string;
  width?: number;
  height?: number;
  palette?: string;
  animations?: string[];
}): string {
  const w = args.width ?? 32;
  const h = args.height ?? 32;
  const animations = args.animations ?? DEFAULT_ANIMATIONS;

  const paletteStep = buildPaletteStep(
    args.name,
    args.palette,
    'a skin tone, outline color, shadow, highlight, and accent color.',
  );

  // Compute frame layout
  let frameIdx = 0;
  const animLayouts: Array<{
    name: string;
    startFrame: number;
    endFrame: number;
    frameCount: number;
  }> = [];

  for (const anim of animations) {
    const config = ANIMATION_DEFAULTS[anim] ?? {
      frames: 2,
      duration_ms: 120,
      description: 'Custom animation',
    };
    const startFrame = frameIdx;
    const endFrame = frameIdx + config.frames - 1;
    animLayouts.push({ name: anim, startFrame, endFrame, frameCount: config.frames });
    frameIdx += config.frames;
  }

  const totalFrames = frameIdx;

  // Build add_frame lines
  const addFrameLines: string[] = [];
  let fIdx = 0;
  for (const anim of animations) {
    const config = ANIMATION_DEFAULTS[anim] ?? {
      frames: 2,
      duration_ms: 120,
      description: 'Custom animation',
    };
    for (let f = 0; f < config.frames; f++) {
      if (fIdx === 0) {
        addFrameLines.push(
          `    - Frame 0 (${anim}) already exists: call \`asset set_frame_duration\` frame_index=0, duration_ms=${String(config.duration_ms)}`,
        );
      } else {
        addFrameLines.push(
          `    - \`asset add_frame\` duration_ms=${String(config.duration_ms)}   → ${anim} frame ${String(f)} (frame ${String(fIdx)})`,
        );
      }
      fIdx++;
    }
  }

  // Build add_tag lines
  const addTagLines = animLayouts.map(
    (a) =>
      `    - \`asset add_tag\` name="${a.name}", start=${String(a.startFrame)}, end=${String(a.endFrame)}, direction="forward"`,
  );

  // Build per-animation drawing guidance
  const guidanceBlocks = animLayouts
    .map((a) => buildAnimationGuidance(a.name, a.startFrame, a.frameCount))
    .join('\n\n');

  return `Scaffold a side-scroller character sprite asset named "${args.name}" (${String(w)}×${String(h)} px).

Follow these steps in order, calling the tool actions exactly as described:

---

## Step 1 — Create the asset

Call \`asset create\` with:
  - name: "${args.name}"
  - width: ${String(w)}, height: ${String(h)}
  - perspective: "side_view"

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
  1. type="image", name="body"    — base silhouette fill colors
  2. type="image", name="details" — eye/detail overlay (drawn on top of body)
  3. type="shape", name="hitbox"  — collision shape layer (role="hitbox")

---

## Step 4 — Add frames and animation tags

This character will have ${String(totalFrames)} frames total across ${String(animations.length)} animations.

Add frames in this exact order so frame indices match the tag ranges below:
${addFrameLines.join('\n')}

Then create animation tags — one per animation:
${addTagLines.join('\n')}

---

## Step 5 — Draw the base idle pose (frame 0)

Target: asset="${args.name}", layer=body layer id, frame_index=0

Use \`draw\` operations to paint the idle side-view pose:
  - Use \`draw rect\` or \`draw fill\` to block in the body silhouette
  - Use \`draw pixel\` or \`draw rect\` for the head, torso, and legs
  - Stay within ${String(w)}×${String(h)} bounds; index 0 is transparent

Then switch to the details layer and use \`draw pixel\` to add eye and detail pixels.

Side-view proportions for a ${String(w)}×${String(h)} character:
  - Head: roughly top 1/4 of canvas, profile view (nose/brow visible from side)
  - Torso: middle 2/5
  - Legs/feet: bottom 1/3
  - Outline with darkest color (index 1), fill interior with mid-tone (index 3)
  - Add shadow pixels on the underside of each form using index 2
  - Add highlight pixels on the topside using index 8

---

## Step 6 — Complete all animation frames

After the idle base pose is drawn, complete the remaining animation frames:

${guidanceBlocks}

---

## Step 7 — Save

Call \`workspace save\` (or \`workspace save_all\`) when the asset is complete.

After each significant drawing step, you can preview with the resource URI:
  pixel://view/asset/${args.name}
`;
}

export function registerScaffoldSideScrollerPrompt(server: McpServer): void {
  server.registerPrompt(
    'scaffold_side_scroller',
    {
      title: 'Scaffold Side Scroller',
      description:
        'Guide through creating a side-scroller character sprite with idle, run, jump, land, and attack animations, structured layers, and a palette.',
      argsSchema: {
        name: z.string().describe('Asset name for the side-scroller character sprite'),
        width: z
          .number()
          .int()
          .positive()
          .optional()
          .describe('Canvas width in pixels, default 32'),
        height: z
          .number()
          .int()
          .positive()
          .optional()
          .describe('Canvas height in pixels, default 32'),
        palette: z
          .string()
          .optional()
          .describe('Lospec palette slug or path to a .json palette file'),
        animations: z
          .array(z.string())
          .optional()
          .describe(
            'List of animation names to include. Defaults to ["idle", "run", "jump_rise", "jump_fall", "land", "attack"]. Custom animation names are supported.',
          ),
      },
    },
    (args) => ({
      messages: [
        {
          role: 'user' as const,
          content: {
            type: 'text' as const,
            text: buildScaffoldSideScrollerText(args),
          },
        },
      ],
    }),
  );
}
