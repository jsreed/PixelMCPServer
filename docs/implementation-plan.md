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

- [ ] **3.4.0.1** **Nearest-neighbor upscale** — `upscale(buffer: Uint8Array, width, height, scaleFactor): Uint8Array` multiplies each pixel into an N×N block in the output RGBA buffer. Used by all export actions that accept `scale_factor`. Can live in `src/algorithms/composite.ts` or a new `src/algorithms/upscale.ts`.
- [ ] **3.4.0.2** **Godot `.png.import` sidecar template** — shared function `generateGodotImportSidecar(pngPath, resourceType?)` that writes the standard Godot 4.x import file: `[remap]` section with `type="CompressedTexture2D"`, `[deps]` with `source_file`, `dest_files`, and `[params]` with `compress/mode=0` (lossless), `mipmaps/generate=false`, `roughness/mode=0`. Reused by `godot_spriteframes` (3.4.3), `godot_tileset` (3.4.4), and `godot_static` (3.4.5).
- [ ] **3.4.0.3** **Export prerequisite tests** — upscale correctness at 1×/2×/4× factors, sidecar file content validation against expected Godot format.

#### 3.4.1 Tool Handler — Core Exports

- [ ] **3.4.1.1** **Zod schema** — discriminated union on `action`: `png`, `gif`, `spritesheet_strip`, `atlas`, `per_tag`, `godot_spriteframes`, `godot_tileset`, `godot_static`. Parameters: `asset_name`, `path` (required), `scale_factor` (optional int, default 1), `pad`/`extrude` (optional bools for atlas), `tags` (optional string array for per_tag).
- [ ] **3.4.1.2** **Image compositing integration** — wire `compositeFrame()` from `src/algorithms/composite.ts` into the export pipeline. Each export action calls `compositeFrame(asset, frameIndex)` → receives `Uint8Array` RGBA buffer → optionally upscales → encodes to target format.
- [ ] **3.4.1.3** **`png`** — composite frame 0 (or specified frame), upscale by `scale_factor`, encode via `pngjs`, write to `path`.
- [ ] **3.4.1.4** **`gif`** — composite each frame, upscale, encode via `gifenc` with per-frame `duration_ms` delays. Write to `path`.
- [ ] **3.4.1.5** **`spritesheet_strip`** — composite all frames, lay out horizontally in a single row, upscale, encode as PNG. Output dimensions: `(width × frame_count × scale) × (height × scale)`.
- [ ] **3.4.1.6** **`atlas`** — bin-pack all loaded assets (frame 0 each) using `bin-pack.ts`. Optional `pad` (1px transparent gap) and `extrude` (repeat edge pixels). Upscale, encode as PNG. Return atlas metadata (asset → region mapping).
- [ ] **3.4.1.7** **`per_tag`** — iterate frame tags (or `tags` subset), apply `export-pattern.ts` token substitution with each tag's name/facing/frame data, export each as a strip PNG to `path` directory. Return list of generated file paths.

#### 3.4.2 Tool Handler — Godot Exports

