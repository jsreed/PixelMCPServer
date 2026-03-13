/**
 * Builds the palette setup instruction text for scaffold prompts.
 *
 * Detects whether the palette argument is:
 * - Absent → falls back to `palette info` with a prompt-specific hint
 * - A file path (contains `/` or ends with `.json`) → `palette load`
 * - A Lospec slug (everything else) → `palette fetch_lospec`
 *
 * @param assetName - The asset name, used in tool-call examples.
 * @param palette - The user-supplied palette arg (slug, path, or undefined).
 * @param fallbackHint - The "add at least..." hint appended to the no-palette message.
 */
export function buildPaletteStep(
  assetName: string,
  palette: string | undefined,
  fallbackHint: string,
): string {
  if (!palette) {
    return `  - No palette was specified. Call \`palette info\` on the asset to check the current palette.
    If the project has a default palette configured, it was applied automatically.
    Otherwise, use \`palette set_bulk\` to add at least: index 0 = transparent [0,0,0,0],
    ${fallbackHint}`;
  } else if (palette.includes('/') || palette.endsWith('.json')) {
    return `  - Load the palette file: call \`palette load\` with \`path="${palette}"\` on asset \`"${assetName}"\`.`;
  } else {
    return `  - Fetch the Lospec palette: call \`palette fetch_lospec\` with \`slug="${palette}"\` on asset \`"${assetName}"\`.`;
  }
}
