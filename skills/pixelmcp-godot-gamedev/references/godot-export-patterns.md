# Godot Export Patterns

Detailed behavior for the three Godot export actions and associated project settings.

## `godot_spriteframes` — Animated Sprites

**Use for:** Characters, equipment overlays, animated props, effects with frame sequences.

**Output files:**
- `{name}_strip.png` — horizontal strip of all frames (frame 0 leftmost)
- `{name}_strip.png.import` — import sidecar (lossless, no mipmaps, Nearest filter)
- `{name}.tres` — SpriteFrames resource

**SpriteFrames structure:**
Each tag becomes a named animation. For tags with `facing`, the animation name is `{tag_name}_{facing}` (e.g., `idle_S`, `walk_E`, `walk_NW`). Tags without facing use just `{tag_name}`.

**GCD-based FPS calculation:**
- Compute GCD of all frame durations within the tag (in milliseconds)
- `animation_fps = 1000 / GCD`
- Each frame's `duration` property = `frame_ms / GCD`
- Example: all frames at 150ms → GCD=150, fps=6.667, each frame duration=1
- Example: mix of 100ms and 200ms → GCD=100, fps=10, durations=[1, 2]

**Ping-pong expansion:**
Tags with `direction=pingpong` are expanded before export. `[A, B, C]` becomes `[A, B, C, B]` — the sequence plays forward then backward, but the last frame of each pass is not duplicated.

**Shape layers → `_shapes.tres`:**
If the asset has shape layers, an additional `{name}_shapes.tres` Animation resource is generated. Each keyframe contains the shape geometry for that frame. Attach this to an AnimationPlayer in Godot alongside the AnimatedSprite2D.

**`scale_factor`:**
Pass `scale_factor: 4` to upscale output. A 16×24px sprite exported at 4× produces a 64×96px strip. The `.tres` coordinates are also scaled. Useful for engines that need larger textures for crisp display without project-wide scaling.

---

## `godot_tileset` — Autotile Tilesets

**Use for:** Terrain tilesets, wall sets, any tile-based layout using Godot's TileMap.

**Output files:**
- `{name}_atlas.png` — full tileset atlas image
- `{name}_atlas.png.import` — import sidecar
- `{name}.tres` — TileSet resource with TileSetAtlasSource

**Terrain peering bits:**
Blob47 bitmask values map to Godot 4's `CellNeighbor` enum:
- N=1 → `CELL_NEIGHBOR_TOP_SIDE`
- NE=2 → `CELL_NEIGHBOR_TOP_RIGHT_CORNER`
- E=4 → `CELL_NEIGHBOR_RIGHT_SIDE`
- SE=8 → `CELL_NEIGHBOR_BOTTOM_RIGHT_CORNER`
- S=16 → `CELL_NEIGHBOR_BOTTOM_SIDE`
- SW=32 → `CELL_NEIGHBOR_BOTTOM_LEFT_CORNER`
- W=64 → `CELL_NEIGHBOR_LEFT_SIDE`
- NW=128 → `CELL_NEIGHBOR_TOP_LEFT_CORNER`

The exporter assigns these peering bits to each tile slot automatically after `autotile_generate` is called with a `terrain_name`.

**Physics and navigation:**
Shape layers in the asset become physics layers and navigation regions in the `.tres`. Each tile slot's shapes are embedded per-tile. Use `tileset set_tile_physics` to define rectangles; use `asset generate_collision_polygon` for complex silhouette-traced polygons.

---

## `godot_static` — Static Images

**Use for:** Particle textures, UI backgrounds, foreground occlusion layers, prop images with no animation.

**Output files:**
- `{name}.png`
- `{name}.png.import`

No `.tres` resource — use directly as a Texture2D in Godot.

---

## `per_tag` — Per-Animation Exports

Exports each tag as a separate strip PNG (not a SpriteFrames `.tres`). Uses pattern token substitution for output paths:

**Pattern tokens:**
| Token | Value |
|-------|-------|
| `{name}` | Asset name |
| `{variant}` | Variant key (empty if none) |
| `{tag}` | Tag name |
| `{direction}` | Facing value (S, N, E, W, etc.) |
| `{frame:03}` | Zero-padded frame index |

**Separator-drop behavior:** Adjacent separators (e.g., `/`, `_`) collapse when the token between them is empty. `{name}_{variant}_{tag}` with no variant → `{name}_{tag}` (not `{name}__walk`).

---

## `.import` Sidecar Format

All Godot export actions write a `.png.import` file that controls how Godot imports the texture:

```ini
[remap]
importer="texture"
type="CompressedTexture2D"

[params]
compress/mode=0          # Lossless
compress/lossy_quality=0.7
compress/hdr_compression=1
compress/normal_map=0
compress/channel_pack=0
mipmaps/generate=false   # No mipmaps (pixel art should not mipmap)
roughness/mode=0
roughness/src_normal=""
process/fix_alpha_border=true
process/premult_alpha=false
process/normal_map_invert_y=false
process/hdr_as_srgb=false
process/hdr_clamp_exposure=false
process/size_limit=0
detect_3d/compress_to=1
svg/scale=1.0
editor/scale_with_editor_scale=false
editor/convert_colors_with_editor_theme=false
```

---

## Godot Project Settings

After importing assets, configure these project settings for correct pixel art rendering:

1. **Rendering > Textures > Canvas Textures > Default Texture Filter** → `Nearest`
   - Without this, all textures use Linear filtering and appear blurry.

2. **Display > Window > Stretch > Mode** → `canvas_items` (for viewport scaling)

3. **Display > Window > Stretch > Aspect** → `keep` or `keep_width` depending on target aspect ratio

For TileMap terrain painting, ensure the TileSet resource's terrain mode is set to `Match Corners and Sides` (blob47 uses both orthogonal and diagonal neighbors).
