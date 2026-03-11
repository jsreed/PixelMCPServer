import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

/**
 * Builds the step-by-step analysis text for the `analyze_asset` prompt.
 * Extracted as a pure function so it can be unit-tested independently of the MCP SDK.
 *
 * The returned text guides the LLM through six structured analysis steps:
 *   1. Gather structural overview via `asset info` + `palette info`
 *   2. Run banding detection via `asset detect_banding`
 *   3. Analyze palette usage (unused indices, near-duplicates, ramp gaps)
 *   4. Verify animation completeness (tag coverage, duration consistency)
 *   5. Check tileset slot coverage via `tileset autotile_generate` (query-only)
 *   6. Output a structured critique with actionable fix suggestions
 *
 * @param args - Prompt arguments provided by the user.
 * @param args.asset_name - Name of the loaded asset to analyze.
 * @returns Markdown-formatted step-by-step instructions for the LLM.
 */
export function buildAnalyzeAssetText(args: { asset_name: string }): string {
  const assetName = args.asset_name;

  return `Analyze the asset \`"${assetName}"\` and produce a structured critique report.

Follow these steps in order, calling the tool actions exactly as described:

---

## Step 1 — Gather structural data

Call the following two tools to collect all information you will need:

  - \`asset info\` on \`"${assetName}"\` — records: \`width\`, \`height\`, \`perspective\`,
    layer list (id, name, type, visible, opacity), frame list (index, duration_ms),
    frame tags (name, start, end, direction, facing), layer tags, cels map, tile fields
    (\`tile_width\`, \`tile_height\`, \`tile_count\`).
  - \`palette info\` on \`"${assetName}"\` — records: full palette array with RGBA values
    and usage counts for each index.

Keep these responses on hand — all subsequent steps reference them.

---

## Step 2 — Banding detection

Call \`asset detect_banding\` on \`"${assetName}"\`.

For each layer the tool reports, note:
  - The layer id, name, and affected frame indices.
  - The detected band ranges (start row, end row, repeated color index).

Banding is a common pixel-art artifact where the same palette color repeats in long
unbroken horizontal or diagonal runs, flattening form and reducing visual interest.

---

## Step 3 — Palette usage analysis

Using the \`palette info\` response from Step 1, identify:

### 3a — Unused palette indices
  - List every index whose \`usage_count\` is 0.
  - Flag indices that are defined (non-null) but never referenced by any cel — these
    waste palette slots and may indicate a leftover color from an earlier iteration.

### 3b — Near-duplicate colors
  - Compare each pair of defined palette entries by their RGBA values.
  - Flag pairs whose Euclidean RGBA distance is less than ~15 (i.e.
    \`sqrt((ΔR)²+(ΔG)²+(ΔB)²+(ΔA)²) < 15\`).
  - Near-duplicates often indicate accidental slight variations that could be merged.

### 3c — Ramp continuity
  - Identify groups of consecutive indices that appear to form a color ramp (indices
    used together in adjacent shading regions).
  - For each candidate ramp, check that luminance progresses monotonically (dark → light
    or light → dark) without large discontinuous jumps.
  - Flag ramps with missing intermediate steps or non-monotonic luminance ordering.

---

## Step 4 — Animation completeness

Using the \`asset info\` response from Step 1:

### 4a — Tag coverage
  - For each **frame tag** (tags with \`start\`/\`end\` frame indices), verify that
    \`start\` and \`end\` are within the asset's frame range (0 to \`frame_count - 1\`).
  - Calculate which frames are **not covered** by any frame tag — a frame with no tag
    may be an orphan or a forgotten animation frame.

### 4b — Duration consistency
  - Within each frame tag, list the duration (ms) of each frame in the tag's range.
  - Flag tags where durations vary significantly unless the variation is intentional
    (e.g., a hold frame in an attack animation is expected to be longer; random small
    differences like 100 ms vs 110 ms are likely unintentional).

### 4c — Layer tag correctness
  - For each **layer tag** (tags referencing layer IDs rather than frame ranges), verify
    that every referenced layer ID exists in the asset's layer list.
  - Flag any layer tags referencing non-existent layer IDs.

---

## Step 5 — Tileset slot coverage (if applicable)

Check whether the \`asset info\` response reports tile fields (\`tile_width\`,
\`tile_height\`, \`tile_count > 0\`). If so, proceed with this step; otherwise skip it.

Call \`tileset autotile_generate\` on \`"${assetName}"\` in **query-only mode** (omit the
\`terrain_name\` parameter) with \`pattern: "blob47"\`:
  - The tool will return three lists: \`expected\`, \`occupied\`, and \`missing\` slot indices.
  - \`missing\` slots are canonical bitmask positions that should have a tile drawn but
    don't yet — these represent gaps an artist still needs to fill.
  - Report the exact \`missing\` list so the user knows which slots remain.

> **Note**: Only run this step for tileset assets. For character sprites or equipment,
> skip this step and note "Not applicable — asset is not a tileset."

---

## Step 6 — Output a structured critique report

After completing Steps 1–5, write your findings in the following format. Be specific:
reference exact layer ids, frame indices, palette index numbers, and tag names. Suggest
the exact tool call(s) that would fix each issue.

\`\`\`
## Structural Summary
<asset name, dimensions (W×H), perspective, layer count, frame count, tag count>

## Palette Issues
### Unused indices
<list or "None">
### Near-duplicate pairs
<list or "None">
### Ramp continuity gaps
<list or "None">

## Animation Issues
### Out-of-range tags
<list or "None">
### Uncovered frames
<list or "None">
### Inconsistent durations
<list or "None">
### Invalid layer tag references
<list or "None">

## Tileset Issues
<Missing canonical slots list, or "Not applicable">

## Suggested Fixes
<For each issue found, state the exact tool action to resolve it.>
<Example: "Remove unused index 14: palette set index=14 rgba=[0,0,0,0] on asset=${assetName}">
<Example: "Cover frame 7 with tag: asset add_tag name=\\"misc\\" start=7 end=7">
\`\`\`

---

Preview the asset at any time using the resource URIs:
  - Full composite: \`pixel://view/asset/${assetName}\`
  - Palette swatch grid: \`pixel://view/palette/${assetName}\`
`;
}

/**
 * Registers the `analyze_asset` MCP prompt with the server.
 *
 * This prompt guides the LLM through a thorough, structured analysis of a loaded
 * pixel-art asset, covering banding detection, palette usage (unused indices,
 * near-duplicates, ramp continuity), animation completeness (tag coverage, duration
 * consistency, layer tag validity), and — for tileset assets — missing autotile slot
 * coverage. The LLM finishes by emitting a structured critique report with actionable
 * tool-call fix suggestions.
 *
 * @param server - The MCP server instance to register the prompt on.
 */
export function registerAnalyzeAssetPrompt(server: McpServer): void {
  server.registerPrompt(
    'analyze_asset',
    {
      title: 'Analyze Asset',
      description:
        'Inspect a loaded asset and produce a structured critique report covering palette usage, banding artifacts, animation completeness, tileset slot coverage, and actionable fix suggestions.',
      argsSchema: {
        asset_name: z.string().describe('Name of the loaded asset to analyze'),
      },
    },
    (args) => ({
      messages: [
        {
          role: 'user' as const,
          content: {
            type: 'text' as const,
            text: buildAnalyzeAssetText(args),
          },
        },
      ],
    }),
  );
}
