# Indexed Color Guide

Deep dive into the indexed color model used by PixelMCPServer and why it matters for game art.

## Why Indexed Color

PixelMCPServer uses indexed color — pixel data stores palette indices (0-255) rather than raw RGBA values. This design choice enables:

- **Instant recoloring:** Change palette index 5 from red to blue and every pixel using index 5 updates automatically. No redrawing.
- **Palette-swap variants:** `asset create_recolor` generates a new asset by remapping palette indices — an iron sword becomes a gold sword by mapping iron-gray indices to gold-yellow indices.
- **Retro aesthetic:** Indexed color enforces color discipline — you can only use colors from your palette, which produces consistent, harmonious art.
- **Smaller files:** Row-integer arrays of indices (0-255) are more compact than RGBA arrays.

## The Fundamental Rule

**Index 0 is always transparent.** This is a hard convention. Never assign a visible color to palette index 0. Drawing with index 0 erases pixels.

Every other index (1-255) can hold any RGBA value including semi-transparent ones, but index 0 is reserved for transparency by convention and by the compositing system.

## Palette Organization Convention

Organize palette slots intentionally. A well-organized palette makes recoloring and ramp generation predictable:

| Indices | Purpose |
|---------|---------|
| 0 | Transparent (always) |
| 1 | Outline / darkest shadow |
| 2-4 | Primary color ramp (dark → mid → light) |
| 5-7 | Secondary color ramp |
| 8 | Highlight (near-white for the primary hue) |
| 9 | Accent color |
| 10-15 | Skin tones or additional ramps |
| 16+ | Environmental colors, UI colors, special use |

This layout makes `generate_ramp` results predictable — you know exactly which indices the ramp will occupy.

## Loading Palettes

**From Lospec:** Use `palette fetch_lospec` with the palette's URL slug (the last segment of the Lospec URL):
- `endesga-32` — 32 vibrant colors, excellent for stylized characters
- `pear36` — 36 colors with strong earth tones, good for environments
- `resurrect-64` — 64 colors, good coverage for complex scenes
- `apollo` — 32 colors, warm palette popular for dungeon crawlers

```
palette fetch_lospec  slug="endesga-32"  asset_name="hero"
```

**Manually:** Use `palette set_bulk` to set multiple colors at once from an array of RGBA values:
```
palette set_bulk  asset_name="hero"  colors: [[r,g,b,a], ...]  start_index: 1
```

**From another asset:** Share palettes across assets with save/load:
```
palette save  asset_name="hero"  path="res://palettes/main.json"
palette load  asset_name="sword"  path="res://palettes/main.json"
```

## Generating Ramps

Use `palette generate_ramp` to interpolate between two existing palette indices and fill intermediate indices with smooth transitions:

```
palette generate_ramp
  asset_name: "hero"
  from_index: 2    # dark shadow color
  to_index: 4      # bright highlight color
  count: 5         # fill 5 steps between them
  start_index: 2   # write to indices 2-6
```

This produces physically-plausible color ramps for shading. Useful for skin tones, metal sheens, and sky gradients.

## Color Banding Detection

After drawing, check for banding artifacts (harsh color transitions that look like stripes):

```
asset detect_banding  asset_name="hero"
```

The tool identifies regions where palette ramps are too coarse or misapplied. Use `analyze_asset` prompt for a full quality audit including banding, unused indices, and near-duplicate colors.

## Near-Duplicate Detection

The `analyze_asset` prompt checks for palette indices whose RGBA values are perceptually very close (Euclidean distance < 15 in RGB space). Near-duplicates waste palette slots — consolidate them with `palette swap` to remap one to the other, then free the duplicate slot.

## Palette Files

Save palettes as reusable `.json` files for project-wide consistency:

```json
{
  "name": "main_palette",
  "colors": [[r,g,b,a], [r,g,b,a], ...]
}
```

All assets in a project should share the same palette file if they appear in the same scene — this ensures visual coherence and enables palette-swap effects across multiple assets simultaneously.
