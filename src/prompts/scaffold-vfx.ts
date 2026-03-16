import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { buildPaletteStep } from './palette-step.js';

type VfxType = 'explosion' | 'magic' | 'hit_spark' | 'projectile' | 'environmental';

interface VfxPhase {
  name: string;
  defaultFrames: number;
  duration_ms: number;
  hint: string;
}

interface VfxPreset {
  phases: VfxPhase[];
  paletteGuidance: string;
  scaleProgression: string;
}

const VFX_PRESETS: Record<VfxType, VfxPreset> = {
  explosion: {
    phases: [
      {
        name: 'spawn',
        defaultFrames: 1,
        duration_ms: 50,
        hint: 'Tiny bright flash at origin — 1-2px white/yellow core',
      },
      {
        name: 'expand',
        defaultFrames: 2,
        duration_ms: 60,
        hint: 'Rapid outward expansion — fill increases each frame, core stays bright, edges turn orange',
      },
      {
        name: 'peak',
        defaultFrames: 1,
        duration_ms: 80,
        hint: 'Maximum size reached — fill the blast radius, core white fades to yellow',
      },
      {
        name: 'dissipate',
        defaultFrames: 2,
        duration_ms: 120,
        hint: 'Shrink and fade — replace bright pixels with dark smoke colors, reduce filled area from edges inward',
      },
    ],
    paletteGuidance: 'white-hot core → yellow → orange → red → dark smoke/gray',
    scaleProgression:
      'Start at ~10% canvas, expand to ~80% at peak, shrink to scattered smoke fragments at end',
  },
  magic: {
    phases: [
      {
        name: 'gather',
        defaultFrames: 1,
        duration_ms: 80,
        hint: 'Particles converge inward — draw 2-3 small dots moving toward center',
      },
      {
        name: 'flash',
        defaultFrames: 1,
        duration_ms: 50,
        hint: 'Bright burst at center — fill core area with lightest color, sharp edges',
      },
      {
        name: 'bloom',
        defaultFrames: 2,
        duration_ms: 100,
        hint: 'Energy radiates outward — rings or rays expand from center, mid-tone magic color',
      },
      {
        name: 'fade',
        defaultFrames: 2,
        duration_ms: 140,
        hint: 'Soft dissipation — replace bright pixels with deeper magic tones, then transparent',
      },
    ],
    paletteGuidance:
      'white core → bright magic color (cyan/purple/green) → deep magic color → dark fade to transparent',
    scaleProgression:
      'Gather at ~20% canvas, flash at ~30%, bloom to ~70%, fade from edges to nothing',
  },
  hit_spark: {
    phases: [
      {
        name: 'flash',
        defaultFrames: 1,
        duration_ms: 30,
        hint: 'Instant white flash — small solid bright shape at impact point',
      },
      {
        name: 'scatter',
        defaultFrames: 1,
        duration_ms: 40,
        hint: 'Sparks fly outward — draw 3-5 single-pixel lines radiating from center',
      },
      {
        name: 'linger',
        defaultFrames: 2,
        duration_ms: 80,
        hint: 'Sparks slow down — shorten the lines, shift to warm ember colors',
      },
      {
        name: 'fade',
        defaultFrames: 2,
        duration_ms: 100,
        hint: 'Embers cool and vanish — reduce to 1-2 dim pixels, then transparent',
      },
    ],
    paletteGuidance:
      'white flash → hot spark color (yellow/orange) → cool ember (red/brown) → transparent',
    scaleProgression:
      'Flash at ~15% canvas, scatter to ~50%, linger shrinks to ~30%, fade to nothing',
  },
  projectile: {
    phases: [
      {
        name: 'lead',
        defaultFrames: 1,
        duration_ms: 50,
        hint: 'Bright front tip — small concentrated bright pixels at the leading edge',
      },
      {
        name: 'trail',
        defaultFrames: 2,
        duration_ms: 70,
        hint: 'Glowing body stretches behind — elongated shape, brightest at front fading toward tail',
      },
      {
        name: 'impact',
        defaultFrames: 1,
        duration_ms: 60,
        hint: 'Burst on contact — projectile shape expands into a small radial splash',
      },
      {
        name: 'scatter',
        defaultFrames: 2,
        duration_ms: 100,
        hint: 'Fragments disperse — small particles fly outward from impact point and fade',
      },
    ],
    paletteGuidance:
      'bright front tip (white/yellow) → glowing body (magic/fire color) → dark trail → impact flash',
    scaleProgression:
      'Lead at ~10% canvas, trail elongates to ~40%, impact burst to ~50%, scatter fades out',
  },
  environmental: {
    phases: [
      {
        name: 'spawn',
        defaultFrames: 1,
        duration_ms: 100,
        hint: 'Particle appears — small shape at origin position (ground, flame base, water surface)',
      },
      {
        name: 'rise',
        defaultFrames: 2,
        duration_ms: 120,
        hint: 'Particle drifts upward/outward — shift position 1-2px per frame, slight size increase',
      },
      {
        name: 'drift',
        defaultFrames: 2,
        duration_ms: 150,
        hint: 'Slow float — gentle position shift, start losing opacity (use lighter palette indices)',
      },
      {
        name: 'fade',
        defaultFrames: 1,
        duration_ms: 180,
        hint: 'Dissolve to transparent — replace remaining pixels with index 0',
      },
    ],
    paletteGuidance:
      'light particle color → mid-tone → dark settle → transparent (all muted/desaturated)',
    scaleProgression:
      'Spawn at ~10% canvas, rise to ~20%, drift at ~20%, fade to nothing — keep particles small throughout',
  },
};

