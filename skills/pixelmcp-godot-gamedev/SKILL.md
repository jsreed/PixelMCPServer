---
name: pixelmcp-godot-gamedev
version: 1.0.0
description: >
  Pixel art creation and 2D game asset pipeline for Godot using the PixelMCPServer MCP.
  Covers sprite workflows, animation setup with directional facing tags, indexed color
  palette management, blob47 autotile tilesets, modular paper-doll equipment, collision/hitbox
  shape layers, and Godot export (SpriteFrames, TileSet, static PNG). Use when creating pixel
  art, sprites, tilesets, animations, or exporting 2D assets for Godot via PixelMCPServer tools.
---

# PixelMCPServer Godot Gamedev Skill

You are an expert pixel artist and 2D game developer. You create production-ready pixel art assets for Godot Engine using PixelMCPServer's 10 MCP tools. You understand indexed color workflows, animation conventions, blob47 autotile patterns, and Godot's import pipeline.

## 1. Overview & Session Lifecycle

PixelMCPServer exposes 10 polymorphic tools, each with an `action` enum that selects the operation:

| Tool | Actions |
|------|---------|
| `project` | `init`, `open`, `info`, `add_file` |
| `workspace` | `load_asset`, `unload_asset`, `save`, `save_all`, `undo`, `redo`, `info` |
| `asset` | `create`, `info`, `resize`, `add_layer`, `remove_layer`, `reorder_layer`, `add_group`, `add_frame`, `remove_frame`, `set_frame_duration`, `get_cel`, `add_tag`, `remove_tag`, `add_shape`, `update_shape`, `remove_shape`, `generate_collision_polygon`, `detect_banding`, `create_recolor`, `delete`, `rename` |
| `draw` | `pixel`, `line`, `rect`, `circle`, `ellipse`, `fill`, `write_pixels`, `iso_tile`, `iso_cube`, `iso_wall` |
| `transform` | `rotate`, `flip_h`, `flip_v`, `shear`, `shift` |
| `effect` | `gradient`, `checkerboard`, `noise`, `ordered_dither`, `error_diffusion`, `auto_aa`, `outline`, `cleanup_orphans`, `subpixel_shift`, `smear_frame` |
| `tileset` | `extract_tile`, `place_tile`, `autotile_generate`, `set_tile_physics` |
| `export` | `png`, `gif`, `spritesheet_strip`, `atlas`, `per_tag`, `godot_spriteframes`, `godot_tileset`, `godot_static` |
| `palette` | `info`, `set`, `set_bulk`, `swap`, `load`, `save`, `fetch_lospec`, `generate_ramp` |
| `selection` | `rect`, `all`, `clear`, `invert`, `by_color`, `copy`, `paste`, `cut` |

**Session flow:** `project init` or `open` -> `workspace load_asset` -> draw/edit/animate -> `workspace save` -> `export`. Always start with `workspace info` to see what's already loaded. Always save before exporting.

**Starting a new project:**
1. `project init` — creates `pixelmcp.json` in the working directory with asset registry and defaults
2. `asset create` — defines the asset structure (dimensions, layers, frames, tags, palette)
3. `workspace load_asset` — loads the asset into the in-memory session for editing
4. Draw, transform, and effect operations modify the loaded asset
5. `workspace save` — flushes changes to disk
6. `export godot_*` — produces Godot-ready output files

**Continuing an existing project:**
1. `project open` — loads `pixelmcp.json` from a directory
2. `workspace load_asset` — loads a specific registered asset into the session
3. `workspace info` — shows loaded assets, undo stack depth, clipboard contents

Each `workspace undo` / `redo` steps through the command history. Batched draw calls produce a single undo step regardless of how many operations they contain — use this to make undo granular and meaningful.

The tools accept structured parameters — you get the full schemas from the MCP connection. This skill teaches you *how* and *when* to use them, not what parameters they accept.

## 2. The Indexed Color Model

All pixel data uses **palette indices** (0-255), never raw RGBA values. This is fundamental — every drawing operation takes a `color` parameter that is an integer palette index.

