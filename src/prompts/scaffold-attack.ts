// Note: scaffold_attack deliberately omits a `palette` arg (per design spec §2.4).
// Attack animations typically share the palette of their character or weapon_asset.
// palette-step.ts is not imported here by design.
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

type AttackType = 'melee_slash' | 'melee_thrust' | 'ranged' | 'magic_cast';

interface AttackPhase {
  name: string;
  defaultFrames: number;
  duration_ms: number;
  hint: string;
  useSmear: boolean;
}

interface AttackPreset {
  phases: AttackPhase[];
  motionX: number;
  motionY: number;
}

const ATTACK_PRESETS: Record<AttackType, AttackPreset> = {
  melee_slash: {
    phases: [
      {
        name: 'anticipate',
        defaultFrames: 2,
        duration_ms: 120,
        hint: 'Wind-up: arm pulled back, weapon cocked behind head/shoulder',
        useSmear: false,
      },
      {
        name: 'smear',
        defaultFrames: 1,
        duration_ms: 60,
        hint: 'Fast arc: motion blur along the slash arc',
        useSmear: true,
      },
      {
        name: 'impact',
        defaultFrames: 1,
        duration_ms: 80,
        hint: 'Contact frame: weapon extended at full reach, hold for impact',
        useSmear: false,
      },
      {
        name: 'follow_through',
        defaultFrames: 2,
        duration_ms: 110,
        hint: 'Deceleration: weapon continues past impact point, body follows',
        useSmear: false,
      },
    ],
    motionX: 1,
    motionY: 1,
  },
  melee_thrust: {
    phases: [
      {
        name: 'anticipate',
        defaultFrames: 2,
        duration_ms: 120,
        hint: 'Pull back: weapon retracted, shoulder rotated away',
        useSmear: false,
      },
      {
        name: 'extend',
        defaultFrames: 1,
        duration_ms: 60,
        hint: 'Fast thrust: linear forward motion',
        useSmear: true,
      },
      {
        name: 'impact',
        defaultFrames: 1,
        duration_ms: 80,
        hint: 'Full extension: weapon at max reach, hold',
        useSmear: false,
      },
      {
        name: 'recover',
        defaultFrames: 2,
        duration_ms: 110,
        hint: 'Retraction: pull weapon back to guard position',
        useSmear: false,
      },
    ],
    motionX: 1,
    motionY: 0,
  },
  ranged: {
    phases: [
      {
        name: 'ready',
        defaultFrames: 1,
        duration_ms: 100,
        hint: 'Stance: arm/bow raised, aiming',
        useSmear: false,
      },
      {
        name: 'draw',
        defaultFrames: 2,
        duration_ms: 130,
        hint: 'Pull back: string drawn or arm cocked',
        useSmear: false,
      },
      {
        name: 'release',
        defaultFrames: 1,
        duration_ms: 60,
        hint: 'Release: projectile launched',
        useSmear: true,
      },
      {
        name: 'recover',
        defaultFrames: 2,
        duration_ms: 150,
        hint: 'Follow-through: arm/bow returns to rest',
        useSmear: false,
      },
    ],
    motionX: 1,
    motionY: 0,
  },
  magic_cast: {
    phases: [
      {
        name: 'channel',
        defaultFrames: 2,
        duration_ms: 130,
        hint: 'Build-up: hands glow, particles gather, body tenses',
        useSmear: false,
      },
      {
        name: 'release',
        defaultFrames: 1,
        duration_ms: 60,
        hint: 'Release: energy burst',
        useSmear: true,
      },
      {
        name: 'burst',
        defaultFrames: 1,
        duration_ms: 80,
        hint: 'Peak: maximum effect, hold for visual impact',
        useSmear: false,
      },
      {
        name: 'dissipate',
        defaultFrames: 2,
        duration_ms: 120,
        hint: 'Fade: energy dissipates, body relaxes',
        useSmear: false,
      },
    ],
    motionX: 0,
    motionY: -1,
  },
};