/**
 * Distributes `total` frames proportionally across phases.
 * Each phase gets at least 1 frame; the last phase absorbs any remainder.
 */
function allocateFrames(phases: VfxPhase[], total: number): number[] {
  const defaultTotal = phases.reduce((sum, p) => sum + p.defaultFrames, 0);
  const allocated = phases.map((p) =>
    Math.max(1, Math.round((p.defaultFrames / defaultTotal) * total)),
  );
  const allocatedTotal = allocated.reduce((sum, n) => sum + n, 0);
  const lastIdx = allocated.length - 1;
  allocated[lastIdx] = Math.max(1, (allocated[lastIdx] ?? 1) + (total - allocatedTotal));
  return allocated;
}

/**
 * Builds the step-by-step scaffold text for the `scaffold_vfx` prompt.
 * Extracted as a pure function so it can be unit tested independently of the MCP SDK.
 */
export function buildScaffoldVfxText(args: {
  name: string;
  vfx_type?: VfxType;
  width?: number;
  height?: number;
  frame_count?: number;
  palette?: string;
}): string {
  const vfxType: VfxType = args.vfx_type ?? 'explosion';
  const w = args.width ?? 32;
  const h = args.height ?? 32;
  const frameCount = args.frame_count ?? 6;
  const preset = VFX_PRESETS[vfxType];
  const tagName = `vfx_${vfxType}`;

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
    drawFrameIdx += count;
  });

  const paletteStep = buildPaletteStep(
    args.name,
    args.palette,
    'index 1 = brightest core, index 2+ = effect color ramp',
  );

  const article = /^[aeiou]/i.test(vfxType) ? 'an' : 'a';

  return `Scaffold ${article} ${vfxType} VFX sprite named "${args.name}" (${String(w)}×${String(h)} px, ${String(frameCount)} frames).

Follow these steps in order, calling the tool actions exactly as described:

---

## Step 1 — Create the asset

Call \`asset create\` with:
  - name: "${args.name}"
  - width: ${String(w)}, height: ${String(h)}
  - perspective: "side_view"

---

## Step 2 — Set up the palette

${paletteStep}

Color guidance for ${vfxType}: ${preset.paletteGuidance}

Recommended minimum palette slots:
  - Index 0: transparent [0, 0, 0, 0]
  - Index 1: brightest core (white or near-white)
  - Index 2–3: primary effect color ramp (bright to mid)
  - Index 4–5: secondary effect color ramp (mid to dark)
  - Index 6: dark fade / smoke / ember
  - Index 7: edge glow (for additive-friendly blending in-engine)

---

## Step 3 — Create layers

Call \`asset add_layer\` twice to set up the layer stack (bottom to top):
  1. type="image", name="core"  — bright center of the effect
  2. type="image", name="glow"  — soft outer halo layer (additive-friendly in-engine)

The \`glow\` layer should use slightly larger, softer shapes than \`core\`.
In-engine, this layer is typically rendered with additive blending for a natural glow effect.

---

## Step 4 — Add frames and animation tag

This VFX will have ${String(frameCount)} frames total across ${String(preset.phases.length)} phases.
Scale progression: ${preset.scaleProgression}

Add frames in this exact order so frame indices match the tag range below:
${addFrameLines.join('\n')}

Then create the animation tag:
    - \`asset add_tag\` name="${tagName}", start=0, end=${String(frameCount - 1)}, direction="forward"

---

## Step 5 — Draw each phase

Target: asset="${args.name}", layer as indicated.

VFX timing philosophy: fast attack phases (low ms) create snappy impact;
slow decay phases (high ms) let the eye register the fade.

${phaseDrawLines.join('\n')}

Use \`draw write_pixels\` with the full ${String(w)}×${String(h)} 2D array for efficiency,
or \`draw pixel\` / \`draw rect\` / \`draw circle\` / \`draw ellipse\` for targeted shapes.
Draw on the \`core\` layer first (brightest pixels), then the \`glow\` layer
(larger, softer surrounding shape using mid-tone indices).
Each successive frame should show clear visual progression — avoid static or duplicate frames.

---

## Step 6 — Timing review

Review the frame durations set in Step 4. Adjust with \`asset set_frame_duration\` if needed:
  - Fast attack phases should feel snappy (aim for ≤80 ms per frame)
  - Slow decay phases should linger (aim for ≥100 ms per frame)

---

## Step 7 — Save

Call \`workspace save\` (or \`workspace save_all\`) when the asset is complete.

After each significant drawing step, you can preview with the resource URI:
  pixel://view/asset/${args.name}
`;
}

export function registerScaffoldVfxPrompt(server: McpServer): void {
  server.registerPrompt(
    'scaffold_vfx',
    {
      title: 'Scaffold VFX',
      description:
        'Guide through creating a particle-like VFX sprite with phase-based frame allocation, additive-friendly color choices, and scale progression.',
      argsSchema: {
        name: z.string().describe('Asset name for the VFX sprite'),
        vfx_type: z
          .enum(['explosion', 'magic', 'hit_spark', 'projectile', 'environmental'])
          .optional()
          .describe(
            'VFX archetype: "explosion", "magic", "hit_spark", "projectile", or "environmental". Defaults to "explosion".',
          ),
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
        frame_count: z
          .number()
          .int()
          .min(4)
          .optional()
          .describe(
            'Total number of frames for the animation, default 6. Minimum 4 (one per phase).',
          ),
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
            text: buildScaffoldVfxText(args),
          },
        },
      ],
    }),
  );
}