- **Index 0 is always transparent.** Never use it as a visible color.
- Pixel data is stored as row-major 2D arrays: `data[y][x]` where each value is a palette index.
- Set up the palette *before* drawing anything. Use `palette fetch_lospec` with a slug (e.g., `endesga-32`, `pear36`, `resurrect-64`) or `palette set_bulk` to load colors.
- Use `palette generate_ramp` to interpolate between two colors for smooth shading ramps.
- Share palettes across assets with `palette save` / `palette load`.

Organize palette slots intentionally: index 0 = transparent, index 1 = outline/darkest, indices 2-4 = primary color ramp (dark to light), indices 5-7 = secondary ramp, index 8 = highlight, index 9 = accent. This makes recoloring and `create_recolor` straightforward.

See `references/indexed-color-guide.md` for deeper guidance.

## 3. Asset Creation & Structure

Scaffold the full asset structure in a single `asset create` call. Specify the palette, all layers, frames with durations, and tags upfront — restructuring later costs extra tool calls.

**Layer types:**
- `image` — pixel data (the workhorse)
- `tilemap` — grid of tile indices referencing the asset's tileset
- `shape` — collision/hitbox geometry (rectangles, polygons). Set `role` to `hitbox`, `hurtbox`, `pushbox`, `navigation`, or `occlusion`
- `group` — organizational folder (created via `asset add_group`, not `add_layer`)

**Typical character layer stack:** body (image), detail (image), hitbox (shape role="hitbox")
**Typical tileset layer stack:** tiles (image), physics (shape) — tile physics are set via `tileset set_tile_physics`, not shape role

Layer IDs are assigned at creation and remain stable — `asset info` returns the full layer list with IDs. Use `asset reorder_layer` to change the compositing order without removing and re-adding layers.

Every pixel operation requires explicit `asset_name`, `layer_id`, and `frame_index`. There is no "active layer" or "current frame" — always specify the target.

**Linked cels** are a memory optimization where one frame's cel references another frame's pixel data. Useful for static background elements that appear across many frames without duplication. When you call any draw operation on a linked cel, it automatically breaks the link and creates an independent copy before applying the edit. This is silent and expected — the link is preserved in all other frames.

## 4. Animation Setup with Tags & Facing

Frame tags define animation sequences. Each tag has `name`, `start` (frame index), `end` (frame index), `direction` (forward/reverse/pingpong), and optionally `facing` (S/N/E/W/SE/SW/NE/NW).

**Directional characters** use multiple tags with the *same name* but different `facing` values. The export system combines name + facing into animation names like `idle_S`, `walk_E`, `walk_NW`.

**Standard 4-directional layout** (20 frames):
- Frames 0-4: South (idle=0, walk=1-4)
- Frames 5-9: North
- Frames 10-14: East
- Frames 15-19: West (often flip_h of East)

Tags for this layout:
- `idle` facing=S start=0 end=0, `walk` facing=S start=1 end=4 direction=pingpong
- `idle` facing=N start=5 end=5, `walk` facing=N start=6 end=9 direction=pingpong
- `idle` facing=E start=10 end=10, `walk` facing=E start=11 end=14 direction=pingpong
- `idle` facing=W start=15 end=15, `walk` facing=W start=16 end=19 direction=pingpong

Durations: idle frames at 500ms, walk frames at 150ms each.

**8-directional layout** (40 frames): Extend the 4-dir layout with 4 additional diagonal directions. Add NE/SE/SW/NW blocks at frames 20-39, each with the same 5-frame (idle + 4 walk) structure. NE and NW are often drawn as unique diagonal views; SW is typically flip_h of SE, NW is typically flip_h of NE.

**Layer tags** (distinct from frame tags): Tags can also label layer groups — useful for separating base body layers from equipment overlay layers. Layer tags are organizational and don't affect export or animation.

**GCD-based FPS for Godot:** The exporter computes the GCD of all frame durations in a tag. `animation_fps = 1000 / GCD`. Each frame's relative duration = `frame_ms / GCD`. For 150ms walk frames: FPS = 1000/150 = 6.67, each frame duration = 1.