/**
 * Distributes `total` frames proportionally across phases.
 * Each phase gets at least 1 frame; the last phase absorbs any remainder.
 */
function allocateFrames(phases: AttackPhase[], total: number): number[] {
  const defaultTotal = phases.reduce((sum, p) => sum + p.defaultFrames, 0);
  const allocated = phases.map((p) =>
    Math.max(1, Math.round((p.defaultFrames / defaultTotal) * total)),
  );
  // Adjust last phase to absorb remainder
  const allocatedTotal = allocated.reduce((sum, n) => sum + n, 0);
  const lastIdx = allocated.length - 1;
  allocated[lastIdx] = Math.max(1, (allocated[lastIdx] ?? 1) + (total - allocatedTotal));
  return allocated;
}

/**
 * Builds the step-by-step scaffold text for the `scaffold_attack` prompt.
 * Extracted as a pure function so it can be unit tested independently of the MCP SDK.
 */
export function buildScaffoldAttackText(args: {
  name: string;
  attack_type?: AttackType;
  frame_count?: number;
  weapon_asset?: string;
}): string {
  const attackType: AttackType = args.attack_type ?? 'melee_slash';
  const frameCount = args.frame_count ?? 6;
  const preset = ATTACK_PRESETS[attackType];
  const tagName = `attack_${attackType}`;

  const frameCounts = allocateFrames(preset.phases, frameCount);

  // Build add_frame lines — frame 0 already exists
  const addFrameLines: string[] = [];
  let frameIdx = 0;
  preset.phases.forEach((phase, pi) => {
    const count = frameCounts[pi] ?? 1;
    for (let f = 0; f < count; f++) {
      if (frameIdx === 0) {
        addFrameLines.push(
          `    - Frame 0 (${phase.name}) already exists: call \`asset set_frame_duration\` frame_index=0, duration_ms=${String(phase.duration_ms)}`,
        );
      } else {
        addFrameLines.push(
          `    - \`asset add_frame\` duration_ms=${String(phase.duration_ms)}   → ${phase.name} (frame ${String(frameIdx)})`,
        );
      }
      frameIdx++;
    }
  });

  // Tag spans
  const tagStart = 0;
  const tagEnd = frameCount - 1;

  // Phase drawing instructions
  const phaseDrawLines: string[] = [];
  let drawFrameIdx = 0;
  preset.phases.forEach((phase, pi) => {
    const count = frameCounts[pi] ?? 1;
    const frameRange =
      count === 1
        ? `frame ${String(drawFrameIdx)}`
        : `frames ${String(drawFrameIdx)}–${String(drawFrameIdx + count - 1)}`;
    phaseDrawLines.push(`### Phase: ${phase.name} (${frameRange})`);
    phaseDrawLines.push(`  ${phase.hint}`);
    if (phase.useSmear) {
      phaseDrawLines.push(
        `  Apply motion blur on the trail layer: call \`effect smear_frame\` with direction_x=${String(preset.motionX)}, direction_y=${String(preset.motionY)} on the trail layer for each frame in this phase.`,
      );
    }
    drawFrameIdx += count;
  });

  // Hitbox guidance
  const hitboxPhases = preset.phases.map((p) => p.name);
  const impactPhase = hitboxPhases.includes('impact')
    ? 'impact'
    : (hitboxPhases[hitboxPhases.length - 2] ?? 'impact');
  const firstPhase = hitboxPhases[0] ?? 'anticipate';
  const lastPhase = hitboxPhases[hitboxPhases.length - 1] ?? 'follow_through';

  // Weapon asset cross-reference step
  const weaponAssetStep = args.weapon_asset
    ? `\n> **Weapon cross-reference**: Before drawing, call \`asset info\` on \`"${args.weapon_asset}"\` to check its canvas dimensions, palette, and tags. Match the attack animation frame count and timing so the weapon asset can be overlaid in-engine.\n`
    : '';

  return `Scaffold an attack animation asset named "${args.name}" (32×32 px, ${String(frameCount)} frames, type: ${attackType}).

Follow these steps in order, calling the tool actions exactly as described:

---

## Step 1 — Create the asset

Call \`asset create\` with:
  - name: "${args.name}"
  - width: 32, height: 32
  - perspective: "side_view"

This creates the asset and registers it in the active project.
${weaponAssetStep}
---

## Step 2 — Set up the palette

  - Call \`palette info\` on the asset to check the current palette.
    If the project has a default palette configured, it was applied automatically.
    If a \`weapon_asset\` was specified, its palette is typically compatible — check via
    \`palette info\` on the weapon asset. Otherwise, use \`palette set_bulk\` to add recommended slots:

Recommended minimum palette slots:
  - Index 0: transparent [0, 0, 0, 0]
  - Index 1: darkest outline/shadow
  - Index 2–4: body color ramp (dark → mid → light)
  - Index 5–7: weapon/effect color ramp
  - Index 8: highlight / specular
  - Index 9: impact flash or accent color

---

## Step 3 — Create layers

Call \`asset add_layer\` three times to set up the layer stack (bottom to top):
  1. type="image", name="body"   — character body pixels
  2. type="image", name="trail"  — motion trail / smear overlay for fast phases
  3. type="shape", name="hitbox" — active hitbox geometry (role="hitbox")

---

## Step 4 — Add frames and animation tag

This attack will have ${String(frameCount)} frames total across ${String(preset.phases.length)} phases.

Add frames in this exact order so frame indices match the tag range below:
${addFrameLines.join('\n')}

Then create the animation tag:
    - \`asset add_tag\` name="${tagName}", start=${String(tagStart)}, end=${String(tagEnd)}, direction="forward"

---

## Step 5 — Draw each phase

Target: asset="${args.name}", frame as indicated per phase.

${phaseDrawLines.join('\n')}

Use \`draw write_pixels\` with the full 32×32 2D array for efficiency,
or \`draw pixel\` / \`draw rect\` for small targeted edits.

---

## Step 6 — Set hitbox keyframes

The hitbox shape layer should reflect the active attack range per phase:

  - **${firstPhase} frames**: narrow hitbox — weapon still cocked, not yet dangerous.
    Call \`asset add_shape\` on the hitbox layer with a small rect near the character center.
  - **${impactPhase} frames**: wide hitbox — weapon at full reach, maximum danger zone.
    Call \`asset add_shape\` on the hitbox layer with a rect extending to weapon tip.
  - **${lastPhase} frames**: narrow hitbox — weapon returning, danger zone closing.
    Reuse the narrow hitbox rect from the anticipate phase.

---

## Step 7 — Save

Call \`workspace save\` (or \`workspace save_all\`) when the asset is complete.

After each significant drawing step, you can preview with the resource URI:
  pixel://view/asset/${args.name}
`;
}

export function registerScaffoldAttackPrompt(server: McpServer): void {
  server.registerPrompt(
    'scaffold_attack',
    {
      title: 'Scaffold Attack',
      description:
        'Guide through creating an attack animation asset with phase-based frame allocation, motion smear, and hitbox keyframes.',
      argsSchema: {
        name: z.string().describe('Asset name for the attack animation sprite'),
        attack_type: z
          .enum(['melee_slash', 'melee_thrust', 'ranged', 'magic_cast'])
          .optional()
          .describe(
            'Attack archetype: "melee_slash", "melee_thrust", "ranged", or "magic_cast". Defaults to "melee_slash".',
          ),
        frame_count: z
          .number()
          .int()
          .min(4)
          .optional()
          .describe(
            'Total number of frames for the animation, default 6. Minimum 4 (one per phase).',
          ),
        weapon_asset: z
          .string()
          .optional()
          .describe(
            'Asset name of the associated weapon sprite to cross-reference dimensions and tags from',
          ),
      },
    },
    (args) => ({
      messages: [
        {
          role: 'user' as const,
          content: {
            type: 'text' as const,
            text: buildScaffoldAttackText(args),
          },
        },
      ],
    }),
  );
}