- [ ] **3.4.2.1** **`godot_spriteframes` — strip PNG** — composite all frames into horizontal strip, upscale by `scale_factor`, write `{name}_strip.png`.
- [ ] **3.4.2.2** **`godot_spriteframes` — import sidecar** — generate `{name}_strip.png.import` using shared sidecar template ([§3.4.0.2](#3402-godot-pngimport-sidecar-template)).
- [ ] **3.4.2.3** **`godot_spriteframes` — `.tres` SpriteFrames resource** — generate Godot 4.x text resource. Each frame tag → named animation. Frame regions as `AtlasTexture` sub-resources into the strip. FPS via GCD method: `GCD(all_durations)` → `animation_fps = 1000 / GCD` → `relative_duration = frame_ms / GCD`. Ping-pong tags expanded: `[A, B, C]` → `[A, B, C, B]` (reverse excluding final frame to avoid double-display).
- [ ] **3.4.2.4** **`godot_spriteframes` — optional shapes export** — if asset has shape layers, export `{name}_shapes.tres` as a Godot `Animation` resource with keyed `CollisionShape2D` shape data per frame. Each shape layer → separate track, using `role` as track path hint.
- [ ] **3.4.2.5** **`godot_tileset`** — composite tileset into atlas PNG, upscale, write `{name}.png` + `{name}.png.import`. Generate `{name}.tres` as Godot `TileSet` text resource: `TileSetAtlasSource` referencing atlas, tile size from `tile_width`/`tile_height`. Embed per-tile collision polygons from `tile_physics`. If `tile_terrain` exists, include terrain set with `TERRAIN_MODE_MATCH_CORNERS_AND_SIDES` (blob47) or appropriate mode, plus per-tile `terrain_peering_bits`.
- [ ] **3.4.2.6** **`godot_static`** — composite frame 0 (all visible layers), upscale, write `{name}.png` + `{name}.png.import`. No `.tres` resource.

#### 3.4.3 Export Tests

- [ ] **3.4.3.1** **Core export tests** — PNG output dimensions and pixel spot-checks at various scale factors, GIF frame count and delay values, spritesheet strip dimensions match `width × frames × scale`, atlas packing (no overlap, bounds fit, padding/extrusion), per_tag filename generation from export pattern.
- [ ] **3.4.3.2** **Godot export tests** — `.tres` SpriteFrames structure validation (animation names match tags, frame count correct, GCD FPS calculation, ping-pong expansion), `.tres` TileSet structure (tile size, collision polygon embedding, terrain peering bits), `.png.import` sidecar format validation, `godot_static` produces only PNG + import (no .tres).

> **Definition of Done — Phase 3:** All 10 MCP tools from the design spec are implemented and tested. All prerequisite algorithms have dedicated unit tests. Export produces valid output files for each format. Godot .tres resources are structurally valid.

---

## Phase 4: MCP Resources & Prompts

### 4.1 MCP Resources (Visual Previews)

These require the image compositing engine from [§3.4.2](#342-image-compositing-engine).

- [ ] **4.1.1** **Resource URI router** — parse `pixel://view/...` URIs, dispatch to renderers
- [ ] **4.1.2** **Asset view** — `pixel://view/asset/{name}` and `/frame/{index}` — composite to PNG
- [ ] **4.1.3** **Layer view** — `pixel://view/asset/{name}/layer/{id}` and `/{frame_index}` — single layer PNG
- [ ] **4.1.4** **Animation view** — `pixel://view/animation/{name}/{tag}` — render tagged frames as animated GIF
- [ ] **4.1.5** **Palette view** — `pixel://view/palette/{name}` — rendered palette swatch grid PNG
- [ ] **4.1.6** **Tileset view** — `pixel://view/tileset/{name}` — rendered tile grid PNG
- [ ] **4.1.7** **Resource links in tool responses** — mutation tools include relevant `pixel://` URIs in response content
- [ ] **4.1.8** **Resource tests** — URI routing, each resource type returns valid image data, resource links present in mutation tool responses

### 4.2 MCP Prompts (Workflow Templates)

- [ ] **4.2.1** **Prompt registration** — register prompts with the MCP server using the SDK's prompt API
- [ ] **4.2.2** **`scaffold_character`** — generate messages array guiding character creation: palette, layers, directional tags, optional hitbox
- [ ] **4.2.3** **`scaffold_tileset`** — generate messages for blob47 tileset creation workflow
- [ ] **4.2.4** **`scaffold_equipment`** — generate messages for modular equipment with fit variants
- [ ] **4.2.5** **`analyze_asset`** — generate messages prompting asset critique (palette usage, banding, completeness)
- [ ] **4.2.6** **`export_for_godot`** — generate messages guiding correct export action selection
- [ ] **4.2.7** **Prompt tests** — each prompt returns valid `messages` array, argument validation, message content references correct tool names

> **Definition of Done — Phase 4:** All resource URIs resolve and return valid image data. All prompts return well-formed message arrays. Resource links appear in mutation tool responses.

---

## Phase 5: Integration & Polish

### 5.1 Error Handling Audit

- [ ] **5.1.1** **Error response audit** — verify every error from [design §2.6](design.md) is returned correctly by the corresponding tool handler
- [ ] **5.1.2** **Error recovery tests** — test that an LLM can self-correct from each domain error (e.g., "not loaded" → call `load_asset` → retry)

### 5.2 End-to-End Integration Testing

- [ ] **5.2.1** **E2E: character sprite** — project init → asset create → palette set → draw frames → add tags → export godot_spriteframes → verify output files
- [ ] **5.2.2** **E2E: tileset** — project init → asset create (with tile dims) → draw tiles at slot indices → autotile_generate → set_tile_physics → export godot_tileset → verify .tres
- [ ] **5.2.3** **E2E: equipment** — create base character + sword assets → draw on both → copy/paste cross-asset → export per_tag
- [ ] **5.2.4** **E2E: undo/redo stress** — perform diverse mutations across multiple loaded assets, undo all, verify state matches initial
- [ ] **5.2.5** **E2E: linked cel lifecycle** — create linked cel → read (verify resolution) → write (verify link break) → undo (verify link restored)
- [ ] **5.2.6** **E2E: selection workflow** — select region → draw (verify constrained) → copy → paste to different asset → verify pixel data

### 5.3 CLAUDE.md Update

- [ ] **5.3.1** **Update CLAUDE.md** to reflect final architecture, tool list, and file layout

### 5.4 Documentation

- [ ] **5.4.1** **README** — usage instructions, MCP client configuration, example tool calls
- [ ] **5.4.2** **Example project** — a minimal `pixelmcp.json` + asset files demonstrating the format

> **Definition of Done — Phase 5:** All E2E tests pass. Error audit confirms full coverage. README and example project are complete.

---

## Phase 6: MCP App (Stretch)

Maybe. This would add a GUI client. Not committed.

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
  ├── 4.1 Resources (depends on 3.4.2 compositing)
  └── 4.2 Prompts (depends on full tool surface)

Phase 5 (Polish — depends on everything)
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
