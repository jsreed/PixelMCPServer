# PixelArt MCP Server: Architecture & Specification

This document defines the architecture and goals for a **Model Context Protocol (MCP)** server designed to act as a "Headless Aseprite." It enables LLMs and AI agents to perform professional-grade pixel art creation, animation, and tileset management through a structured, action-oriented API.


## 1. Core Goals

PixelMCPServer is a headless pixel art engine exposed as an MCP server.
It enables LLMs and AI agents to create, animate, and export
production-ready 2D game art — sprites, tilesets, and animations —
entirely through structured tool calls, with no GUI required.

### 1.1 LLM-Driven Asset Creation

Give an LLM the primitives it needs to produce complete 2D game art:

- **Sprites & characters** — base models, modular "paper doll" equipment
sets (armor, weapons) that share animation rigs and palette indices.
- **Animation** — multi-frame cycles (idle, walk, attack) across linked
assets, with per-frame duration control and tag-based sequence definitions.
- **Tilesets & environments** — ground tiles, autotile sets, and
environmental objects (trees, water) with support for common autotile
patterns (blob 47, corner 16, transitions).

### 1.2 Visual Feedback Loop

LLMs cannot iterate on art they cannot see. The server provides visual previews of the active workspace through two MCP Protocol features:
1. **MCP Resources** — Parameterized `pixel://` URIs exposed via Resource Templates (for arbitrary exploration) and Resource Lists (for currently loaded assets) that provide PNG/GIF previews and palette swatch grids. The server emits `list_changed` notifications when the workspace state changes.
2. **Inline Tool Results** — Many mutation tools return base64 image data directly in their Tool Results alongside the resource URIs for immediate, zero-latency visual feedback in the chat UI.

### 1.3 Agent-Friendly API Surface

Modern agent frameworks impose tool-count limits. The server consolidates
operations into a small set of polymorphic tools (each with an `action`
discriminator) rather than exposing one tool per operation, keeping the
total tool count low while maintaining full functionality.

## 2. Architecture

### 2.1 The Data Model

The model is structured hierarchically, separating the on-disk project structure from the in-memory active editing session. To ensure retro-compatibility and memory efficiency, it operates natively with **Indexed Color**.

* **Project**: The root on-disk configuration. Maps to a `pixelmcp.json` project file that defines filesystem paths, asset registry, naming conventions, and project-wide defaults. Does not contain pixel data — it is the "solution file" that ties everything together.
* **Workspace**: The active, in-memory editing session. One or more Assets can be loaded into the Workspace simultaneously (e.g., editing an armor set while referencing the base character body). The Workspace maintains the **Command-Based Undo History** and is not persisted to disk — it exists only for the duration of the session.
* **Asset**: An individual, self-contained art file (e.g., "Player," "Sword," or "Wall_Tileset") with defined pixel dimensions (width x height). Each Asset is persisted as a JSON file on disk and contains its own Layers, Frames, Cels, and Palette. Assets are registered in the Project's asset registry. Each Asset also carries a **perspective** property (a free string, e.g., `"flat"`, `"top_down"`, `"top_down_3/4"`, `"isometric"`) that documents the drawing convention and, when set to `"isometric"`, unlocks projection-aware coordinate helpers in the draw and tileset tools. The underlying pixel storage is always flat — perspective affects only how coordinates are interpreted, not how data is stored.
* **Layer**: A hierarchical stacking plane within an Asset. Layers can be **Image Layers** (raw pixels), **Tilemap Layers** (grid-based), **Shape Layers** (non-rendered collision geometry — stores named rect/polygon shapes per frame for hitboxes, hurtboxes, navigation regions, etc.), or **Group Layers** (folders). Layers support visibility, opacity (integer, 0–255; 0 = fully transparent, 255 = fully opaque; default 255), and user-defined tags. Shape Layers carry two additional properties: `role` (free string classifying purpose, e.g. `"hitbox"`, `"hurtbox"`, `"pushbox"`, `"navigation"`, `"occlusion"`) and `physics_layer` (integer 1–32 mapping to a Godot physics layer number).
* **Frame**: A specific point in time within an Asset. Each Asset contains one or more Frames, each with a specific duration (ms).
* **Cel**: The atomic unit where pixel data is stored. It is the intersection of a **Layer** and a **Frame**. An image cel's `x` and `y` fields position the top-left corner of its pixel data within the asset canvas (default `(0, 0)` = canvas origin). Cels can be smaller than the canvas — pixels outside the cel region are treated as transparent (index 0). Tilemap and shape cels do not carry offsets.
* **Palette**: A collection of up to 256 RGBA colors. All pixel data in a Cel stores a **color index (0-255)** rather than raw color values, enabling instant global color swapping.
* **Tag**: A named label applied to a range of frames or a set of layers. Frame tags define animation sequences (e.g., "idle" = frames 0-3, "walk" = frames 4-11) with playback properties including direction (`forward`, `reverse`, `ping_pong`) and an optional `facing` property (one of N, NE, E, SE, S, SW, W, NW) that records the screen-facing direction for directional character sprites. Layer tags group related layers for organizational purposes (e.g., "armor", "base_body").
* **NineSlice**: Optional metadata on an Asset defining nine-slice scaling margins (`top`, `right`, `bottom`, `left` in pixels). When set, the asset is treated as a scalable UI element — the four corners are fixed, edges repeat/stretch, and the center tiles. Used by the `godot_ui_frame` export to produce a Godot `StyleBoxTexture` resource.

#### Data Model Lifecycle

```
Project (on disk: pixelmcp.json)
  └── Asset Registry (logical name → file path)
        ├── "player" → assets/sprites/player.json
        ├── "sword" → assets/sprites/sword.json
        └── "grass_tileset" → assets/tilesets/grass.json

Workspace (in memory, not persisted)
  ├── Loaded Assets: [player, sword]  ← one or more loaded simultaneously
  ├── Undo/Redo History
  └── Active Selection (if any)

Asset (on disk: .json file)
  ├── Metadata (name, dimensions, version)
  ├── Palette (up to 256 RGBA entries)
  ├── Layers
  │     ├── Layer 0: "base" (Image)
  │     ├── Layer 1: "outline" (Image)
  │     └── Layer 2: "group/armor" (Group)
  │           ├── Layer 3: "helmet" (Image)
  │           └── Layer 4: "chest" (Image)
  ├── Frames [0, 1, 2, 3, ...] (each with duration_ms)
  ├── Cels (layer_id × frame_index → pixel data)
  └── Tags
        ├── Frame Tag: "idle" (frames 0-3, loop: ping-pong)
        └── Layer Tag: "armor" (layers 3, 4)
```

### 2.2 MCP Tools

All tools that operate on pixel data require explicit **`asset_name`**, **`layer_id`**, and **`frame_index`** parameters to identify the target. There are no implicit "active" targets — every operation states exactly where it applies. These parameters default to the first loaded asset, layer 0, and frame 0 when omitted, but the LLM should always specify them explicitly.

#### Batched Operation Tools

The `draw`, `transform`, and `effect` tools use an **operations array** schema rather than a single action. The targeting parameters (`asset_name`, `layer_id`, `frame_index`) are declared once at the top level, and the `operations` array contains one or more action objects that execute sequentially on that target. A single operation is just an array of one element — there is no separate "single" vs "batch" mode.

All operations in one call share the same undo Command (one undo step reverts the entire batch). This design eliminates per-operation round trips while keeping the schema consistent whether the LLM is making one draw call or twenty.

If the target cel is a linked cel, the link is broken on the first operation in the batch. All subsequent operations in the same batch operate on the newly allocated independent copy.

---

#### 1. **project**
**Purpose:** On-disk project configuration and asset registry management.

**Arguments:**
- action (enum: `init`, `open`, `info`, `add_file`)
- path (string, optional — project directory for `init`, project file for `open`)
- name (string, optional — logical registry name for `add_file`)
- type (string, optional — free-string asset type for `add_file`, e.g. `"character"`, `"tileset"`)
- import_path (string, optional — path to external image file for `add_file`)

**Behavior:**
- `init` — creates a new `pixelmcp.json` at the given path. Does not create any directories — project directory structure is the developer's concern, not the server's.
- `open` — sets the server's active Project by reading an existing `pixelmcp.json`.
- `info` — returns the current Project configuration (paths, defaults, asset registry).
- `add_file` — imports an external image file (PNG) into the Project. Reads the image at `import_path` and quantizes its colors into a palette of up to 256 entries using the Median Cut algorithm. Pixels with alpha < 128 are treated as transparent (mapped to index 0); all others are treated as fully opaque. If the image has ≤ 255 distinct opaque colors (or ≤ 256 if no transparency), colors are mapped exactly without reduction. Palette indices are ordered by the median-cut bucket structure, not by frequency or luminance. Creates a single image layer with the pixel data as palette indices, saves the resulting `.json` asset file alongside the source image, and registers it in the project's asset registry under `name` with the given `type`. Returns the registered name and file path. Not wrapped in a Command (file I/O).

**Example — starting a new project:**
```json
{ "action": "init", "path": "/my-game" }
```

**Example — reopening an existing project:**
```json
{ "action": "open", "path": "/my-game/pixelmcp.json" }
```

**Example — inspecting the asset registry:**
```json
{ "action": "info" }
```

---

#### 2. **workspace**
**Purpose:** In-memory editing session management. Handles loading/unloading assets, persistence, undo/redo, and session state queries.

**Arguments:**
- action (enum: `load_asset`, `unload_asset`, `save`, `save_all`, `undo`, `redo`, `info`)
- asset_name (string, optional — required for `load_asset`, `unload_asset`, `save`)
- variant (string, optional — selects a fit variant for `load_asset` when the registry entry uses a `variants` map; defaults to the first defined variant)

**Behavior:**
- `info` — returns current Workspace state: active project name and path, list of loaded assets (with unsaved change flags and which variant is loaded for multi-variant entries), undo/redo stack depth, and active selection summary (target asset/layer/frame, or null if no selection). This is the LLM's primary entry point for orienting itself.
- `load_asset` — loads a registered Asset from disk into the Workspace for editing. Multiple assets can be loaded simultaneously.
- `unload_asset` — removes an Asset from the Workspace. Warns if there are unsaved changes.
- `save` — persists a specific loaded Asset back to its file on disk.
- `save_all` — persists all loaded Assets with unsaved changes.
- `undo` / `redo` — steps through the Command-based history stack. The history is global across all loaded assets — operations are undone in reverse chronological order regardless of which asset they targeted.

**Example — orienting at session start:**
```json
{ "action": "info" }
```

**Example — loading two assets for a coordinated edit:**
```json
{ "action": "load_asset", "asset_name": "player" }
{ "action": "load_asset", "asset_name": "sword" }
```

**Example — undoing the last batch of draw operations, then saving:**
```json
{ "action": "undo" }
{ "action": "save", "asset_name": "player" }
```

---

#### 3. **asset**
**Purpose:** Querying and modifying the structural hierarchy (layers, frames, tags) and properties of a loaded Asset.

