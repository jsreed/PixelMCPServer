# Workflow: Character Sprite (4/8-Directional)

End-to-end workflow for creating a directional character sprite with idle and walk animations. Aligns with the `scaffold_character` built-in prompt.

## Frame Layout

**4-directional (20 frames total):**

| Frames | Direction | Idle | Walk |
|--------|-----------|------|------|
| 0-4    | South     | 0 (500ms) | 1-4 (150ms each) |
| 5-9    | North     | 5 (500ms) | 6-9 (150ms each) |
| 10-14  | East      | 10 (500ms) | 11-14 (150ms each) |
| 15-19  | West      | 15 (500ms) | 16-19 (150ms each) |

**8-directional (40 frames total):** Extend the same pattern, adding NE/NW/SE/SW blocks at frames 20-39.

## Layer Stack

```
body    (image)  — base silhouette and primary colors
eyes    (image)  — eyes on top (separate layer for easy editing)
hitbox  (shape, role="hitbox")   — player hitbox
hurtbox (shape, role="hurtbox")  — damage receive region (optional)
```

Add more image layers for complex characters (hair, equipment slots, accessories).

## Tag Setup

Create tags using `asset add_tag` for each facing direction. Tags with the same `name` but different `facing` values are grouped into a single animation in Godot with directional suffixes:

```
idle  facing=S  start=0   end=0   direction=forward
walk  facing=S  start=1   end=4   direction=pingpong
idle  facing=N  start=5   end=5   direction=forward
walk  facing=N  start=6   end=9   direction=pingpong
idle  facing=E  start=10  end=10  direction=forward
walk  facing=E  start=11  end=14  direction=pingpong
idle  facing=W  start=15  end=15  direction=forward
walk  facing=W  start=16  end=19  direction=pingpong
```

## Step-by-Step

### Step 1: Create the asset

Call `asset create` with full structure upfront:
- `width` / `height` for sprite dimensions (e.g., 16x24 for a small character)
- `frame_count: 20` with alternating durations (500ms idle, 150ms walk)
- All three layers defined in the create call
- All tags defined in the create call

### Step 2: Set up the palette

Load a palette before drawing anything:
```
palette fetch_lospec  slug="endesga-32"  asset_name="hero"
```
Or use `palette set_bulk` to define colors manually. Arrange slots: 0=transparent, 1=outline, 2-4=skin ramp, 5-7=clothing ramp.

### Step 3: Draw the south idle base pose (frame 0, body layer)

Pixel art anatomy for a 16x24 character:
- Head: top ~8px (rows 0-7)
- Torso: middle ~8px (rows 8-15)
- Legs: bottom ~8px (rows 16-23)

Draw center-facing (south) first. Use `draw write_pixels` for bulk fills, `draw rect` for blocky shapes, `draw pixel` for details. Outline in the darkest palette color first, then fill inward.

### Step 4: Draw the south walk cycle (frames 1-4, body layer)

Walk cycle contact-passing-contact-passing pattern:
- Frame 1 (contact): right foot forward, left foot back, body neutral
- Frame 2 (passing): feet together/passing, body slightly raised (+1px shift up)
- Frame 3 (contact): left foot forward, right foot back, body neutral
- Frame 4 (passing): feet together/passing, body slightly raised (+1px shift up)

Use `selection all` -> `selection copy` -> target frame 1 -> `selection paste` to copy the base pose, then modify. Use `transform shift` for the 1-2px vertical body bob on passing frames.

### Step 5: Other directions

**North:** Copy south idle base to frame 5. Redraw the head facing away (no face visible, show back of head/hair). Legs and torso mostly the same silhouette.

**East:** Copy south to frame 10. Rotate/reshape to side profile. East-facing walk cycle: animate legs front-to-back.

**West:** Copy east facing to frames 15-19, then `transform flip_h` on each frame. West is typically the horizontal mirror of east for non-asymmetric characters.

For 8-directional characters, NE/SE/NW/SW are diagonal views — usually a mix of the side and front/back proportions.

### Step 6: Add eyes layer details

Draw eyes on the `eyes` layer (same frame structure). Eyes change direction with the character, which is why they're on a separate layer — easy to edit independently.

### Step 7: Polish

Apply effects after all frames are drawn:
```
effect outline    — adds 1px outline in palette index 1 (your darkest color)
effect auto_aa    — smooths convex corners with intermediate colors
effect cleanup_orphans  — removes isolated stray pixels
```

Show `pixel://view/animation/hero/walk_S` and ask user to review before proceeding.

### Step 8: Hitbox shape

Use `asset add_shape` on the `hitbox` layer to define a rectangle centered on the character's feet. For a 16x24 character, a typical hitbox is 12x8px at the bottom (y=16).

### Step 9: Export

```
workspace save  asset_name="hero"
export godot_spriteframes  asset_name="hero"  output_path="res://characters/hero/"
```

Output: `hero_strip.png`, `hero_strip.png.import`, `hero.tres` (SpriteFrames with `idle_S`, `walk_S`, `idle_N`, `walk_N`, `idle_E`, `walk_E`, `idle_W`, `walk_W`).
