# Implementation Plan for PixelMCPServer

Reference: [design.md](design.md)

---

## Phase 0: Prep

- [x] **0.1** Initialize project structure
- [x] **0.2** Setup common workflows
- [x] **0.3** Setup testing and code quality tools
- [x] **0.4** Create core claude-code customizations (CLAUDE.md) — complete before Phase 1 so agents have correct context from the start. Should contain project architecture, file layout conventions, and testing commands.
- [x] **0.5** Develop design doc [design.md](design.md)
- [x] **0.6** Develop implementation plan doc [implementation-plan.md](implementation-plan.md)
- [x] **0.7** Implement shared error factory (`src/errors.ts`) — typed error constructors for every domain error in [design §2.6](design.md). Each tool handler imports these rather than constructing ad-hoc error strings. Build this early so all phases use consistent error responses.

---

## Phase 1: Core Data Model & Algorithms

Build the in-memory data model types and classes under `src/types/` and `src/classes/`, plus pure drawing algorithms under `src/algorithms/`. No MCP wiring yet — just pure TypeScript with unit tests. Everything in later phases depends on this.

### 1.1 Types & Interfaces

Define the core type hierarchy as described in [design §2.1](design.md) and [design §2.5](design.md).

- [x] **1.1.1** **Palette types** — `Palette` interface (array of up to 256 `[r, g, b, a]` entries), palette index type alias, color validation helpers
- [x] **1.1.2** **Layer types** — discriminated union: `ImageLayer | TilemapLayer | ShapeLayer | GroupLayer`. Each carries `id`, `name`, `type`, `visible`, `opacity`. Shape layers add `role`, `physics_layer`.
- [x] **1.1.3** **Frame & Cel types** — `Frame` interface (`index`, `duration_ms`). `Cel` as discriminated union: `ImageCel` (x, y, data as `number[][]`), `TilemapCel` (grid as `number[][]`), `ShapeCel` (shapes array), `LinkedCel` (link reference string). Cel key format: `"{layer_id}/{frame_index}"`.
- [x] **1.1.4** **Tag types** — discriminated union: `FrameTag` (name, start, end, direction, facing?) and `LayerTag` (name, layers). Direction enum: `forward | reverse | ping_pong`. Facing enum: `N | NE | E | SE | S | SW | W | NW`.
- [x] **1.1.5** **Shape types** — discriminated union: `RectShape` (name, x, y, width, height) and `PolygonShape` (name, points as `[number, number][]`).
- [x] **1.1.6** **Asset types** — `Asset` interface: name, width, height, `perspective` (free string: `"flat"`, `"top_down"`, `"top_down_3/4"`, `"isometric"`; defaults to `"flat"`), palette, layers, frames, cels (Map keyed by string), tags. Optional tileset fields: `tile_width`, `tile_height`, `tile_count`, `tile_physics`, `tile_terrain`.
- [x] **1.1.7** **Project types** — `ProjectConfig` interface matching `pixelmcp.json` schema: version, name, conventions (including `export_pattern`), defaults (including palette slug-vs-file-path detection), assets registry (each entry has `type` + either `path` or `variants` map + optional `recolor_of` string).
- [x] **1.1.8** **Selection types** — `SelectionMask` interface scoped to asset/layer/frame. Bitmask or coordinate-set representation. Separate from the MCP tool wiring (which comes in Phase 2).

### 1.2 Core Classes

Stateful classes that manage in-memory data and enforce invariants.

- [x] **1.2.1** **`Palette` class** — wraps the color array. Methods: `get(index)`, `set(index, rgba)`, `setBulk(entries)`, `swap(i, j)`, `toJSON()`, `fromJSON()`. Validates index bounds (0–255).
- [x] **1.2.2** **`Asset` class** — in-memory representation of a loaded asset. Methods for:
  - Layer CRUD: `addLayer()`, `addGroup()`, `removeLayer()`, `reorderLayer()` with group/parent logic
  - Frame CRUD: `addFrame()`, `removeFrame()`, `setFrameDuration()` with tag index shifting
  - Cel access: `getCel(layerId, frameIndex)` with linked cel resolution, `setCelData()` with link-break-on-write
  - Tag CRUD: `addTag()`, `removeTag()` with facing disambiguation
  - Shape CRUD: `addShape()`, `updateShape()`, `removeShape()`, `getShapes()`
  - Resize: `resize(width, height, anchor)` with anchor-relative repositioning
  - Perspective: store and validate `perspective` property
  - Serialization: `toJSON()`, `static fromJSON()`
  - Dirty tracking: `isDirty` flag set on any mutation, cleared on save
- [x] **1.2.3** **`Project` class** — manages `pixelmcp.json`. Methods: `init(path)`, `open(path)`, `info()`, `registerAsset(name, type, path)`, `resolveAssetPath(name, variant?)` with variant resolution logic, `toJSON()`, `save()`. Path resolution relative to project root. Defaults application logic: detect palette as Lospec slug vs. file path (contains `/` or ends with `.json` → file path, otherwise Lospec slug).
- [x] **1.2.4** **`Workspace` class** — the in-memory editing session (singleton per server). Holds:
  - `project: Project | null`
  - `loadedAssets: Map<string, Asset>`
  - `undoStack` / `redoStack` (Command history)
  - `clipboard` / `selection: SelectionMask | null` state
  - Methods: `loadAsset(name, variant?)`, `unloadAsset(name)`, `save(name)`, `saveAll()`, `undo()`, `redo()`, `info()`

### 1.3 Command System (Undo/Redo)

- [x] **1.3.1** **`Command` interface** — `execute(): void`, `undo(): void`. Immutable snapshot of the before-state captured at creation time.
- [x] **1.3.2** **`CommandHistory` class** — push/undo/redo stack management. `push(cmd)` clears the redo stack. Max history depth (configurable, default 100). Wire into `Workspace` to replace the placeholder `_undoStack`/`_redoStack` arrays and make `undo()`/`redo()` functional.
- [x] **1.3.3** **Concrete command classes** for each mutation category. Each captures the before-state snapshot on construction and restores it on `undo()`. Tool actions that use each command are listed for cross-reference:
  - `PaletteCommand` — captures palette entry before-state. Used by: `palette set`, `palette set_bulk`, `palette swap`, `palette load`, `palette fetch_lospec`, `palette generate_ramp`.
  - `CelWriteCommand` — captures full cel data snapshot before mutation. Used by: `draw` (all operations), `transform` (all operations), `effect` (all operations), `selection paste`, `selection cut`. Handles linked cel break on first write.
  - `LayerCommand` — captures layer list state for add/remove/reorder. Used by: `asset add_layer`, `asset add_group`, `asset remove_layer`, `asset reorder_layer`.
  - `FrameCommand` — captures frame list + affected cels + tag shifts. Used by: `asset add_frame`, `asset remove_frame`, `asset set_frame_duration`.
  - `TagCommand` — captures tag list before-state. Used by: `asset add_tag`, `asset remove_tag`.
  - `ShapeCommand` — captures shapes array before-state. Used by: `asset add_shape`, `asset update_shape`, `asset remove_shape`, `asset generate_collision_polygon`.
  - `ResizeCommand` — captures all cel data + dimensions before-state. Used by: `asset resize`.
  - `AssetDeleteCommand` — captures registry entry (file deletion is not reversible via undo). Used by: `asset delete`.
  - `RenameCommand` — captures old name, registry key, and filename. Used by: `asset rename`.

### 1.4 File I/O

Files under `src/io/`. Models have `toJSON()`/`fromJSON()` for serialization; this layer handles the actual `fs` read/write and schema validation.

- [x] **1.4.1** **Asset serialization** — `loadAssetFile(path): Asset` reads and validates `.json` asset files using `AssetClass.fromJSON()`. `saveAssetFile(path, asset)` writes them using `asset.toJSON()`. Must handle all cel formats (image, tilemap, shape, linked). Sets `modified` timestamp on save.
- [x] **1.4.2** **Project serialization** — `loadProjectFile(path): ProjectConfig` reads and validates `pixelmcp.json` using `ProjectClass.fromJSON()`. `saveProjectFile(path, project)` writes using `project.toJSON()`. Wire into `Workspace.loadAsset()` and `Workspace.save()` to replace any placeholder file I/O.
- [x] **1.4.3** **Palette file I/O** — `loadPaletteFile(path): PaletteData` and `savePaletteFile(path, palette, name)`. Validates `{ name, colors }` schema where colors is `Array<[r,g,b,a] | null>`. Returns validation errors for malformed files using the shared error factory.

### 1.5 Drawing & Geometry Algorithms

Pure functions under `src/algorithms/`, unit tested independently of the model.

- [x] **1.5.1** **Bresenham's line** — for `draw line`
- [x] **1.5.2** **Midpoint circle / ellipse** — for `draw circle`, `draw ellipse`
- [x] **1.5.3** **Flood fill** (scanline variant) — for `draw fill`
- [x] **1.5.4** **Marching squares contour trace** — for `generate_collision_polygon`
- [x] **1.5.5** **Ramer-Douglas-Peucker simplification** — for `generate_collision_polygon`
- [x] **1.5.6** **Color quantization** (median cut or octree) — for `project add_file` PNG import
- [x] **1.5.7** **Banding detection** — monotonic staircase scan for `detect_banding`
- [x] **1.5.8** **Export pattern token substitution** — parse `{name}`, `{tag}`, `{direction}`, `{variant}`, `{frame}` tokens with separator-dropping logic for empty token values
- [x] **1.5.9** **Bin-packing algorithm** — rectangle packing for `export atlas` (e.g., shelf or maxrects algorithm)
- [x] **1.5.10** **Image compositing** — flatten visible layers into an RGBA output buffer. Algorithm: iterate layers bottom-to-top, skip non-visible layers; for each visible layer, resolve linked cels, convert palette indices to RGBA via the asset's palette, then alpha-over composite onto the output buffer respecting the layer's `opacity` (0–255). Group layers affect their children's visibility but produce no pixels themselves. Output is a flat `Uint8Array` of `width × height × 4` (RGBA). Prerequisite for all export actions and MCP Resources.

### 1.6 Phase 1 Testing

- [x] **1.6.1** **Palette unit tests** — get/set bounds, `setBulk` overwrites, `swap` correctness, `toJSON()`/`fromJSON()` roundtrip (`src/classes/palette.test.ts`)
- [x] **1.6.2** **Asset unit tests** — layer CRUD (including group nesting, reorder across groups), frame CRUD with tag index shifting, linked cel resolution chains, link-break-on-write, resize with all 9 anchor positions, `toJSON()`/`fromJSON()` roundtrip fidelity (`src/classes/asset.test.ts`)
- [x] **1.6.3** **Project unit tests** — `init` creates valid config, `resolveAssetPath` variant resolution, defaults palette slug-vs-path detection (`src/classes/project.test.ts`)
- [x] **1.6.4** **Workspace unit tests** — load/unload lifecycle, dirty flag tracking, save clears dirty (`src/classes/workspace.test.ts`)
- [x] **1.6.5** **Command system unit tests** — execute→undo→verify state restored, execute→undo→redo→verify matches, history depth limit enforcement, `push` clears redo stack. Test each concrete command class individually.
- [x] **1.6.6** **File I/O roundtrip tests** — load known-good fixture JSON → verify parsed Asset, save→reload→verify roundtrip for assets, projects, and palettes. Create fixture files under `src/io/__fixtures__/`.
- [x] **1.6.7** **Drawing algorithm tests** — Bresenham known pixel coords for various slopes (horizontal, vertical, diagonal, steep), midpoint circle pixel coords at various radii, midpoint ellipse pixel coords, flood fill on bordered regions and edge-touching fills
- [x] **1.6.8** **Geometry algorithm tests** — marching squares contour on known silhouettes (rectangle, circle, L-shape), RDP simplification at various epsilon values, iso projection formula verification
- [x] **1.6.9** **Processing algorithm tests** — color quantization output ≤ 256 entries with round-trip fidelity, banding detection on synthetic staircase patterns (positive and negative cases)
- [x] **1.6.10** **Utility algorithm tests** — export pattern token substitution with and without empty tokens and separator-dropping, bin-packing correctness (no overlap, bounds fit), image compositing (opacity blending, layer visibility, linked cel resolution, group layer nesting)

> **Definition of Done — Phase 1:** All types compile, all classes have comprehensive unit tests covering happy paths and edge cases, fixture roundtrip tests pass, all algorithm tests pass.

---

## Phase 2: Basic MCP Tools

Wire the core model to MCP tool handlers. Each tool is one file under `src/tools/` exporting a `register*Tool(server)` function. Broken into sub-phases to establish a usable creative loop early.

### 2.1 External Dependencies

- [x] **2.1.1** **PNG read/write library** — needed for `project add_file` (import PNG), all `export` actions, and MCP Resources. Use `pngjs` (pure JS, no native deps — appropriate for an MCP server).
- [x] **2.1.2** **GIF encoding library** — needed for `export gif` and animation preview resources. Use `gifenc` (small, no native deps).
- [x] **2.1.3** **HTTP client** — for `palette fetch_lospec`. Use Node built-in `fetch` (available since Node 18).

### 2.2 Server Bootstrap

- [x] **2.2.1** **Refactor `src/index.ts`** — import and call tool registration functions. Remove the `get_status` stub. Keep the file thin.
- [x] **2.2.2** **Shared workspace singleton** — `getWorkspace()` accessor already implemented in `src/classes/workspace.ts`. Tool handlers import from there.

