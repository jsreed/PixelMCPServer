# Workflow: Modular Paper-Doll Equipment

Workflow for creating equipment assets that overlay cleanly on a base character. Aligns with the `scaffold_equipment` built-in prompt.

## Core Principle

Equipment assets must **exactly match** the base character in:
- Canvas dimensions (same width × height)
- Frame count and layout (same 20-frame 4-dir layout, or whatever the base uses)
- Frame durations
- Tag names and facing values

This alignment lets Godot layer SpriteFrames resources on top of each other frame-perfectly.

## Layer Presets by Equipment Type

| Type | Layers |
|------|--------|
| `weapon` | base (image), detail (image), grip (image) |
| `armor_head` | base (image), visor (image), attachment (image) |
| `armor_chest` | base (image), overlay (image), attachment (image) |
| `cape` / `armor_back` | base (image), overlay (image), attachment (image) |
| generic | base (image), detail (image) |

Separate layers per visual element allow targeted edits (e.g., change only the visor color without touching the helmet base).

## Step-by-Step

### Step 1: Inspect the base character

Before creating the equipment asset, query the character to mirror its structure:

```
asset info  asset_name="hero"
```

Note: `width`, `height`, `frame_count`, frame durations, tags (names, start, end, facing, direction).

Show `pixel://view/asset/hero` for visual reference.

### Step 2: Load the base character's palette

Equipment must use the same palette indices for transparency. If the character's palette was saved to a file, load it:

```
palette load  asset_name="sword_iron"  path="res://palettes/main.json"
```

Or use the same Lospec slug as the character:
```
palette fetch_lospec  slug="endesga-32"  asset_name="sword_iron"
```

### Step 3: Create the equipment asset

Mirror the base character's dimensions and frame structure exactly:

```
asset create
  name: "sword_iron"
  width: 16        # same as hero
  height: 24       # same as hero
  frame_count: 20  # same as hero
  # frame durations copied from hero
  # same tags copied from hero
  layers: [base, detail, grip]
```

### Step 4: Draw the equipment

Draw with the character's reference visible:
- Show `pixel://view/asset/hero` side-by-side while working
- Align equipment to character anchor points (weapon grip at hand position, helmet at head position)
- Draw on transparent background — index 0 everywhere except the equipment pixels
- Use the same palette indices for consistent shading with the character

**Form-fitting vs. non-form-fitting:**
- Form-fitting equipment (tight armor): stays within the character's silhouette, aligns to body contours
- Non-form-fitting (cloaks, large shields): extends beyond the silhouette, needs its own visible pixels outside the character area

### Step 5: Mirror animation across frames

Equipment overlays must animate with the character. For each direction's walk cycle:
- Copy the idle frame to each walk frame as a base
- Apply the same positional shifts as the character (`transform shift` by same dx/dy)
- For weapons held in hand: track the hand pixel position across walk frames and adjust equipment position accordingly

Use `selection all` -> `selection copy` (from idle frame) -> target walk frame -> `selection paste`, then adjust.

### Step 6: Review alignment

Show both assets together:
```
pixel://view/asset/hero
pixel://view/asset/sword_iron
pixel://view/animation/sword_iron/walk_S
```

Check that equipment moves naturally with the character across all walk frames.

### Step 7: Create palette-swap variants (optional)

Use `asset create_recolor` to generate color variants without redrawing:

```
asset create_recolor
  asset_name: "sword_iron"
  new_name: "sword_gold"
  color_map: { 5: 12, 6: 13, 7: 14 }  # remap iron indices to gold indices
```

Each variant is an independent asset that shares the same frame structure but substitutes palette indices. Export each variant separately.

### Step 8: Export

```
workspace save  asset_name="sword_iron"
export godot_spriteframes
  asset_name: "sword_iron"
  output_path: "res://equipment/weapons/"
```

In Godot, attach both the character's SpriteFrames and the equipment's SpriteFrames to separate AnimatedSprite2D nodes, both driven by the same AnimationPlayer or synchronized via code.
