# Example LLM Chat Scenarios
This document outlines realistic examples of how a user might interact with an LLM to drive the PixelMCP server. These examples highlight how the server acts as an automated, "headless Aseprite," bridging the gap between raw pixel data and full Godot `.tres` scene integrations. The scenarios assume an architecture defined in `design.md` and a project structure matching `example-art-asset-directory.md`.

## Scenario 1: Scaffolding a New Equipment Variant (The "Slim Iron Sword")

**What the user is trying to accomplish:**
The user has a modular "paper-doll" equipment system in their Godot game (as defined in the `equipment/weapons/` directory). They need a new visual variant of the iron sword that is thinner. Because it's part of an equipment system, it must perfectly inherit the animation structure of the base character (e.g., an `idle` state and a 90-degree downward `attack` state). The user wants the LLM to generate the art, animate it to match the standard rig, and export it directly to Godot format so they can instantly test it in-engine without opening Aseprite.

**Related MCP Server Tools & Resources:**

*   **Tools:** `palette info`, `asset create`, `draw`, `selection all`, `selection copy`, `selection paste`, `transform`, `workspace save`, `export godot_spriteframes`.
*   **Resources:** `pixel://view/asset/iron_sword_slim` (PNG preview of the sprite).

**The Chat and MCP Server Flow:**

1.  **User Prompt:** *"Create a new 'slim' variant of the iron sword weapon. It needs to match our standard 16x16 character rig. Use a couple of steel greys and brown from our default palette. Make a very thin, 1-pixel wide blade pointing up-right. Frame 0 is `idle`. Frame 1 is `attack` (rotate the sword 90 degrees clockwise). Export it as Godot SpriteFrames into the slim iron sword directory."*
2.  **LLM Action (Context Gathering):** The LLM calls `{action: "info"}` on the `palette` tool to check the project's default ENDESGA-32 palette and find the exact integer indices for steel grey and leather brown.
3.  **LLM Action (Scaffolding):** The LLM calls `{action: "create"}` on the `asset` tool, passing `width: 16, height: 16`, generating two frames (`duration_ms: 100`), and scaffolding the `idle` and `attack` tags via the `tags` array parameter in a single highly-efficient call.
4.  **LLM Action (Drawing):** The LLM calls the `draw` tool for `frame_index: 0`. It passes an `operations` array with a `line` primitive for the thin 1px blade, and a few `pixel` and `rect` primitives for the brown hilt.
5.  **LLM Action (Animating):** Because Frame 1 must be the attack frame, the LLM calls `selection all`, then `selection copy` on frame 0. It calls `selection paste` targeting frame 1. It then calls the `transform` tool on frame 1 with the `rotate` operation (angle: 90) to create the downward swing.
6.  **LLM Action (Exporting):** The LLM calls `workspace save`, then `export` with the `godot_spriteframes` action, pointing at the correct path in the `assets/equipment/.../slim/` directory.
7.  **LLM Chat Response:** The agent replies confirming the exact steps taken to ensure the user knows the logic. It includes the resource link: `![Preview](pixel://view/asset/iron_sword_slim)` so the user can immediately see the sword in the chat UI.
8.  **Follow-up:** The user sees the preview and says, *"The blade is a bit too short, make it 2 pixels longer."* The LLM uses the `draw` tool line primitives to extend exactly those pixels on both frames, re-exports, and shows the updated preview.

---

## Scenario 2: Injecting Collision Metadata (Hitboxes on the "Chest")

**What the user is trying to accomplish:**
The principles of the Single Source of Truth (SSoT) Godot pipeline dictate that collision areas should be defined in the pixel art metadata, not by manually dragging nodes in Godot. The user has an animated chest (`chest_basic`) and needs a physical boundary so the player's interact-raycast can detect it. They want the LLM to inject a perfectly mapped 16x16 geometric Area2D representation over the sprite on Frame 0, but *remove* the interaction bounds on the "open" frames.

**Related MCP Server Tools & Resources:**

*   **Tools:** `workspace load_asset`, `asset info`, `asset add_layer`, `asset add_shape`, `workspace save`, `export godot_spriteframes`.

**The Chat and MCP Server Flow:**