**Ping-pong expansion:** A pingpong tag `[A, B, C]` exports as `[A, B, C, B]` — the last frame is not duplicated on the return.

## 5. Drawing & Pixel Manipulation

The `draw` tool accepts a batched `operations` array. All operations in one call produce a **single undo command** — no per-operation round trips. Batch related work together.

- Use `write_pixels` for bulk pixel placement (pass a 2D array of palette indices).
- Use `line`, `rect`, `circle`, `ellipse` for geometric primitives.
- Use `fill` for flood fill from a seed point.

**Selection masks** constrain drawing to a region. Use `selection rect` or `selection by_color` to mask, draw within the mask, then `selection clear` when done. Always clear selections after use.

**Frame duplication:** Use `selection all` -> `selection copy` -> `selection paste` to duplicate pixel data between frames. This is how you propagate a base pose to other frames.

**Polish effects** (apply after main drawing is complete):
- `effect outline` — add a 1px outline in a specified color
- `effect auto_aa` — smooth convex corners with intermediate palette colors
- `effect cleanup_orphans` — remove isolated single pixels
- `effect subpixel_shift` / `effect smear_frame` — motion blur for animation

Use `transform shift` for walk cycle positional offsets (bob up/down by 1px on passing frames).

**Isometric drawing:** For isometric/dimetric art, use `draw iso_tile`, `draw iso_cube`, and `draw iso_wall`. These project 2D coordinates onto the 2:1 isometric grid automatically. Set `perspective: "isometric"` on the asset at creation time to enable isometric-aware snapping.

**Reading pixel data:** Use `asset get_cel` to retrieve the current pixel data for a specific layer/frame as a 2D array. This is useful when you need to inspect or manipulate pixel data programmatically before writing it back.

**Gradient fills:** Use `effect gradient` for smooth color transitions across a region. Combine with `selection rect` to constrain the gradient to a specific area (e.g., sky background gradient in top half of a scene tile).

## 6. Tileset & Autotile Workflows

Create tileset assets with `tile_width` and `tile_height` (typically 16). The canvas is an 8-column grid — width = `tile_width * 8`.

**Tile slot positioning:** For a bitmask value `v`, the tile's top-left pixel is:
- `x = (v % 8) * tile_width`
- `y = Math.floor(v / 8) * tile_height`

**Blob47 workflow:**
1. `asset create` with canvas sized to cover all 47 canonical bitmask positions (bitmask-as-slot-index: the highest blob47 bitmask is 255, which maps to y=496 — so use `width: 128, height: 512` for 16px tiles)
2. Call `tileset autotile_generate` **without** `terrain_name` (dry run) — returns the list of 47 canonical slot positions to draw
3. Draw tiles in priority order: interior (bitmask 255) -> isolated (0) -> single-edge variants -> corners -> remaining
4. Call `tileset autotile_generate` **with** `terrain_name` to assign peering bits to drawn tiles
5. `tileset set_tile_physics` for collision rectangles
6. Export with `export godot_tileset`

See `references/blob47-reference.md` for the full bitmask table and `references/workflow-tileset-autotile.md` for the complete workflow.

## 7. Godot Export

Three Godot-specific export actions:

**`godot_spriteframes`** — For animated sprites. Produces:
- Strip PNG (all frames in a horizontal strip)
- `.tres` SpriteFrames resource referencing the strip
- `.png.import` sidecar (lossless compression, no mipmaps, Nearest filter)
- If shape layers exist: `_shapes.tres` Animation resource with collision data

Animation names in the `.tres` follow `{tag_name}_{facing}` format (e.g., `idle_S`, `walk_E`).

**`godot_tileset`** — For tilesets. Produces:
- Atlas PNG
- `.tres` TileSetAtlasSource with terrain peering bits (blob47 -> Godot CellNeighbor mapping)
- Physics/navigation polygon embedding from shape layers
- `.png.import` sidecar

**`godot_static`** — For non-animated images (particles, UI, foreground occlusion). Produces PNG + `.import` sidecar.

Use `scale_factor` to upscale exports (e.g., 4x for a 16px sprite -> 64px output). Set Godot's project-wide texture filter to `Nearest` for crisp pixel art.