**Arguments:**
- action (enum: `info`, `get_cel`, `get_cels`, `detect_banding`, `generate_collision_polygon`, `create`, `resize`, `rename`, `duplicate`, `create_recolor`, `delete`, `add_layer`, `add_group`, `remove_layer`, `reorder_layer`, `add_frame`, `remove_frame`, `set_frame_duration`, `add_tag`, `remove_tag`, `add_shape`, `update_shape`, `remove_shape`, `get_shapes`, `set_nine_slice`, `link_cel`)
- asset_name (string, optional — identifies target asset)
- name (string, optional — for rename, duplicate, new asset/layer/group/tag name)
- delete_file (boolean, optional — for `delete`: also remove the asset's `.json` file from disk; defaults to false, which only removes the registry entry)
- width, height (integers, optional — for create, resize)
- anchor (enum: `top_left`, `top_center`, `top_right`, `center_left`, `center`, `center_right`, `bottom_left`, `bottom_center`, `bottom_right` — for `resize`; defaults to `top_left`)
- layer_id (integer, optional — target layer for layer operations, get_cel, and get_cels range mode)
- layer_type (enum: `image`, `tilemap`, `shape` — for add_layer)
- layer_role (string, optional — for shape layers: e.g. `"hitbox"`, `"hurtbox"`, `"pushbox"`, `"navigation"`, `"occlusion"`)
- layer_physics_layer (integer 1-32, optional — Godot physics layer number for shape layers; defaults to 1)
- parent_layer_id (integer, optional — for nesting under a group)
- position (integer, optional — for reorder_layer)
- frame_index (integer, optional — target frame for get_cel)
- frame_start, frame_end (integers, optional — frame range for get_cels range mode)
- cels (array of {layer_id, frame_index}, optional — explicit cel list for get_cels)
- duration_ms (integer, optional — for set_frame_duration)
- tag_type (enum: `frame`, `layer` — for add_tag)
- tag_start, tag_end (integers, optional — frame range for frame tags)
- tag_layers (array of integers, optional — layer IDs for layer tags)
- tag_direction (enum: `forward`, `reverse`, `ping_pong` — playback direction for frame tags; defaults to `forward`)
- tag_facing (enum: `N`, `NE`, `E`, `SE`, `S`, `SW`, `W`, `NW`, optional — facing direction for directional sprite tags; maps to the `{direction}` token in export_pattern)
- perspective (string, optional — drawing convention for `create`; e.g. `"flat"`, `"top_down"`, `"top_down_3/4"`, `"isometric"`; defaults to `"flat"`)
- tile_width, tile_height (integers, optional — for `create`: iso grid cell dimensions when `perspective: "isometric"`, or tile dimensions for tileset assets; stored on the asset and used by isometric draw operations and tileset tools)
- palette (array of [r,g,b,a], optional — initial palette for create)
- layers (array of {name, type}, optional — initial layers for create)
- frames (array of {duration_ms}, optional — initial frames for create)
- tags (array of tag definitions, optional — initial tags for create)
- shape_name (string, optional — name of the shape within the shape layer cel, for `add_shape`, `update_shape`, `remove_shape`, and `generate_collision_polygon`)
- shape_type (enum: `rect`, `polygon` — for `add_shape`, `update_shape`)
- shape_x, shape_y, shape_width, shape_height (integers, optional — geometry for rect shapes)
- shape_points (array of [x, y] pairs, optional — geometry for polygon shapes; coordinates in asset-local pixels)
- epsilon (float, optional — RDP simplification tolerance for `generate_collision_polygon`; smaller = more vertices, more accurate; defaults to 1.0)
- target_layer_id (integer, optional — shape layer to write the generated polygon into, for `generate_collision_polygon`)
- palette_file (string, optional — for `create_recolor`: path to a palette `.json` file, relative to `pixelmcp.json`)
- palette_slug (string, optional — for `create_recolor`: Lospec palette slug, e.g. `"endesga-32"`)
- palette_entries (array of {index, rgba}, optional — for `create_recolor`: inline palette overrides)
- nine_slice_top, nine_slice_right, nine_slice_bottom, nine_slice_left (integers ≥ 0, optional — pixel margins for `set_nine_slice`; also accepted on `create` for convenience)
- source_layer_id (integer, optional — source layer for `link_cel`)
- source_frame_index (integer, optional — source frame for `link_cel`)

**Behavior:**
- `info` — returns full structural metadata for the asset: dimensions, perspective, layer tree (IDs, names, types, visibility, opacity, tags), frame list (indices, durations), all tags, and palette summary (color count, entries). This is the LLM's primary way to discover and inspect asset structure.
- `get_cel` — returns pixel data for a specific cel as a **row integer array** (2D array of palette indices). Also returns the cel's origin offset and dimensions. This is how the LLM reads back pixel data to verify its work. **Linked cel behavior:** if the target cel is a link (`{ "link": "layer_id/frame_index" }`), the server transparently resolves it and returns the referenced pixel data — callers always receive data, never raw link references. The response includes `is_linked: true` and `link_source: "layer_id/frame_index"` as informational metadata when the cel was resolved through a link, so the LLM can choose to avoid writing to it (which would break the link and duplicate the data) if that is not the intent. Linked cels resolve transitively — if cel A links to B, and B links to C, `get_cel(A)` returns C's data. Circular links are prevented at creation time: the `link_cel` action rejects any link that would create a cycle.
- `get_cels` — returns pixel data for multiple cels in one call. Supports two modes:
  - **Explicit list:** provide `cels` array of `{layer_id, frame_index}` pairs.
  - **Range shorthand:** provide `layer_id` + `frame_start` + `frame_end` to get all cels for one layer across a frame range (useful for animation review).
  - Returns array of `{layer_id, frame_index, x, y, width, height, data}` objects.
- `generate_collision_polygon` — traces the pixel silhouette of the source cel (`layer_id` + `frame_index`) and writes a simplified polygon shape into the target shape layer. Algorithm: marching squares contour trace → Ramer-Douglas-Peucker simplification at `epsilon` tolerance. The result is written as a `polygon` shape named `shape_name` in `target_layer_id` at `frame_index`. Returns the generated vertices. Wrapped in a Command for undo/redo. `layer_id` must be an image layer (the source pixels); `target_layer_id` must be a shape layer. If `target_layer_id` is omitted, the server looks for the first shape layer with `role: "hitbox"` and uses it.

- `detect_banding` — analyzes a target cel (`layer_id` + `frame_index`) for color banding artifacts: gradient regions that stair-step with visibly distinct parallel bands instead of smooth transitions. Algorithm: scans for adjacent pixel rows/columns where palette indices form a monotonic sequence (staircase pattern) with uniform step width; reports regions where 3+ parallel bands of equal width are detected. Severity is based on band count and contrast between adjacent indices. Read-only — does not modify pixel data and is not wrapped in a Command. Returns either `{ clean: true }` or `{ banding: [{ x, y, width, height, severity: "low"|"medium"|"high", description }] }`. Useful for self-correction after applying gradient or dither effects.
- `create` — creates a new Asset file on disk, registers it in the Project, and loads it into the Workspace. Accepts optional `palette`, `layers`, `frames`, and `tags` to scaffold the full asset structure in a single call.
- `resize` — changes the canvas dimensions of the Asset. Accepts `width`, `height`, and optional `anchor` (enum: `top_left`, `top_center`, `top_right`, `center_left`, `center`, `center_right`, `bottom_left`, `bottom_center`, `bottom_right` — defaults to `top_left`). Existing pixel data is positioned relative to the new canvas according to the anchor. If the canvas grows, new pixels are filled with index 0 (transparent). If it shrinks, pixels outside the new bounds are cropped. All cels are resized. Cel origin offsets are adjusted to maintain positioning relative to the anchor. Wrapped in a Command.
- `rename` — changes the logical name of a loaded Asset. Updates the asset's internal `name` property, renames the registry key in the Project (preserving `type`, `path`/`variants`, and all other metadata), and renames the `.json` file on disk to match the new name (in the same directory). The asset remains loaded in the Workspace under the new name. Wrapped in a Command for undo/redo (undo restores the original name, registry key, and filename).
- `duplicate` — clones an Asset under a new `name` (required). The new file is saved in the same directory as the source asset's file, registered in the Project, and loaded into the Workspace. Returns the new asset's registry name and file path.
- `create_recolor` — creates a palette-swap variant of an existing Asset in a single call. Clones the source asset's pixel data, layers, frames, tags, and all cels under a new `name` as an independent deep copy (subsequent changes to the source do not propagate to the recolor, and vice versa), then applies a replacement palette. At least one palette source is required: `palette_file` (path to a `.json` palette file, relative to `pixelmcp.json`), `palette_slug` (Lospec slug), or `palette_entries` (inline `{index, rgba}` array). If multiple sources are provided, they layer in order: file → slug → entries (later sources overwrite earlier ones for overlapping indices). The new asset file is saved in the same directory as the source, registered in the Project with a `recolor_of` metadata field pointing to the source asset name, and loaded into the Workspace. Returns the new asset's registry name and file path. Wrapped in a Command for undo/redo.
- `delete` — removes an Asset from the Project registry. If `delete_file` is true, also deletes the `.json` file from disk. The asset is unloaded from the Workspace if currently loaded. Wrapped in a Command for undo/redo (undo restores the registry entry; file deletion is not reversible via undo).
- `add_layer` / `add_group` / `remove_layer` / `reorder_layer` — structural layer operations. `reorder_layer` moves the target layer to a new `position` among its siblings (within the same parent group). If `parent_layer_id` is provided, the layer is reparented into that group at `position` within the group's children. Moving a group layer moves all its children with it. All operations are wrapped in Commands.
- `add_frame` — inserts a new frame at `frame_index` (optional — defaults to appending at the end). New cels for image layers are initialized empty (all index 0); new cels for shape layers have no shapes; new cels for tilemap layers have all cells set to -1. Accepts optional `duration_ms` (defaults to 100). Frame tags with `start` or `end` >= the insertion index shift their indices by +1. Wrapped in a Command.
- `remove_frame` — removes the frame at `frame_index`. All cels at that frame index across all layers are deleted. Frame tags adjust: if the removed index falls within a tag's range, the range shrinks by one. If a tag's range becomes empty (`start` > `end`), the tag is removed automatically. Tags whose ranges are entirely after the removed index shift by -1. Wrapped in a Command.
- `set_frame_duration` — sets the duration of the frame at `frame_index` to `duration_ms`. Wrapped in a Command.
- `add_tag` / `remove_tag` — creates or removes named tags on frame ranges or layer sets. Frame tags accept an optional `tag_facing` to record screen-facing direction (N, NE, E, …) — used by the `{direction}` export pattern token and by the `export per_tag` action when exporting directional sprites. `remove_tag` accepts `name` and optional `tag_facing` to disambiguate when multiple tags share the same name (e.g., `idle/S` vs `idle/N`). If `tag_facing` is omitted and multiple tags share the name, all matching tags are removed.
- `add_shape` — adds a named shape to a shape layer cel (`layer_id` + `frame_index`). Shape type is `rect` (requires `shape_x`, `shape_y`, `shape_width`, `shape_height`) or `polygon` (requires `shape_points`). Wrapped in a Command for undo/redo.
- `update_shape` — replaces the geometry of an existing named shape in a shape layer cel.
- `remove_shape` — deletes a named shape from a shape layer cel.
- `get_shapes` — returns all shapes in a shape layer cel as an array of `{name, type, ...geometry}` objects.
- `set_nine_slice` — sets nine-slice scaling margins on the asset. Requires at least one of `nine_slice_top`, `nine_slice_right`, `nine_slice_bottom`, `nine_slice_left` (unspecified margins default to 0). Validates that `top + bottom < height` and `left + right < width` — returns an error if margins exceed asset dimensions. Sets `asset.nine_slice = { top, right, bottom, left }`. Also accepted on `create` for convenience. Wrapped in a Command for undo/redo.
- `link_cel` — creates a LinkedCel at the target cel (`layer_id` + `frame_index`) pointing to the source cel (`source_layer_id` + `source_frame_index`). The target cel's existing data (if any) is replaced by the link reference. Subsequent reads via `get_cel` on the target will transparently resolve to the source cel's data (with `is_linked: true` metadata). Writing to the linked cel (via `draw`, `transform`, `effect`) breaks the link as usual. Wrapped in a Command for undo/redo. Errors: source cel must exist; self-linking (target == source) is rejected; source must be on the same layer type as target.

**Example — linking frame 3 to frame 0 on the same layer:**
```json
{
  "action": "link_cel",
  "asset_name": "player",
  "layer_id": 0,
  "frame_index": 3,
  "source_layer_id": 0,
  "source_frame_index": 0
}
```

**Example — scaffolding a full asset in one call:**
```json
{
  "action": "create",
  "name": "player",
  "width": 16,
  "height": 16,
  "palette": [
    [0,0,0,0], [45,30,20,255], [120,85,60,255],
    [200,160,120,255], [80,130,70,255]
  ],
  "layers": [
    { "name": "base", "type": "image" },
    { "name": "outline", "type": "image" }
  ],
  "frames": [
    { "duration_ms": 100 },
    { "duration_ms": 100 },
    { "duration_ms": 100 },
    { "duration_ms": 100 }
  ],
  "tags": [
    { "name": "idle", "type": "frame", "start": 0, "end": 3, "direction": "ping_pong" }
  ]
}
```

**Example — creating a palette-swap variant from a palette file:**
```json
{
  "action": "create_recolor",
  "asset_name": "grass_ground",
  "name": "corrupted_ground",
  "palette_file": "palettes/corruption.json"
}
```

**Example — creating an enemy tier recolor with inline entries:**
```json
{
  "action": "create_recolor",
  "asset_name": "slime",
  "name": "fire_slime",
  "palette_entries": [
    { "index": 3, "rgba": [220, 50, 30, 255] },
    { "index": 4, "rgba": [255, 120, 40, 255] },
    { "index": 5, "rgba": [255, 200, 80, 255] }
  ]
}
```

---

#### 4. **draw**
**Purpose:** Direct pixel manipulation primitives and bulk pixel data writing.

**Top-level arguments:**
- asset_name (string, optional — defaults to first loaded asset)
- layer_id (integer, optional — defaults to 0)
- frame_index (integer, optional — defaults to 0)
- frame_range (array of two integers `[start, end]`, optional — mutually exclusive with `frame_index`; applies all operations to every frame in the inclusive range `[start, end]`; produces a single undo Command)
- operations (array of operation objects — executed sequentially)

**Operation types:**

| action | Parameters | Description |
|---|---|---|
| `pixel` | x, y, color | Set a single pixel |
| `line` | x, y, x2, y2, color | Draw a line between two points |
| `rect` | x, y, width, height, color, filled? | Draw a rectangle (outline or filled) |
| `circle` | x, y, radius, color, filled? | Draw a circle (outline or filled) |
| `ellipse` | x, y, width, height, color, filled? | Draw an ellipse (outline or filled) |
| `fill` | x, y, color | Flood fill from a point |
| `write_pixels` | x?, y?, width, height, data | Write a rectangular region of pixel data |
| `color_replace` | from_color, to_color | Replace all pixels of one palette index with another |

- `color` is always an integer 0-255 (palette index).
- `filled` defaults to false for rect, circle, ellipse.
- `write_pixels` accepts `data` as a **row integer array** (2D array of palette indices), same format as `get_cel` responses and asset files. `x` and `y` default to 0. `width` and `height` must match the data dimensions.
- `fill` replaces contiguous pixels matching the starting pixel's palette index with `color`. If the starting pixel already has index `color`, the operation is a no-op.
- `color_replace` replaces every pixel in the target cel (or selected region, if a selection is active) that has palette index `from_color` with palette index `to_color`. Both must be valid palette indices (0–255).

**Frame range mode:** When `frame_range` is provided instead of `frame_index`, all operations are applied to every frame in the inclusive range `[start, end]`. This is useful for batch operations like replacing a color across an entire animation. A single undo Command covers all frames in the range. `frame_range` and `frame_index` are mutually exclusive — providing both is an error.

**Example — building a character frame with mixed operations:**
```json
{
  "asset_name": "player",
  "layer_id": 0,
  "frame_index": 0,
  "operations": [
    { "action": "rect", "x": 5, "y": 4, "width": 6, "height": 8, "color": 2, "filled": true },
    { "action": "circle", "x": 8, "y": 2, "radius": 2, "color": 3, "filled": true },
    { "action": "line", "x": 5, "y": 12, "x2": 4, "y2": 15, "color": 1 },
    { "action": "line", "x": 10, "y": 12, "x2": 11, "y2": 15, "color": 1 },
    { "action": "fill", "x": 7, "y": 6, "color": 3 }
  ]
}
```

**Example — writing a full cel from computed pixel data:**
```json
{
  "asset_name": "player",
  "layer_id": 0,
  "frame_index": 1,
  "operations": [
    {
      "action": "write_pixels",
      "width": 16, "height": 16,
      "data": [
        [0,0,0,0,0,1,1,1,1,1,1,0,0,0,0,0],
        [0,0,0,0,1,2,2,2,2,2,2,1,0,0,0,0]
      ]
    }
  ]
}
```

**Behavior:** Operations execute in order on the target cel. All operations in a single call respect the active Selection and are wrapped in a single undo Command. When a selection mask is active, `write_pixels` applies the data array positionally but only writes to pixels that fall within the selected region — unselected pixels in the data array are skipped and the existing cel data at those positions is preserved.

#### Isometric Draw Operations

When the target asset has `perspective: "isometric"`, the following additional operations are available. They accept iso-grid coordinates `(col, row)` and optional `elevation` rather than pixel coordinates. The server projects to pixel space using the asset's `tile_width` and `tile_height` (set at creation time via `asset create`; required for isometric assets).

| action | Parameters | Description |
|---|---|---|
| `iso_tile` | col, row, color | Fill a flat rhombus tile at the given grid position |
| `iso_cube` | col, row, elevation?, top_color, left_color, right_color | Draw a cube with three visible faces |
| `iso_wall` | col, row, length, axis (`x`\|`y`), height?, color | Draw a wall segment along the x or y iso axis |

**Projection formula** (dimetric 2:1):
- `screen_x = (col − row) × (tile_width / 2)`
- `screen_y = (col + row) × (tile_height / 2) − elevation × tile_height`

These operations call flat draw primitives internally — the underlying pixel data remains a standard 2D array. `elevation` defaults to `0`. Isometric operations project to pixel coordinates internally, then respect the active selection mask in pixel space — the selection mask is always defined in pixel coordinates regardless of the asset's perspective.

---

#### 5. **transform**
**Purpose:** Geometric and spatial transformations applied to a specific cel, layer, or selection region.

**Top-level arguments:**
- asset_name (string, optional — defaults to first loaded asset)
- layer_id (integer, optional — defaults to 0)
- frame_index (integer, optional — defaults to 0)
- frame_range (array of two integers `[start, end]`, optional — mutually exclusive with `frame_index`; applies all operations to every frame in the inclusive range; single undo Command)
- operations (array of operation objects — executed sequentially)

**Operation types:**

| action | Parameters | Description |
|---|---|---|
| `rotate` | angle | Rotate by 90-degree increments (90, 180, 270). Lossless — no interpolation artifacts. |
| `flip_h` | — | Flip horizontally |
| `flip_v` | — | Flip vertically |
| `shear` | amount_x?, amount_y? | Shear by pixel offset |
| `shift` | amount_x?, amount_y? | Translate by pixel offset |

**Example — creating a mirrored frame variant:**
```json
{
  "asset_name": "player",
  "layer_id": 0,
  "frame_index": 2,
  "operations": [
    { "action": "flip_h" },
    { "action": "shift", "amount_x": 1 }
  ]
}
```

**Behavior:** Operations execute in order on the target cel. If a Selection is active, only the selected region is affected. All operations in a single call are wrapped in a single undo Command.

**Frame range mode:** When `frame_range` is provided instead of `frame_index`, all operations are applied to every frame in the inclusive range `[start, end]`. This is useful for batch operations like flipping an entire animation sequence. A single undo Command covers all frames in the range. `frame_range` and `frame_index` are mutually exclusive — providing both is an error.

---

#### 6. **tileset**
**Purpose:** Tools for creating and managing reusable tile-based environments.

**Arguments:**
- action (enum: `extract_tile`, `place_tile`, `autotile_generate`, `set_tile_physics`, `set_tile_animation`, `clear_tile_animation`, `set_tile_data`, `clear_tile_data`, `add_tile_alternative`, `remove_tile_alternative`)
- asset_name (string, optional)
- layer_id (integer, optional)
- frame_index (integer, optional)
- name (string, optional — tileset name)
- tile_width, tile_height (integers, optional — tile dimensions)
- tile_index (integer, optional — for place_tile, set_tile_physics)
- x, y (integers, optional — source/destination position)
- physics_polygon (array of [x, y] pairs, optional — collision polygon in tile-local pixel coordinates for `set_tile_physics`; pass empty array to clear)
- navigation_polygon (array of [x, y] pairs, optional — navigation polygon in tile-local pixel coordinates for `set_tile_physics`)
- physics_layer_index (integer, optional — which physics layer to assign; defaults to 0)
- pattern (enum: `blob47`, `4side`, `4corner` — autotile bitmask pattern for `autotile_generate`)
- terrain_name (string, optional — terrain name written into `tile_terrain` metadata and used as the terrain set name in Godot export; defaults to the asset name)
- frame_count (integer, optional — number of animation frames for `set_tile_animation`)
- frame_duration_ms (integer, optional — per-frame duration for `set_tile_animation`; defaults to 100)
- separation (integer, optional — horizontal pixel gap between animation frames in the atlas for `set_tile_animation`; defaults to 0)
- data_layer_name (string, optional — custom data layer name for `set_tile_data`)
- data_layer_type (enum: `string`, `int`, `float`, `bool`, optional — data type for `set_tile_data`)
- data_value (string | number | boolean, optional — value for `set_tile_data`)
- occlusion_polygon (array of [x, y] pairs, optional — occlusion polygon for `set_tile_physics`)
- alternative_id (integer, optional — alternative tile ID for `add_tile_alternative`)
- flip_h (boolean, optional — horizontal flip for `add_tile_alternative`)
- flip_v (boolean, optional — vertical flip for `add_tile_alternative`)
- transpose (boolean, optional — diagonal transpose for `add_tile_alternative`)

**Behavior:** Handles the creation of tile maps and the extraction of regions from standard sprites into tile libraries.

**Tile slot storage model:** Tile slots are stored as sequential regions on the asset's first image layer, laid out in a horizontal strip. Slot N occupies pixels at x-offset `N × tile_width`, y-offset `0`, with dimensions `tile_width × tile_height`. The asset's canvas width is always `tile_count × tile_width`. A top-level `tile_count` property in the asset JSON tracks how many slots are occupied. The LLM can draw tile pixels directly at the slot's pixel region using `draw` with `write_pixels` at offset `(slot_index × tile_width, 0)`, or draw to a scratch position and formalize it with `extract_tile`.

- `extract_tile` — copies a `tile_width × tile_height` pixel region from source position (`x`, `y`) on the target layer/frame and appends it as the next tile slot. The canvas width extends by `tile_width` and `tile_count` increments. Returns the new slot index. Wrapped in a Command for undo/redo.
- `place_tile` — stamps a tile slot's pixel data onto a tilemap layer at the given grid position. For image layers, this copies the tile's pixels to position (`x`, `y`). For tilemap layers, this writes the tile index into the grid cell.

**Isometric assets:** When the target asset has `perspective: "isometric"`, `place_tile` accepts `col` and `row` (iso-grid coordinates) instead of pixel `x` and `y`. The server projects to pixel space using the asset's `tile_width` and `tile_height` and the same dimetric formula used by isometric draw operations.

- `autotile_generate` — scans the tileset's occupied tile slots and assigns terrain metadata based on the selected `pattern`. Each tile slot index directly encodes its neighbor bitmask value (see **Autotile Slot Convention** below). The action computes Godot `CellNeighbor` peering bit assignments for every occupied slot and stores them in the asset JSON under `tile_terrain`. Returns the list of slot indices that were assigned and any expected-but-missing slots so the LLM can fill gaps. Wrapped in a Command for undo/redo. This metadata is consumed by `export godot_tileset`.

- `set_tile_physics` — sets collision and/or navigation polygon data for a specific tile slot (`tile_index`). Polygons are in tile-local pixel coordinates (relative to the tile's top-left corner). A full-tile collision box would be `[[0,0],[tile_width,0],[tile_width,tile_height],[0,tile_height]]`. This data is stored in the asset JSON under `tile_physics` and is consumed by the `godot_tileset` export action. If `occlusion_polygon` is provided, it is stored alongside the collision polygon and consumed by `export godot_tileset` to emit an occlusion layer for light-blocking tiles. Wrapped in a Command for undo/redo.

- `set_tile_animation` — sets animation metadata for a tile slot (`tile_index`). Animated tiles cycle through `frame_count` sequential frames laid out horizontally in the atlas starting from the tile's position, each `frame_duration_ms` milliseconds. `separation` specifies extra horizontal pixels between each animation frame in the atlas (0 = frames packed tightly). The layout formula is: animation frame N occupies x-offset `tile_x + N × (tile_width + separation)`, y-offset `0`, with dimensions `tile_width × tile_height`. Frames are strictly horizontal (no row wrapping). The asset's canvas width must accommodate all animation frames — it is the caller's responsibility to ensure `(tile_index × tile_width) + frame_count × (tile_width + separation) ≤ canvas_width`. This metadata is stored in the asset JSON under `tile_animation` and consumed by `export godot_tileset` to emit `animation_columns`, `animation_speed_fps`, and `animation_frames_count` in the TileSet resource. Wrapped in a Command for undo/redo.

- `set_tile_data` — sets a custom data value on a tile slot (`tile_index`). Custom data layers are defined by `data_layer_name` and `data_layer_type`; the layer is created automatically if it doesn't exist. The `data_value` is stored per-tile. This metadata is stored in the asset JSON under `tile_custom_data` and consumed by `export godot_tileset` to emit custom data layer definitions and per-tile custom data values in the TileSet resource. Useful for gameplay metadata (e.g., `"terrain_type": "grass"`, `"movement_cost": 2`, `"is_destructible": true`). Wrapped in a Command for undo/redo.

- `add_tile_alternative` — creates an alternative tile variant for a base tile (`tile_index`). The alternative uses the same pixel data but with transform flags: `flip_h`, `flip_v`, and/or `transpose`. This allows a single tile's art to serve as multiple oriented variants without duplicating pixel data. The `alternative_id` is auto-assigned (incrementing from 1) if not provided. Stored in `tile_alternatives` in the asset JSON and consumed by `export godot_tileset` to emit alternative tile entries with transform flags. Wrapped in a Command for undo/redo.

- `clear_tile_animation` — removes animation metadata from a tile slot (`tile_index`). Wrapped in a Command for undo/redo.

- `clear_tile_data` — removes a specific custom data value from a tile slot (`tile_index`) for the given `data_layer_name`. If no `data_layer_name` is provided, clears all custom data for the tile. Wrapped in a Command for undo/redo.

- `remove_tile_alternative` — removes a tile alternative by `alternative_id` from the base tile (`tile_index`). Wrapped in a Command for undo/redo.

#### Autotile Slot Convention

`autotile_generate` uses a **bitmask-as-slot-index** convention: the tile slot index directly encodes the neighbor bitmask value. There is no separate mapping to maintain — the slot number is the bitmask.

**Neighbor bit assignments (shared across all patterns):**

| Bit | Value | Direction |
|-----|-------|-----------|
| 0 | 1 | North |
| 1 | 2 | Northeast |
| 2 | 4 | East |
| 3 | 8 | Southeast |
| 4 | 16 | South |
| 5 | 32 | Southwest |
| 6 | 64 | West |
| 7 | 128 | Northwest |

**`blob47` pattern** — 8-direction, full blob tileset. Uses all 8 bits; slot range 0–255. Only the 47 canonical slot indices need to be filled (all others are invalid and ignored). A slot index is **canonical** if every set corner bit has both of its orthogonal neighbors also set:
- Northeast (2) requires North (1) **and** East (4)
- Southeast (8) requires East (4) **and** South (16)
- Southwest (32) requires South (16) **and** West (64)
- Northwest (128) requires North (1) **and** West (64)

Example assignments: slot `0` = isolated tile, slot `255` = interior (all neighbors), slot `85` = orthogonal interior (N+E+S+W, no corners), slot `21` = N+E+S peninsula.

**`4side` pattern** — 4-direction orthogonal only. Uses bits N(1)+E(4)+S(16)+W(64); 16 valid slots. Diagonal bits are unused.

**`4corner` pattern** — 4-direction diagonal only. Uses bits NE(2)+SE(8)+SW(32)+NW(128); 16 valid slots. Orthogonal bits are unused.

**Workflow:** Call `autotile_generate` with only `pattern` (no drawn tiles yet) to receive the list of expected canonical slot indices for that pattern. Draw each tile variant at its corresponding slot index. Then call `autotile_generate` again (with `terrain_name`) to assign peering bits and store `tile_terrain` metadata. The action reports any still-missing slots.

> **Note:** To create a tileset asset, use `asset create` with `tile_width` and `tile_height` parameters. There is no separate tileset creation action — a tileset is simply an asset with tile dimensions set.

**Example — extracting drawn pixels into a numbered tile slot:**
```json
{
  "action": "extract_tile",
  "asset_name": "grass_tileset",
  "x": 0,
  "y": 0,
  "tile_width": 16,
  "tile_height": 16
}
```

**Example — stamping tile 3 onto a tilemap layer:**
```json
{
  "action": "place_tile",
  "asset_name": "level_01",
  "layer_id": 0,
  "frame_index": 0,
  "tile_index": 3,
  "x": 32,
  "y": 0
}
```

**Example — assigning a full-tile collision box to tile 0:**
```json
{
  "action": "set_tile_physics",
  "asset_name": "grass_tileset",
  "tile_index": 0,
  "physics_polygon": [[0,0],[16,0],[16,16],[0,16]]
}
```

**Example — assigning a half-height platform collision to tile 5:**
```json
{
  "action": "set_tile_physics",
  "asset_name": "grass_tileset",
  "tile_index": 5,
  "physics_polygon": [[0,8],[16,8],[16,16],[0,16]]
}
```

**Example — querying expected blob47 slot indices before drawing:**
```json
{ "action": "autotile_generate", "asset_name": "grass_tileset", "pattern": "blob47" }
```
*Returns `{ "expected_slots": [0, 1, 4, 5, 7, 16, 17, 20, 21, 23, ...], "occupied_slots": [], "missing_slots": [...] }` so the LLM knows which slot indices to draw tiles at.*

**Example — assigning terrain metadata after drawing all 47 tile variants:**
```json
{
  "action": "autotile_generate",
  "asset_name": "grass_tileset",
  "pattern": "blob47",
  "terrain_name": "grass"
}
```
*Assigns Godot peering bits to every occupied canonical slot and stores the result in `tile_terrain`. Returns `{ "assigned": [0, 1, 4, ...], "missing_slots": [] }` on success.*

**Example — setting tile animation for a water tile:**
```json
{
  "action": "set_tile_animation",
  "asset_name": "water_tileset",
  "tile_index": 0,
  "frame_count": 4,
  "frame_duration_ms": 200
}
```

**Example — setting custom data on a tile:**
```json
{
  "action": "set_tile_data",
  "asset_name": "grass_tileset",
  "tile_index": 0,
  "data_layer_name": "movement_cost",
  "data_layer_type": "int",
  "data_value": 1
}
```

**Example — adding a horizontally flipped tile alternative:**
```json
{
  "action": "add_tile_alternative",
  "asset_name": "grass_tileset",
  "tile_index": 5,
  "flip_h": true
}
```

---

#### 7. **effect**
**Purpose:** Procedural texturing, dithering, and pixel-art-specific refinement algorithms.

**Top-level arguments:**
- asset_name (string, optional — defaults to first loaded asset)
- layer_id (integer, optional — defaults to 0)
- frame_index (integer, optional — defaults to 0)
- frame_range (array of two integers `[start, end]`, optional — mutually exclusive with `frame_index`; applies all operations to every frame in the inclusive range; single undo Command)
- operations (array of operation objects — executed sequentially)

**Operation types:**

| action | Parameters | Description |
|---|---|---|
| `gradient` | x?, y?, width?, height?, color1, color2, direction? | Linear gradient between two palette colors |
| `checkerboard` | x?, y?, width?, height?, color1, color2 | Checkerboard dither pattern |
| `noise` | x?, y?, width?, height?, color1, color2 | Random noise dither |
| `ordered_dither` | x?, y?, width?, height?, color1, color2 | Ordered (Bayer) dither pattern |
| `error_diffusion` | x?, y?, width?, height?, color1, color2 | Error diffusion dither |
| `auto_aa` | — | Automatic anti-aliasing: for each pixel on a color boundary, checks whether placing an intermediate palette color (nearest existing entry whose luminance falls between the two boundary colors) at convex corners of color clusters would smooth the transition. Only modifies convex corner pixels where the boundary angle changes; does not touch concave regions or straight edges. |
| `outline` | color | Add outline around non-transparent pixels (within canvas bounds only — does not expand canvas) |
| `cleanup_orphans` | — | Remove isolated single pixels |
| `subpixel_shift` | intensity, direction_x?, direction_y? | Sub-pixel motion shift for animation smoothing along a direction vector |
| `smear_frame` | intensity, direction_x?, direction_y? | Directional smear for motion blur along a direction vector |
| `selout` | color | Selective outline: draws outline pixels using a darker shade determined by adjacent pixel luminance rather than a fixed color. `color` provides the base outline color; actual placed color is shifted toward the adjacent sprite color's hue. |
| `background_remove` | target_color | Replace all pixels matching `target_color` with index 0 (transparent). Operates on the full cel regardless of selection. |

- Region parameters (`x`, `y`, `width`, `height`) default to the full cel when omitted.
- `direction` for `gradient` is an enum: `vertical` (top→bottom), `horizontal` (left→right), `diagonal_down` (top-left→bottom-right), `diagonal_up` (bottom-left→top-right). Defaults to `vertical`. `color1` is at the starting edge, `color2` at the ending edge.
- `color1`, `color2` are palette indices (0-255).
- `intensity` is a float 0.0-1.0.
- `direction_x`, `direction_y` are floats forming a direction vector for `subpixel_shift` and `smear_frame`. Defaults to `(1, 0)` (rightward). The vector is normalized internally — only the direction matters, not the magnitude.

**Example — texturing and polishing a background region:**
```json
{
  "asset_name": "grass_tileset",
  "layer_id": 0,
  "frame_index": 0,
  "operations": [
    { "action": "noise", "x": 0, "y": 0, "width": 16, "height": 16, "color1": 4, "color2": 5 },
    { "action": "outline", "color": 1 },
    { "action": "auto_aa" }
  ]
}
```

**Behavior:** Operations execute in order on the target cel. All effects respect the active Selection and are wrapped in a single undo Command.

- `selout` (selective outline) is a pixel-art-specific outline technique where the outline color adapts to the adjacent sprite pixel's hue and luminance, producing softer, more natural outlines than a flat-color outline. The `color` parameter provides the base/fallback outline color for pixels adjacent to transparent areas. For pixels adjacent to colored sprite pixels, the actual outline color is interpolated between `color` and a darker shade of the adjacent color's hue (using the nearest existing palette entry). Only operates on the boundary of non-transparent pixel clusters, same as `outline`.
- `background_remove` is a convenience operation that replaces every pixel matching `target_color` with palette index 0 (transparent). Useful for cleaning up imported sprites with solid-color backgrounds. Ignores the active selection — always operates on the full cel. `target_color` must be a valid palette index (0–255).

**Frame range mode:** When `frame_range` is provided instead of `frame_index`, all operations are applied to every frame in the inclusive range `[start, end]`. This is useful for batch operations like applying an outline across all frames of an animation. A single undo Command covers all frames in the range. `frame_range` and `frame_index` are mutually exclusive — providing both is an error.

---

#### 8. **export**
**Purpose:** The gateway out of the engine — produces standard game-ready file formats.

**Arguments:**
- action (enum: `png`, `gif`, `spritesheet_strip`, `atlas`, `per_tag`, `godot_spriteframes`, `godot_tileset`, `godot_static`, `godot_ui_frame`, `godot_atlas`, `spritesheet_grid`, `spritesheet_per_layer`, `normal_map`, `palette_lut`)
- asset_name (string, optional — defaults to first loaded asset)
- path (string — output file path)
- scale_factor (integer, optional — e.g., 4 for 4x upscale)
- pad (integer, optional — pixel padding between atlas cells, default 0)
- extrude (boolean, optional — extrude edge pixels for atlas bleeding prevention)
- tags (array of strings, optional — for `per_tag`: filter which frame tags to export; defaults to all frame tags)
- columns (integer, optional — number of columns for `spritesheet_grid` layout; defaults to `ceil(sqrt(frame_count))`)
- layers (array of integers, optional — layer IDs to include for `spritesheet_per_layer`; defaults to all image layers)
- frame_index (integer, optional — for `normal_map`: which frame to render; defaults to 0)
- palette_sources (array of strings, optional — asset names whose palettes provide additional LUT rows for `palette_lut`)

**Behavior:** Routes internal Asset data into standard game development file formats. Exports operate on a specific asset (or all loaded assets for atlas packing).

- `per_tag` — iterates over all frame tags in the asset (or the `tags` subset) and exports each as a separate spritesheet strip PNG. Output filenames are generated from the project's `conventions.export_pattern`, substituting each tag's name, facing, and frame data. Tokens that have no value for a given tag are silently dropped along with their adjacent separator (e.g., a tag with no `facing` in a `{name}_{tag}_{direction}.png` pattern produces `{name}_{tag}.png`). Returns a list of generated file paths. This is the primary action that makes `export_pattern` functional: instead of 24 separate `png` calls for an 8-directional, 3-animation character, a single `per_tag` call produces all 24 files.

- `gif` — exports an animated GIF of the asset. All visible layers are composited at each frame, upscaled by `scale_factor`, and encoded as a looping GIF with per-frame timing from `duration_ms` values. If `tags` is provided, only frames within those tag ranges are included; if omitted, all frames are exported. Writes to `path`.

- `godot_spriteframes` — exports a complete Godot 4.x-ready sprite package to the given directory:
  1. `{name}_strip.png` — horizontal spritesheet strip of all frames at `scale_factor`.
  2. `{name}_strip.png.import` — import sidecar configuring lossless compression and disabled mipmaps (correct pixel art defaults; Godot may regenerate this on first open, but pre-writing it ensures correct initial settings).
  3. `{name}.tres` — Godot `SpriteFrames` text resource. Each frame tag becomes a named animation. Frame regions are expressed as `AtlasTexture` sub-resources pointing into the strip. Animation FPS and per-frame relative durations are derived from `duration_ms` values using the **GCD method**: compute the GCD of all frame durations in the tag → `animation_fps = 1000 / GCD` → `relative_duration = frame_ms / GCD`. This preserves exact per-frame timing regardless of whether all frames share the same duration. **Ping-pong tags** (`tag_direction: "ping_pong"`) are expanded by duplicating the frame sequence in reverse (excluding the final frame to avoid double-display): a 3-frame tag `[A, B, C]` becomes `[A, B, C, B]` as a linear loop. `SpriteFrames` has no native ping-pong mode; this duplication is the correct workaround.
  4. If the asset has any shape layers, also exports `{name}_shapes.tres` — a Godot `Animation` resource with keyed `CollisionShape2D` shape data per animation frame, ready for use in an `AnimationPlayer` node. Each shape layer becomes a separate keyed track, using the layer's `role` as the track path hint.
  > **Note:** Godot 4.x texture filter (Nearest/Linear) is a project-wide setting, not a per-texture import option. Set `Project Settings → Rendering → Textures → Canvas Textures → Default Texture Filter` to `Nearest` once in the Godot editor for correct pixel art display.

- `godot_tileset` — exports a complete Godot 4.x-ready tileset package to the given directory:
  1. `{name}.png` — tileset atlas image at `scale_factor`.
  2. `{name}.png.import` — import sidecar with lossless compression and disabled mipmaps.
  3. `{name}.tres` — Godot `TileSet` text resource with a `TileSetAtlasSource` referencing the atlas. Tile size is read from the asset's `tile_width`/`tile_height`. Per-tile collision polygons from `tile_physics` data are embedded as physics layer polygon definitions. Navigation polygons (if present) populate navigation layer data. If the asset has `tile_terrain` data (populated by `tileset autotile_generate`), the resource also includes a terrain set with `TERRAIN_MODE_MATCH_CORNERS_AND_SIDES` (for `blob47`) or the appropriate mode for `4side`/`4corner`, and per-tile `terrain_peering_bits` assignments mapping the blob47 bitmask to Godot's `CellNeighbor` constants. If the asset has `tile_animation` data (populated by `tileset set_tile_animation`), animated tile properties are emitted per-tile: `animation_columns`, `animation_speed_fps` (derived from `frame_duration_ms`), and `animation_frames_count`. If the asset has `tile_custom_data` (populated by `tileset set_tile_data`), the TileSet resource includes custom data layer definitions and per-tile custom data values. If any tile has `occlusion_polygon` data, an occlusion layer is included in the TileSet. If the asset has `tile_alternatives` (populated by `tileset add_tile_alternative`), alternative tile entries are emitted with `flip_h`, `flip_v`, and `transpose` transform flags.

- `godot_static` — exports a single composited image (frame 0, all visible layers) for non-animated assets that need only an image file — foreground occlusion layers, particle textures, UI backgrounds, and any sprite that does not require a `SpriteFrames` resource:
  1. `{name}.png` — composited PNG at `scale_factor`.
  2. `{name}.png.import` — import sidecar with lossless compression and disabled mipmaps.
  Does not produce a `.tres` resource. For animated assets, use `godot_spriteframes` instead.

  > **UI icon sheets:** For packed UI icon atlases (items, abilities, status effects), use `godot_atlas` to pack multiple loaded icon assets into a single texture with named `AtlasTexture` sub-resources. For animated UI elements (spinning effects, animated buttons), use `godot_spriteframes`.

- `godot_ui_frame` — exports a nine-slice UI panel as a Godot 4.x `StyleBoxTexture` package:
  1. `{name}.png` — composited frame 0 at `scale_factor`.
  2. `{name}.png.import` — import sidecar with lossless compression and disabled mipmaps.
  3. `{name}.tres` — Godot `StyleBoxTexture` text resource with `texture_margin_left`, `texture_margin_top`, `texture_margin_right`, `texture_margin_bottom` set from the asset's `nine_slice` margins (scaled by `scale_factor`).
  Requires the asset to have `nine_slice` margins set (via `asset set_nine_slice`). Returns an error if `nine_slice` is not set.

- `godot_atlas` — exports a packed texture atlas with named Godot `AtlasTexture` sub-resources:
  1. `{name}.png` — packed atlas image at `scale_factor`, using the same bin-packing logic as the `atlas` action.
  2. `{name}.png.import` — import sidecar with lossless compression and disabled mipmaps.
  3. `{name}.tres` — Godot resource file containing one `ext_resource` for the atlas texture and one `AtlasTexture` `sub_resource` per packed asset, each with a `region = Rect2(x, y, w, h)` pointing to its location in the atlas. Sub-resources are named by asset name, making them directly referenceable from Godot code.
  Returns message + file list + region metadata.

- `spritesheet_grid` — lays out all frames in a grid with the specified number of `columns`. Output dimensions: `(width × columns × scale) × (height × rows × scale)` where `rows = ceil(frame_count / columns)`. Empty cells in the last row (when frame_count is not a multiple of columns) are filled with transparent pixels. Useful for game engines that expect grid-based spritesheets rather than horizontal strips.

- `spritesheet_per_layer` — exports one horizontal strip PNG per image layer, writing them to the `path` directory as `{asset_name}_{layer_name}_strip.png`. Only image layers are included; tilemap, shape, and group layers are skipped. If `layers` is provided, only the listed layer IDs are exported (must all be image layers). Returns the list of generated file paths. Useful for engines that composite layers at runtime (e.g., paper-doll character systems).

- `normal_map` — generates a normal map from the sprite's luminance using a Sobel filter. Composites all visible layers at frame 0 (or specified `frame_index`), converts to grayscale luminance, applies 3×3 Sobel operators for horizontal and vertical gradients, maps to RGB normal space (R = dx, G = dy, B = 1.0, normalized). Output is a standard tangent-space normal map PNG at `scale_factor`. Writes to `path`. Useful for 2D lighting systems in Godot (CanvasItem → Normal Map property).

- `palette_lut` — generates a 256×N lookup texture (LUT) for runtime palette swapping. Each row N contains 256 pixels where pixel X has the RGBA color of palette index X from the Nth palette source. Row 0 is always the asset's current palette. Additional rows can be added by providing `palette_sources` (array of asset names whose palettes provide additional rows). The LUT is written as a PNG to `path`. Shader-based palette swap: sample the sprite to get the palette index (red channel of indexed texture), then sample the LUT at `(index / 256, row / N)` to get the swapped color.

**Example — exporting all directional animation strips using the project export_pattern:**
```json
{
  "action": "per_tag",
  "asset_name": "player",
  "path": "exports/player/",
  "scale_factor": 4
}
```
*With `export_pattern: "{name}_{tag}_{direction}.png"` and tags `idle/S`, `idle/N`, `walk/S`, `walk/N`, produces: `player_idle_S.png`, `player_idle_N.png`, `player_walk_S.png`, `player_walk_N.png`.*

**Example — exporting only specific tags:**
```json
{
  "action": "per_tag",
  "asset_name": "iron_sword",
  "path": "exports/weapons/",
  "scale_factor": 4,
  "tags": ["idle", "attack"]
}
```

**Example — 4× PNG for a single sprite:**
```json
{
  "action": "png",
  "asset_name": "player",
  "path": "exports/player.png",
  "scale_factor": 4
}
```

**Example — horizontal spritesheet strip of all frames:**
```json
{
  "action": "spritesheet_strip",
  "asset_name": "player",
  "path": "exports/player_strip.png",
  "scale_factor": 2
}
```

**Example — animated GIF preview of an animation:**
```json
{
  "action": "gif",
  "asset_name": "player",
  "path": "exports/player_idle.gif",
  "scale_factor": 4
}
```

**Example — packed texture atlas from all loaded assets:**
```json
{
  "action": "atlas",
  "path": "exports/atlas.png",
  "pad": true,
  "extrude": true
}
```

**Example — exporting a character sprite for Godot (SpriteFrames + collision shapes):**
```json
{
  "action": "godot_spriteframes",
  "asset_name": "player",
  "path": "godot_project/assets/characters/player/",
  "scale_factor": 4
}
```
*Produces: `player_strip.png`, `player_strip.png.import`, `player.tres` (SpriteFrames), and if hitbox/hurtbox shape layers exist: `player_shapes.tres` (Animation).*

**Example — exporting a tileset for Godot (TileSet with collision data):**
```json
{
  "action": "godot_tileset",
  "asset_name": "grass_tileset",
  "path": "godot_project/assets/tilesets/",
  "scale_factor": 1
}
```
*Produces: `grass_tileset.png`, `grass_tileset.png.import`, `grass_tileset.tres` (TileSet with per-tile collision polygons).*

**Example — exporting a foreground occlusion layer or particle texture:**
```json
{
  "action": "godot_static",
  "asset_name": "tree_canopy_a",
  "path": "godot_project/assets/environments/foreground/",
  "scale_factor": 2
}
```
*Produces: `tree_canopy_a.png`, `tree_canopy_a.png.import`. No `.tres` generated.*

**Example — exporting a grid spritesheet with 4 columns:**
```json
{
  "action": "spritesheet_grid",
  "asset_name": "player",
  "path": "exports/player_grid.png",
  "columns": 4,
  "scale_factor": 2
}
```
*Produces: `player_grid.png` with frames laid out in a 4-column grid.*

**Example — exporting per-layer strips for a paper-doll system:**
```json
{
  "action": "spritesheet_per_layer",
  "asset_name": "player",
  "path": "exports/player/layers/",
  "scale_factor": 4
}
```
*Produces: `player_base_strip.png`, `player_outline_strip.png`, etc. — one strip per image layer.*

**Example — generating a normal map for 2D lighting:**
```json
{
  "action": "normal_map",
  "asset_name": "tree",
  "path": "exports/tree_normal.png",
  "scale_factor": 4
}
```
*Produces: `tree_normal.png` — tangent-space normal map for use with Godot's CanvasItem Normal Map property.*

**Example — generating a palette LUT for runtime palette swapping:**
```json
{
  "action": "palette_lut",
  "asset_name": "player",
  "path": "exports/player_lut.png",
  "palette_sources": ["fire_player", "ice_player"]
}
```
*Produces: `player_lut.png` — 256×3 lookup texture (base palette + 2 swap palettes).*

---

#### 9. **palette**
**Purpose:** Querying and managing the Indexed Color system.

**Arguments:**
- action (enum: `info`, `set`, `set_bulk`, `swap`, `load`, `save`, `fetch_lospec`, `generate_ramp`)
- asset_name (string, optional — target asset's palette)
- index, index2 (integers 0-255, optional — for set, swap)
- rgba (array [r, g, b, a], optional — for set)
- entries (array of {index, rgba}, optional — for set_bulk)
- name (string, optional — Lospec slug for fetch_lospec; palette name written into saved file for save)
- path (string, optional — file path for load and save; relative to pixelmcp.json)
- color1, color2 (integers 0-255, optional — start and end palette indices for generate_ramp)
- hue_shift_start (float, optional — hue rotation in degrees, -360 to +360, applied to the start color before interpolation; for `generate_ramp`)
- hue_shift_end (float, optional — hue rotation in degrees, -360 to +360, applied to the end color before interpolation; for `generate_ramp`)

**Behavior:**
- `info` — returns the full palette: all defined entries with their index, RGBA values, and usage counts (how many pixels in the asset reference each index). This is how the LLM inspects available colors before drawing.
- `set` — sets a single palette entry at `index` to `rgba`.
- `set_bulk` — sets multiple palette entries in one call. Accepts `entries` array of `{index, rgba}` objects. Useful for initializing or replacing an entire palette.
- `swap` — exchanges the RGBA values at `index` and `index2`. All pixels that reference either index will render the other index's former color after the swap. Does not modify pixel data — only the palette entries at those two positions are changed. Wrapped in a Command.
- `load` — reads a palette `.json` file at `path` (resolved relative to `pixelmcp.json`) and applies it to the asset's palette, replacing existing entries. Entries present in the file overwrite; entries absent in the file are left unchanged. Wrapped in a Command.
- `save` — writes the asset's current palette to a palette `.json` file at `path` (resolved relative to `pixelmcp.json`), using the optional `name` field as the palette identifier in the file. Creates or overwrites the file. Useful for promoting a palette built via `set_bulk` into a shared project file. Not wrapped in a Command (file I/O only).
- `fetch_lospec` — fetches a palette from the Lospec API by `name` (slug, e.g., `"endesga-32"`) and applies it to the asset's palette. Wrapped in a Command. To persist the fetched palette to a local file for project-wide reuse, follow with a `save` call.
- `generate_ramp` — reads the existing RGBA values at `color1` and `color2` as the ramp start and end colors, then interpolates and writes intermediate colors to every palette index between `color1` and `color2` inclusive. The values at `color1` and `color2` themselves are preserved. Requires both endpoint indices to already have colors defined. If `hue_shift_start` and/or `hue_shift_end` are provided, the endpoint colors are first converted to HSL, the specified hue rotation is applied, and interpolation proceeds in HSL space. This enables warm-to-cool ramps (e.g., orange highlight → blue shadow with `hue_shift_end: -180`) that are common in pixel art shading. HSL conversion uses the standard cylindrical model (H: 0–360°, S: 0–1, L: 0–1). Saturation and lightness are linearly interpolated between endpoints; hue is interpolated along the shortest arc (or the shifted arc when hue_shift is applied). The resulting RGB is snapped to integer 0–255 values. Without hue shift parameters, interpolation is in RGB space as before. Wrapped in a Command.
- All palette mutations are wrapped in Commands for undo/redo.

**Example — inspecting current colors before drawing:**
```json
{ "action": "info", "asset_name": "player" }
```

**Example — initializing a palette in one call:**
```json
{
  "action": "set_bulk",
  "asset_name": "player",
  "entries": [
    { "index": 0, "rgba": [0, 0, 0, 0] },
    { "index": 1, "rgba": [20, 12, 28, 255] },
    { "index": 2, "rgba": [68, 36, 52, 255] },
    { "index": 3, "rgba": [48, 96, 130, 255] },
    { "index": 4, "rgba": [91, 168, 140, 255] },
    { "index": 5, "rgba": [246, 214, 189, 255] }
  ]
}
```

**Example — filling indices 10–14 with a skin-tone ramp:**
```json
{
  "action": "generate_ramp",
  "asset_name": "player",
  "color1": 10,
  "color2": 14
}
```

**Example — loading a shared project palette into an asset:**
```json
{
  "action": "load",
  "asset_name": "armor_overlay",
  "path": "palettes/fishing_village.json"
}
```

**Example — saving the current palette to a shared file:**
```json
{
  "action": "save",
  "asset_name": "player",
  "path": "palettes/player_base.json",
  "name": "player_base"
}
```

**Example — fetching from Lospec and persisting locally:**
```json
{ "action": "fetch_lospec", "asset_name": "player", "name": "endesga-32" }
{ "action": "save", "asset_name": "player", "path": "palettes/endesga-32.json", "name": "endesga-32" }
```

---

#### 10. **selection**
**Purpose:** Establishing editing masks and clipboard operations.

**Arguments:**
- action (enum: `rect`, `all`, `clear`, `invert`, `by_color`, `copy`, `paste`, `cut`)
- asset_name (string, optional — defaults to first loaded asset)
- layer_id (integer, optional — defaults to 0)
- frame_index (integer, optional — defaults to 0)
- x, y, width, height (integers, optional — for rect)
- color (integer 0-255, optional — for by_color)
- target_layer_id (integer, optional — destination for paste)
- target_frame_index (integer, optional — destination for paste)
- target_asset_name (string, optional — destination for paste, enables cross-asset copy)
- offset_x, offset_y (integers, optional — position offset for paste)

**Behavior:** The Workspace maintains one active selection at a time. Each selection is scoped to a specific `asset_name` + `layer_id` + `frame_index` — setting a new selection replaces any previous one, even on a different asset. The selection is automatically cleared when its target layer is removed, its target frame is removed, or its parent asset is unloaded. The selection mask constrains `draw`, `effect`, and `transform` operations on the same target.

- `rect` — selects a rectangular region on the target cel.
- `all` — selects the entire cel.
- `clear` — removes the active selection (no mask; operations affect the full cel).
- `invert` — flips the selection mask (selected ↔ unselected).
- `by_color` — selects all pixels in the target cel that match `color` (global match, not flood-fill — selects every pixel of that palette index regardless of contiguity).
- `copy` — captures the selected region to an internal clipboard.
- `paste` — places clipboard contents at the target location (same or different layer/frame/asset). Position defaults to the original selection origin, offset by `offset_x`/`offset_y`.
- `cut` — copies and then clears the selected region.

All mutation operations (`cut`, `paste`) are wrapped in Commands for undo/redo.

**Example — masking a region before applying an effect:**
```json
{
  "action": "rect",
  "asset_name": "player",
  "layer_id": 0,
  "frame_index": 0,
  "x": 4, "y": 4, "width": 8, "height": 8
}
```

**Example — selecting all pixels of a specific color (global match):**
```json
{
  "action": "by_color",
  "asset_name": "player",
  "layer_id": 0,
  "frame_index": 0,
  "color": 3
}
```

**Example — copying frame 0 and pasting it shifted by 2px onto frame 1:**
```json
{ "action": "all", "asset_name": "player", "layer_id": 0, "frame_index": 0 }
{ "action": "copy", "asset_name": "player", "layer_id": 0, "frame_index": 0 }
{
  "action": "paste",
  "target_frame_index": 1,
  "offset_x": 2,
  "offset_y": 0
}
```

**Example — cross-asset copy (body → armor overlay):**
```json
{ "action": "rect", "asset_name": "player", "layer_id": 0, "frame_index": 0, "x": 4, "y": 4, "width": 8, "height": 8 }
{ "action": "copy", "asset_name": "player", "layer_id": 0, "frame_index": 0 }
{
  "action": "paste",
  "target_asset_name": "armor_overlay",
  "target_layer_id": 0,
  "target_frame_index": 0
}
```

**Example — deselecting after an operation:**
```json
{ "action": "clear" }
```

---

### 2.3 MCP Resources

#### Design Rationale: Tools-First, Resources as Bonus

MCP defines two mechanisms for reading state: **Tools** (model-controlled — the LLM decides when to call them) and **Resources** (application-controlled — the host/client decides when to inject them into context). This is a critical distinction.

In practice, only ~39% of MCP clients support resources, while 100% support tools. More importantly, resources require the client to mediate access — the LLM cannot proactively request a resource URI on its own. This makes resources unsuitable as the primary state observation mechanism for an LLM-driven workflow.

**Our approach:** All state the LLM needs to query is exposed through **read-only tool actions** (`project info`, `workspace info`, `asset info`, `asset get_cel`, `palette info`). The LLM calls these like any other tool and gets structured data back. MCP Resources are defined as a **supplementary layer** for clients that support them — primarily visual previews (PNG/GIF) that are useful for the human user but not interpretable by the LLM.

Tool results for mutation actions (e.g., `draw`, `transform`) may include **resource links** and **inline image data** in their response, pointing to or displaying relevant visual previews. Clients that support resources can render these inline; clients that don't simply ignore them.

#### Resource Registration and Discovery

To adhere idiomatically to the MCP specification:

1. **Resource Templates (`resources/templates/list`)**: All parameterized dynamic views are explicitly registered and advertised as URI templates (e.g., `pixel://view/asset/{name}`). This allows the MCP client to understand how to construct queries.
2. **Resource Listing (`resources/list`)**: When queried for a concrete list of resources, the server returns the fully qualified URIs for the assets currently loaded in the active workspace.
3. **List Changed Notifications (`notifications/resources/list_changed`)**: Because the Workspace state changes dynamically as the LLM loads and unloads assets, the server emits `list_changed` notifications to prompt the client to refresh its resource list.

#### Visual Preview Resources (Client-Facing)

These resources render visual output for the human user. They are not required for LLM operation — the LLM reads state via tool actions instead.

- `pixel://view/asset/{name}` — Composited PNG render of the asset (all visible layers, frame 0).
- `pixel://view/asset/{name}/frame/{index}` — Composited PNG render of a specific frame.
- `pixel://view/asset/{name}/layer/{layer_id}` — PNG render of a single layer (frame 0), isolated.
- `pixel://view/asset/{name}/layer/{layer_id}/{frame_index}` — PNG render of a specific cel.
- `pixel://view/animation/{name}/{tag}` — Animated GIF preview of a tagged animation sequence.
- `pixel://view/palette/{name}` — Rendered PNG visualization of the palette grid.
- `pixel://view/tileset/{name}` — Rendered PNG grid of all tiles in the tileset.


### 2.4 MCP Prompts

MCP Prompts are user-invoked workflow templates — they differ from Tools in that the **user** triggers them (e.g., from a slash-command menu in the host UI) rather than the LLM invoking them autonomously. When a prompt is requested, the server returns a `messages` array that seeds the LLM's context with a structured starting instruction, optionally embedding resource references or prior context.

Prompts complement the tool surface: tools handle atomic operations; prompts handle multi-step workflows by pre-configuring the LLM's intent before it begins tool calls.

#### Registered Prompts

---

**`scaffold_character`**
Guide the LLM through creating a character sprite from scratch.
Covers: palette selection, layer structure, directional frame tags, hitbox/hurtbox shape layers, and animation states.
The animation set is not role-prescribed; instead the prompt presents a curated menu of common animation states grouped by category, and the LLM selects what fits the character.

Arguments:
- `name` (required) — asset name
- `directions` (optional) — `"4"` or `"8"` directional; defaults to `"4"`
- `width` / `height` (optional) — canvas size in pixels; defaults to 16×24
- `palette` (optional) — Lospec slug or palette file path; defaults to project default
- `description` (optional) — free-text description of the character (e.g., `"shopkeeper NPC who sweeps"`); gives the LLM context when choosing from the animation menu
- `animations` (optional) — explicit list of animation names (e.g., `["idle", "walk", "attack", "hurt", "death"]`); skips the menu entirely and uses this list directly

Animation menu (embedded in the prompt text — LLM selects appropriate states):

| Category | Animation | Frames | Duration/frame |
|---|---|---|---|
| Movement | `idle` | 1 | 500 ms |
| | `walk` | 4 | 150 ms |
| | `run` | 4 | 100 ms |
| | `crouch` | 2 | 150 ms |
| | `jump` | 3 | 100 ms |
| Combat | `attack` | 3 | 100 ms |
| | `hurt` | 2 | 150 ms |
| | `death` | 4 | 200 ms |
| | `block` | 1 | 500 ms |
| | `dash` | 2 | 80 ms |
| Interaction | `interact` | 2 | 300 ms |
| | `talk` | 2 | 200 ms |
| | `idle_variant` | 4 | 200 ms |
| Special | `cast` | 3 | 150 ms |
| | `emote` | 3 | 200 ms |

Frame layout algorithm (taught to the LLM in the prompt text):
For each facing direction (in order), for each selected animation (in menu order): lay frames sequentially, note start/end indices, create the tag.
`totalFrames = sum(frameCounts) × directionCount`.
A worked example is embedded so the LLM can verify its arithmetic before calling tools.

---

**`scaffold_tileset`**
Guide the LLM through creating a blob47 autotile tileset: asset creation, drawing the 47 canonical tile variants at their bitmask slot indices, calling `autotile_generate`, and exporting for Godot.

Arguments:
- `name` (required) — asset name
- `tile_size` (optional) — tile pixel size (square); defaults to project default
- `terrain_name` (optional) — Godot terrain name; defaults to asset name

---

**`scaffold_equipment`**
Guide the LLM through creating a modular equipment asset (weapon, armor, accessory) with fit variants and directional animation tags aligned to a reference character rig.

Arguments:
- `name` (required) — asset name
- `type` (optional) — `"weapon"`, `"armor_head"`, `"armor_chest"`, `"cape"`, etc.; informs default variant structure
- `reference_character` (optional) — registered asset name of the base body to use as anchor reference

---

**`analyze_asset`**
Prompt the LLM to inspect a loaded asset's structure and pixel data, then return a structured critique: palette usage, banding issues, missing animation frames, misaligned anchor points, or incomplete tileset slots.

Arguments:
- `asset_name` (required) — the asset to analyze

---

**`export_for_godot`**
Prompt the LLM to determine the correct export action for a loaded asset (spriteframes vs. tileset vs. static vs. ui_frame vs. atlas) based on its type and structure, then execute the export to the appropriate project path.

Arguments:
- `asset_name` (required) — the asset to export
- `godot_project_path` (optional) — root path of the Godot project; defaults to project-level export path if configured

---

**`scaffold_ui_icons`**
Guide the LLM through creating a set of UI icons: asset creation per icon, palette selection, drawing at a consistent canvas size, and exporting all icons as a packed atlas with named Godot `AtlasTexture` sub-resources.

Arguments:
- `name` (required) — base name for the icon set
- `icon_size` (optional) — icon canvas size in pixels (square); defaults to 16
- `count` (optional) — expected number of icons to create
- `palette` (optional) — Lospec slug or palette file path; defaults to project default

---

**`scaffold_ui_frame`**
Guide the LLM through creating a nine-slice UI frame panel: asset creation, palette setup, explaining the 9-slice concept (fixed corners, repeating edges, tiling center), drawing the frame (corners first, then edges, then center fill), setting nine-slice margins, and exporting as a Godot `StyleBoxTexture`.

Arguments:
- `name` (required) — asset name
- `width` (optional) — canvas width in pixels; defaults to 48
- `height` (optional) — canvas height in pixels; defaults to 48
- `palette` (optional) — Lospec slug or palette file path; defaults to project default

---

**`scaffold_attack`**
Guide the LLM through creating an attack animation sequence with proper pixel art timing principles: anticipation (wind-up, 2-3 frames), active/smear (fast motion, 1-2 frames with motion blur via `smear_frame`), impact/rebound (contact frame with screen-shake implied timing), follow-through (deceleration, 2-3 frames), and recovery (return to idle). Covers frame timing, layer organization for weapon trail effects, and hitbox shape keyframes.

Arguments:
- `name` (required) — asset name (or existing asset to add frames to)
- `attack_type` (optional) — `"melee_slash"`, `"melee_thrust"`, `"ranged"`, `"magic_cast"`; informs default frame structure and motion direction. Defaults to `"melee_slash"`.
- `weapon_asset` (optional) — registered weapon asset name for cross-reference alignment
- `frame_count` (optional) — total frames in the attack cycle; defaults to 6

---

**`scaffold_side_scroller`**
Guide the LLM through creating a side-view character sprite with animation states specific to side-scrolling gameplay: `idle` (breathing/bob loop), `run` (full run cycle with contact/passing/flight phases), `jump_rise`, `jump_apex`, `jump_fall`, `land` (squash recovery), and `attack`. Covers the characteristic side-view proportions (wider stance, more horizontal motion), run cycle principles (contact→recoil→passing→high point), and jump arc frame selection.

Arguments:
- `name` (required) — asset name
- `width` / `height` (optional) — canvas size; defaults to 32×32 (side-scrollers typically use larger canvases than top-down)
- `palette` (optional) — Lospec slug or palette file path
- `animations` (optional) — explicit animation state list; defaults to `["idle", "run", "jump_rise", "jump_fall", "land", "attack"]`

---

**`scaffold_vfx`**
Guide the LLM through creating particle-like VFX sprites: explosions, magic effects, hit sparks, projectile impacts, and environmental particles (dust, fire, water splash). Covers: short frame count with aggressive timing (fast attack → slow decay), additive-friendly color choices (bright core → edge fade), scale progression (small → large → dissipate), and optional trail/afterimage layers.

Arguments:
- `name` (required) — asset name
- `vfx_type` (optional) — `"explosion"`, `"magic"`, `"hit_spark"`, `"projectile"`, `"environmental"`; informs default frame structure and palette guidance. Defaults to `"explosion"`.
- `width` / `height` (optional) — canvas size; defaults to 32×32
- `frame_count` (optional) — total frames; defaults to 6
- `palette` (optional) — Lospec slug or palette file path

---

**`scaffold_parallax`**
Guide the LLM through creating a parallax background as a single asset with multiple image layers for side-scrolling or horizontal scenes. The canvas width is 2× the viewport width for seamless horizontal tiling. Covers: layer depth ordering (sky → far mountains → near hills → foreground), atmospheric perspective (less saturated and lighter for distant layers), tile-seam alignment, and scroll-speed guidance for the game engine.

Arguments:
- `name` (required) — asset name for the parallax background
- `layer_count` (optional) — number of parallax depth layers; defaults to 4
- `viewport_width` (optional) — game viewport width in pixels; layers are created as multiples of this; defaults to 320
- `height` (optional) — layer height in pixels; defaults to 180
- `palette` (optional) — Lospec slug or palette file path

---

**`scaffold_props`**
Guide the LLM through creating environment props — objects that populate the game world: destructible objects (crates, pots with break animation), interactable objects (chests with open/close states, levers, doors), and decorative objects (flowers, signs, furniture with optional idle animation). Covers: state-based frame tags (`normal`, `activated`, `broken`, `open`, `closed`), hitbox/interaction-area shape layers, and consistent scale relative to a reference character.

Arguments:
- `name` (required) — asset name
- `prop_type` (optional) — `"destructible"`, `"interactable"`, `"decoration"`; informs default state tags and layer structure. Defaults to `"decoration"`.
- `reference_character` (optional) — registered character asset for scale reference
- `width` / `height` (optional) — canvas size; defaults to 16×16
- `palette` (optional) — Lospec slug or palette file path

---

#### Future Considerations (Tier 4)

The following features are documented for future implementation but are lower priority than the core tool enhancements above.

**`interpolate_frames` action on `asset` tool** — inserts N intermediate frames between two keyframes by interpolating pixel data.
Accepts `frame_start`, `frame_end`, `count` (number of intermediate frames to insert).
Interpolation method: per-pixel threshold blending — for each pixel, picks the source or destination palette index based on the interpolation position (produces a dissolve/crossfade effect appropriate for indexed color).
The `count` new frames are inserted at position `frame_start + 1`; `frame_end` and all later frames shift right by `count`.
All image layers are interpolated independently; non-image layers (shape, tilemap, group) are skipped (no cel created for those layers on the new frames).
If a source cel is a LinkedCel, it is resolved to its target's pixel data before interpolation; an error is returned if resolution fails.
Both source cels must be ImageCels (or LinkedCels pointing to ImageCels); mismatched cel types produce an error.
Interpolated frames inherit `duration_ms` from `frame_start`.
The entire operation (frame insertion + cel population) is atomic — a single Command for undo/redo.
Useful for roughing out smooth animation transitions that the LLM can then refine.

**`detect_jaggies` read-only action on `asset` tool** — analyzes a target cel for jaggy artifacts: staircase patterns on edges that should be smooth curves or diagonals. Reports pixel coordinates and suggested corrections (e.g., "add intermediate pixel at (x,y) with color between indices A and B"). Does not modify pixel data. Returns `{ clean: true }` or `{ jaggies: [{ x, y, severity, suggestion }] }`. Complements `detect_banding` for pixel art quality analysis.

**`scale2x` algorithm option on export** — adds a `scale_algorithm` parameter (enum: `nearest`, `scale2x`) to export actions that accept `scale_factor`. Scale2x is a pixel art-specific upscaling algorithm that smooths edges while preserving sharp details, producing cleaner results than nearest-neighbor at 2× magnification. Only valid when `scale_factor` is a power of 2 (2, 4, 8 — applied iteratively).

**Color cycling metadata** — adds an optional `color_cycling` array on the Asset type, where each entry defines a range of palette indices that cycle at a specified speed (`{ start_index, end_index, speed_ms, direction: "forward" | "reverse" | "ping_pong" }`).
A `set_color_cycling` action on the `palette` tool manages this metadata (palette-adjacent — it controls which palette indices animate at runtime).
Validation: `start_index < end_index`, both in 0–255, `speed_ms > 0`.
Color cycling is stored in the asset JSON and serialized/deserialized alongside other optional asset metadata (follows the `nine_slice` pattern: optional field on Asset interface, getter/setter with `markDirty()` on AssetClass, deep-copy restoration in `_restoreDataPatch()`).
A new `AssetMetadataCommand` captures the `color_cycling` array before/after for undo/redo (distinct from `PaletteCommand` which captures palette colors).
For Godot export, color cycling entries are emitted as a `metadata/color_cycling` section in the SpriteFrames `.tres` resource, readable at runtime via `get_meta("color_cycling")`.
Useful for retro water, fire, and rainbow effects without additional animation frames.

**`scaffold_bitmap_font` prompt** — guides creation of a bitmap font asset: fixed-width glyph grid, character mapping, kerning metadata. Paired with a `bitmap_font` export action that outputs a Godot `BitmapFont` `.tres` resource referencing the glyph atlas PNG.


### 2.5 MCP App

The MCP App is an interactive pixel art editor that renders **inline in the conversation** using the [MCP Apps extension](https://modelcontextprotocol.io/extensions/apps/overview). When `open_editor` is called (by the AI or user), the host (Claude web, Claude Desktop, VS Code Copilot, etc.) fetches the UI resource and renders it in a sandboxed iframe alongside the chat. The user can interact with the editor while the AI continues to make tool calls — both sides share the same MCP tool surface with no additional API or authentication.

#### How It Works

The MCP App extension adds two patterns on top of standard MCP:

1. **Tool with UI metadata** — `open_editor` declares `_meta: { ui: { resourceUri: "ui://pixel-editor/app.html" } }` in its registration. The host preloads the HTML resource before the tool is even called, enabling instant rendering.
2. **HTML resource** — `ui://pixel-editor/app.html` is a standard MCP resource that returns a self-contained HTML bundle (compiled by Vite with `vite-plugin-singlefile`). The host renders it in a sandboxed iframe.

Communication between the app and host is via `postMessage` (not direct network calls). The host proxies tool calls from the iframe to the MCP server over the existing stdio transport — no HTTP endpoint required.

```
User ←→ Claude (host)
              ├── stdio ←→ PixelMCPServer (all existing tools + open_editor)
              └── postMessage ←→ MCP App iframe
                                    └── calls tools through host proxy
```

#### New Server-Side Surface

Two new additions to the server, registered alongside the existing 10 tools:

**`open_editor` tool**

Opens the editor for a specific asset. Returns the full asset state (palette, layers, frames, tags, cels for frame 0) as JSON, and declares the UI resource URI in `_meta.ui`.

- `asset_name` (string, optional — defaults to first loaded asset)

The tool result JSON contains: `{ asset_name, width, height, palette, layers, frames, tags, cels }` — everything the UI needs to perform an initial render without any additional round trips.

**`get_asset_state` tool**

Fetches current asset state for a specific frame. Called by the UI after any edit (user-initiated or AI-initiated) to sync the canvas.

- `asset_name` (string)
- `frame_index` (integer, optional — defaults to 0)

Returns: `{ cels, frame_index }` (cel pixel data for that frame across all image layers).

**`ui://pixel-editor/app.html` resource**

Served by a resource handler that reads `dist/app/app.html` (the Vite-compiled UI bundle) and returns it with MIME type `text/html+mcp-app`. Registered via `registerAppResource` from `@modelcontextprotocol/ext-apps/server`.

#### UI Capabilities

The app is built with Preact (minimal bundle size) and communicates with the host via the `App` class from `@modelcontextprotocol/ext-apps`.

| Panel / Tool | Behavior |
|---|---|
| **Canvas** | Composited view of all visible image layers for the current frame. Indexed color → RGBA via palette. Checkerboard background for transparent (index 0) pixels. Zoom 1×–16× (nearest-neighbor, no smoothing). Pan via middle-click or space+drag. |
| **Pencil** | Click/drag to paint pixels with the active color. Strokes are committed as a single `draw write_pixels` call on mouse-up (one undo step per stroke). |
| **Eraser** | Same as pencil but paints with index 0 (transparent). |
| **Eyedropper** | Click a canvas pixel to set the active palette color. No server call. |
| **Fill** | Click → calls `draw fill` at that coordinate. |
| **Palette panel** | Color swatches for all palette entries. Click to set active color. Hover shows `[index] #hex`. |
| **Layer panel** | Layer list with visibility toggles. Click eye → calls `asset` tool to toggle `visible`. Click row → sets active layer for pencil/fill. |
| **Frame timeline** | Frame strip with current frame highlighted. Prev/Next buttons, frame counter "3 / 8 (120ms)". Tag spans shown as colored labels above strip. |
| **Play / Pause** | `requestAnimationFrame` loop advancing frames based on `duration_ms`. Loop toggle. |
| **Rect selection** | Drag to select a rectangle → calls `selection rect` to set the server-side mask. Marching ants overlay drawn on canvas. |
| **Select All / Clear** | Calls `selection all` / `selection clear`. |
| **"Reference in AI"** | Extracts a dominant-color histogram from the selected region using local canvas pixel data, then calls `app.sendContextUpdate({ type: "pixel_selection", asset, region: {x,y,w,h}, dominant_colors })` so the AI knows exactly what region the user is pointing at in subsequent messages. |
| **Undo / Redo** | Buttons call `workspace undo` / `workspace redo`, then `get_asset_state` to refresh. |
| **Auto-refresh** | `app.ontoolresult` fires whenever the AI calls a tool (draw, transform, etc.). On receipt, the UI calls `get_asset_state` to sync the canvas with AI-made changes. |

#### State Sync Model

The UI maintains a local copy of the asset state: `{ assetName, width, height, palette, layers, frames, tags, cels, activeLayerId, activeColorIndex, currentFrame, isPlaying, selection }`.

- **Initial state** — populated from `open_editor` tool result via `app.ontoolresult`.
- **User edits** — pencil strokes apply optimistically to local canvas; committed to server on mouse-up; UI then calls `get_asset_state` to confirm.
- **AI edits** — `app.ontoolresult` fires; UI calls `get_asset_state` to pull fresh state.
- **Frame navigation** — switching frames calls `get_asset_state` with the new `frame_index`.

This pull-on-demand model keeps state management simple at the cost of one round-trip per edit — acceptable for pixel art at typical sprite sizes (≤256×256 pixels).

#### Build Pipeline

The UI (`src/app/`) is compiled separately from the server (`src/`) using Vite with `vite-plugin-singlefile`, which inlines all CSS and JS into a single `dist/app/app.html` file. This self-contained HTML is what the resource handler serves.

```
npm run build:app   # Vite → dist/app/app.html (UI bundle)
npm run build       # tsc → dist/ (server)
npm run start       # node dist/index.js (stdio transport, default)
npm run start -- --http   # + Express on :3001 (for basic-host dev testing)
```

---

### 2.6 Custom Files

#### 1. The Root Project File (`pixelmcp.json`)

This file represents the Project configuration for your entire game or creative environment. It does not contain any actual pixel data. Instead, it acts like a "Solution" file in traditional IDEs, handling pathing, discovery, and configuration.

**Example structure:**
```json
{
  "pixelmcp_version": "1.0",
  "name": "my-game",
  "created": "2026-02-21T12:00:00Z",
  "conventions": {
    "export_pattern": "{name}_{tag}_{direction}.png"
  },
  "defaults": {
    "tile_width": 16,
    "tile_height": 16,
    "export_scale": 4,
    "palette": "endesga-32"
  },
  "assets": {
    "human_male_a": {
      "type": "character",
      "path": "assets/art/characters/base_bodies/human_male_a/human_male_a.json"
    },
    "iron_sword": {
      "type": "weapon",
      "variants": {
        "standard": "assets/art/equipment/weapons/one_handed_melee/iron_sword/standard/iron_sword.json",
        "slim":     "assets/art/equipment/weapons/one_handed_melee/iron_sword/slim/iron_sword.json"
      }
    },
    "fishing_village_ground": {
      "type": "tileset",
      "path": "assets/art/environments/tilesets/fishing_village/terrain/ground_base.json"
    },
    "corrupted_ground": {
      "type": "tileset",
      "path": "assets/art/environments/tilesets/fishing_village/terrain/corrupted_ground.json",
      "recolor_of": "fishing_village_ground"
    }
  }
}
```

**Key schema notes:**

- **No `paths` block.** Asset paths are explicit in the registry — there is no server-enforced directory structure. Projects organize their files however they want; the registry is the single source of truth for locating assets. `project init` creates only the `pixelmcp.json` itself.
- **Asset paths are relative to `pixelmcp.json`.** All registry paths are resolved relative to the location of `pixelmcp.json`. Since `pixelmcp.json` lives at the project root (not inside an `assets/` subdirectory), a path like `"assets/art/characters/..."` is relative to that root.
- **`conventions.export_pattern`** — template string controlling generated export filenames, primarily applied by the `export per_tag` action. Supported tokens:

  | Token | Source in data model | Example value |
  |---|---|---|
  | `{name}` | Asset's logical name in the registry | `iron_sword` |
  | `{variant}` | Variant key selected at load time (omitted if asset has no variants) | `slim` |
  | `{tag}` | Frame tag name — this IS the animation state; no separate `{state}` token is needed | `idle` |
  | `{direction}` | Frame tag's optional `facing` property (N, NE, E, SE, S, SW, W, NW); omitted if tag has no `facing` | `S` |
  | `{frame}` | Frame index; supports zero-pad width specifier | `{frame:03}` → `007` |

  Tokens with no value for a given tag are silently dropped along with their nearest adjacent separator character (`_`, `-`, `.`). For example, `{name}_{tag}_{direction}.png` applied to a tag with no `facing` produces `iron_sword_idle.png`, not `iron_sword_idle_.png`. Only include tokens relevant to your asset structure.
- **`defaults`** — applied when creating new assets without explicit overrides. `palette` may be a Lospec slug (`"endesga-32"`) or a relative path to a local palette `.json` file (e.g., `"palettes/fishing_village.json"`). Detection: if the value contains `/` or ends with `.json`, it is treated as a file path resolved relative to `pixelmcp.json`; otherwise it is treated as a Lospec slug fetched from the API.
- **`assets`** — the asset registry. Each entry maps a logical name to either a single `path` or a `variants` map of fit-category name → path. `type` is a free string — the server does not enforce an enum; use whatever classification fits the project (e.g., `character`, `weapon`, `armor`, `tileset`, `prop`, `effect`, `icon`, `ui_frame`, `cursor`, `hud`). **UI asset conventions:** use `icon` for individual icons or icon sets (export with `godot_atlas`), `ui_frame` for nine-slice panels and buttons (export with `godot_ui_frame`), `cursor` for mouse cursors, and `hud` for HUD elements. **Multi-state UI controls** (buttons with normal/hover/pressed/disabled states): use frame tags named `normal`, `hover`, `pressed`, `disabled` — the standard frame tag system handles state variants the same way it handles animation sequences. The `project add_file` action appends entries here. `workspace load_asset` resolves names through this registry; pass an optional `variant` parameter to select a specific fit (e.g., `"slim"`), otherwise the first defined variant is used.

  **`recolor_of` (string, optional)** — records that this asset is a palette-swap variant of another registered asset. Purely informational — the server does not enforce or resolve this field at runtime. The referenced asset does not need to be loaded or even exist. Automatically set by `asset create_recolor`; can also be added manually to any registry entry. Useful for LLM context (avoiding redundant pixel work on known recolors), batch operations (propagating structural changes across all recolors of a base), and human readability.

  **Equipment variant convention — fixed canvas, proportional fit categories:** Variant keys for equipment (weapons, armor) represent *proportional canvas categories*, not race names and not gender. The recommended proportional categories are:

  | Variant key | Who maps to it |
  |---|---|
  | `standard` | Most humanoid races — human, elf, half-elf, etc.; **both male and female** at typical pixel art scales |
  | `slim` | Genuinely narrower/shorter body canvases — halfling, gnome |
  | `large` | Broader/taller body canvases — half-orc, goliath, heavy builds |

  **Gender is not a fit category at pixel art scales.** At 16×24 or 32×48, anatomical differences between male and female humanoids are 1–2 pixels — imperceptible on most equipment. Gender is expressed through the **base body sprite, hairstyle layer, and clothing cut**, not through equipment fit variants. All bodies within a proportional category are drawn to identical canvas dimensions with shared anchor points (hand positions, feet center, eye line), so a single equipment sprite aligns correctly across both male and female characters of that fit.

  **Non-form-fitting vs. form-fitting split:**
  - **Non-form-fitting** (weapons, shields, capes, hats, boots, tools): one variant per proportional size category. These items composite over the body without conforming to it — gender is irrelevant.
  - **Form-fitting** (chest armor, dresses, fitted clothing): if the male/female silhouette difference is visible at your target resolution, add gendered sub-variants using the naming pattern `{fit}_{gender}` (e.g., `standard_m`, `standard_f`). At 16×24 where the difference is imperceptible, a single `standard` variant is usually sufficient.

  Game logic (not the server) selects which variant to load based on the character's proportional category and, where applicable, gender. Non-humanoid characters (slimes, dragons, eldritch horrors) do not use modular equipment — they have dedicated character assets with equipment baked into the relevant animation frames, registered separately in the asset registry.

  > **Canonical anchor points:** All base body variants within a proportional category must use the same canvas dimensions with identical key anchor points (hand positions, feet center, eye line). This is what allows a single non-form-fitting equipment sprite to align correctly across both male and female characters of the same fit. Canvas size is established by the base body asset at creation time, not enforced by the server.
- **Format:** Plain JSON, human-readable, and safe to version-control alongside game source. No pixel data is stored here — it is purely declarative configuration.

#### 2. Palette Files (`.json`)

Shared palette files allow multiple assets to reference a common color set. A palette file is a plain JSON file containing a `colors` array in the same format used by asset palettes — an ordered array of `[r, g, b, a]` tuples where the array index is the palette index.

**Example structure:**
```json
{
  "name": "fishing_village",
  "colors": [
    [0, 0, 0, 0],
    [20, 12, 28, 255],
    [68, 36, 52, 255],
    [48, 96, 130, 255],
    [91, 168, 140, 255],
    [246, 214, 189, 255]
  ]
}
```

- `name` (string) — palette identifier, used for display only.
- `colors` (array of [r, g, b, a]) — up to 256 entries. Index 0 is conventionally transparent. Sparse palettes may use `null` for undefined indices.

When `defaults.palette` references a palette file, `asset create` initializes new assets with that palette. The `palette load` action applies a palette file to any already-loaded asset. The `palette save` action writes an asset's current palette to a file for project-wide reuse. Use `palette fetch_lospec` followed by `palette save` to persist a Lospec palette locally.

#### 3. The Asset Files (`.json`)

Each Asset is stored as a self-contained JSON file. Pixel data uses the **row integer array** format: a 2D array where each inner array is one row of palette indices, top-to-bottom, left-to-right. This is directly indexable as `data[y][x]`, human-readable, and produces row-localized git diffs.

**Example structure:**
```json
{
  "pixelmcp_version": "1.0",
  "name": "player",
  "width": 16,
  "height": 16,
  "created": "2026-02-21T12:00:00Z",
  "modified": "2026-02-21T14:30:00Z",
  "perspective": "flat",
  "palette": [
    [0, 0, 0, 0],
    [45, 30, 20, 255],
    [120, 85, 60, 255],
    [200, 160, 120, 255]
  ],
  "layers": [
    { "id": 0, "name": "base", "type": "image", "visible": true, "opacity": 255 },
    { "id": 1, "name": "outline", "type": "image", "visible": true, "opacity": 255 },
    { "id": 2, "name": "hitbox", "type": "shape", "role": "hitbox", "physics_layer": 1, "visible": false, "opacity": 255 }
  ],
  "frames": [
    { "index": 0, "duration_ms": 100 },
    { "index": 1, "duration_ms": 100 }
  ],
  "cels": {
    "0/0": {
      "x": 0, "y": 0,
      "data": [
        [0,0,0,0,0,1,1,1,1,1,1,0,0,0,0,0],
        [0,0,0,0,1,2,2,2,2,2,2,1,0,0,0,0],
        [0,0,0,1,2,3,3,3,3,3,3,2,1,0,0,0]
      ]
    },
    "0/1": {
      "x": 0, "y": 0,
      "data": [
        [0,0,0,0,0,1,1,1,1,1,1,0,0,0,0,0],
        [0,0,0,0,1,2,2,2,2,2,2,1,0,0,0,0],
        [0,0,0,1,2,3,3,3,3,3,3,2,1,0,0,0]
      ]
    },
    "2/0": {
      "shapes": [
        { "name": "body", "type": "rect", "x": 4, "y": 2, "width": 8, "height": 12 },
        { "name": "head", "type": "rect", "x": 5, "y": 0, "width": 6, "height": 4 }
      ]
    },
    "2/1": { "link": "2/0" }
  },
  "tags": [
    { "name": "idle", "type": "frame", "start": 0, "end": 1, "direction": "ping_pong", "facing": "S" }
  ]
}
```

**Key schema notes:**

- **Palette** is an array of `[r, g, b, a]` tuples. Index 0 is conventionally transparent.
- **Cels** are keyed by `"{layer_id}/{frame_index}"`. Each cel has an origin offset (`x`, `y`) and a `data` row integer array. Cels may be smaller than the full asset dimensions (sparse — only the non-empty bounding rect is stored).
- **Linked cels** (duplicate frames) can reference another cel instead of duplicating data: `{ "link": "0/0" }` instead of `{ "data": [...] }`. Shape layer cels can also be linked: `{ "link": "2/0" }` means frame 1's hitbox is identical to frame 0's. `asset get_cel` transparently resolves links and always returns pixel data; the response includes `is_linked: true` and `link_source` metadata when resolution occurred. Writing to a linked cel (via `draw`, `transform`, `effect`) automatically breaks the link and allocates new pixel storage for that cel, leaving the source cel unchanged.
- **Tilemap layer cels** use a `grid` array instead of a pixel `data` array. The grid is a 2D integer array where each value is a tile slot index (or `-1` for empty). Grid dimensions are `ceil(asset_width / tile_width) × ceil(asset_height / tile_height)`. Example:
  ```json
  "1/0": {
    "grid": [
      [0, 1, 1, 0],
      [2, 3, 3, 2],
      [-1, 2, 2, -1]
    ]
  }
  ```
- **Shape layer cels** use a `shapes` array instead of a pixel `data` array. Each shape has `name`, `type` (`"rect"` or `"polygon"`), and geometry (`x`, `y`, `width`, `height` for rects; `points` array of `[x, y]` pairs for polygons). All coordinates are in asset-local pixels, relative to the cel origin.
- **Tileset assets** include a top-level `tile_count` (integer) tracking the number of occupied tile slots. The asset's canvas width equals `tile_count × tile_width`. Tile slot N occupies the pixel region at x-offset `N × tile_width`, y-offset `0`.
- **Tileset assets** may include a top-level `tile_physics` object storing per-tile collision and navigation polygon data. This is populated by the `tileset set_tile_physics` action and consumed by the `export godot_tileset` action. Example structure:
  ```json
  "tile_physics": {
    "physics_layers": [{ "collision_layer": 1, "collision_mask": 1 }],
    "tiles": {
      "0": { "polygon": [[0,0],[16,0],[16,16],[0,16]] },
      "5": { "polygon": [[0,8],[16,8],[16,16],[0,16]] }
    }
  }
  ```
- **Tileset assets** may also include a top-level `tile_terrain` object storing autotile terrain metadata. This is populated by the `tileset autotile_generate` action and consumed by the `export godot_tileset` action. Example structure:
  ```json
  "tile_terrain": {
    "pattern": "blob47",
    "terrain_name": "grass",
    "peering_bits": {
      "0":   { "top": -1, "top_right": -1, "right": -1, "bottom_right": -1, "bottom": -1, "bottom_left": -1, "left": -1, "top_left": -1 },
      "255": { "top":  0, "top_right":  0, "right":  0, "bottom_right":  0, "bottom":  0, "bottom_left":  0, "left":  0, "top_left":  0 },
      "85":  { "top":  0, "top_right": -1, "right":  0, "bottom_right": -1, "bottom":  0, "bottom_left": -1, "left":  0, "top_left": -1 }
    }
  }
  ```
  Keys in `peering_bits` are slot indices (as strings). Each entry maps the 8 neighbor directions to a terrain ID (`0`+) or `-1` (no connection). The direction names (`top`, `top_right`, etc.) correspond to Godot's `CellNeighbor` constants and are written directly into the `.tres` as `terrain_peering_bits/<neighbor_int>` values.
- **UI frame assets** may include a top-level `nine_slice` object defining nine-slice scaling margins. This is populated by the `asset set_nine_slice` action (or on `create`) and consumed by the `export godot_ui_frame` action. Example structure:
  ```json
  "nine_slice": { "top": 4, "right": 4, "bottom": 4, "left": 4 }
  ```
  Margins are in pixels relative to the asset's native resolution (before any `scale_factor` upscaling). All four values must be non-negative and `top + bottom` must be less than `height`, `left + right` less than `width`.
- **Tags** include both frame tags (animation sequences with `start`, `end`, `direction`, and optional `facing`) and layer tags (organizational groups with `layers` array of IDs). `facing` is only meaningful on frame tags for directional sprites and maps to the `{direction}` token in `export_pattern`.

**Why JSON for images?** Saving pixel art hierarchies this way (instead of as raw PNGs) is highly intentional for an AI agent. The JSON format is human-readable (allowing the LLM to inspect or debug specific layers/pixels), diff-friendly (working well with Git for game development workflows), and parsable (meaning generic tools can read the asset data without a specialized decoder). When actual images are needed for the game, the server runs an export pipeline to bake the JSON out into standard .png spritesheets or .gif animations.

#### Version Policy

The `pixelmcp_version` field in Asset and Project JSON files uses semantic versioning. Minor version increments when new optional fields are added (e.g., `tile_animation`, `tile_custom_data`). Major version increments when existing field semantics change. `fromJSON()` handles backward compatibility by defaulting missing optional fields — assets created with older versions load without migration.


### 2.7 Error Response Catalog

Domain errors are returned with `{ isError: true, content: [{ type: "text", text: "..." }] }`. The LLM should read the message and self-correct (e.g., call `workspace load_asset` before retrying a draw operation). Protocol-level errors (unknown tool name, schema validation failure) are handled automatically by the SDK and are not listed here.

| Tool | Condition | Message |
|---|---|---|
| project | any action, no project loaded | `"No project loaded. Call project init or project open first."` |
| project | `open` — file not found | `"Project file not found: {path}"` |
| workspace | `load_asset` — name not in registry | `"Asset '{name}' not found in project registry."` |
| workspace | `load_asset` — file missing on disk | `"Asset file not found: {path}"` |
| workspace | `unload_asset` / `save` — asset not loaded | `"Asset '{name}' is not loaded in the workspace."` |
| workspace | `unload_asset` — unsaved changes | Non-error warning in `content` text; unload proceeds after warning. |
| asset | any action, asset not loaded | `"Asset '{name}' is not loaded in the workspace."` |
| asset | `get_cel` / `get_cels` — target is a shape layer | `"Layer {id} is a shape layer. Use asset get_shapes to read shape data."` |
| asset | `get_cel` / `get_cels` — target is a tilemap layer | Not an error — returns the `grid` array (tile indices) instead of a pixel `data` array. |
| asset | `get_cel` / `detect_banding` — invalid `layer_id` | `"Layer {id} does not exist in asset '{name}'."` |
| asset | `get_cel` / `detect_banding` — `frame_index` out of range | `"Frame {index} is out of range. Asset '{name}' has {count} frame(s)."` |
| asset | `add_layer` — invalid `parent_layer_id` (not a group) | `"Layer {id} is not a group layer and cannot be a parent."` |
| asset | `generate_collision_polygon` — `layer_id` not an image layer | `"Layer {id} is not an image layer. Provide an image layer as the pixel source."` |
| asset | `generate_collision_polygon` — no shape layer found | `"No target shape layer specified and no hitbox shape layer found in asset '{name}'."` |
| asset | `add_shape` / `update_shape` — `layer_id` not a shape layer | `"Layer {id} is not a shape layer."` |
| asset | `create_recolor` — no palette source provided | `"At least one palette source (palette_file, palette_slug, or palette_entries) is required for create_recolor."` |
| asset | `set_nine_slice` — margins exceed dimensions | `"Nine-slice margins exceed asset dimensions (top + bottom must be < height, left + right must be < width)."` |
| asset | `link_cel` — source cel does not exist | `"Source cel at layer {id}/frame {index} does not exist in asset '{name}'."` |
| asset | `link_cel` — self-link (target == source) | `"Cannot link a cel to itself."` |
| asset | `link_cel` — layer type mismatch | `"Source layer {id} and target layer {id} must be the same type for link_cel."` |
| draw | any operation — `color` out of range | `"Color index {color} is out of range (0–255)."` |
| draw | `write_pixels` — data dimensions mismatch | `"write_pixels data dimensions ({dw}×{dh}) do not match declared width×height ({w}×{h})."` |
| draw | `color_replace` — `from_color` or `to_color` out of range | `"Color index {color} is out of range (0–255)."` |
| draw / transform / effect | `frame_range` — invalid range | `"frame_range [{start}, {end}] is invalid. Requires 0 ≤ start ≤ end < frame_count."` |
| draw / transform / effect | `frame_range` + `frame_index` both provided | `"frame_range and frame_index are mutually exclusive."` |
| effect | any operation — `color1` / `color2` out of range | `"Color index {color} is out of range (0–255)."` |
| palette | `set` / `swap` — index out of range | `"Palette index {index} is out of range (0–255)."` |
| palette | `generate_ramp` — endpoint index has no color defined | `"Palette index {index} has no color defined. Set it before generating a ramp."` |
| palette | `generate_ramp` — `color1` >= `color2` | `"generate_ramp requires color1 < color2."` |
| palette | `fetch_lospec` — slug not found or API unavailable | `"Lospec palette '{slug}' not found or API unavailable."` |
| palette | `load` — file not found | `"Palette file not found: {path}"` |
| palette | `load` — file is not valid palette JSON | `"Invalid palette file: {path}. Expected { name, colors } with colors as [[r,g,b,a], ...]."` |
| tileset | `autotile_generate` — asset is not a tileset | `"Asset '{name}' has no tile dimensions. Create the asset with tile_width/tile_height via asset create."` |
| tileset | `autotile_generate` — `pattern` missing | `"autotile_generate requires a pattern (blob47, 4side, or 4corner)."` |
| tileset | `set_tile_physics` — tile index not found | `"Tile index {index} does not exist in tileset '{name}'."` |
| tileset | `set_tile_animation` — `frame_count` < 1 | `"set_tile_animation requires frame_count ≥ 1."` |
| tileset | `set_tile_data` — missing data_layer_name or data_layer_type | `"set_tile_data requires data_layer_name and data_layer_type."` |
| tileset | `add_tile_alternative` — tile_index not found | `"Tile index {index} does not exist in tileset '{name}'."` |
| tileset | `clear_tile_animation` — tile_index not found | `"Tile index {index} does not exist in tileset '{name}'."` |
| tileset | `clear_tile_data` — tile_index not found | `"Tile index {index} does not exist in tileset '{name}'."` |
| tileset | `remove_tile_alternative` — alternative_id not found | `"Alternative {id} does not exist for tile {index} in tileset '{name}'."` |
| export | any action, asset not loaded | `"Asset '{name}' is not loaded in the workspace."` |
| export | any action — output path not writable | `"Cannot write to path: {path}"` |
| export | `godot_ui_frame` — no nine_slice set | `"Asset '{name}' has no nine_slice margins set. Call asset set_nine_slice first."` |
| export | `spritesheet_grid` — `columns` < 1 | `"spritesheet_grid requires columns ≥ 1."` |
| export | `spritesheet_per_layer` — no image layers | `"Asset '{name}' has no image layers to export."` |
| export | `spritesheet_per_layer` — specified layer not an image layer | `"Layer {id} is not an image layer."` |
| selection | `paste` — clipboard empty | `"Clipboard is empty. Copy or cut a selection first."` |
| selection | `paste` — `target_asset_name` not loaded | `"Target asset '{name}' is not loaded in the workspace."` |