1.  **User Prompt:** *"Load up the `chest_basic` interactable prop. We need to define an interaction boundary so the player can open it. Add a shape layer with the role 'interactable' mapped to collision layer 4. On frame 0 (the closed idle frame), add a 16x16 rectangular hitbox covering the chest. Ensure the open frames do not have this hitbox. Save it and re-export the Godot spriteframes."*
2.  **LLM Action (Context Gathering):** The LLM calls `workspace load_asset` for `chest_basic`, followed by `asset info` to understand the frame timeline (e.g., verifying that frame 0 is the closed frame, and frames 1-3 are the opening animation).
3.  **LLM Action (Structure Injection):** The LLM calls `asset add_layer` (type: `shape`, role: `interactable`, physics_layer: `4`).
4.  **LLM Action (Geometric Slicing):** The LLM calls `asset add_shape` for `frame_index: 0`. It specifies `shape_type: rect` and passes the bounds (`x:0, y:0, width:16, height:16`).
5.  **LLM Action (Exporting):** The LLM saves and calls `export godot_spriteframes`.
6.  **LLM Chat Response:** The agent replies: *"I've injected the 'interactable' shape layer. I added a 16x16 bounding box exclusively to Frame 0. I exported the asset package. Because you now have a shape layer, the exporter has generated the `chest_basic_shapes.tres` file. When you drop this into your Godot `AnimationPlayer`, the interaction Area2D will automatically be enabled on the closed frame and deactivated during the opening animation frames."*

---

## Scenario 3: Procedural Polish & Corrupted Palette Swaps

**What the user is trying to accomplish:**
The game features "corrupted" environments (as seen in the `assets/environments/tilesets/fishing_village/corruption/` directory). The user has a cloned copy of the grass tileset but doesn't have the time to manually redraw it to look corrupted. They want to leverage the LLM to procedurally alter the pixel data using specific Godot palette colors and pixel-art dither algorithms, reviewing the output visually before saving.

**Related MCP Server Tools & Resources:**

*   **Tools:** `workspace load_asset`, `palette info`, `selection by_color`, `selection clear`, `effect`.
*   **Resources:** `pixel://view/tileset/ground_corrupted` (PNG grid preview of the full tileset).

**The Chat and MCP Server Flow:**

1.  **User Prompt:** *"I'm working on the `ground_corrupted` tileset. Can you mask out ONLY the bright grass color (let me know what index that is), and apply an error diffusion dither using the void purple and sickly green from our project palette? Also, run the `cleanup_orphans` effect. Show me a preview before we export it."*
2.  **LLM Action (Context Gathering):** The LLM loads `ground_corrupted`. It calls `palette info` and reads the color breakdown. It deduces that index 5 is bright green (grass), index 12 is void purple, and index 14 is sickly green.
3.  **LLM Action (Masking):** The LLM calls `selection by_color` with `color: 5`. This creates an internal editing mask across the tileset where only the bright grass pixels can be modified.
4.  **LLM Action (Procedural Effects):** The LLM uses the `effect` tool, pushing an operations array: `[{action: "error_diffusion", color1: 12, color2: 14}, {action: "cleanup_orphans"}]`. Because of the active selection, the engine only dithers the grass, leaving the dirt/rocks untouched.
5.  **LLM Action (Deselect):** The LLM calls `selection clear`.
6.  **LLM Chat Response:** The agent replies: *"I found your grass color at index 5 and masked it. I applied the error diffusion using indices 12 and 14, and cleaned up the stray pixels. Here is the preview: `![Corrupted Preview](pixel://view/tileset/ground_corrupted)`. Should I export this as a Godot Tileset, or would you like to tweak the dither algorithm (e.g., trying `noise` or `ordered_dither` instead)?"*
7.  **Follow-up:** The user looks at the preview inline in the chat and says *"Looks a bit too noisy, let's undo and try `ordered_dither` instead."* The LLM calls `workspace undo` (which reverts the entire effects batch instantly), applies the new effect, and shows the updated preview. Once approved, it calls `export godot_tileset`.

---

## Scenario 4: Automated Tileset Physics Engineering

**What the user is trying to accomplish:**
Painting collision bounds on a TileSet inside the Godot editor is incredibly tedious, requiring dozens of clicks per tile to draw polygons. The user wants the ground tiles in their tileset to act as solid walls/floors for the player's `CharacterBody2D`. They want to automate the mathematics and injection using the MCP server so the JSON file remains the exact Single Source of Truth for physics.

**Related MCP Server Tools & Resources:**

*   **Tools:** `workspace load_asset`, `asset info`, `tileset set_tile_physics`, `export godot_tileset`.

**The Chat and MCP Server Flow:**

