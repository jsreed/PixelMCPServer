# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

PixelMCPServer is a **headless pixel art engine** exposed as a [Model Context Protocol (MCP)](https://modelcontextprotocol.io/) server. It enables LLMs and AI agents to create, animate, and export production-ready 2D game art — sprites, tilesets, and animations — entirely through structured tool calls, with no GUI required. Think of it as a "Headless Aseprite" for AI.

The project is in early development. The full architecture is defined in [`docs/design.md`](docs/design.md) and the phased build plan is in [`docs/implementation-plan.md`](docs/implementation-plan.md).

## Commands

```bash
npm run dev          # Run server with tsx (live TypeScript execution)
npm run build        # Compile TypeScript (tsc) to dist/
npm run start        # Run compiled dist/index.js
npm run lint         # ESLint check (type-aware, strictTypeChecked)
npm run format       # Prettier format src/**/*.ts
npm run format:check # Prettier check (no write)
npm run typecheck    # tsc --noEmit
npm run test         # Vitest single run
npm run test:watch   # Vitest watch mode
```

## Architecture

### Directory Structure

```
src/
├── index.ts                       # Entry point — thin. Imports register*() functions, starts stdio.
├── errors.ts                      # Shared error factory — typed constructors for all domain errors
│
├── types/                         # Interfaces & discriminated unions (no runtime logic)
│   ├── index.ts                   #   Barrel re-export
│   ├── palette.ts                 #   Palette, PaletteIndex type alias
│   ├── layer.ts                   #   ImageLayer | TilemapLayer | ShapeLayer | GroupLayer
│   ├── cel.ts                     #   ImageCel | TilemapCel | ShapeCel | LinkedCel, cel key helpers
│   ├── frame.ts                   #   Frame interface
│   ├── tag.ts                     #   FrameTag | LayerTag, Direction/Facing enums
│   ├── shape.ts                   #   RectShape | PolygonShape
│   ├── asset.ts                   #   Asset interface
│   ├── project.ts                 #   ProjectConfig, AssetRegistryEntry, Conventions, Defaults
│   └── selection.ts               #   SelectionMask interface
│
├── classes/                       # Stateful classes (enforce invariants, no MCP awareness)
│   ├── palette.ts                 #   Palette class — get/set/swap/setBulk/toJSON/fromJSON
│   ├── asset.ts                   #   Asset class — layer/frame/cel/tag/shape CRUD, resize, dirty tracking
│   ├── project.ts                 #   Project class — init/open/info, registry, path resolution, defaults
│   └── workspace.ts               #   Workspace singleton — loaded assets, clipboard, selection, getWorkspace()
│
├── commands/                      # Command pattern (undo/redo)
│   ├── command.ts                 #   Command interface + CommandHistory class
│   ├── palette-command.ts         #   PaletteCommand
│   ├── cel-write-command.ts       #   CelWriteCommand — captures full cel data snapshot
│   ├── layer-command.ts           #   LayerCommand — add/remove/reorder
│   ├── frame-command.ts           #   FrameCommand — captures frames + cels + tag shifts
│   ├── tag-command.ts             #   TagCommand
│   ├── shape-command.ts           #   ShapeCommand
│   ├── resize-command.ts          #   ResizeCommand — captures all cel data + dimensions
│   └── asset-delete-command.ts    #   AssetDeleteCommand — captures registry entry
│
├── io/                            # File I/O (serialization to/from disk)
│   ├── asset-io.ts                #   loadAssetFile() / saveAssetFile()
│   ├── project-io.ts              #   loadProjectFile() / saveProjectFile()
│   └── palette-io.ts              #   loadPaletteFile() / savePaletteFile()
│
├── algorithms/                    # Pure functions (no model deps, independently testable)
│   ├── bresenham.ts               #   Line drawing
│   ├── midpoint.ts                #   Circle & ellipse rasterization
│   ├── flood-fill.ts              #   Scanline flood fill
│   ├── marching-squares.ts        #   Contour tracing
│   ├── rdp.ts                     #   Ramer-Douglas-Peucker simplification
│   ├── quantize.ts                #   Color quantization (median cut)
│   ├── banding.ts                 #   Banding detection
│   ├── export-pattern.ts          #   Token substitution with separator-drop logic
│   ├── bin-pack.ts                #   Rectangle packing for atlas export
│   ├── composite.ts               #   Layer compositing — indexed→RGBA, opacity, visibility
│   ├── iso-projection.ts          #   Dimetric 2:1 projection helpers
│   ├── gradient.ts                #   Linear gradient generation
│   ├── dither.ts                  #   Checkerboard, ordered (Bayer), error diffusion, noise
│   ├── outline.ts                 #   Outline generation
│   ├── auto-aa.ts                 #   Automatic anti-aliasing at convex corners
│   ├── motion.ts                  #   Subpixel shift & smear frame
│   ├── autotile.ts                #   Blob47/4side/4corner canonical slot computation & peering bits
│   └── transform.ts               #   Rotate/flip/shear/shift pixel array operations
│
├── tools/                         # MCP tool handlers (one file per tool, thin wrappers)
│   ├── project.ts                 #   registerProjectTool(server)
│   ├── workspace.ts               #   registerWorkspaceTool(server)
│   ├── asset.ts                   #   registerAssetTool(server)
│   ├── draw.ts                    #   registerDrawTool(server)
│   ├── transform.ts               #   registerTransformTool(server)
│   ├── effect.ts                  #   registerEffectTool(server)
│   ├── tileset.ts                 #   registerTilesetTool(server)
│   ├── export.ts                  #   registerExportTool(server)
│   ├── palette.ts                 #   registerPaletteTool(server)
│   └── selection.ts               #   registerSelectionTool(server)
│
├── resources/                     # MCP Resource handlers (visual previews)
│   ├── router.ts                  #   URI parser + dispatch for pixel://view/... URIs
│   ├── asset-view.ts              #   Asset & frame composite PNG rendering
│   ├── layer-view.ts              #   Single layer/cel PNG rendering
│   ├── animation-view.ts          #   Tagged animation → GIF rendering
│   ├── palette-view.ts            #   Palette swatch grid PNG
│   └── tileset-view.ts            #   Tile grid PNG
│
└── prompts/                       # MCP Prompt handlers (workflow templates)
    ├── scaffold-character.ts      #   scaffold_character prompt
    ├── scaffold-tileset.ts        #   scaffold_tileset prompt
    ├── scaffold-equipment.ts      #   scaffold_equipment prompt
    ├── analyze-asset.ts           #   analyze_asset prompt
    └── export-for-godot.ts        #   export_for_godot prompt
```

**Structural principles:**
- **`types/` vs `classes/`** — types are pure interfaces/unions with no runtime logic; classes are stateful wrappers. Both algorithms and tool handlers can import from `types/` without pulling in class dependencies.
- **`commands/`** — undo/redo command classes live separately from models to keep the system cohesive and `models/` focused.
- **`io/`** — file I/O is separate from models. Models have `toJSON()`/`fromJSON()` for serialization; `io/` handles the actual `fs` read/write.
- **`algorithms/`** — flat directory of pure functions with no model dependencies. Each file is independently testable.
- **`tools/`** — mirrors the 10-tool design spec 1:1. Each file exports a single `register*Tool(server)` function. Tool handlers are thin wrappers: validate input → delegate to model/algorithm → format MCP response.
- **Tests colocated** — `*.test.ts` files sit next to their source (e.g., `src/algorithms/bresenham.test.ts`, `src/classes/asset.test.ts`).

### Data Model (defined in [`design.md` §2.1](docs/design.md))

The model separates on-disk project structure from the in-memory editing session. All pixel data uses **Indexed Color** (palette indices 0–255).

- **Project** — on-disk configuration (`pixelmcp.json`). Maps logical asset names to file paths. No pixel data. The "solution file."
- **Workspace** — in-memory editing session (singleton). Holds loaded assets, undo/redo history, clipboard, and active selection. Not persisted.
- **Asset** — self-contained art file (`.json`). Has dimensions, perspective, palette, layers, frames, cels, and tags. Registered in the Project.
- **Layer** — stacking plane within an asset. Types: `image` (pixels), `tilemap` (grid of tile indices), `shape` (collision/hitbox geometry), `group` (folder).
- **Frame** — a point in time with a `duration_ms`.
- **Cel** — the intersection of a Layer × Frame. Contains pixel data (image), tile grid (tilemap), shapes array (shape), or a link reference (linked cel).
- **Tag** — named label on a frame range (animation sequence) or layer set (organizational grouping). Frame tags carry optional `facing` for directional sprites.
- **Palette** — up to 256 RGBA colors. All pixel data stores indices, not raw color values.

### Target Tool Surface (10 polymorphic tools)

Each tool uses the SDK's `registerTool()` API with a Zod `inputSchema`. An `action` enum parameter discriminates operations within each tool.

| Tool | Purpose |
|------|---------|
| `project` | On-disk project config and asset registry (`init`, `open`, `info`, `add_file`) |
| `workspace` | In-memory session management (`load_asset`, `unload_asset`, `save`, `undo`, `redo`, `info`) |
| `asset` | Asset structure queries and mutations (layers, frames, tags, shapes, resize, create, delete) |
| `draw` | Pixel manipulation primitives (`pixel`, `line`, `rect`, `circle`, `ellipse`, `fill`, `write_pixels`, isometric ops) |
| `transform` | Geometric transforms (`rotate`, `flip_h`, `flip_v`, `shear`, `shift`) |
| `effect` | Procedural texturing and refinement (`gradient`, `noise`, `dither`, `auto_aa`, `outline`, `smear_frame`) |
| `tileset` | Tile management (`extract_tile`, `place_tile`, `autotile_generate`, `set_tile_physics`) |
| `export` | File output (`png`, `gif`, `spritesheet_strip`, `atlas`, `per_tag`, `godot_spriteframes`, `godot_tileset`, `godot_static`) |
| `palette` | Color management (`info`, `set`, `set_bulk`, `swap`, `load`, `save`, `fetch_lospec`, `generate_ramp`) |
| `selection` | Editing masks and clipboard (`rect`, `all`, `clear`, `invert`, `by_color`, `copy`, `paste`, `cut`) |

The `draw`, `transform`, and `effect` tools use a **batched operations array** — one undo Command per call, no per-operation round trips.


### Custom File Formats

- **`pixelmcp.json`** — project root file (asset registry, conventions, defaults). No pixel data.
- **`.json` asset files** — self-contained art assets. Pixel data in **row integer array** format (`data[y][x]` = palette index). Human-readable, diff-friendly, git-safe.
- **`.json` palette files** — shared palettes (`{ name, colors: [[r,g,b,a], ...] }`).

## Code Style

- TypeScript strict mode, ES2022 target, Node16 module resolution
- ESM project (`"type": "module"` in package.json)
- Prettier: single quotes, semicolons, trailing commas, 100 char width
- ESLint flat config with `strictTypeChecked` (type-aware rules including `no-floating-promises`, `no-misused-promises`) and prettier integration

## Rules

### TypeScript

- **Validate tool arguments with Zod via `registerTool`.** Pass a Zod shape object as `inputSchema` to `registerTool()` — the SDK validates inputs and provides typed args to the callback automatically. Never cast with `as` or manually parse `request.params.arguments`.
- **Discriminated unions for polymorphic tool actions.** Each tool has an `action` enum. Model these as discriminated unions (e.g., `type DrawOp = { action: 'pixel'; x: number; ... } | { action: 'line'; ... }`) so TypeScript narrows after checking `action`.
- **`interface` for data model types, `type` for unions.** Use `interface` for model objects (Asset, Layer, Cel, etc.) and `type` for unions and computed types.
- **No `any`.** Use `unknown` and narrow. Especially important since MCP request params are loosely typed.
- **`.js` extensions on all relative imports.** This is an ESM project with Node16 module resolution — TypeScript requires `.js` extensions in import specifiers even though the source files are `.ts`. Example: `import { Asset } from '../types/asset.js';` not `'../types/asset'` or `'../types/asset.ts'`.
- **String Template Interpolation**: When using template literals, explicitly convert variables to strings (e.g., `` `Layer ${String(id)}` ``) to satisfy `@typescript-eslint/restrict-template-expressions`.
- **Strict Checks**: Avoid redundant conditionals (`@typescript-eslint/no-unnecessary-condition`) and type assertions (`@typescript-eslint/no-unnecessary-type-assertion`). If TypeScript has narrowed a union or determined a property exists, trust it.
- **Arrow Functions & Void**: Do not return a void expression from a shorthand arrow function (`@typescript-eslint/no-confusing-void-expression`). Wrap void-returning calls in braces: `() => { myVoidCall(); }` instead of `() => myVoidCall()`.

### Import Layering

Dependencies flow in one direction. Never import upward or sideways in ways that create cycles.

```
types/          ← no internal deps (imported by everything)
errors.ts       ← no internal deps (imported by classes/, tools/)
algorithms/     ← imports only from types/
classes/        ← imports from types/, errors.ts, algorithms/
commands/       ← imports from types/, classes/
io/             ← imports from types/, classes/
tools/          ← imports from types/, classes/, commands/, io/, algorithms/
resources/      ← imports from types/, classes/, algorithms/
prompts/        ← imports from types/
```

- `algorithms/` must **never** import from `classes/` — they are pure functions that accept plain data (arrays, numbers) and return plain data.
- `classes/` must **never** import from `tools/`, `io/`, or MCP SDK types.
- `tools/` is the integration layer — it wires everything together but contains no business logic of its own.

### MCP Server Architecture

- **One file per tool handler.** Each tool exports a registration function (e.g., `registerDrawTool(server: McpServer)`) that calls `server.registerTool()` with the tool's schema and callback. The entry point imports and calls these — keep `index.ts` thin.
- **Separate data model from tool handlers.** Data model types and stateful classes live under `src/classes/`, independent of MCP concerns. Tool handlers are thin wrappers: validate input → delegate to model/algorithm → format MCP response.
- **Workspace singleton.** Expose a module-level `getWorkspace()` accessor that tool handlers import. The Workspace holds the active Project, loaded Assets, undo/redo history, clipboard, and selection state.
- **Use `console.error` for logging, never `console.log`.** stdio transport uses stdout for protocol messages — any `console.log` will corrupt the MCP stream.
- **`isError: true` for recoverable domain errors.** For domain errors (e.g., "asset not loaded", "palette index out of range"), return `{ content: [...], isError: true }` so the LLM can self-correct. Use the shared error factory in `src/errors.ts`. Protocol-level errors are handled by the SDK.

### Project-Specific

- **Indexed color everywhere.** All pixel data uses palette indices (0–255), never raw RGBA. Functions that accept color args take `number` (the palette index) and resolve via the Palette.
- **Command pattern for undo/redo.** Any mutation operation must be wrapped in a Command object with `execute()` and `undo()` methods, pushed onto the history stack. Batched operations (draw, transform, effect) produce a single Command per call.
- **Explicit targeting, no implicit state.** All tools that operate on pixel data require explicit `asset_name`, `layer_id`, and `frame_index` parameters. No "active layer" or "current frame" concept.
- **Row integer arrays for pixel data.** Pixel data is a 2D array of palette indices: `data[y][x]`. Same format in memory, on disk, and in tool I/O.

### Testing

- **Vitest** with tests colocated next to source files as `*.test.ts` (e.g., `src/tools/draw.test.ts` tests `src/tools/draw.ts`).
- **Test model logic directly, not through MCP.** Unit tests should import and call model/algorithm classes. Don't spin up an MCP server for unit tests.
- **Run a single test file:** `npx vitest run src/path/to/file.test.ts`
- **Run tests matching a name:** `npx vitest run -t "pattern"`

## Implementation Plan

Work follows the phased plan in [`docs/implementation-plan.md`](docs/implementation-plan.md). Before starting a task, check the plan for:
- **Phase ordering** — later phases depend on earlier ones (e.g., tools depend on models, export depends on compositing).
- **Task status** — checked boxes `[x]` are done; unchecked `[ ]` are pending.
- **Definition of Done** per phase — lists the acceptance criteria.

## Key Documents

- [`docs/design.md`](docs/design.md) — full architecture and API specification (the source of truth)
- [`docs/implementation-plan.md`](docs/implementation-plan.md) — phased build plan with task tracking
- [`docs/research/`](docs/research/) — supporting research (pixel art workflows, Godot import metadata, example scenarios)