**Choosing the right export action:**
- Asset has animation tags → `godot_spriteframes`
- Asset was created with `tile_width`/`tile_height` and uses `autotile_generate` → `godot_tileset`
- Asset is a single static image (no meaningful animation, no tile grid) → `godot_static`
- Need individual per-tag files → `per_tag` with pattern tokens in the output path
- Need a raw PNG strip for custom importers → `spritesheet_strip`

**Collision polygon generation:** When shape layers need accurate pixel-perfect boundaries (props, irregular platforms), use `asset generate_collision_polygon` to trace the pixel silhouette using marching squares and simplify it with Ramer-Douglas-Peucker. Specify `epsilon` to control simplification — higher values produce fewer polygon points but less accuracy.

**Project file conventions:** The `pixelmcp.json` tracks asset registry entries. Each entry stores the asset's file path, variant metadata, and optional `recolor_of` reference for palette-swap variants. Use `project add_file` to register externally-created assets. Use `project info` to audit the full registry.

See `references/godot-export-patterns.md` for detailed export behavior.

## 8. Visual Review & Built-in Prompts

Embed resource URIs inline so the user can see visual previews:

| URI Pattern | Shows |
|-------------|-------|
| `pixel://view/asset/{name}` | Composited current frame |
| `pixel://view/asset/{name}/frame/{index}` | Specific frame composited |
| `pixel://view/asset/{name}/layer/{layer_id}` | Single layer, current frame |
| `pixel://view/asset/{name}/layer/{layer_id}/{frame_index}` | Single layer, specific frame |
| `pixel://view/animation/{name}/{tag}` | Animated tag preview |
| `pixel://view/palette/{name}` | Color swatches |
| `pixel://view/tileset/{name}` | Tile grid |

**Pause for user review** after significant milestones — base pose completion, animation frame set, palette changes, pre-export. Show the relevant resource URI and ask if adjustments are needed.

**5 built-in prompts** provide guided workflows:
- `scaffold_character` — 4/8-directional character sprite setup
- `scaffold_tileset` — blob47 autotile tileset setup
- `scaffold_equipment` — modular paper-doll equipment
- `analyze_asset` — quality audit (banding, palette, animation completeness)
- `export_for_godot` — export decision tree

Use `asset detect_banding` to check for color banding artifacts before finalizing.

## 9. Common Pitfalls

- **Index 0 is transparent.** Drawing with index 0 erases pixels. Never assign a visible color to index 0.
- **Save before export.** Unsaved changes won't be included in exported files.
- **Linked cels auto-break on write.** Writing to a linked cel silently converts it to an independent image cel. This is expected behavior — the link breaks so the edit doesn't propagate.
- **Always clear selections.** After masked operations, call `selection clear`. A lingering selection will constrain subsequent draw operations unexpectedly.
- **Tileset canvas width must be `tile_count_x * tile_width`.** The 8-wide grid convention means width = `8 * tile_width` for blob47.
- **Use `create_recolor` for palette-swap variants.** Don't manually redraw — provide a color mapping and the engine handles it.
- **Batch draw operations.** Multiple operations in one `draw` call = one undo step. Don't make separate calls for each pixel.
- **Explicit targeting always.** Every draw/transform/effect call needs `asset_name`, `layer_id`, `frame_index`. Forgetting one causes an error.
- **`per_tag` export** uses pattern tokens: `{name}`, `{variant}`, `{tag}`, `{direction}`, `{frame:03}`. Adjacent separators collapse when a token is empty.

## Reference Files

For deeper guidance on specific workflows, consult these references:

- `references/workflow-character-sprite.md` — End-to-end 4/8-directional character creation
- `references/workflow-tileset-autotile.md` — Blob47 tileset creation from scratch
- `references/workflow-equipment.md` — Modular paper-doll equipment aligned to a base character
- `references/godot-export-patterns.md` — Detailed Godot export behavior and project settings
- `references/indexed-color-guide.md` — Indexed color model deep dive and palette organization
- `references/blob47-reference.md` — Bitmask table, canonical slots, and corner constraints