1.  **User Prompt:** *"Load the `ground_base` terrain tileset. We need to make the first three tiles (tiles 0, 1, and 2) completely solid. Inject full 16x16 collision physics polygons for these three tiles. Export the Godot Tileset so the physics layers are baked in."*
2.  **LLM Action (Context Gathering):** The LLM loads the `ground_base` asset. It checks `asset info` to confirm the `tile_width` and `tile_height` are indeed 16x16.
3.  **LLM Action (Mathematics & Data Injection):** A full 16x16 square collision box in Cartesian geometry relative to the tile's origin is `[[0,0], [16,0], [16,16], [0,16]]`. The LLM sequentially calls the `tileset` tool with the `set_tile_physics` action three times, assigning the calculated polygon array to `tile_index` 0, 1, and 2.
4.  **LLM Action (Exporting):** The LLM calls `workspace save` and `export godot_tileset`. The MCP server's backend logic automatically translates these JSON coordinates into a Godot native `TileData` object with a physics layer, appending it to the `.tres` text file.
5.  **LLM Chat Response:** The agent replies: *"I mapped the 16x16 rectangular polygons to tiles 0, 1, and 2, and overwrote the `ground_base.tres` Godot file. The Godot engine will instantly detect the file change. Your TileMapLayer will now block the player using those specific tiles without you ever having to open Godot's TileSet UI."*

## Scenario 5: Creating a Base Character Rig

**What the user is trying to accomplish:**
The player character requires a base body that all other modular equipment will attach to. The user needs to establish the foundational 16x16 sprite with a 4-directional walk cycle (South, North, East, West) and idle frames. They want the LLM to generate the raw pixel data, set up the facing tags properly for directional exports, and align the pivot so the SSoT spriteframes load perfectly centered in Godot.

**Related MCP Server Tools & Resources:**

*   **Tools:** `asset create`, `draw`, `selection`, `transform`, `workspace save`, `export per_tag`, `export godot_spriteframes`.

**The Chat and MCP Server Flow:**

1.  **User Prompt:** *"Let's build the `human_male_a` base body. 16x16 canvas. I need a 4-directional setup: Idle and Walk for South, North, East, and West. The walk cycles should be 4 frames each. Use our standard skin tone palette. Go ahead and scaffold the tags with the proper facing directions so the exporter knows how to name them. Draw a basic standing frame for the South idle to start."*
2.  **LLM Action (Context & Scaffolding):** The LLM calls `asset create` outfitting a 20-frame animation timeline (1 idle frame x 4 dirs = 4; 4 walk frames x 4 dirs = 16). It meticulously assigns the tags, utilizing the `tag_facing` property: `[{"name": "idle", "facing": "S", "start": 0, "end": 0}, {"name": "idle", "facing": "N", "start": 1, "end": 1}, ... {"name": "walk", "facing": "S", "start": 4, "end": 7}, ...]`.
3.  **LLM Action (Drawing):** The LLM uses `draw` operations (rects, lines, and pixel placement) to construct the forward-facing naked base body in `frame_index: 0`.
4.  **LLM Action (Duplication/Modification):** To create the North facing frame, the LLM calls `selection all`, `selection copy` on frame 0, and `selection paste` on frame 1. It then uses `draw` to overwrite the face pixels with hair pixels, indicating the back of the head.
5.  **LLM Action (Exporting):** The LLM calls `export godot_spriteframes`. Because the tags contain structural `facing` metadata, the Godot `.tres` file automatically organizes the animations into `idle_S`, `idle_N`, `walk_E`, etc., exactly as a 2D blendspace requires.
6.  **LLM Chat Response:** The agent replies: *"I have scaffolded the 20-frame rig for `human_male_a` with all 4-directional tags properly facing-assigned. I've drawn the base South and North idle frames. Check the preview: `![South Idle](pixel://view/asset/human_male_a)`. Let's refine the anatomy here before I generate the walk-cycle animation frames."*

---

## Scenario 6: Generating an Autotiling Dungeon Biome

**What the user is trying to accomplish:**
The user needs a new underground biome (e.g., a "Crypt") utilizing Godot's 4.6 Terrains system. Instead of manually painting 47 tiles to support the `Match Corners and Sides` bitmask (Blob-47), they want the LLM to generate the unified 47-tile stone floor pattern, inject the Godot terrain peering bits instantly, and export the ready-to-use TileSet block.

**Related MCP Server Tools & Resources:**

