# PixelMCPServer

A headless pixel art engine exposed as a [Model Context Protocol (MCP)](https://modelcontextprotocol.io/) server. Enables LLMs and AI agents to create, animate, and export production-ready 2D game art — sprites, tilesets, and animations — entirely through structured tool calls.

## What Is This?

PixelMCPServer acts as a **"Headless Aseprite"** for AI. Instead of clicking in a GUI, an LLM calls MCP tools to:

- **Draw pixel art** — primitives (line, rect, circle, fill), bulk pixel writes, and isometric helpers
- **Manage palettes** — indexed color (up to 256 entries), Lospec integration, color ramps
- **Animate** — multi-frame sequences with per-frame timing, directional tags, ping-pong playback
- **Build tilesets** — tile extraction, autotile generation (blob47, 4side, 4corner), per-tile collision data
- **Export for game engines** — PNG, GIF, spritesheets, texture atlases, and native Godot 4.x resources (`SpriteFrames`, `TileSet`)

The server uses the agent-friendly MCP protocol, which means any MCP-compatible client (Claude, Cursor, Cline, etc.) can use it.

## Key Design Decisions

### Indexed Color

All pixel data stores palette indices (0–255), not raw RGBA values. This enables instant global color swapping, palette-based effects, and memory-efficient storage — the same approach used by classic pixel art tools like Aseprite.

### Polymorphic Action-Based Tools

Modern agent frameworks impose tool-count limits. Instead of one tool per operation, the server exposes **10 polymorphic tools**, each with an `action` parameter that selects the specific operation. This keeps the tool count low while providing a comprehensive creative surface.

### JSON Asset Format

Assets are stored as human-readable JSON files with pixel data in **row integer array** format (`data[y][x]` = palette index). This is intentional for AI workflows: the format is inspectable, diff-friendly, and parsable without a specialized decoder. When actual images are needed, the server's export pipeline produces standard formats.

### Explicit Targeting

Every tool call requires explicit `asset_name`, `layer_id`, and `frame_index` parameters — no implicit "active layer" or "current frame." This eliminates ambiguity in LLM-driven workflows.

## Tools

| Tool | Purpose | Key Actions |
|------|---------|-------------|
| **`project`** | On-disk project config | `init`, `open`, `info`, `add_file` (PNG import with auto-quantization) |
| **`workspace`** | In-memory session | `load_asset`, `unload_asset`, `save`, `save_all`, `undo`, `redo`, `info` |
| **`asset`** | Asset structure | `create`, `info`, `get_cel`, `get_cels`, `resize`, `duplicate`, `delete`, layer/frame/tag/shape CRUD, `detect_banding`, `generate_collision_polygon` |
| **`draw`** | Pixel manipulation | `pixel`, `line`, `rect`, `circle`, `ellipse`, `fill`, `write_pixels`, `iso_tile`, `iso_cube`, `iso_wall` |
| **`transform`** | Geometric transforms | `rotate` (90° increments), `flip_h`, `flip_v`, `shear`, `shift` |
| **`effect`** | Texturing & refinement | `gradient`, `checkerboard`, `noise`, `ordered_dither`, `error_diffusion`, `auto_aa`, `outline`, `cleanup_orphans`, `subpixel_shift`, `smear_frame` |
| **`tileset`** | Tile management | `extract_tile`, `place_tile`, `autotile_generate`, `set_tile_physics` |
| **`export`** | File output | `png`, `gif`, `spritesheet_strip`, `atlas`, `per_tag`, `godot_spriteframes`, `godot_tileset`, `godot_static` |
| **`palette`** | Color management | `info`, `set`, `set_bulk`, `swap`, `load`, `save`, `fetch_lospec`, `generate_ramp` |
| **`selection`** | Masks & clipboard | `rect`, `all`, `clear`, `invert`, `by_color`, `copy`, `paste`, `cut` |

### Batched Operations

`draw`, `transform`, and `effect` accept an **operations array** — multiple actions in a single call, sharing one undo step. This eliminates per-operation round trips while keeping the API consistent.

## Data Model

```
Project (on disk: pixelmcp.json)
  └── Asset Registry (logical name → file path)

Workspace (in memory, not persisted)
  ├── Loaded Assets
  ├── Undo/Redo History
  └── Active Selection

Asset (on disk: .json file)
  ├── Palette (up to 256 RGBA entries)
  ├── Layers (image, tilemap, shape, group)
  ├── Frames (each with duration_ms)
  ├── Cels (layer × frame → pixel data)
  └── Tags (animation sequences, layer groups)
```

## MCP Resources

Visual preview resources for clients that support them (supplementary — LLMs read state via tool actions):

| URI Pattern | Returns |
|-------------|---------|
| `pixel://view/asset/{name}` | Composited PNG (all visible layers, frame 0) |
| `pixel://view/asset/{name}/frame/{index}` | Composited PNG of a specific frame |
| `pixel://view/asset/{name}/layer/{id}` | Single layer PNG |
| `pixel://view/animation/{name}/{tag}` | Animated GIF of a tagged sequence |
| `pixel://view/palette/{name}` | Palette swatch grid PNG |
| `pixel://view/tileset/{name}` | Tile grid PNG |

## MCP Prompts

Workflow templates invoked by the user (e.g., via slash commands) to seed the LLM's context:

- **`scaffold_character`** — guide character sprite creation (palette, layers, directional tags, hitbox)
- **`scaffold_tileset`** — guide blob47 autotile tileset creation
- **`scaffold_equipment`** — guide modular equipment with fit variants
- **`analyze_asset`** — critique palette usage, banding, completeness
- **`export_for_godot`** — determine correct export action for an asset

## Godot Integration

The server produces first-class Godot 4.x resources:

- **`godot_spriteframes`** — `SpriteFrames` `.tres` with per-tag animations, `AtlasTexture` sub-resources, GCD-based FPS, ping-pong expansion, and optional collision shape animation tracks
- **`godot_tileset`** — `TileSet` `.tres` with `TileSetAtlasSource`, per-tile collision polygons, navigation polygons, and terrain peering bits (blob47/4side/4corner)
- **`godot_static`** — composited PNG + import sidecar for non-animated assets
- All exports include `.png.import` sidecars with pixel art defaults (lossless compression, no mipmaps)

## File Formats

### `pixelmcp.json` — Project File

Root configuration. Contains the asset registry, naming conventions (`export_pattern`), and project defaults (tile size, export scale, default palette). No pixel data.

### `.json` — Asset File

Self-contained art asset with palette, layer hierarchy, frames, cels (pixel data as palette index arrays), and tags. Supports image layers, tilemap layers, shape layers (collision geometry), group layers, and linked cels (shared frames without data duplication).

### `.json` — Palette File

Shared palette (`{ name, colors: [[r,g,b,a], ...] }`) for cross-asset color consistency.

## Getting Started

### Prerequisites

- Node.js 18+
- npm

### Install

```bash
git clone https://github.com/jsreed/PixelMCPServer.git
cd PixelMCPServer
npm install
```

### Build & Run

```bash
npm run build    # Compile TypeScript
npm run start    # Run the MCP server on stdio
```

Or for development:

```bash
npm run dev      # Run directly with tsx (no build step)
```

### MCP Client Configuration

**Claude Desktop** — add to `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS) or `%APPDATA%\Claude\claude_desktop_config.json` (Windows):

```json
{
  "mcpServers": {
    "pixelmcpserver": {
      "command": "node",
      "args": ["/path/to/PixelMCPServer/dist/index.js"]
    }
  }
}
```

**Cursor / Cline** — same JSON format, placed in the tool's MCP config file (e.g., `.cursor/mcp.json` or Cline's MCP settings).

**Claude Code** — run once from any directory:

```bash
claude mcp add pixelmcpserver -- node /path/to/PixelMCPServer/dist/index.js
```

## Example Project

The [`example/`](example/) directory contains a minimal sample project demonstrating the file formats:

- **`example/pixelmcp.json`** — project config with conventions, defaults, and two registered assets
- **`example/palettes/game.json`** — a shared 12-color palette file
- **`example/assets/hero.json`** — 16×16 character sprite: 2 image/shape layers, 2 idle frames with a `ping_pong` facing-S animation tag, linked hitbox cel
- **`example/assets/coin.json`** — 8×8 item sprite: 4-frame spin animation (`forward` loop), linked cel for the reverse-oval frame

Open it with the server:

```json
{ "tool": "project", "action": "open", "path": "/path/to/PixelMCPServer/example" }
```

## Example: Creating a Sprite

This walkthrough shows the minimum viable loop — init a project, create an asset, draw pixels, and export.

### 1. Initialize a project

```json
{ "tool": "project", "action": "init", "path": "/my/game/art" }
```

### 2. Create an asset

```json
{
  "tool": "asset",
  "action": "create",
  "name": "player",
  "width": 16,
  "height": 24,
  "palette": [
    [0, 0, 0, 0],
    [45, 30, 20, 255],
    [120, 85, 60, 255],
    [200, 160, 120, 255]
  ],
  "layers": [
    { "name": "body", "type": "image" },
    { "name": "eyes", "type": "image" }
  ],
  "frames": [{ "duration_ms": 150 }, { "duration_ms": 150 }],
  "tags": [{ "name": "idle", "type": "frame", "start": 0, "end": 1, "direction": "ping_pong" }]
}
```

### 3. Draw pixels (batched — one undo step)

```json
{
  "tool": "draw",
  "asset_name": "player",
  "layer_id": 0,
  "frame_index": 0,
  "operations": [
    { "action": "rect", "x": 4, "y": 8, "width": 8, "height": 12, "color": 2, "filled": true },
    { "action": "fill", "x": 5, "y": 9, "color": 3 },
    { "action": "circle", "x": 8, "y": 4, "radius": 4, "color": 2, "filled": true }
  ]
}
```

### 4. Inspect pixel data

```json
{ "tool": "asset", "action": "get_cel", "asset_name": "player", "layer_id": 0, "frame_index": 0 }
```

### 5. Save

```json
{ "tool": "workspace", "action": "save", "asset_name": "player" }
```

### 6. Export to PNG

```json
{
  "tool": "export",
  "action": "png",
  "asset_name": "player",
  "output_path": "/my/game/art/exports/player.png",
  "scale_factor": 2
}
```

### Godot export

To produce a `SpriteFrames` `.tres` ready for Godot 4.x:

```json
{
  "tool": "export",
  "action": "godot_spriteframes",
  "asset_name": "player",
  "output_dir": "/my/game/art/exports"
}
```

This writes `player.png`, `player.png.import`, and `player.tres` — import directly into your Godot project.

## Project Structure

```
src/
├── index.ts              # Entry point — registers tools, starts stdio transport
├── errors.ts             # Shared error factory for domain errors
├── types/                # Interfaces & discriminated unions (no runtime logic)
├── classes/              # Stateful classes — Palette, Asset, Project, Workspace
├── commands/             # Command pattern (undo/redo) — one class per mutation category
├── io/                   # File I/O — read/write asset, project, and palette JSON files
├── algorithms/           # Pure functions — drawing, geometry, compositing, dithering, autotile
├── tools/                # MCP tool handlers — one file per tool (10 files, 1:1 with design spec)
├── resources/            # MCP Resource handlers — visual preview rendering (PNG/GIF)
└── prompts/              # MCP Prompt handlers — workflow templates
```

- **`types/`** — pure interfaces and discriminated unions, no runtime logic. Imported by everything.
- **`classes/`** — stateful classes that enforce data model invariants. No MCP awareness.
- **`commands/`** — undo/redo command classes (one per mutation category: cel write, layer, frame, tag, etc.).
- **`io/`** — file serialization. Models handle `toJSON()`/`fromJSON()`; `io/` handles `fs` read/write.
- **`algorithms/`** — pure functions with no model dependencies. Independently testable. Covers drawing primitives (Bresenham, midpoint circle/ellipse, flood fill), geometry (marching squares, RDP simplification), effects (gradient, dither, outline, auto-AA), compositing, bin-packing, autotile bitmask computation, and more.
- **`tools/`** — thin MCP wrappers. Each file exports `register*Tool(server)` which calls `server.registerTool()` with a Zod schema and delegates to models/algorithms.
- **`resources/`** — `pixel://view/...` URI handlers for visual previews.
- **`prompts/`** — workflow template generators (scaffold_character, scaffold_tileset, etc.).
- **Tests** are colocated as `*.test.ts` next to their source files.

## Development

```bash
npm run test         # Run tests (Vitest)
npm run test:watch   # Watch mode
npm run lint         # ESLint (type-aware)
npm run typecheck    # tsc --noEmit
npm run format       # Prettier
```

### Tech Stack

- **Runtime:** Node.js (ES2022, ESM)
- **Language:** TypeScript (strict mode)
- **MCP SDK:** `@modelcontextprotocol/sdk` — `McpServer` high-level API with Zod schema validation
- **Schema Validation:** Zod
- **Testing:** Vitest
- **Linting:** ESLint (flat config, `strictTypeChecked`) + Prettier

## Documentation

- [`docs/design.md`](docs/design.md) — architecture specification and full API reference
- [`docs/implementation-plan.md`](docs/implementation-plan.md) — phased build plan
- [`docs/research/`](docs/research/) — supporting research (pixel art workflows, Godot asset metadata, example LLM chat scenarios)

## License

UNLICENSED