### 2.3 Minimum Viable Loop Tools

Focus on the minimum creative loop: create project → create asset → set palette → draw pixels → read back → save.

#### 2.3.1 `project` Tool (Core Actions)

- [x] **2.3.1.1** **Zod schema** — discriminated union on `action: 'init' | 'open' | 'info'` (defer `add_file` to [§2.5.5](#255-project-add_file))
- [x] **2.3.1.2** **`init` action** — create `pixelmcp.json` at path, set as active project
- [x] **2.3.1.3** **`open` action** — read existing `pixelmcp.json`, validate, set as active project
- [x] **2.3.1.4** **`info` action** — return project config (name, conventions, defaults, asset registry)
- [x] **2.3.1.5** **Domain error responses** — implement errors from [design §2.6](design.md) for this tool using shared error factory

#### 2.3.2 `workspace` Tool

- [x] **2.3.2.1** **Zod schema** — discriminated union on `action`
- [x] **2.3.2.2** **`info` action** — return loaded assets, undo/redo depth, selection summary
- [x] **2.3.2.3** **`load_asset` / `unload_asset`** — load from registry path, variant resolution (pass optional `variant` parameter), unsaved-changes warning on unload
- [x] **2.3.2.4** **`save` / `save_all`** — persist to disk, clear dirty flags
- [x] **2.3.2.5** **`undo` / `redo`** — delegate to `CommandHistory` (requires [§1.3](#13-command-system-undoredo) to be complete)
- [x] **2.3.2.6** **Domain error responses** — "not in registry", "file not found", "not loaded" errors

#### 2.3.3 `palette` Tool (Core Actions)

- [x] **2.3.3.1** **Zod schema** — discriminated union on `action`
- [x] **2.3.3.2** **`info`** — return full palette with usage counts (scan all cels)
- [x] **2.3.3.3** **`set` / `set_bulk` / `swap`** — palette mutations wrapped in Commands
- [x] **2.3.3.4** **Domain error responses** — index out of range errors

#### 2.3.4 `asset` Tool (Read-Only + Create + Structure)

- [x] **2.3.4.1** **Zod schema** — discriminated union on all 24 actions (including `create_recolor`)
- [x] **2.3.4.2** **Read-only actions**: `info`, `get_cel` (with linked cel resolution + `is_linked`/`link_source` metadata), `get_cels` (explicit list + range modes), `get_shapes`
- [x] **2.3.4.3** **`create`** — create new Asset with optional `palette`, `layers`, `frames`, `tags` scaffold. Apply `defaults.palette` from project config (Lospec slug vs. file path detection). Store `perspective` property.
- [x] **2.3.4.4** **Layer management**: `add_layer` (image, tilemap, shape types), `add_group`, `remove_layer`, `reorder_layer` (with parent reparenting)
- [x] **2.3.4.5** **Frame management**: `add_frame`, `remove_frame`, `set_frame_duration` (with tag index cascading on add/remove)
- [x] **2.3.4.6** **Tag management**: `add_tag`, `remove_tag` (with `tag_facing` disambiguation)
- [x] **2.3.4.7** **Asset lifecycle**: `rename` (updates asset internal name, renames registry key preserving metadata, renames `.json` file on disk, updates workspace mapping — wrapped in `RenameCommand`), `duplicate`, `delete` (with optional `delete_file`), `create_recolor` (clone + palette replacement with layered sources: file → slug → entries; sets `recolor_of` in registry)
- [x] **2.3.4.8** **`resize`** — with all 9 anchor positions, cel origin adjustment
- [x] **2.3.4.9** **Domain error responses** — "not loaded", "layer not found", "frame out of range", "not a group", "not a shape layer" errors

#### 2.3.5 `draw` Tool (Core Primitives)

- [x] **2.3.5.1** **Zod schema** — top-level targeting + operations array
- [x] **2.3.5.2** **Drawing primitives**: `pixel`, `line` (Bresenham), `rect`, `circle` (midpoint), `ellipse` (midpoint), `fill` (flood fill)
- [x] **2.3.5.3** **`write_pixels`** — bulk pixel data write with dimension validation
- [x] **2.3.5.4** **Batched command wrapping** — single Command for entire operations array, linked cel break on first op
- [x] **2.3.5.5** **Domain error responses** — color out of range, data dimension mismatch

#### 2.3.6 Minimum Viable Loop Testing

- [x] **2.3.6.1** **Tool schema validation tests** — each tool rejects malformed input
- [x] **2.3.6.2** **Tool action dispatch tests** — each action returns expected result shape
- [x] **2.3.6.3** **Integration test: minimum viable loop** — `project init` → `asset create` (with palette, layers, frames) → `palette set_bulk` → `draw` (rect + fill + write_pixels) → `asset get_cel` (verify pixel data) → `workspace save` → `workspace unload_asset` → `workspace load_asset` → `asset get_cel` (verify persistence)
- [x] **2.3.6.4** **Undo/redo integration test** — draw → undo → get_cel (verify reverted) → redo → get_cel (verify re-applied)

> 🎯 **Milestone — Minimum Viable Loop:** Can create project → create asset → set palette → draw → read back → save → reload and verify.

### 2.4 Selection Tool

Implement after draw so clipboard operations (paste) can reuse the draw/write pattern.

- [x] **2.4.1** **Zod schema** — discriminated union on `action`
- [x] **2.4.2** **Mask operations**: `rect`, `all`, `clear`, `invert`, `by_color` — operate on the `SelectionMask` in Workspace
- [x] **2.4.3** **Clipboard operations**: `copy`, `cut`, `paste` — with cross-asset support, offset positioning
- [x] **2.4.4** **Domain error responses** — "clipboard empty", "target not loaded"
- [x] **2.4.5** **Selection tests** — mask operations, clipboard roundtrip, cross-asset paste

### 2.5 Complete Basic Tools

Remaining actions that have additional dependencies or are non-essential for the minimum loop.

#### 2.5.1 `draw` — Selection Mask Support

- [x] **2.5.1.1** **Retrofit selection masking into draw** — skip pixels outside active selection for all primitives and `write_pixels`
- [x] **2.5.1.2** **Selection mask tests for draw** — draw with active selection, verify only selected pixels modified

#### 2.5.2 `palette` — Remaining Actions

- [x] **2.5.2.1** **`load` / `save`** — palette file I/O (relative path resolution to `pixelmcp.json`). Note: `load` is wrapped in a Command (palette mutation); `save` is NOT wrapped in a Command (file I/O only, per design spec).
- [x] **2.5.2.2** **`fetch_lospec`** — HTTP fetch from Lospec API, apply to palette (depends on [§2.1.3](#213-http-client))
- [x] **2.5.2.3** **`generate_ramp`** — interpolate between two existing palette entries, validate endpoints exist, require `color1 < color2`
- [x] **2.5.2.4** **Palette remaining action tests** — load/save roundtrip, generate_ramp output verification, fetch_lospec error handling

#### 2.5.3 `asset` — Remaining Actions

- [x] **2.5.3.1** **Shape management**: `add_shape`, `update_shape`, `remove_shape`
- [x] **2.5.3.2** **`detect_banding`** — read-only analysis using banding detection algorithm ([§1.5.7](#157-banding-detection))
- [x] **2.5.3.3** **`generate_collision_polygon`** — marching squares + RDP using algorithms from [§1.5.4](#154-marching-squares-contour-trace) and [§1.5.5](#155-ramer-douglas-peucker-simplification). Validate source is image layer, target is shape layer.
- [x] **2.5.3.4** **Asset remaining action tests** — shape CRUD, banding detection on known patterns, collision polygon generation from test silhouettes

#### 2.5.4 `draw` — Isometric Operations

- [x] **2.5.4.1** **Iso projection helpers** — `isoToPixel(col, row, elevation, tileW, tileH)` using dimetric 2:1 formula from [design §2.2.4](design.md). Add to `src/algorithms/`.
- [x] **2.5.4.2** **`iso_tile`** — fill flat rhombus at grid position
- [x] **2.5.4.3** **`iso_cube`** — three-face cube with top/left/right colors
- [x] **2.5.4.4** **`iso_wall`** — wall segment along x or y axis
- [x] **2.5.4.5** **Isometric tests** — projection formula verification, iso_tile pixel output, selection mask in pixel space

#### 2.5.5 `project` — `add_file` Action

- [x] **2.5.5.1** **`add_file` action** — read PNG at `import_path` (depends on [§2.1.1](#211-png-readwrite-library)), quantize to indexed palette (depends on [§1.5.6](#156-color-quantization)), create asset JSON, register in project. Not wrapped in Command.
- [x] **2.5.5.2** **Add Zod schema branch** for `add_file` to the existing project tool schema
- [x] **2.5.5.3** **`add_file` tests** — import a test PNG, verify palette ≤ 256 entries, verify pixel data matches source, verify registry entry created

> **Definition of Done — Phase 2:** All 6 basic tools (project, workspace, asset, palette, draw, selection) are wired and functional. Schema validation tests pass for every tool. The minimum viable loop integration test passes. Undo/redo works across all mutation tools.

---

## Phase 3: Advanced Tools

Build on the foundation from Phase 2. These tools complete the design spec's full creative surface. Each sub-phase begins with its prerequisite pure algorithms (under `src/algorithms/`), followed by the tool handler wiring and tests.

### 3.1 `transform` Tool

#### 3.1.0 Transform Algorithms

Pure functions under `src/algorithms/transform.ts`, unit tested independently.

- [x] **3.1.0.1** **`rotate90` / `rotate180` / `rotate270`** — lossless index rotation of 2D palette-index array. `rotate90` maps `(x, y)` → `(height - 1 - y, x)`. Returns a new array with swapped dimensions for 90°/270°.
- [x] **3.1.0.2** **`flipHorizontal` / `flipVertical`** — in-place or copy reversal of rows (flip_h) or columns (flip_v) in a 2D array.
- [x] **3.1.0.3** **`shear`** — pixel offset shear by `amount_x` and/or `amount_y`. Shifts each row (for x-shear) or column (for y-shear) by a proportional integer offset. Out-of-bounds pixels are filled with index 0.
- [x] **3.1.0.4** **`shift`** — translation by `amount_x`, `amount_y` pixel offset. Wraps or fills with index 0 at edges.
- [x] **3.1.0.5** **Transform algorithm tests** — verify pixel output for each operation: rotate at all 3 angles, flip symmetry, shear offset correctness, shift wrap/fill behavior.

#### 3.1.1 Tool Handler

- [x] **3.1.1.1** **Zod schema** — top-level targeting (`asset_name`, `layer_id`, `frame_index`) + `operations` array. Discriminated union on `action`: `rotate` (`angle`: 90 | 180 | 270), `flip_h`, `flip_v`, `shear` (`amount_x?`, `amount_y?`), `shift` (`amount_x?`, `amount_y?`).
- [x] **3.1.1.2** **`rotate`** — delegate to `rotate90`/`rotate180`/`rotate270` from algorithm. Validate angle is 90/180/270.
- [x] **3.1.1.3** **`flip_h` / `flip_v`** — delegate to algorithm functions.
- [x] **3.1.1.4** **`shear`** — delegate to algorithm. At least one of `amount_x` or `amount_y` required.
- [x] **3.1.1.5** **`shift`** — delegate to algorithm. At least one of `amount_x` or `amount_y` required.
- [x] **3.1.1.6** **Selection mask + batched command** — same pattern as draw: all operations in one call share a single `CelWriteCommand`. When a selection mask is active, only the selected region is affected (copy selected region → transform → write back).
- [x] **3.1.1.7** **Transform tool tests** — tool-level tests: schema validation, each operation returns expected result shape, selection-masked transform, batched command undo/redo.

### 3.2 `effect` Tool

#### 3.2.0 Effect Algorithms

Pure functions under `src/algorithms/`, unit tested independently. Each file handles one category.

- [x] **3.2.0.1** **`gradient.ts`** — `linearGradient(width, height, color1, color2, direction)` where `direction` is `vertical` | `horizontal` | `diagonal_down` | `diagonal_up`. Returns a 2D palette-index array. Interpolation distributes the two colors across the axis using a dither threshold (not true-color blending — this is indexed color).
- [x] **3.2.0.2** **`dither.ts`** — four functions: `checkerboard(w, h, color1, color2)`, `noise(w, h, color1, color2)`, `orderedDither(w, h, color1, color2)` (4×4 Bayer matrix), `errorDiffusion(w, h, color1, color2)` (Floyd-Steinberg). All return 2D palette-index arrays. Region parameters (`x`, `y`, `width`, `height`) default to full cel when omitted.
- [x] **3.2.0.3** **`outline.ts`** — `generateOutline(data, color)` scans for non-transparent pixels and writes `color` to adjacent transparent pixels (4-connected or 8-connected). Does not expand canvas — only fills within bounds.
- [x] **3.2.0.4** **`auto-aa.ts`** — `autoAntiAlias(data, palette)` detects convex corners on color boundaries. For each convex corner pixel, finds the nearest existing palette entry whose luminance falls between the two boundary colors and places it. Does not modify concave regions or straight edges.
- [x] **3.2.0.5** **`motion.ts`** — `subpixelShift(data, intensity, dirX, dirY)` shifts pixel data by a sub-pixel amount along a normalized direction vector for animation smoothing. `smearFrame(data, intensity, dirX, dirY)` applies directional motion blur by sampling along the direction vector. `intensity` is 0.0–1.0. Direction vector is normalized internally.
- [x] **3.2.0.6** **`cleanupOrphans`** — can live in `outline.ts` or standalone. Removes isolated single pixels (pixels with no same-color neighbors in 4-connected adjacency). Returns modified 2D array.
- [x] **3.2.0.7** **Effect algorithm tests** — gradient direction correctness, checkerboard pattern verification, ordered dither Bayer matrix validation, noise statistical distribution, error diffusion error propagation, outline adjacency, auto_aa convex corner detection, motion blur directionality, orphan detection.

#### 3.2.1 Tool Handler

- [x] **3.2.1.1** **Zod schema** — top-level targeting + `operations` array. Discriminated union on `action` for all 10 operations. Region parameters (`x`, `y`, `width`, `height`) optional on gradient/dither ops, default to full cel. `color1`/`color2` are palette indices 0–255. `direction` enum for gradient. `intensity` float 0.0–1.0 and `direction_x`/`direction_y` floats for motion ops.
- [x] **3.2.1.2** **Gradient effects**: `gradient`, `checkerboard`, `noise`, `ordered_dither`, `error_diffusion` — delegate to `gradient.ts` and `dither.ts`. Apply within optional region bounds.
- [x] **3.2.1.3** **Pixel art refinement**: `auto_aa`, `outline`, `cleanup_orphans` — delegate to `auto-aa.ts` and `outline.ts`.
- [x] **3.2.1.4** **Animation effects**: `subpixel_shift`, `smear_frame` — delegate to `motion.ts`.
- [x] **3.2.1.5** **Selection mask + batched command** — same pattern as draw.
- [x] **3.2.1.6** **Effect tool tests** — tool-level tests: schema validation, each effect returns expected result shape, region-constrained effects, selection-masked effects, batched command undo/redo.

### 3.3 `tileset` Tool

#### 3.3.0 Autotile Algorithm

Pure functions under `src/algorithms/autotile.ts`, unit tested independently.

- [x] **3.3.0.1** **Canonical slot computation** — `getCanonicalSlots(pattern)` returns the list of valid bitmask slot indices for `blob47` (47 slots), `4side` (16 slots, bits N+E+S+W), or `4corner` (16 slots, bits NE+SE+SW+NW). For `blob47`, a slot is canonical iff every set corner bit has both orthogonal neighbors set (NE requires N+E, SE requires E+S, SW requires S+W, NW requires N+W).
- [x] **3.3.0.2** **Godot peering bit assignment** — `assignPeeringBits(slotIndex, pattern)` maps a bitmask slot index to a Godot `CellNeighbor` peering bits object (`{ top, top_right, right, bottom_right, bottom, bottom_left, left, top_left }` with values `0` for connected or `-1` for not connected). Direction mapping: bit 0 (N) → `top`, bit 1 (NE) → `top_right`, bit 2 (E) → `right`, etc.
- [x] **3.3.0.3** **Autotile algorithm tests** — blob47 produces exactly 47 canonical slots, 4side produces 16, 4corner produces 16. Known slot indices verified (e.g., blob47: 0, 1, 4, 5, 7, 16, 17, 20, 21, 23, …, 255). Peering bit output verified for isolated tile (slot 0), interior tile (slot 255), and orthogonal interior (slot 85).

#### 3.3.1 Tool Handler

- [x] **3.3.1.1** **Zod schema** — discriminated union on `action`: `extract_tile`, `place_tile`, `autotile_generate`, `set_tile_physics`. Parameters per [design §2.2.6](design.md).
- [x] **3.3.1.2** **`extract_tile`** — copy `tile_width × tile_height` pixel region from source position (`x`, `y`) on target layer/frame, append as next tile slot. Extend canvas width by `tile_width`, increment `tile_count`. Return new slot index. Wrapped in Command.
- [x] **3.3.1.3** **`place_tile`** — stamp tile slot pixels onto target layer at (`x`, `y`) for image layers, or write tile index into grid cell for tilemap layers. When asset `perspective` is `"isometric"`, accept `col`/`row` instead of `x`/`y` and project via dimetric formula.
- [x] **3.3.1.4** **`autotile_generate`** — delegate to autotile algorithm. When `terrain_name` is provided: compute peering bits for all occupied canonical slots, store in `tile_terrain`, report assigned + missing. When `terrain_name` is omitted: query-only mode, return expected + occupied + missing slot lists. Wrapped in Command.
- [x] **3.3.1.5** **`set_tile_physics`** — store `physics_polygon` and/or `navigation_polygon` for `tile_index` in `tile_physics`. Pass empty array to clear. Wrapped in Command.
- [x] **3.3.1.6** **Tileset tool tests** — extract_tile canvas extension + slot index, place_tile pixel verification (both image and tilemap layers), place_tile isometric projection, autotile query-only vs assign modes, autotile missing slot reporting, set_tile_physics storage + clear, Command undo/redo for each action.

### 3.4 `export` Tool

#### 3.4.0 Export Prerequisites

Shared utilities needed by multiple export actions.

- [x] **3.4.0.1** **Nearest-neighbor upscale** — `upscale(buffer: Uint8Array, width, height, scaleFactor): Uint8Array` multiplies each pixel into an N×N block in the output RGBA buffer. Used by all export actions that accept `scale_factor`. Can live in `src/algorithms/composite.ts` or a new `src/algorithms/upscale.ts`.
- [x] **3.4.0.2** **Godot `.png.import` sidecar template** — shared function `generateGodotImportSidecar(pngPath, resourceType?)` that writes the standard Godot 4.x import file: `[remap]` section with `type="CompressedTexture2D"`, `[deps]` with `source_file`, `dest_files`, and `[params]` with `compress/mode=0` (lossless), `mipmaps/generate=false`, `roughness/mode=0`. Reused by `godot_spriteframes` (3.4.3), `godot_tileset` (3.4.4), and `godot_static` (3.4.5).
- [x] **3.4.0.3** **Export prerequisite tests** — upscale correctness at 1×/2×/4× factors, sidecar file content validation against expected Godot format.

#### 3.4.1 Tool Handler — Core Exports

- [x] **3.4.1.1** **Zod schema** — discriminated union on `action`: `png`, `gif`, `spritesheet_strip`, `atlas`, `per_tag`, `godot_spriteframes`, `godot_tileset`, `godot_static`. Parameters: `asset_name`, `path` (required), `scale_factor` (optional int, default 1), `pad`/`extrude` (optional bools for atlas), `tags` (optional string array for per_tag).
- [x] **3.4.1.2** **Image compositing integration** — wire `compositeFrame()` from `src/algorithms/composite.ts` into the export pipeline. Each export action calls `compositeFrame(asset, frameIndex)` → receives `Uint8Array` RGBA buffer → optionally upscales → encodes to target format.
- [x] **3.4.1.3** **`png`** — composite frame 0 (or specified frame), upscale by `scale_factor`, encode via `pngjs`, write to `path`.
- [x] **3.4.1.4** **`gif`** — composite each frame, upscale, encode via `gifenc` with per-frame `duration_ms` delays. Write to `path`.
- [x] **3.4.1.5** **`spritesheet_strip`** — composite all frames, lay out horizontally in a single row, upscale, encode as PNG. Output dimensions: `(width × frame_count × scale) × (height × scale)`.
- [x] **3.4.1.6** **`atlas`** — bin-pack all loaded assets (frame 0 each) using `bin-pack.ts`. Optional `pad` (1px transparent gap) and `extrude` (repeat edge pixels). Upscale, encode as PNG. Return atlas metadata (asset → region mapping).
- [x] **3.4.1.7** **`per_tag`** — iterate frame tags (or `tags` subset), apply `export-pattern.ts` token substitution with each tag's name/facing/frame data, export each as a strip PNG to `path` directory. Return list of generated file paths.

#### 3.4.2 Tool Handler — Godot Exports

- [x] **3.4.2.1** **`godot_spriteframes` — strip PNG** — composite all frames into horizontal strip, upscale by `scale_factor`, write `{name}_strip.png`.
- [x] **3.4.2.2** **`godot_spriteframes` — import sidecar** — generate `{name}_strip.png.import` using shared sidecar template ([§3.4.0.2](#3402-godot-pngimport-sidecar-template)).
- [x] **3.4.2.3** **`godot_spriteframes` — `.tres` SpriteFrames resource** — generate Godot 4.x text resource. Each frame tag → named animation. Frame regions as `AtlasTexture` sub-resources into the strip. FPS via GCD method: `GCD(all_durations)` → `animation_fps = 1000 / GCD` → `relative_duration = frame_ms / GCD`. Ping-pong tags expanded: `[A, B, C]` → `[A, B, C, B]` (reverse excluding final frame to avoid double-display).
- [x] **3.4.2.4** **`godot_spriteframes` — optional shapes export** — if asset has shape layers, export `{name}_shapes.tres` as a Godot `Animation` resource with keyed `CollisionShape2D` shape data per frame. Each shape layer → separate track, using `role` as track path hint.
- [x] **3.4.2.5** **`godot_tileset`** — composite tileset into atlas PNG, upscale, write `{name}.png` + `{name}.png.import`. Generate `{name}.tres` as Godot `TileSet` text resource: `TileSetAtlasSource` referencing atlas, tile size from `tile_width`/`tile_height`. Embed per-tile collision polygons from `tile_physics`. If `tile_terrain` exists, include terrain set with `TERRAIN_MODE_MATCH_CORNERS_AND_SIDES` (blob47) or appropriate mode, plus per-tile `terrain_peering_bits`.
- [x] **3.4.2.6** **`godot_static`** — composite frame 0 (all visible layers), upscale, write `{name}.png` + `{name}.png.import`. No `.tres` resource.

#### 3.4.3 Export Tests

- [x] **3.4.3.1** **Core export tests** — PNG output dimensions and pixel spot-checks at various scale factors, GIF frame count and delay values, spritesheet strip dimensions match `width × frames × scale`, atlas packing (no overlap, bounds fit, padding/extrusion), per_tag filename generation from export pattern.
- [x] **3.4.3.2** **Godot export tests** — `.tres` SpriteFrames structure validation (animation names match tags, frame count correct, GCD FPS calculation, ping-pong expansion), `.tres` TileSet structure (tile size, collision polygon embedding, terrain peering bits), `.png.import` sidecar format validation, `godot_static` produces only PNG + import (no .tres).

> **Definition of Done — Phase 3:** All 10 MCP tools from the design spec are implemented and tested. All prerequisite algorithms have dedicated unit tests. Export produces valid output files for each format. Godot .tres resources are structurally valid.

---

## Phase 4: MCP Resources & Prompts

### 4.1 MCP Resources (Visual Previews)

Visual preview resources for human users (not required for LLM operation — the LLM reads state via tool actions). These require the image compositing engine from [§1.5.10](#1510-image-compositing) and export encoding from [§3.4.1.2](#3412-image-compositing-integration).

#### 4.1.1 Resource Registration & Discovery

- [x] **4.1.1.1** **Resource Templates (`resources/templates/list`)** — register URI templates with the MCP SDK for the dynamic views: `pixel://view/asset/{name}`, `pixel://view/asset/{name}/layer/{layer_id}`, `pixel://view/asset/{name}/frame/{index}`, `pixel://view/animation/{name}/{tag}`, `pixel://view/palette/{name}`, `pixel://view/tileset/{name}`.
- [x] **4.1.1.2** **Resource Listing (`resources/list`)** — implement the listing endpoint to return concrete URIs for the currently active/loaded Workspace assets (e.g., `pixel://view/asset/{name}`, `pixel://view/palette/{name}`).
- [x] **4.1.1.3** **List Changed Notifications (`notifications/resources/list_changed`)** — wire up notifications so that when `workspace load_asset`, `workspace unload_asset`, or `project open` are called, the server emits a `list_changed` notification telling clients to refresh their resource lists.
- [x] **4.1.1.4** **URI parser & dispatch (`resources/read`)** — parse incoming `pixel://view/...` URIs into structured route objects: resource type (`asset`, `layer`, `animation`, `palette`, `tileset`), asset name, and optional sub-parameters. Dispatch to the appropriate renderer function and return `{ uri, mimeType, blob }` for image data.

#### 4.1.2 Asset View

- [x] **4.1.2.1** **`pixel://view/asset/{name}`** — composite all visible layers at frame 0 using `compositeFrame()`, encode as PNG via `pngjs`, return as base64 blob with `mimeType: "image/png"`. Validate asset is loaded.
- [x] **4.1.2.2** **`pixel://view/asset/{name}/frame/{index}`** — same as above but composite the specified frame index. Validate frame index in bounds.

#### 4.1.3 Layer View

- [x] **4.1.3.1** **`pixel://view/asset/{name}/layer/{layer_id}`** — render a single layer at frame 0 in isolation: resolve cel (including linked cels), convert palette indices to RGBA, encode as PNG. Non-image layers return an error or empty image.
- [x] **4.1.3.2** **`pixel://view/asset/{name}/layer/{layer_id}/{frame_index}`** — same as above for a specific frame. Validate layer ID exists and frame index in bounds.

#### 4.1.4 Animation View

- [x] **4.1.4.1** **`pixel://view/animation/{name}/{tag}`** — find the named frame tag, composite each frame in the tag's range using `compositeFrame()`, encode as animated GIF via `gifenc` with per-frame `duration_ms` delays from the asset's frame data. Validate tag exists and is a frame tag (not a layer tag). Return with `mimeType: "image/gif"`.

#### 4.1.5 Palette View

- [x] **4.1.5.1** **`pixel://view/palette/{name}`** — render the asset's palette as a swatch grid PNG. Layout: 16 columns × ceil(colorCount/16) rows, each swatch a fixed pixel size (e.g., 8×8 or 16×16). Transparent (index 0) rendered with a checkerboard background. Include index labels or distinguishing marks for empty vs. occupied slots.

#### 4.1.6 Tileset View

- [x] **4.1.6.1** **`pixel://view/tileset/{name}`** — render all tile slots in a grid PNG. Layout: tiles arranged in rows of `ceil(sqrt(tile_count))` columns, each tile at `tile_width × tile_height`. Composite each tile slot's pixel data, convert to RGBA via palette. Draw 1px grid lines between tiles for visual separation. Validate asset has tileset fields (`tile_width`, `tile_height`, `tile_count`).

#### 4.1.7 Resource Links in Tool Responses

Retrofit existing mutation tool handlers to include relevant `pixel://` URIs in their response content, so clients that support resources can render inline previews.

- [x] **4.1.7.1** **`draw` tool** — append `pixel://view/asset/{name}/layer/{layer_id}/{frame_index}` after successful draw operations.
- [x] **4.1.7.2** **`transform` tool** — append `pixel://view/asset/{name}/layer/{layer_id}/{frame_index}` after successful transform operations.
- [x] **4.1.7.3** **`effect` tool** — append `pixel://view/asset/{name}/layer/{layer_id}/{frame_index}` after successful effect operations.
- [x] **4.1.7.4** **`palette` tool** — append `pixel://view/palette/{name}` after palette mutations (`set`, `set_bulk`, `swap`, `load`, `fetch_lospec`, `generate_ramp`).
- [x] **4.1.7.5** **`asset` tool** — append `pixel://view/asset/{name}` after structural mutations (`create`, `resize`, `add_layer`, `remove_layer`, `add_frame`, `remove_frame`).
- [x] **4.1.7.6** **`tileset` tool** — append `pixel://view/tileset/{name}` after tileset mutations (`extract_tile`, `place_tile`, `autotile_generate`).
- [x] **4.1.7.7** **`selection` tool** — append `pixel://view/asset/{name}/layer/{layer_id}/{frame_index}` after `paste` and `cut` operations.

#### 4.1.8 Resource Tests

- [x] **4.1.8.1** **Registration & discovery tests** — templates list returns expected templates, resources list returns valid concrete URIs for loaded assets, list_changed notification is fired on workspace asset load/unload.
- [x] **4.1.8.2** **URI routing tests** — valid URIs dispatch to correct renderer, malformed URIs return errors, unknown asset names return domain errors.
- [x] **4.1.8.3** **Asset view tests** — returns valid PNG data, correct dimensions, frame index bounds validation.
- [x] **4.1.8.4** **Layer view tests** — single layer isolation (other layers excluded), linked cel resolution, layer ID and frame validation.
- [x] **4.1.8.5** **Animation view tests** — GIF frame count matches tag range, per-frame delays match asset durations, tag-not-found error.
- [x] **4.1.8.6** **Palette view tests** — PNG dimensions match expected grid layout, swatch count matches palette size.
- [x] **4.1.8.7** **Tileset view tests** — PNG dimensions match expected grid layout, tile count correct, error for non-tileset assets.
- [x] **4.1.8.8** **Resource link tests** — verify mutation tool responses include expected `pixel://` URIs for draw, transform, effect, palette, asset, tileset, and selection tools.

### 4.2 MCP Prompts (Workflow Templates)

MCP Prompts are user-invoked workflow templates (triggered from the host UI, not by the LLM). Each returns a `messages` array that seeds the LLM's context with structured instructions before it begins tool calls. Depends on the full tool surface being available (Phases 2–3).

#### 4.2.1 Prompt Registration

- [x] **4.2.1.1** **Prompt registration infrastructure** — register all prompts with the MCP server using the SDK's prompt API. Each prompt defines its `name`, `description`, and `arguments` array (with `name`, `description`, `required` fields). Wire into `src/index.ts` via `register*Prompt(server)` functions following the same pattern as tool registration.

#### 4.2.2 `scaffold_character`

- [x] **4.2.2.1** **Arguments**: `name` (required — asset name), `directions` (optional — `"4"` or `"8"` directional, default `"4"`), `width` (optional — canvas width in pixels, default 16), `height` (optional — canvas height in pixels, default 24), `palette` (optional — Lospec slug or palette file path, default project default).
- [x] **4.2.2.2** **Messages generation** — return messages array guiding the LLM through: (1) create asset with specified dimensions and perspective, (2) set up palette (fetch from Lospec or load from file), (3) create layer structure (body, eyes/detail, optional hitbox shape layer), (4) create directional frame tags with `facing` values based on `directions` arg (4-dir: N/E/S/W or 8-dir: all 8), (5) draw base pose on frame 0, (6) guidance for animation frames (idle, walk cycles).

#### 4.2.3 `scaffold_tileset`

- [x] **4.2.3.1** **Arguments**: `name` (required — asset name), `tile_size` (optional — tile pixel size as integer, default project default), `terrain_name` (optional — Godot terrain name, default asset name).
- [x] **4.2.3.2** **Messages generation** — return messages array guiding the LLM through: (1) create asset with `tile_width`/`tile_height` set to `tile_size`, (2) set up palette, (3) explain blob47 canonical slot layout and bitmask indexing, (4) draw each of the 47 tile variants at their correct slot positions, (5) call `autotile_generate` with `terrain_name` to assign peering bits, (6) set tile physics for relevant slots, (7) export via `godot_tileset`.

#### 4.2.4 `scaffold_equipment`

- [x] **4.2.4.1** **Arguments**: `name` (required — asset name), `type` (optional — `"weapon"`, `"armor_head"`, `"armor_chest"`, `"cape"`, etc.; informs default variant structure), `reference_character` (optional — registered asset name of the base body to use as anchor reference).
- [x] **4.2.4.2** **Messages generation** — return messages array guiding the LLM through: (1) create asset with dimensions matching the reference character (if provided, query its info), (2) set up palette (possibly shared with reference character), (3) create layer structure appropriate for the equipment type, (4) create directional frame tags aligned with the reference character's tags, (5) draw equipment with alignment guidance relative to the character rig, (6) create fit variants if applicable.

#### 4.2.5 `analyze_asset`

- [x] **4.2.5.1** **Arguments**: `asset_name` (required — the asset to analyze).
- [x] **4.2.5.2** **Messages generation** — return messages array prompting the LLM to: (1) call `asset info` and `palette info` to gather structural data, (2) call `asset detect_banding` to check for banding issues, (3) analyze palette usage (unused colors, duplicate near-colors, missing ramp continuity), (4) check animation completeness (missing frames in tags, inconsistent durations), (5) for tilesets: check for missing canonical slots via `autotile_generate` query mode, (6) return a structured critique with specific fix suggestions referencing the correct tool actions.

#### 4.2.6 `export_for_godot`

- [x] **4.2.6.1** **Arguments**: `asset_name` (required — the asset to export), `godot_project_path` (optional — root path of the Godot project; defaults to project-level export path if configured).
- [x] **4.2.6.2** **Messages generation** — return messages array guiding the LLM to: (1) call `asset info` to determine asset type and structure, (2) select the correct export action based on asset characteristics: `godot_spriteframes` for animated sprites (has frame tags), `godot_tileset` for tilesets (has tile dimensions), `godot_static` for single-frame non-tiled assets, (3) construct the correct `path` parameter relative to `godot_project_path`, (4) execute the export, (5) verify output files were created.

#### 4.2.7 Prompt Tests

- [x] **4.2.7.1** **Registration tests** — all 5 prompts registered, each has correct name, description, and argument definitions.
- [x] **4.2.7.2** **Argument validation tests** — required arguments enforced, optional arguments apply defaults correctly, invalid argument values rejected.
- [x] **4.2.7.3** **`scaffold_character` tests** — messages reference `asset create`, `palette` tool, `asset add_layer`, `asset add_tag`; 4-dir vs 8-dir produces different facing values; custom dimensions passed through.
- [x] **4.2.7.4** **`scaffold_tileset` tests** — messages reference `asset create` with tile fields, `autotile_generate`, `godot_tileset` export; terrain_name defaults to asset name.
- [x] **4.2.7.5** **`scaffold_equipment` tests** — messages reference `asset info` for reference character, correct equipment type guidance.
- [x] **4.2.7.6** **`analyze_asset` tests** — messages include calls to `asset info`, `palette info`, `detect_banding`; output is a structured critique.
- [x] **4.2.7.7** **`export_for_godot` tests** — messages include `asset info` inspection, correct export action selection logic for each asset type.

> **Definition of Done — Phase 4:** All resource URIs resolve and return valid image data. All prompts return well-formed message arrays with correct argument validation. Resource links appear in mutation tool responses for all 7 mutation tools. Prompt messages reference correct tool names and actions.

---

## Phase 5: Integration & Polish

### 5.1 Error Handling Audit

Verify every domain error from [design §2.6](design.md) is implemented correctly. The error catalog defines ~30 specific errors across 8 tools with exact message strings.

#### 5.1.1 Error Message Fidelity

Verify each tool returns the exact error message text from §2.6, with `isError: true` set, for every documented error condition.

- [x] **5.1.1.1** **`project` errors** — (1) "No project loaded" on any action without active project, (2) "Project file not found: {path}" on `open` with missing file.
- [x] **5.1.1.2** **`workspace` errors** — (1) "Asset '{name}' not found in project registry" on `load_asset` with unknown name, (2) "Asset file not found: {path}" on `load_asset` with missing file on disk, (3) "Asset '{name}' is not loaded" on `unload_asset`/`save` with unloaded asset, (4) unsaved changes warning (non-error) on `unload_asset` with dirty asset.
- [x] **5.1.1.3** **`asset` errors** — (1) "Asset '{name}' is not loaded" on any action, (2) "Layer {id} is a shape layer" redirect on `get_cel`/`get_cels`, (3) tilemap layer returns grid array (non-error), (4) "Layer {id} does not exist" on invalid `layer_id`, (5) "Frame {index} is out of range" on out-of-bounds `frame_index`, (6) "Layer {id} is not a group layer" on invalid `parent_layer_id` in `add_layer`, (7) "Layer {id} is not an image layer" on `generate_collision_polygon`, (8) "No target shape layer specified" when no hitbox shape layer found, (9) "Layer {id} is not a shape layer" on `add_shape`/`update_shape`, (10) "At least one palette source" on `create_recolor` with no palette.
- [x] **5.1.1.4** **`draw` errors** — (1) "Color index {color} is out of range (0–255)" on any operation, (2) "write_pixels data dimensions ({dw}×{dh}) do not match declared width×height ({w}×{h})" on `write_pixels`.
- [x] **5.1.1.5** **`effect` errors** — (1) "Color index {color} is out of range (0–255)" for `color1`/`color2`.
- [x] **5.1.1.6** **`palette` errors** — (1) "Palette index {index} is out of range (0–255)" on `set`/`swap`, (2) "Palette index {index} has no color defined" on `generate_ramp` endpoints, (3) "generate_ramp requires color1 < color2", (4) "Lospec palette '{slug}' not found or API unavailable" on `fetch_lospec`, (5) "Palette file not found: {path}" on `load`, (6) "Invalid palette file: {path}" on `load` with malformed JSON.
- [x] **5.1.1.7** **`tileset` errors** — (1) "Asset '{name}' has no tile dimensions" on `autotile_generate` for non-tileset, (2) "autotile_generate requires a pattern" when `pattern` missing, (3) "Tile index {index} does not exist" on `set_tile_physics`.
- [x] **5.1.1.8** **`export` errors** — (1) "Asset '{name}' is not loaded" on any action, (2) "Cannot write to path: {path}" on non-writable output.
- [x] **5.1.1.9** **`selection` errors** — (1) "Clipboard is empty" on `paste` without prior copy/cut, (2) "Target asset '{name}' is not loaded" on `paste` with unloaded target.

#### 5.1.2 Error Recovery Tests

Verify that each domain error returns sufficient information for recovery. For each error, test the pattern: trigger error → verify `isError: true` + message text → perform the corrective action suggested by the message → retry original operation → verify success.

- [x] **5.1.2.1** **Project recovery** — call any tool before project init → get error → call `project init` → retry → success.
- [x] **5.1.2.2** **Workspace recovery** — call `asset info` on unloaded asset → get error → call `workspace load_asset` → retry → success.
- [x] **5.1.2.3** **Layer type recovery** — call `get_cel` on shape layer → get redirect message → call `asset get_shapes` → success.
- [x] **5.1.2.4** **Palette recovery** — call `generate_ramp` with undefined endpoint → get error → call `palette set` on endpoint → retry → success.

### 5.2 Tool Surface Completeness Check

- [x] **5.2.1** **Action inventory** — verify all 10 tools are registered with all actions from [design §2.2](design.md). Cross-reference every action enum value in the design spec against the implemented Zod schemas. Report any missing or extra actions.
- [x] **5.2.2** **Parameter completeness** — for each tool action, verify all parameters from the design spec are accepted (required params enforced, optional params have correct defaults). Spot-check against the design spec's parameter tables.

### 5.3 End-to-End Integration Testing

Full workflow tests that exercise multiple tools in sequence, verifying the system works as an integrated whole. Each test uses only the public tool interface (no direct class/algorithm imports).

#### 5.3.1 Character Sprite Workflow

- [x] **5.3.1.1** **E2E: character creation and export** — `project init` → `asset create` (16×24, perspective "top_down_3/4") → `palette fetch_lospec` (apply a known slug) → `asset add_layer` (body, eyes) → `asset add_layer` (hitbox, shape type) → `asset add_frame` (×3 for walk cycle) → `asset add_tag` (frame tag "idle" frame 0, "walk" frames 1–3 with direction forward) → `asset add_tag` (frame tag "idle_south" with facing S) → `draw` (rect + fill on body layer, frame 0) → `draw` (pixels on eyes layer) → `asset get_cel` (verify pixel data matches) → `workspace save` → `workspace unload_asset` → `workspace load_asset` → `asset info` (verify full structure persisted) → `export godot_spriteframes` → verify strip PNG exists with correct dimensions (`16 × 4 frames × scale` wide), `.tres` file contains animation names matching tags, `.png.import` sidecar exists.

#### 5.3.2 Tileset Workflow

- [x] **5.3.2.1** **E2E: tileset creation and Godot export** — `project init` → `asset create` (with `tile_width: 16`, `tile_height: 16`) → `palette set_bulk` → `draw` (draw a few tile patterns at slot positions) → `tileset extract_tile` (extract 3+ tiles, verify slot indices increment, verify canvas width extends) → `tileset place_tile` (stamp tile onto image layer, verify pixels) → `tileset autotile_generate` (query-only mode with `pattern: "blob47"`, verify expected/occupied/missing lists) → `tileset autotile_generate` (assign mode with `terrain_name`, verify `tile_terrain` populated with peering bits) → `tileset set_tile_physics` (add collision polygon to a tile, verify storage) → `workspace save` → `export godot_tileset` → verify `.tres` contains `TileSetAtlasSource` with correct tile size, collision polygons embedded, terrain peering bits present, `.png.import` sidecar exists.

#### 5.3.3 Equipment Workflow

- [x] **5.3.3.1** **E2E: modular equipment with cross-asset operations** — `project init` → `asset create` "hero" (16×24 character) → `asset create` "sword" (16×24 weapon) → `palette set_bulk` (same palette on both) → `draw` (draw character body on hero) → `draw` (draw sword pixels on sword asset) → `asset add_tag` on both (matching "idle" tags with facing) → `selection rect` (select sword region) → `selection copy` → `selection paste` (paste to hero asset at offset, verify pixels transferred cross-asset) → `export per_tag` (with export pattern `{name}_{tag}_{direction}`) → verify output filenames use correct token substitution with separator-dropping for tags without facing.

#### 5.3.4 Recolor Workflow

- [x] **5.3.4.1** **E2E: recolor creation and variant resolution** — `project init` → `asset create` "base_char" → `palette set_bulk` → `draw` (draw base character) → `workspace save` → `asset create_recolor` "alt_char" (with `palette_entries` providing replacement colors) → `workspace load_asset` "alt_char" → `asset get_cel` (verify pixel structure matches base but palette differs) → `asset info` (verify `recolor_of` in registry) → `project info` (verify both assets in registry, alt_char has `recolor_of: "base_char"`).

#### 5.3.5 Variant Resolution Workflow

- [x] **5.3.5.1** **E2E: asset variants** — `project init` → `asset create` "iron_sword" → `workspace save` → manually register a `variants` map in the project (standard → path_a, slim → path_b) by creating two asset files → `workspace load_asset` "iron_sword" (no variant — loads first defined) → verify loaded → `workspace unload_asset` → `workspace load_asset` "iron_sword" with `variant: "slim"` → verify loads the slim variant path.

#### 5.3.6 Palette Workflow

- [x] **5.3.6.1** **E2E: palette lifecycle** — `project init` → `asset create` → `palette fetch_lospec` (known slug) → `palette info` (verify colors populated) → `palette save` (write to palette file) → `palette set` (modify a color) → `palette load` (reload saved file, verify color reverted) → `palette generate_ramp` (between two existing colors) → `palette info` (verify ramp entries interpolated) → `workspace undo` (verify ramp reverted) → `workspace redo` (verify ramp restored).

#### 5.3.7 PNG Import Workflow

- [x] **5.3.7.1** **E2E: project add_file** — `project init` → place a test PNG file (small, ≤256 colors) → `project add_file` (import the PNG) → `project info` (verify asset registered) → `workspace load_asset` (load the imported asset) → `asset info` (verify dimensions match PNG) → `palette info` (verify palette ≤ 256 entries, colors match quantized PNG) → `asset get_cel` (verify pixel data is indexed, non-zero for non-transparent regions).

#### 5.3.8 Undo/Redo Stress

- [x] **5.3.8.1** **E2E: undo/redo across tools and assets** — `project init` → create and load 2 assets → perform diverse mutations: `palette set_bulk` on asset A → `draw` (line + rect + fill) on asset A → `transform` (rotate + flip) on asset A → `effect` (gradient + outline) on asset B → `draw` (write_pixels) on asset B → `tileset extract_tile` on asset B → capture full state snapshot of both assets via `asset get_cel` on all layers/frames → undo all operations one by one via `workspace undo`, verify state after each undo step matches expected intermediate state → redo all operations via `workspace redo`, verify final state matches the captured snapshot.

#### 5.3.9 Linked Cel Lifecycle

- [x] **5.3.9.1** **E2E: linked cel resolution, write-break, and undo** — `project init` → `asset create` (2 frames) → `draw` (pixels on frame 0) → create linked cel (frame 1 links to frame 0) → `asset get_cel` frame 1 (verify returns frame 0 pixel data, `is_linked: true`, `link_source` metadata) → `draw` (modify a pixel on frame 1) → `asset get_cel` frame 1 (verify link broken — `is_linked: false`, pixel data includes the modification) → `asset get_cel` frame 0 (verify source cel unchanged) → `workspace undo` → `asset get_cel` frame 1 (verify link restored — `is_linked: true`, data matches frame 0 again).

#### 5.3.10 Selection Workflow

- [x] **5.3.10.1** **E2E: selection masking and clipboard** — `project init` → `asset create` (16×16) → `palette set` (set a few colors) → `draw` (fill entire cel with color 1) → `selection rect` (select 4×4 region) → `draw` (fill with color 2 — verify only selected 4×4 region changed, rest remains color 1) → `selection copy` → `selection clear` → create second asset → `workspace load_asset` → `selection paste` (to second asset at offset) → `asset get_cel` on second asset (verify 4×4 region pasted at correct offset) → `selection by_color` (select color 2 region) → `selection cut` → `asset get_cel` (verify cut region now transparent/index 0) → `selection invert` → verify selection covers everything except the cut region.

#### 5.3.11 MCP Resources Integration

- [x] **5.3.11.1** **E2E: resource rendering** — `project init` → `asset create` (with palette and drawn pixels) → verify `pixel://view/asset/{name}` returns valid PNG data with correct dimensions → `draw` on specific layer/frame → verify `pixel://view/asset/{name}/layer/{id}/{frame}` renders that layer in isolation → `asset add_tag` (frame tag) → verify `pixel://view/animation/{name}/{tag}` returns valid GIF → verify `pixel://view/palette/{name}` returns a PNG → create tileset asset → verify `pixel://view/tileset/{name}` returns a PNG grid.
- [x] **5.3.11.2** **E2E: resource links in mutation responses** — perform a `draw` operation → verify response includes `pixel://view/` URI → perform a `palette set` → verify response includes palette resource URI → perform `tileset extract_tile` → verify response includes tileset resource URI.

### 5.4 CLAUDE.md Update

- [x] **5.4.1** **Update CLAUDE.md** to reflect final architecture, tool list, and file layout

### 5.5 Documentation

- [x] **5.5.1** **README** — usage instructions, MCP client configuration, example tool calls
- [x] **5.5.2** **Example project** — a minimal `pixelmcp.json` + asset files demonstrating the format

> **Definition of Done — Phase 5:** All E2E tests pass covering every major workflow from the design spec. Error audit confirms all ~30 domain errors from §2.6 return correct messages with `isError: true`. Tool surface completeness check confirms all 10 tools with all actions match the design spec. README and example project are complete.

---

## Phase 6: UI Art Assets

First-class support for **UI art assets** — icons, UI frames/panels, buttons, and similar. Adds nine-slice metadata for scalable UI panels, Godot `StyleBoxTexture` export, atlas export with named Godot `AtlasTexture` sub-resources, and scaffolding prompts for common UI art workflows.

**Depends on:** Phases 1–5 (full tool surface, working exports)

---

### 6.1 Nine-Slice Types & Class

- [x] **6.1.1** **`NineSlice` interface** (`src/types/asset.ts`) — `{ top: number; right: number; bottom: number; left: number }` defining pixel margins for 9-slice scaling
- [x] **6.1.2** **Optional `nine_slice` field on `Asset`** (`src/types/asset.ts`) — `nine_slice?: NineSlice`, following the `tile_physics`/`tile_terrain` pattern
- [x] **6.1.3** **`AssetClass` getter/setter** (`src/classes/asset.ts`) — getter/setter for `nine_slice` with `markDirty()` in the setter; handle in `_restoreDataPatch()` using the `'nine_slice' in patch` pattern

---

### 6.2 Nine-Slice Command

- [x] **6.2.1** **`NineSliceCommand`** (`src/commands/nine-slice-command.ts`) — follows the `TilesetCommand` pattern: captures `nine_slice` before-state in constructor, applies mutation, captures after-state. Uses `_restoreDataPatch()` for undo/redo.

---

### 6.3 Asset Tool: `set_nine_slice` Action

- [x] **6.3.1** **Add `set_nine_slice` to asset tool** (`src/tools/asset.ts`) — add to the action enum in the Zod schema; add optional params `nine_slice_top`, `nine_slice_right`, `nine_slice_bottom`, `nine_slice_left` (all `z.number().int().min(0).optional()`)
- [x] **6.3.2** **Accept `nine_slice` on `asset create`** — same way `tile_width`/`tile_height` are set on create, for convenience
- [x] **6.3.3** **Handler logic** — validate at least one margin is provided, validate margins don't exceed asset dimensions (top+bottom >= height or left+right >= width → error), wrap in `NineSliceCommand`, set `asset.nine_slice`

---

### 6.4 Godot Resource Generation

- [x] **6.4.1** **`generateGodotStyleBoxTexture()`** (`src/io/godot-resources.ts`) — produces a Godot 4.x `StyleBoxTexture` `.tres` with `texture_margin_*` properties from nine-slice margins and scale factor
- [x] **6.4.2** **`generateGodotAtlasTextures()`** (`src/io/godot-resources.ts`) — produces a single `.tres` with named `AtlasTexture` sub-resources, each pointing to a region within a packed atlas texture

---

### 6.5 Export Actions

- [x] **6.5.1** **`godot_ui_frame` export action** (`src/tools/export.ts`) — requires loaded asset with `nine_slice` set; composites frame 0, upscales, writes `{name}.png` + `.png.import` sidecar + `{name}.tres` (`StyleBoxTexture`). Returns message + file list.
- [x] **6.5.2** **`godot_atlas` export action** (`src/tools/export.ts`) — uses same atlas packing logic as existing `atlas` action (refactor shared helper); writes `{name}.png` + `.png.import` sidecar + `{name}.tres` (named `AtlasTexture` sub-resources). Returns message + file list + regions.

---

### 6.6 MCP Prompts

- [x] **6.6.1** **`scaffold_ui_icons` prompt** (`src/prompts/scaffold-ui-icons.ts`) — follows `scaffold_tileset` pattern. Arguments: `name` (required), `icon_size` (optional, default 16), `count` (optional), `palette` (optional). Guides: create asset, set palette, draw icon, tips for consistency, export as `godot_atlas`.
- [x] **6.6.2** **`scaffold_ui_frame` prompt** (`src/prompts/scaffold-ui-frame.ts`) — Arguments: `name` (required), `width` (optional, default 48), `height` (optional, default 48), `palette` (optional). Guides: create asset, set palette, explain 9-slice concept, draw frame (corners → edges → center fill), set nine_slice margins, preview, export as `godot_ui_frame`.
- [x] **6.6.3** **Register prompts** (`src/index.ts`) — import and call `registerScaffoldUiIconsPrompt()` and `registerScaffoldUiFramePrompt()`

---

### 6.7 Testing

- [x] **6.7.1** **Unit tests** — nine_slice getter/setter, toJSON/fromJSON roundtrip, dirty tracking (`src/classes/asset.test.ts`); NineSliceCommand execute/undo/redo (`src/commands/nine-slice-command.test.ts`); `generateGodotStyleBoxTexture()` and `generateGodotAtlasTextures()` output format (`src/io/godot-resources.test.ts`)
- [x] **6.7.2** **Tool tests** — `set_nine_slice` action: valid set, margins-exceed-dimensions error, undo/redo; `create` with nine_slice params (`src/tools/asset.test.ts`); `godot_ui_frame` (produces PNG + import + .tres, error when no nine_slice set) and `godot_atlas` (produces PNG + import + .tres with named sub-resources) export actions (`src/tools/export.test.ts`)
- [x] **6.7.3** **Prompt tests** — `scaffold_ui_icons` and `scaffold_ui_frame` registration, argument validation, messages reference correct tool actions
- [x] **6.7.4** **E2E tests** — UI frame workflow: `project init` → `asset create` → `palette set_bulk` → `draw` → `asset set_nine_slice` → `workspace save` → `export godot_ui_frame` → verify `.tres` contains correct `StyleBoxTexture` margins. Icon atlas workflow: create 3 icon assets → draw on each → `export godot_atlas` → verify `.tres` contains 3 named `AtlasTexture` sub-resources with correct regions.

> **Definition of Done — Phase 6:** Nine-slice metadata round-trips through save/load. `set_nine_slice` validates margins and supports undo/redo. `godot_ui_frame` produces a valid Godot `StyleBoxTexture` `.tres`. `godot_atlas` produces a valid Godot `AtlasTexture` `.tres` with named sub-resources. Both scaffolding prompts guide the user through complete workflows. All 6.7 tests pass.

---

## Phase 7: MCP App

An interactive pixel art editor that renders **inline in the conversation** using the [MCP Apps extension](https://modelcontextprotocol.io/extensions/apps/overview). When the AI (or user) calls the `open_editor` tool, a sandboxed iframe appears in the chat containing a live pixel art editor. The user can paint pixels, navigate frames, make selections to reference in conversation, and step through animations — all without leaving the chat. The AI can continue making tool calls while the user interacts with the editor.

**Depends on:** Phases 1–6 (full tool surface, working resources, UI art assets)

**SDK/infra deps:** `@modelcontextprotocol/ext-apps`, `vite`, `vite-plugin-singlefile`, `preact`

**Transport note:** MCP Apps work over stdio — the host (Claude) proxies `postMessage` ↔ stdio on behalf of the sandboxed UI. The server needs no transport change. An optional `--http` flag (Express + `StreamableHTTPServerTransport`) is added for testing with `basic-host`.

---

### 7.1 Infrastructure

- [x] **7.1.1** **Install UI deps** — `@modelcontextprotocol/ext-apps`, `vite`, `vite-plugin-singlefile`, `preact`; install as dev deps or separate workspace package to avoid bloating the server bundle
- [x] **7.1.2** **Vite config** — `vite.config.app.ts` targeting `src/app/app.html`, `viteSingleFile` plugin, outputs `dist/app/app.html`
- [x] **7.1.3** **Build scripts** — add `build:app` (`vite build --config vite.config.app.ts`) and `dev:app` (vite dev server with HMR) to `package.json`; `build` script stays tsc-only
- [x] **7.1.4** **Optional HTTP transport** — if `--http` flag present, start Express + `StreamableHTTPServerTransport` on port 3001 alongside (or instead of) stdio; useful for `basic-host` dev testing

---

### 7.2 Server-side: Editor Tool & Resource

- [x] **7.2.1** **`src/tools/editor.ts`** — uses `registerAppTool()` from `@modelcontextprotocol/ext-apps/server` (not `server.registerTool()`):
  - `open_editor({ asset_name })` — loads asset if not loaded; returns `structuredContent` with full asset state (palette, layers, frame list, tags, cels for frame 0) for the UI, and a brief text summary in `content` for the LLM; declares `_meta: { ui: { resourceUri: "ui://pixel-editor/app.html" } }`
  - `get_asset_state({ asset_name, frame_index? })` — returns cels + metadata for the given frame in `structuredContent`; declared with `visibility: ["app"]` so it only appears to the UI, not the LLM; called by the UI to refresh after any edit or AI tool call
- [x] **7.2.2** **`src/resources/editor.ts`** — uses `registerAppResource()` from `@modelcontextprotocol/ext-apps/server` to register `ui://pixel-editor/app.html`; reads `dist/app/app.html` and returns it (the SDK handles the MIME type)
- [x] **7.2.3** **Wire into `src/index.ts`** — call `registerEditorTool` and `registerEditorResource`

---

### 7.3 UI: Canvas Renderer (`src/app/canvas.ts`)

- [x] **7.3.1** **`CanvasRenderer` class** — wraps a `<canvas>` element; `render(cels, layers, palette, selection?)` composites all visible image layers for the current frame into `ImageData` using indexed→RGBA conversion (respects layer opacity, visibility order); draws to canvas
- [x] **7.3.2** **Transparency background** — checkerboard pattern drawn behind any pixel with index 0 (transparent)
- [x] **7.3.3** **Zoom** — CSS canvas scaling with `imageSmoothingEnabled = false` (nearest-neighbor); scroll-wheel to zoom 1×–16×; zoom anchored to cursor position
- [x] **7.3.4** **Pan** — middle-click or space+drag to pan; canvas offset tracked as `{ dx, dy }` state
- [x] **7.3.5** **`getPixelAt(clientX, clientY)`** — maps screen coordinates back to canvas pixel `{ x, y, colorIndex }` accounting for zoom and pan; used by pencil, eyedropper, and selection tools

---

### 7.4 UI: Palette Panel (`src/app/palette.ts`)

- [x] **7.4.1** **Color swatch grid** — renders all non-null palette entries as colored squares (skip index 0 or render as checkerboard for transparent)
- [x] **7.4.2** **Active color selection** — click a swatch → set `activeColorIndex`; selected swatch gets a highlight border
- [x] **7.4.3** **Hover tooltip** — shows `[${index}] #${hexRGBA}` on mouse-over

---

### 7.5 UI: Layer Panel (`src/app/layers.ts`)

- [x] **7.5.1** **Layer list** — renders all layers top-to-bottom with name, type icon (image/tilemap/shape/group), and eye toggle icon
- [x] **7.5.2** **Visibility toggle** — click eye → optimistic local toggle + call `asset` tool to set `visible`; re-render canvas on confirmation
- [x] **7.5.3** **Active layer** — click row → set `activeLayerId`; highlighted in panel; pencil/fill tools target this layer

---

### 7.6 UI: Frame Timeline (`src/app/timeline.ts`)

- [x] **7.6.1** **Frame strip** — small squares for each frame; current frame highlighted; click to jump to frame → call `get_asset_state` to reload cels
- [x] **7.6.2** **Prev / Next buttons** — step one frame at a time; wraps at ends
- [x] **7.6.3** **Frame counter** — "frame 3 / 8 (120ms)" label
- [x] **7.6.4** **Tag spans** — colored labels above the strip showing tag name and frame range for each frame tag
- [x] **7.6.5** **Play / Pause** — `requestAnimationFrame` loop; advances frame when elapsed time ≥ current frame's `duration_ms`; respects loop toggle
- [x] **7.6.6** **Loop toggle** — loops back to frame 0, or stops at last frame

---

### 7.7 UI: Drawing Toolbar (`src/app/toolbar.ts`)

- [x] **7.7.1** **Pencil tool** — `mousedown` → `mousemove` → `mouseup` on canvas; accumulates `{x, y}` stroke pixels optimistically into local canvas; on `mouseup` commits as a batch of `draw pixel` operations (one undo step)
- [x] **7.7.2** **Eraser tool** — same as pencil but uses `activeColorIndex = 0`
- [x] **7.7.3** **Eyedropper tool** — click canvas → `getPixelAt()` → set `activeColorIndex`; no server call needed
- [x] **7.7.4** **Fill tool** — click canvas → `getPixelAt()` → call `draw fill` with that `{x, y}` and `activeColorIndex` → call `get_asset_state` to refresh
- [x] **7.7.5** **Undo / Redo buttons** — call `workspace undo` / `workspace redo` → call `get_asset_state` to refresh canvas

---

### 7.8 UI: Selection & Context Bridge (`src/app/selection.tsx`)

- [x] **7.8.1** **Rect selection tool** — drag on canvas → draw dashed rectangle overlay; on `mouseup` call `selection rect { asset_name, layer_id, frame_index, x, y, width, height }` to set server-side mask; render marching ants (CSS `stroke-dashoffset` animation) on canvas overlay
- [x] **7.8.2** **Select All / Clear** — buttons calling `selection all` / `selection clear`; clear also removes marching ants overlay
- [x] **7.8.3** **"Reference in AI" button** — extracts dominant color histogram from the selected region using local canvas pixel data; calls `app.updateModelContext({ content: [{ type: "text", text: "..." }] })` with a YAML-frontmatter block containing `{ type: "pixel_selection", asset, region: { x, y, w, h }, dominant_colors }` so the AI knows exactly what region the user is pointing at in subsequent messages

---

### 7.9 UI: App Shell & State (`src/app/app.tsx`)

- [x] **7.9.1** **`App` from `@modelcontextprotocol/ext-apps`** — register all handlers (`ontoolresult`, `onhostcontextchanged`, `onteardown`) **before** calling `app.connect()` to avoid missing the initial tool result; `app.ontoolresult` receives initial asset state from `open_editor` via `structuredContent` and triggers first render
- [x] **7.9.2** **Top-level state** — `{ assetName, width, height, palette, layers, frames, tags, cels, activeLayerId, activeColorIndex, currentFrame, isPlaying, selection }`
- [x] **7.9.3** **Status bar** — shows active tool, active layer name, active palette color swatch + index, last AI operation
- [x] **7.9.4** **Auto-refresh on AI edits** — `ontoolresult` also fires when the AI calls tools (draw, transform, etc.); on receipt, call `get_asset_state` to sync canvas with any AI-made changes

---

### 7.10 Testing

- [x] **7.10.1** **Compositing unit tests** — test `compositeFrame()` directly (no DOM required): render known pixel data + palette → assert correct RGBA output for specific pixels; assert transparent pixels (index 0 → alpha 0 in composited output). `CanvasRenderer` itself wraps a `<canvas>` element requiring a DOM environment (`jsdom` or `happy-dom`) — defer browser-dependent rendering tests to the manual smoke test
- [x] **7.10.2** **`open_editor` tool tests** — call with a loaded test asset; verify response `structuredContent` contains `palette`, `layers`, `frames`, `cels`; verify `content` contains a text summary for the LLM; verify the tool is registered with `_meta.ui.resourceUri` pointing to `"ui://pixel-editor/app.html"`
- [x] **7.10.3** **Editor resource handler tests** — verify `ui://pixel-editor/app.html` returns content with correct MIME type; verify HTML content is non-empty after build; test should skip gracefully if `dist/app/app.html` has not been built yet
- [x] **7.10.4** **Manual smoke test** — build UI (`npm run build:app`), start server with `--http`, open with `npx @mcpjam/inspector@latest` or `basic-host` at `http://localhost:3001/mcp`, call `open_editor`, verify canvas renders and pencil tool commits pixels via draw tool

> **Definition of Done — Phase 7:** `open_editor` renders an interactive canvas inline in Claude. User can paint pixels, step through animation frames, drag a selection rectangle and hit "Reference in AI" to update conversation context with the selected region. Undo/redo works. Canvas auto-refreshes when the AI makes tool calls. All 7.10 tests pass.

---

## Phase 8: Extended Features & Workflow Breadth

Extends the tool surface with 25 features identified through gap analysis, organized by priority tier. Tiers communicate implementation priority — higher tiers should be completed first, but sub-tasks within a tier can be parallelized.

**Depends on:** Phases 1–7 (full tool surface, working exports, MCP app)

---

### 8A — LLM Workflow Optimizations (Tier 1)

High-impact features that reduce round trips and unlock common LLM pixel art workflows.

#### 8A.1 Frame Range Batch Operations

- [x] **8A.1.1** **Frame range command infrastructure** — `FrameRangeCommand` that wraps an inner command factory, iterating over `[start, end]` frames and capturing/restoring all affected cels as a single undo step. Validates `0 ≤ start ≤ end < frame_count` and mutual exclusivity with `frame_index`.
- [x] **8A.1.2** **Wire `frame_range` into `draw` tool** — add `frame_range` to Zod schema (mutually exclusive with `frame_index`), dispatch through `FrameRangeCommand`. All operations in the `operations` array are applied to each frame sequentially.
- [x] **8A.1.3** **Wire `frame_range` into `transform` tool** — same pattern as draw.
- [x] **8A.1.4** **Wire `frame_range` into `effect` tool** — same pattern as draw.

#### 8A.2 Linked Cel Creation

- [x] **8A.2.1** **`LinkCelCommand`** (`src/commands/link-cel-command.ts`) — captures the target cel's existing data on construction, replaces with a link reference on `execute()`, restores original data on `undo()`.
- [x] **8A.2.2** **`link_cel` action on asset tool** — add to Zod schema with `source_layer_id` and `source_frame_index` params. Validate source exists, reject self-link, validate matching layer types. Wrap in `LinkCelCommand`.

#### 8A.3 Per-Layer Spritesheet Export

- [x] **8A.3.1** **`spritesheet_per_layer` export action** — iterate image layers (filtered by optional `layers` param), composite each layer in isolation across all frames into a horizontal strip, write to `{asset_name}_{layer_name}_strip.png` in `path` directory. Return file list.

#### 8A.4 Hue-Shifting in generate_ramp

- [x] **8A.4.1** **HSL conversion utilities** (`src/algorithms/color-utils.ts`) — `rgbaToHsl()` and `hslToRgba()` pure functions. Unit tested independently.
- [x] **8A.4.2** **Hue-shifted ramp generation** — extend `Palette.generateRamp()` (or the palette tool handler) to accept `hue_shift_start` and `hue_shift_end`. Convert endpoints to HSL, apply hue rotation, interpolate in HSL space, convert back to RGBA, snap to nearest existing palette entry or write directly.

#### 8A.5 Selective Outline Effect

- [x] **8A.5.1** **`selout` algorithm** (`src/algorithms/outline.ts`) — extend outline module with `selectiveOutline(data, palette, baseColor)`. For each outline candidate pixel, examine adjacent non-transparent sprite pixels, compute a blended outline color shifted toward the adjacent pixel's hue at reduced luminance, find the nearest palette entry, and place it. Falls back to `baseColor` for pixels adjacent only to transparency.
- [x] **8A.5.2** **Wire `selout` into effect tool** — add `selout` operation to Zod schema and dispatch to algorithm.

#### 8A.6 Color Replace Draw Operation

- [x] **8A.6.1** **`colorReplace` algorithm** — simple scan-and-replace on a 2D palette-index array. Respects selection mask when provided.
- [x] **8A.6.2** **Wire `color_replace` into draw tool** — add to operations Zod schema with `from_color` and `to_color` params, dispatch to algorithm.

#### 8A.7 `scaffold_attack` Prompt

- [x] **8A.7.1** **`scaffold_attack` prompt** (`src/prompts/scaffold-attack.ts`) — arguments: `name`, optional `attack_type` (`melee_slash`/`melee_thrust`/`ranged`/`magic_cast`), optional `weapon_asset`, optional `frame_count`. Messages guide through anticipation → smear → impact → follow-through → recovery frame structure with timing advice.

#### 8A.8 `scaffold_side_scroller` Prompt

- [x] **8A.8.1** **`scaffold_side_scroller` prompt** (`src/prompts/scaffold-side-scroller.ts`) — arguments: `name`, optional `width`/`height`, optional `palette`, optional `animations`. Messages guide through side-view character proportions, run cycle phases, jump arc frames.

#### 8A.9 Testing

- [x] **8A.9.1** **Frame range tests** — `FrameRangeCommand` undo/redo across multiple frames; draw/transform/effect with `frame_range` verify all frames modified; mutual exclusivity error with `frame_index`.
- [x] **8A.9.2** **Link cel tests** — `LinkCelCommand` execute/undo/redo; `link_cel` action validation (self-link error, source not found, type mismatch); get_cel on linked cel returns source data.
- [x] **8A.9.3** **Per-layer spritesheet tests** — correct number of output files; each strip has correct dimensions; `layers` filter works; non-image layers skipped.
- [x] **8A.9.4** **Hue-shifted ramp tests** — HSL conversion roundtrip fidelity; ramp with hue shift produces different intermediate colors than without; warm→cool ramp verification.
- [x] **8A.9.5** **Selective outline tests** — `selout` produces different outline colors near different sprite regions; fallback to base color near transparency; comparison with flat `outline`.
- [x] **8A.9.6** **Color replace tests** — all matching pixels replaced; non-matching pixels unchanged; respects selection mask; works with `frame_range`.
- [x] **8A.9.7** **Prompt tests** — `scaffold_attack` and `scaffold_side_scroller` registration, argument validation, messages reference correct tool actions.

> **Definition of Done — Phase 8A:** Frame range operations work across draw/transform/effect with single undo step. Linked cels can be created explicitly. Per-layer spritesheet export produces correct output. Hue-shifted ramps produce warm→cool gradients. Selective outline adapts to adjacent colors. Color replace works with selection and frame range. Both new prompts pass registration and message tests.

---

### 8B — Godot Import Completeness (Tier 2)

Features that produce richer Godot `.tres` resources for direct import without manual editor work. Depends on Phase 1 types (`src/types/asset.ts`) and Phase 3.3 tileset tool (`src/tools/tileset.ts`).

#### 8B.1 Animated Tiles in TileSet

- [x] **8B.1.1** **`tile_animation` asset storage** — extend asset types with optional `tile_animation: Record<string, { frame_count, frame_duration_ms, separation }>` field. Add to `toJSON()`/`fromJSON()` roundtrip. Extends the Phase 1 Asset type definition (`src/types/asset.ts`) with new optional field.
- [x] **8B.1.2** **`TileAnimationCommand`** — captures `tile_animation` before-state for undo/redo.
- [x] **8B.1.3** **`set_tile_animation` tileset action** — add to Zod schema, validate `tile_index` exists and `frame_count ≥ 1`, store in asset, wrap in command.
- [x] **8B.1.4** **Emit animated tile properties in `godot_tileset` `.tres`** — `animation_columns`, `animation_speed_fps` (1000 / frame_duration_ms), `animation_frames_count` per animated tile.
- [x] **8B.1.5** **`clear_tile_animation` tileset action** — add to Zod schema, validate `tile_index` exists, remove animation metadata, wrap in command.

#### 8B.2 TileSet Custom Data Layers

- [x] **8B.2.1** **`tile_custom_data` asset storage** — extend asset types with `tile_custom_data: { layers: Array<{ name, type }>, tiles: Record<string, Record<string, value>> }`. Add to roundtrip. Extends the Phase 1 Asset type definition (`src/types/asset.ts`) with new optional field.
- [x] **8B.2.2** **`TileDataCommand`** — captures custom data before-state.
- [x] **8B.2.3** **`set_tile_data` tileset action** — add to Zod schema, auto-create data layer if new, store value per tile, wrap in command.
- [x] **8B.2.4** **Emit custom data layers in `godot_tileset` `.tres`** — custom data layer definitions + per-tile custom data values.
- [x] **8B.2.5** **`clear_tile_data` tileset action** — add to Zod schema, remove custom data value for given `data_layer_name` (or all custom data if omitted), wrap in command.

#### 8B.3 TileSet Occlusion Polygons

- [x] **8B.3.1** **Extend `set_tile_physics` with `occlusion_polygon`** — add optional param to Zod schema, store alongside physics polygon in `tile_physics`.
- [x] **8B.3.2** **Emit occlusion layer in `godot_tileset` `.tres`** — include occlusion polygon data for tiles that have it.

#### 8B.4 Tile Alternatives

- [x] **8B.4.1** **`tile_alternatives` asset storage** — extend asset types with `tile_alternatives: Record<string, Array<{ alternative_id, flip_h, flip_v, transpose }>>`. Add to roundtrip. Extends the Phase 1 Asset type definition (`src/types/asset.ts`) with new optional field.
- [x] **8B.4.2** **`TileAlternativeCommand`** — captures alternatives before-state.
- [x] **8B.4.3** **`add_tile_alternative` tileset action** — add to Zod schema, auto-assign `alternative_id` if not provided, validate tile exists, store, wrap in command.
- [x] **8B.4.4** **Emit alternative tiles in `godot_tileset` `.tres`** — alternative tile entries with transform flags (`flip_h`, `flip_v`, `transpose`).
- [x] **8B.4.5** **`remove_tile_alternative` tileset action** — add to Zod schema, validate `tile_index` and `alternative_id` exist, remove alternative, wrap in command.

#### 8B.5 Grid Spritesheet Export

- [x] **8B.5.1** **`spritesheet_grid` export action** — composite frames into grid layout with `columns` parameter (default `ceil(sqrt(frame_count))`). Validate `columns ≥ 1`. Fill incomplete final row with transparent pixels.

#### 8B.6 Per-Tag Side-Scroller Verification

- [x] **8B.6.1** **Verify `export per_tag`** works correctly with side-scroller animation states (no `facing` property — just tag names like `idle`, `run`, `jump`). Ensure separator-dropping logic handles tags with no facing gracefully.

#### 8B.7 Testing

- [x] **8B.7.1** **Animated tile tests** — `set_tile_animation` storage and roundtrip; `clear_tile_animation` removes metadata and round-trips; `.tres` output contains animation properties; command undo/redo.
- [x] **8B.7.2** **Custom data tests** — `set_tile_data` auto-creates layers; `clear_tile_data` removes single key or all custom data; multiple data types stored correctly; `.tres` output contains custom data; command undo/redo.
- [x] **8B.7.3** **Occlusion tests** — `set_tile_physics` with `occlusion_polygon`; `.tres` output contains occlusion layer.
- [x] **8B.7.4** **Tile alternative tests** — `add_tile_alternative` auto-assigns ID; `remove_tile_alternative` removes by ID; `.tres` output contains alternative entries with transform flags; command undo/redo.
- [x] **8B.7.5** **Grid spritesheet tests** — correct dimensions for various `columns` values; transparent fill in incomplete rows; `columns < 1` error.

> **Definition of Done — Phase 8B:** Animated tiles, custom data layers, occlusion polygons, and tile alternatives all round-trip through save/load and appear in Godot `.tres` output. Grid spritesheet export produces correct layouts. All 8B.7 tests pass.

---

### 8C — Workflow Breadth (Tier 3)

New prompts and export formats that broaden the range of art assets the LLM can create.

#### 8C.1 Enhance `scaffold_character`

- [x] **8C.1.1** **Rework `scaffold_character` prompt** — remove `role` argument. Add `description` (free-text hint) and `animations` (explicit override list) arguments. Embed an animation menu in the prompt text (15 states across 4 categories, each with suggested frame count and duration). Teach the LLM the frame layout algorithm with a worked example instead of pre-computing frame indices in TypeScript.
- [x] **8C.1.2** **Update prompt tests** — verify menu appears when `animations` is omitted, verify `animations` override skips the menu, verify layout algorithm example is correct, verify `description` is threaded into prompt text.

#### 8C.2 `scaffold_vfx` Prompt

- [x] **8C.2.1** **`scaffold_vfx` prompt** (`src/prompts/scaffold-vfx.ts`) — arguments: `name`, optional `vfx_type`, optional `width`/`height`, optional `frame_count`, optional `palette`. Messages guide through VFX sprite creation with timing advice (fast attack → slow decay), color choices, scale progression.

#### 8C.3 `scaffold_parallax` Prompt

- [x] **8C.3.1** **`scaffold_parallax` prompt** (`src/prompts/scaffold-parallax.ts`) — arguments: `name`, optional `layer_count`, optional `viewport_width`, optional `height`, optional `palette`. Messages guide through parallax layer creation with depth ordering, atmospheric perspective color guidance, tile-seam alignment.

#### 8C.4 `scaffold_props` Prompt

- [x] **8C.4.1** **`scaffold_props` prompt** (`src/prompts/scaffold-props.ts`) — arguments: `name`, optional `prop_type`, optional `reference_character`, optional `width`/`height`, optional `palette`. Messages guide through environment prop creation with state-based tags, hitbox layers, scale consistency.

#### 8C.5 Normal Map Generation

- [x] **8C.5.1** **Sobel normal map algorithm** (`src/algorithms/normal-map.ts`) — `generateNormalMap(rgbaBuffer, width, height): Uint8Array`. Convert to grayscale luminance, apply 3×3 Sobel operators, map gradients to tangent-space RGB normals. Pure function, unit tested.
- [x] **8C.5.2** **`normal_map` export action** — composite asset at target frame, pass RGBA buffer to normal map algorithm, upscale, encode as PNG, write to path.

#### 8C.6 Palette Swap LUT Export

- [x] **8C.6.1** **LUT generation algorithm** (`src/algorithms/palette-lut.ts`) — `generatePaletteLUT(palettes: Array<Array<[r,g,b,a]>>): Uint8Array`. Build a 256×N RGBA texture where row R, column C = palettes[R][C]. Pure function.
- [x] **8C.6.2** **`palette_lut` export action** — gather asset palette + palette_sources palettes, pass to LUT algorithm, encode as PNG, write to path.

#### 8C.7 Testing

- [x] **8C.7.1** **Reworked scaffold_character tests** — animation menu present when `animations` omitted, `animations` override skips menu, `description` threaded into text, layout algorithm example is arithmetically correct.
- [x] **8C.7.2** **New prompt tests** — `scaffold_vfx`, `scaffold_parallax`, `scaffold_props` registration, argument validation, messages reference correct tool actions.
- [x] **8C.7.3** **Normal map tests** — Sobel output verified against known gradient inputs; flat surface produces (128, 128, 255) blue; edge detection produces correct directional normals.
- [x] **8C.7.4** **Palette LUT tests** — LUT dimensions correct (256 × palette_count); pixel values match source palettes; single-palette LUT is 256×1.

> **Definition of Done — Phase 8C:** Enhanced `scaffold_character` covers all character roles with behavioral states. Three new prompts (vfx, parallax, props) pass registration and message tests. Normal map export produces valid tangent-space normal maps. Palette LUT export produces correct lookup textures. All 8C.7 tests pass.

---

### 8D — Nice to Have (Tier 4)

Lower-priority features that are documented for completeness. Implement as time allows.

#### 8D.1 Background Removal Effect

- [x] **8D.1.1** **`background_remove` effect operation** — scan-and-replace: every pixel matching `target_color` → index 0. Ignores selection. Add to effect tool Zod schema.

#### 8D.2 Animation Interpolation

- [ ] **8D.2.1** **Frame interpolation algorithm** (`src/algorithms/interpolate.ts`) — `interpolateFrames(celA: number[][], celB: number[][], count: number): number[][][]`. Per-pixel threshold blending between two keyframe cels, producing `count` intermediate 2D arrays. For each pixel at interpolation step `t` (0→1), picks `celA` index if `t < 0.5`, else `celB` index; transparent (0) pixels in either source are preserved (if both non-zero, threshold applies). [design §2.4 Future Considerations]
- [ ] **8D.2.2** **`interpolate_frames` action on asset tool** — insert `count` new frames at position `frame_start + 1` (`frame_end` and later shift right by `count`). Populate cels from interpolation algorithm for all image layers independently; skip non-image layers. Resolve LinkedCels to source data before interpolating; error on type mismatch (both must be ImageCels). Interpolated frames inherit `duration_ms` from `frame_start`. Atomic single Command (frame insertion + cel writes in one undo step). [design §2.4 Future Considerations]

#### 8D.3 Advanced Upscaling (Scale2x)

- [ ] **8D.3.1** **Scale2x algorithm** (`src/algorithms/scale2x.ts`) — pixel art upscaling that smooths edges while preserving sharp details. Applied iteratively for 4×, 8×.
- [ ] **8D.3.2** **`scale_algorithm` parameter on export** — add optional enum param (`nearest` | `scale2x`) to export actions. Default `nearest`. Validate `scale2x` only valid with power-of-2 scale factors.

#### 8D.4 Jaggy Detection

- [ ] **8D.4.1** **Jaggy detection algorithm** (`src/algorithms/jaggies.ts`) — scan for staircase patterns on edges that should be smooth. Report coordinates and severity.
- [ ] **8D.4.2** **`detect_jaggies` read-only action on asset tool** — delegate to algorithm, return structured report.

#### 8D.5 Color Cycling

- [ ] **8D.5.1** **`color_cycling` asset metadata** — add `ColorCycleEntry` interface (`{ start_index, end_index, speed_ms, direction: 'forward' | 'reverse' | 'ping_pong' }`) and optional `color_cycling?: ColorCycleEntry[]` on Asset type. Follow `nine_slice` pattern: getter/setter with `markDirty()` on AssetClass, deep-copy restoration in `_restoreDataPatch()`. Validation: `start_index < end_index`, both 0–255, `speed_ms > 0`. [design §2.4 Future Considerations]
- [ ] **8D.5.2** **`set_color_cycling` palette action** — manage color cycling entries on the asset. New `AssetMetadataCommand` class (`src/commands/asset-metadata-command.ts`) captures `color_cycling` array before/after for undo/redo (distinct from `PaletteCommand` which captures palette colors). [design §2.4 Future Considerations]
- [ ] **8D.5.3** **Export color cycling as Godot metadata** — emit `color_cycling` entries as a `metadata/color_cycling` section in the SpriteFrames `.tres` resource, readable at runtime via `get_meta("color_cycling")`. [design §2.4 Future Considerations]

#### 8D.6 Bitmap Font Workflow

- [ ] **8D.6.1** **`scaffold_bitmap_font` prompt** — guide creation of fixed-width glyph grid asset with character mapping.
- [ ] **8D.6.2** **`bitmap_font` export action** — output glyph atlas PNG + Godot `BitmapFont` `.tres` resource.

#### 8D.7 Testing

- [ ] **8D.7.1** **Background removal tests** — matching pixels replaced with 0; non-matching unchanged; ignores selection.
- [ ] **8D.7.2** **Interpolation tests** — correct number of intermediate frames inserted; boundary frames unchanged; command undo removes inserted frames; non-image layers skipped; LinkedCel resolution; type mismatch error; interpolated frames inherit duration from frame_start.
- [ ] **8D.7.3** **Scale2x tests** — output dimensions correct; known pattern produces expected smoothed output; error on non-power-of-2 scale factor.
- [ ] **8D.7.4** **Jaggy detection tests** — known staircase pattern detected; clean diagonal not flagged; report structure correct.
- [ ] **8D.7.5** **Color cycling tests** — metadata roundtrip (save/load preserves entries); `set_color_cycling` command undo/redo via AssetMetadataCommand; validation rejects `start_index >= end_index`, out-of-range indices, `speed_ms <= 0`; Godot export includes `metadata/color_cycling` in `.tres`.
- [ ] **8D.7.6** **Bitmap font tests** — prompt registration and argument validation; export produces glyph atlas with correct dimensions.

> **Definition of Done — Phase 8D:** All Tier 4 features implemented and tested. Background removal, animation interpolation, Scale2x upscaling, jaggy detection, color cycling, and bitmap font workflow all have passing tests.

---

## Dependency Graph

```
Phase 0 (Prep) ✅ COMPLETE
  ├── 0.4 CLAUDE.md ✅
  └── 0.7 Error factory ✅ — used by all tool handlers

Phase 1 (Core Model & Algorithms)
  ├── 1.1 Types ✅ ─────────────────────┐
  ├── 1.2 Classes ✅ (depends on 1.1)   │
  ├── 1.3 Command System (1.1, 1.2)     │  ← next: wire into Workspace
  ├── 1.4 File I/O (1.1, 1.2)           │  ← uses classes' toJSON/fromJSON
  ├── 1.5 Algorithms (independent)      │  ← parallelizable with 1.3/1.4
  │     ├── 1.5.1-8 (drawing, geometry, patterns)
  │     ├── 1.5.9 bin-packing (for 3.4.6 atlas)
  │     └── 1.5.10 image compositing (for 3.4.2+ and Phase 4)
  └── 1.6 Testing (depends on all ↑)    │
        ├── 1.6.1-4 ✅ (types & classes)
        └── 1.6.5-10 (commands, I/O, algorithms)
                                         │
Phase 2 (Basic Tools — depends on Phase 1)
  ├── 2.1 External deps (install early: pngjs, gifenc)
  ├── 2.2 Server Bootstrap (2.2.2 ✅ — getWorkspace() exists)
  ├── 2.3 Minimum Viable Loop ──────────┤
  │     ├── 2.3.1 project (init/open/info) (1.2 Project, 1.4)
  │     ├── 2.3.2 workspace (1.2 Workspace, 1.3, 1.4)
  │     ├── 2.3.3 palette (core) (1.2 Palette, 1.3)
  │     ├── 2.3.4 asset (1.2 Asset, 1.3, 1.4, 1.5)
  │     ├── 2.3.5 draw (1.2 Asset, 1.3, 1.5)
  │     └── 2.3.6 MVL integration test
  ├── 2.4 selection (1.1.8 SelectionMask, 1.2 Workspace)
  │     └── clipboard ops (paste depends on draw pattern)
  └── 2.5 Complete Basic Tools
        ├── 2.5.1 draw + selection masking (depends on 2.4)
        ├── 2.5.2 palette remaining (load/save: 1.4; fetch_lospec: 2.1.3)
        ├── 2.5.3 asset remaining (shapes, banding: 1.5.7, collision: 1.5.4+1.5.5)
        ├── 2.5.4 draw isometric ops (2.3.5 draw + iso projection)
        └── 2.5.5 project add_file (2.1.1 PNG lib + 1.5.6 quantization)

Phase 3 (Advanced Tools — depends on Phase 2)
  ├── 3.1 transform
  │     ├── 3.1.0 algorithms: transform.ts (rotate/flip/shear/shift pure functions)
  │     └── 3.1.1 tool handler (follows 2.3.5 draw pattern)
  ├── 3.2 effect
  │     ├── 3.2.0 algorithms: gradient.ts, dither.ts, outline.ts, auto-aa.ts, motion.ts
  │     └── 3.2.1 tool handler (follows 2.3.5 draw pattern)
  ├── 3.3 tileset
  │     ├── 3.3.0 algorithm: autotile.ts (blob47/4side/4corner + Godot peering bits)
  │     └── 3.3.1 tool handler (1.2 Asset tileset fields)
  └── 3.4 export
        ├── 3.4.0 prerequisites: upscale util, Godot .png.import sidecar template
        ├── 3.4.1 core exports (png, gif, strip, atlas, per_tag)
        │     └── 3.4.1.2 compositing integration (wires 1.5.10 into export pipeline)
        ├── 3.4.2 Godot exports (spriteframes, tileset, static)
        │     ├── 3.4.2.1-4 godot_spriteframes (strip + sidecar + .tres + shapes)
        │     ├── 3.4.2.5 godot_tileset (atlas + sidecar + .tres with collision/terrain)
        │     └── 3.4.2.6 godot_static (composite + sidecar, no .tres)
        └── 3.4.3 export tests

Phase 4 (Resources & Prompts)
  ├── 4.1 Resources (depends on 1.5.10 compositing + 3.4.1.2 export integration)
  │     ├── 4.1.1-6 resource renderers (compositing + pngjs/gifenc encoding)
  │     └── 4.1.7 resource links in tool responses (cross-cuts all mutation tools)
  └── 4.2 Prompts (depends on full tool surface from Phases 2-3)

Phase 5 (Integration & Polish — depends on everything)
  ├── 5.1 Error handling audit (verifies §2.6 catalog across all tools)
  ├── 5.2 Tool surface completeness check (verifies all 10 tools × all actions)
  ├── 5.3 E2E integration tests
  │     ├── 5.3.1 character sprite workflow (Phases 2-3 tools + godot_spriteframes)
  │     ├── 5.3.2 tileset workflow (tileset tool + godot_tileset export)
  │     ├── 5.3.3 equipment workflow (cross-asset + per_tag export + export pattern)
  │     ├── 5.3.4 recolor workflow (create_recolor + recolor_of registry)
  │     ├── 5.3.5 variant resolution (variants map + load_asset variant param)
  │     ├── 5.3.6 palette lifecycle (fetch_lospec + save + load + generate_ramp)
  │     ├── 5.3.7 PNG import (project add_file + quantize + register)
  │     ├── 5.3.8 undo/redo stress (multi-tool, multi-asset)
  │     ├── 5.3.9 linked cel lifecycle (resolution + write-break + undo restore)
  │     ├── 5.3.10 selection workflow (masking + clipboard + cross-asset paste)
  │     └── 5.3.11 MCP resources integration (Phase 4 resources in E2E context)
  ├── 5.4 CLAUDE.md update
  └── 5.5 Documentation (README + example project)

Phase 6 (UI Art Assets — depends on Phases 1-5)
  ├── 6.1 Nine-Slice types & class (NineSlice interface, Asset optional field, getter/setter)
  ├── 6.2 NineSliceCommand (undo/redo for nine_slice mutations)
  ├── 6.3 Asset tool: set_nine_slice (action + validation + create convenience)
  ├── 6.4 Godot resource generation (StyleBoxTexture, AtlasTextures)
  ├── 6.5 Export actions (godot_ui_frame, godot_atlas)
  ├── 6.6 MCP Prompts (scaffold_ui_icons, scaffold_ui_frame)
  └── 6.7 Testing (unit + tool + prompt + E2E)

Phase 7 (MCP App — depends on Phases 1-6)
  ├── 7.1 Infrastructure (Vite + ext-apps SDK + optional HTTP transport)
  ├── 7.2 Server-side tool + resource (open_editor, get_asset_state, ui:// resource)
  ├── 7.3 UI: CanvasRenderer (indexed→RGBA composite, zoom, pan)
  ├── 7.4 UI: PalettePanel (swatch grid, active color)
  ├── 7.5 UI: LayerPanel (layer list, visibility toggle, active layer)
  ├── 7.6 UI: FrameTimeline (scrubber, play/pause, tag spans)
  ├── 7.7 UI: DrawingToolbar (pencil, eraser, eyedropper, fill, undo/redo)
  ├── 7.8 UI: Selection + context bridge (rect select, marching ants, "Reference in AI")
  ├── 7.9 UI: App shell + state (App.connect, ontoolresult, auto-refresh)
  └── 7.10 Testing (CanvasRenderer unit tests + tool tests + smoke test)

Phase 8 (Extended Features — depends on Phases 1-7)
  ├── 8A LLM Workflow Optimizations (Tier 1)
  │     ├── 8A.1 Frame range batch ops (new command + draw/transform/effect wiring)
  │     ├── 8A.2 Linked cel creation (new command + asset tool action)
  │     ├── 8A.3 Per-layer spritesheet export (export tool)
  │     ├── 8A.4 Hue-shifting ramps (color-utils algorithm + palette tool)
  │     ├── 8A.5 Selective outline (outline algorithm extension + effect tool)
  │     ├── 8A.6 Color replace (draw tool operation)
  │     ├── 8A.7-8 scaffold_attack + scaffold_side_scroller prompts
  │     └── 8A.9 Testing
  ├── 8B Godot Import Completeness (Tier 2, parallelizable with 8A; depends on 1.1 types + 3.3 tileset)
  │     ├── 8B.1 Animated tiles (asset storage + tileset action + clear action + .tres emission)
  │     ├── 8B.2 Custom data layers (asset storage + tileset action + clear action + .tres emission)
  │     ├── 8B.3 Occlusion polygons (set_tile_physics extension + .tres emission)
  │     ├── 8B.4 Tile alternatives (asset storage + tileset action + remove action + .tres emission)
  │     ├── 8B.5 Grid spritesheet export
  │     ├── 8B.6 Per-tag side-scroller verification
  │     └── 8B.7 Testing
  ├── 8C Workflow Breadth (Tier 3, after 8A prompts for consistency)
  │     ├── 8C.1 Enhance scaffold_character (role + behavioral states)
  │     ├── 8C.2-4 scaffold_vfx, scaffold_parallax, scaffold_props prompts
  │     ├── 8C.5 Normal map generation (algorithm + export action)
  │     ├── 8C.6 Palette swap LUT (algorithm + export action)
  │     └── 8C.7 Testing
  └── 8D Nice to Have (Tier 4, after 8A-8C)
        ├── 8D.1 Background removal effect
        ├── 8D.2 Animation interpolation (algorithm + asset action)
        ├── 8D.3 Scale2x upscaling (algorithm + export param)
        ├── 8D.4 Jaggy detection (algorithm + asset action)
        ├── 8D.5 Color cycling (asset metadata + palette action + export)
        ├── 8D.6 Bitmap font (prompt + export action)
        └── 8D.7 Testing
```

## Implementation Rules

### Verification Procedure
Every new execution plan provided for an implementation step MUST explicitly include the following full validation commands in its Verification Plan section, to ensure zero regressions in typing, formatting, style, or existing functionality:

```bash
npm run format && npm run format:check
npm run lint
npm run typecheck
npm run test
```