*   **Tools:** `asset create`, `draw`, `effect`, `tileset autotile_generate`, `export godot_tileset`.
*   **Resources:** `pixel://view/tileset/crypt_floor`

**The Chat and MCP Server Flow:**

1.  **User Prompt:** *"I need a new 16x16 Blob-47 autotile floorset for a Crypt biome. Make the base stone a cold grey, and the 'wall' boundaries a darker, nearly black grey. Generate all 47 combinations. Inject the Godot 4.6 peering bits for terrain set 0, terrain 0, so it autotiles immediately in-engine."*
2.  **LLM Action (Scaffolding):** The LLM creates the tileset asset natively: `asset create` *(name: "crypt_floor", tile_width: 16, tile_height: 16)*.
3.  **LLM Action (Algorithmic Generation):** Because generating 47 tiles via standard `draw` operations is incredibly context-heavy, the LLM heavily utilizes the MCP server's built-in macro tools. It calls `tileset autotile_generate` *(asset_name: "crypt_floor", pattern: "blob47", base_color: 8, edge_color: 2, terrain_set: 0, terrain: 0)*. The pixelMCP backend processes the algorithmic layout and automatically embeds the 3x3 minimal peering bits mapping into the tileset custom data.
4.  **LLM Action (Texturing Polish):** The LLM uses `effect` *(action: "noise")* specifically masked over the base color (cold grey) to give the stone some gritty texture without breaking the dark edge boundaries.
5.  **LLM Action (Exporting):** The LLM calls `export godot_tileset`. The resulting `.tres` file perfectly contains all 47 bitmasks mapped to the corresponding tile coordinates.
6.  **LLM Chat Response:** The agent responds: *"The Crypt floor Blob-47 autotile has been generated and textured. All Godot 4.6 Terrains peering bits are mathematically mapped to Terrain Set 0. I exported `crypt_floor.tres` to your environments folder. You can instantly start drawing with the Terrain tool in Godot!"*

---

## Scenario 7: Creating Prop Silhouettes for Complex Environments

**What the user is trying to accomplish:**
The user is building an outdoor environment containing large, irregular assets like a "twisted ancient tree." They want the LLM to draw the tree, but critically, they need a complex, pixel-perfect collision polygon generated so players don't walk through the trunk, while allowing them to walk *behind* the upper canopy (Y-sorting).

**Related MCP Server Tools & Resources:**

*   **Tools:** `asset create`, `draw`, `effect`, `asset add_layer`, `tileset set_tile_physics` / Node geometry generation, `export godot_spriteframes`.

**The Chat and MCP Server Flow:**

1.  **User Prompt:** *"Draw a 'twisted_ancient_tree' prop. It should be large, maybe 64x64. Make the trunk gnarled brown and the canopy dead, grey wisps. Once it looks good, I need you to generate a pixel-perfect navigation/collision boundary only for the bottom 16 pixels of the trunk so the player can walk behind the dead branches but collides with the roots."*
2.  **LLM Action (Drawing):** The LLM calls `asset create` (64x64). It executes a series of `draw` operations (filled ellipses for the canopy, curving lines and fills for the twisted roots and trunk).
3.  **LLM Action (Procedural Generation):** The LLM runs `effect` *(action: "cleanup_orphans")* and `effect` *(action: "auto_aa")* to smooth the complex organic rendering.
4.  **LLM Action (Silhouette Collision Injection):** The LLM creates a structural shape layer: `asset add_layer` *(name: "trunk_phys", type: "shape", role: "solid")*.
5.  **LLM Action (Geometric Slicing):** The LLM analyzes the bounding box of the roots drawn at the bottom of the canvas and calls `asset add_shape` for frame 0, generating a polygon mapping to the coordinates of the drawn trunk (e.g., `shape_points: [[24, 50], [40, 50], [44, 60], [20, 60]]`).
6.  **LLM Action (Exporting):** The LLM saves and calls `export godot_spriteframes`. The exporter recognizes the polygon shape and embeds it as a `CollisionPolygon2D` track in the generated `_shapes.tres` file.
7.  **LLM Chat Response:** The agent responds: *"The 64x64 twisted ancient tree is complete. I drew a specific pixel-perfect physics polygon wrapping just the base roots (from Y:50 to Y:60), ignoring the canopy. I exported `twisted_ancient_tree_shapes.tres`. When assigned to an Area2D or StaticBody2D beneath your Sprite, Y-sorting will function perfectly as players walk behind the upper branches!"*
