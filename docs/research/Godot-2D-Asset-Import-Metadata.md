# **Advanced 2D Asset Pipeline Automation in Godot 4.6: Metadata Schemas, Importer Architecture, and Asset Integration**

## **The Single Source of Truth Paradigm in 2D Game Development**

The architectural framework of 2D game development within the Godot Engine has undergone a profound evolution, culminating in the 4.5 and 4.6 release cycles throughout 2025 and early 2026\.1 As production complexities scale, the friction between external digital content creation (DCC) tools—specifically dedicated pixel art and tilemap editors—and the game engine's internal node hierarchy must be systematically reduced. The industry standard has shifted toward establishing the external DCC tool as the definitive Single Source of Truth (SSoT).4 In this paradigm, the pixel art editor is responsible not only for raster graphics but for authoring structural metadata, collision geometries, animation temporal data, and navigation parameters.

Automating the import pipeline necessitates an external pixel art editor capable of exporting a standardized serialization format—typically a comprehensive JSON file paired with a tightly packed atlas PNG—that Godot can intercept during its filesystem scanning phase.6 Through the utilization of the EditorImportPlugin and EditorScenePostImport interfaces, Godot can parse this JSON metadata and dynamically construct SpriteFrames, TileSet resources, Area2D nodes for hurtboxes, and NavigationPolygon data without any manual user intervention.8 The objective of this report is to exhaustively detail the specific metadata schemas required by the Godot 4.6 architecture to achieve zero-touch automation for sprites, animations, and complex environmental tilesets.

## **Architectural Shifts in Godot 4.5 and 4.6 Importer Mechanics**

Understanding the automation requirements demands a granular analysis of the underlying engine improvements introduced in the recent Godot 4.5 and 4.6 releases. The engine has decisively decoupled visual representations from spatial logic and introduced backend mechanics that penalize non-deterministic import pipelines.

### **Delta PCK Patching and Resource Determinism**

Godot 4.6 introduces delta encoding for exported PCK (Pack) files.2 This vital optimization allows game updates to ship only the modified byte-ranges of assets rather than replacing entire files, dramatically reducing the size of patches for end-users.2 To leverage this architecture, the external automation pipeline must be highly deterministic. If an automated importer rebuilds a TileSet or SpriteFrames resource from JSON metadata, the resulting .tres (text resource) or .res (binary resource) must maintain consistent internal Unique Identifiers (UIDs) and array orders.3 Automated SSoT exports from pixel editors must ensure that metadata array indices, dictionary keys, and spatial slice identifiers remain completely static across iterative exports. If the JSON structure scrambles these indices arbitrarily, the Godot delta patcher will perceive the entire generated resource as a newly modified binary blob, completely negating the bandwidth benefits of the 4.6 patching algorithm.2

### **The TileMapLayer Paradigm**

A critical structural change is the full deprecation of the legacy TileMap node in favor of the flattened TileMapLayer node, which converts previously nested layer structures into discrete, independent scene tree nodes.11 This architectural shift dictates that automated tileset importers—such as the YATI plugin for Tiled maps—must now map custom metadata directly to SSoT TileSet resources, while the structural spatial layout is mapped to an array of independent TileMapLayer nodes.12 The export schema from the pixel art editor must account for this by strictly isolating the TileSet atlas definitions (the palette) from the geometric coordinate mapping (the canvas).

### **Physics Interpolation and Transform Integrity**

The maturation of 2D physics interpolation in recent Godot versions requires that collision metadata precisely matches the visual transform of the sprite at any given micro-tick to avoid visual stutter.14 When exporting hurtbox or hitbox geometry from a pixel art editor, the coordinates must be perfectly normalized to the sprite's pivot point. If the JSON data dictates an animation frame with an arbitrary offset due to sprite trimming, the collision geometry must mathematically inherit this exact offset. Failure to do so introduces interpolation jitter between the PhysicsServer2D and the RenderingServer, breaking the illusion of smooth movement, particularly on high refresh-rate monitors.15

## **Sprite Animation Metadata and Frame Key Topologies**

To fully automate the instantiation of an AnimatedSprite2D or an AnimationPlayer driving a Sprite2D, the pixel art editor must output an exhaustive temporal and spatial schema.17 Plugins such as the Godot Aseprite Wizard have established a high benchmark for how external metadata is mapped into engine-native parameters, effectively automating tedious keyframing processes.5

### **Temporal Resolution and FPS Conversion Algorithms**

Pixel art editors natively construct animations using independent frame durations (e.g., Frame 0 is 100ms, Frame 1 is 150ms, Frame 2 is 50ms).5 Conversely, Godot's SpriteFrames resource utilizes a global Frames Per Second (FPS) variable applied uniformly across an entire animation sequence, combined with a local speed\_scale multiplier.20

When the pixel editor exports its JSON, it must output the exact duration of each discrete frame in milliseconds. The Godot import automation script must then perform a mathematical transformation to reconcile these variable frame lengths into a fixed FPS timeline.

Let ![][image1] be the duration of frame ![][image2] in milliseconds. If the importer is constructing an AnimationPlayer track (which supports arbitrary float timings), the exact floating-point timestamp ![][image3] (in seconds) where frame ![][image2] must be keyed is calculated as:

![][image4]  
However, if the importer is strictly generating a SpriteFrames resource for use with AnimatedSprite2D, the script must determine a Base FPS (![][image5]) by identifying the greatest common divisor of all frame durations. It must then inject duplicated image pointers into the SpriteFrames array to simulate longer durations within a fixed-FPS constraint. This ensures the pacing crafted by the animator remains perfectly intact within the engine runtime.

### **Animation Tags, Loops, and Directionality**

Godot requires explicit definitions for how animations cycle. In SSoT metadata, "Tags" represent individual animation states (e.g., "Player\_Idle", "Enemy\_Run", "Boss\_Attack").5 The required metadata keys that the Godot importer must extract include:

| Pixel Editor Metadata Parameter | Godot Resource Destination | Architectural Translation Logic |
| :---- | :---- | :---- |
| **Tag Name** | SpriteFrames.add\_animation(name) | The string identifier representing the action sequence. Drives state machines.20 |
| **Direction** | SpriteFrames Array Manipulation | Pixel editors support forward, reverse, ping-pong, and ping-pong\_reverse.5 Because Godot's SpriteFrames only natively supports standard looping, the importer must manually reconstruct "ping-pong" animations by duplicating and appending the frame array in reverse order before saving the resource. |
| **Loop** | SpriteFrames.set\_animation\_loop() | A boolean explicitly enabling or disabling the continuous wrap-around of the animation sequence.20 |
| **Frame Range** | SpriteFrames.add\_frame() | The start and end integer indices pointing to the texture regions within the packed atlas image. |

### **Region Mapping and Texture Atlasing Geometries**

To optimize VRAM usage and minimize draw calls, pixel editors should never output thousands of individual PNGs. Instead, they must implement a texture packer algorithm to output a singular, highly optimized SSoT atlas image. The JSON metadata describing this atlas must define the following coordinate spaces:

* **Frame Coordinates:** The integer x, y, w (width), and h (height) values denoting the actual bounding box of the graphic on the tightly packed atlas.23  
* **Sprite Source Size:** The original dimensions of the canvas before the packer trimmed the transparent alpha pixels.  
* **Source Size Offset:** If the pixel editor trims transparent pixels to save atlas space, it must output the localized x and y offsets of the trimmed texture relative to the original, untrimmed canvas. The automated Godot importer maps this to the AtlasTexture.margin property. This is a critical metadata point; without it, sprites will visually "jitter" or bounce around their pivot points as frames switch between differing trimmed sizes.23

## **Automating Collision, Hitbox, and Hurtbox Geometry**

Defining combat boundaries—hitboxes (areas dealing damage) and hurtboxes (areas receiving damage)—within the pixel art editor profoundly streamlines the combat design pipeline.24 Hardcoding these shapes manually within the Godot Editor inevitably leads to severe desynchronization when sprite animations are subsequently updated or adjusted by the artist. Automation requires the DCC tool to export specific geometric sub-regions of the canvas alongside the visual pixel data.25

### **The Geometric Slice Paradigm**

Using advanced SSoT editors like Aseprite, animators can utilize "Slices" to define logical collision boundaries directly over the pixel art.26 A slice is a named rectangular or polygonal region drawn over specific frames of an animation. The custom metadata schema must instruct the Godot importer to translate these Slices into fully configured Area2D nodes populated with CollisionShape2D geometries.24

The ideal JSON schema for a collision Slice should capture:

1. **Identifier:** A string prefix indicating the purpose, such as hitbox\_sword\_heavy or hurtbox\_torso.  
2. **Bounds:** The local ![][image6] coordinates and ![][image7] dimensions of the slice per specific frame.26  
3. **Pivot:** The origin point of the slice to ensure correct mathematical calculations when the node rotates.26  
4. **User Data (String/Dictionary):** Arbitrary data used to encode gameplay variables, such as collision layer masks, damage float values, or knockback vectors (e.g., layer:3|mask:4|damage:50).

### **Godot Importer Translation Logic for Slices**

When the EditorImportPlugin detects Slice metadata in the JSON payload, it dynamically instances an Area2D and attaches it to the imported character scene. The algorithmic translation logic follows specific rules:

| Pixel Editor Slice Metadata | Godot Node and Property Target | Transformation and Instantiation Logic |
| :---- | :---- | :---- |
| **Slice Name (hitbox\_)** | Area2D.name / CollisionLayer | The importer instances an Area2D, assigns it to the hitbox logical group, and sets the bitwise collision\_layer based on predefined project settings.24 |
| **Slice Name (hurtbox\_)** | Area2D.name / CollisionMask | The importer instances an Area2D, assigns it to the hurtbox logical group, and sets the bitwise collision\_mask allowing it to detect hitboxes.24 |
| **Bounds (w, h)** | RectangleShape2D.size | Direct numerical mapping to the extents of the instantiated shape resource. |
| **Bounds (x, y)** | CollisionShape2D.position | Calculated as ![][image8]. The Godot offset must account for the sprite's centered pivot to align perfectly.29 |
| **User Data (damage:X)** | Script @export var damage | The importer attaches a standardized gameplay script (e.g., hitbox.gd) and dynamically injects the parsed integer into the exported damage variable.24 |

Because these shapes must track perfectly with the animation (e.g., a sword swinging forward), the Godot importer will ideally construct an AnimationPlayer. For each sequential frame where the slice changes position or dimensions, the importer automatically creates keyframes on the CollisionShape2D:position and CollisionShape2D:shape:size property tracks. This yields an impeccably accurate, frame-perfect melee combat system without the developer ever opening the Godot animation timeline.

### **Automated Bitmap to Polygon Generation for Complex Colliders**

If simple rectangular slices are insufficient for complex geometries (such as terrain generation or highly irregular boss monsters), Godot's BitMap class can generate highly accurate CollisionPolygon2D meshes based purely on sprite opacity.31 The pipeline automation utilizes BitMap.create\_from\_image\_alpha() passing the source image frame, followed by BitMap.opaque\_to\_polygons().32

However, generating these contour algorithms at runtime using GDScript incurs heavy CPU overhead and causes noticeable instantiation stuttering.34 Therefore, the optimal workflow executes this algorithm exclusively *during* the EditorImportPlugin processing step in the editor. The pixel editor simply exports an additional silhouette layer labeled \_collision\_mask. The Godot importer reads this binary black-and-white layer, generates the optimal vertices using opaque\_to\_polygons(), bakes the data into a static CollisionPolygon2D resource, and permanently discards the silhouette texture. This approach saves both VRAM and CPU cycles during actual gameplay while guaranteeing pixel-perfect physical collision bounds.

## **TileSet Metadata Architecture and Layer Automation**

The Godot 4 TileSet resource is an exceptionally complex, deeply nested data structure designed to handle textures, physical collision bodies, navigation mapping, auto-tiling logic, and arbitrary gameplay data within a single file.35 When automating the import of a tileset from a pixel art editor or an external map tool (like LDtk or Tiled), mapping the external JSON arrays to Godot's internal TileData objects is a critical undertaking that saves thousands of hours of manual configuration.

### **Custom Data Layers (CDL)**

Custom Data Layers are a powerful feature allowing developers to append strongly typed gameplay variables to individual atlas tiles.36 Common implementations include defining damage-per-second properties for environmental hazards (e.g., lava), identifying terrain types for footstep audio (e.g., is\_ice, is\_wood), or defining movement movement penalties for strategy games.36

To automate this injection, the pixel editor's export format must define a global array of Custom Data Layers, which are then mapped to specific tile coordinates on the atlas.

| Layer Identifier Name | Data Type | Tile Atlas Coordinates | Assigned Value |
| :---- | :---- | :---- | :---- |
| destructible | bool | (2, 4\) | true |
| damage\_per\_second | int | (5, 1\) | 25 |
| terrain\_audio\_profile | String | (1, 1\) | "res://audio/grass.wav" |
| movement\_penalty | float | (3, 3\) | 0.75 |

During the execution of the import phase, the EditorImportPlugin will instantiate a base TileSet resource and register the SSoT layers using TileSet.add\_custom\_data\_layer(). It then iterates over every defined tile coordinate in the JSON payload, retrieves the respective TileData memory object using TileSetAtlasSource.get\_tile\_data(), and applies the specific value utilizing TileData.set\_custom\_data\_by\_layer\_id(layer\_id, value).39 This guarantees that game logic systems can immediately query TileMapLayer.get\_cell\_tile\_data() at runtime to retrieve these values effortlessly.

### **Physics and Navigational Geometry Injection**

Automating physics boundaries for tiles eliminates the incredibly tedious process of manually painting collision polygons inside the Godot editor.36 If a pixel editor can export vertex arrays for solid tiles, the importer script maps these directly to Godot's physics engine.

* **Collision Layer Mapping:** The importer script invokes TileSet.add\_physics\_layer(). For each tile marked as solid in the JSON, the importer translates the external Cartesian vertices into a PackedVector2Array. It assigns this shape via TileData.set\_collision\_polygons\_count() and TileData.set\_collision\_polygon\_points().35 Note that Godot's TileSet physics engine does not natively support mathematical ellipses or bezier curves; therefore, curved bounds must be rasterized by the exporter into discretized convex polygons before injection.12  
* **Navigation Layers and Pathfinding:** Artificial intelligence pathfinding in 2D utilizes the NavigationServer2D and requires NavigationPolygon resources mapped to walkable tiles.41 The pixel art editor should allow the level designer to paint "walkable" masks over the atlas. The export JSON converts this mask to coordinates. The Godot importer subsequently utilizes TileSet.add\_navigation\_layer() and instantiates a new polygon using TileData.set\_navigation\_polygon(). This bakes the AI pathing map automatically, ensuring that NavigationAgent2D nodes can navigate the generated TileMapLayer immediately upon scene load.39

### **Terrain Sets and Peering Bits (Autotiling Logic)**

Godot 4's approach to procedural, rules-based tile placement relies on Terrains and Peering Bits, which fully replaced the legacy 3.x bitmask autotiler.36 Terrains support Match Corners and Sides, Match Corners, and Match Sides algorithmic modes.36

When a pixel artist constructs an auto-tiling sheet (like a dirt path surrounded by grass), the export JSON must numerically denote the peering bit values. A peering bit informs the engine how a specific edge or corner of a cell is allowed to connect to its neighboring cells.36 The automation script must parse these specific rules:

* A peering value of \-1 explicitly denotes empty space (the tile will only place itself if there is nothing adjacent to that bit).36  
* Values of 0 or greater act as identifiers pointing to a specific Terrain ID within a master Terrain Set ID.36

The pixel editor metadata must export a JSON dictionary where the keys correspond to the Godot internal peering directions (e.g., PEERING\_BIT\_TOP\_SIDE, PEERING\_BIT\_BOTTOM\_RIGHT\_CORNER) and the values represent the corresponding Terrain IDs. The custom importer loop will systematically apply these rules by invoking TileData.set\_terrain\_peering\_bit() on the parsed SSoT configurations.36 If these configurations are structurally complex (e.g., establishing a "water-in-grass" versus "grass-in-water" logic set), automating the bitwise assignment drastically curtails deterministic bugs and edge-case rendering artifacts that are incredibly common when users attempt to configure a 3x3 minimal bitmask manually.45

## **Engineering the Custom EditorImportPlugin**

To orchestrate the seamless translation between the external SSoT JSON file and Godot's internal resource architecture, a developer must author an EditorImportPlugin.9 This class registers a custom importer tool into the Godot editor, commanding the engine to intercept files with specific custom extensions (e.g., .pxldata or .json\_atlas) before they are handled by default file parsers.9

### **Core Importer Pipeline Methods**

The custom importer script must extend EditorImportPlugin and override several specific virtual methods to interface with the engine's asset pipeline:

1. **\_get\_importer\_name()**: Defines the internal backend name used by the engine registry.  
2. **\_get\_recognized\_extensions()**: Returns an array of strings informing the Godot filesystem dock which files to intercept (e.g., \["pxl", "anim\_data"\]).  
3. **\_get\_resource\_type()**: Defines the ultimate Godot class being generated and saved to the disk (e.g., "SpriteFrames", "PackedScene", or "TileSet").  
4. **\_get\_save\_extension()**: Returns "tres" or "res", directing the engine to compile the SSoT JSON text into a native resource object.47

### **Scene Generation vs. Resource Generation Strategies**

The import architect must make a crucial architectural decision regarding whether the automation will generate a standalone Resource or a complete, instantiable PackedScene.48

* **Resource Generation:** If the importer's primary function is merely packaging metadata into a SpriteFrames library or a TileSet, generating a .tres (Text Resource) is highly optimal. This allows developers to assign the generated resource generically to any arbitrary node across multiple different scenes.48 For example, a single imported TileSet.tres can be dynamically loaded into dozens of different level scenes.  
* **Scene Generation:** If the SSoT data contains nested hierarchical elements—such as a character file containing hitboxes, hurtboxes, audio cue triggers, and complex sprite structures—the importer must generate a full scene tree. The script instances a Node2D root, appends the Sprite2D and an AnimationPlayer, injects the Area2D children based on the Slices metadata, configures the bitwise collision masks, sets the ownership hierarchy using node.set\_owner(root), and finally saves the entire constructed tree as a .tscn (PackedScene) utilizing the ResourceSaver.save() method.47

Additionally, by leveraging the secondary EditorScenePostImport or EditorScenePostImportPlugin classes, developers can intercept more complex metadata conversions, altering node types or injecting rigid bodies strictly as a post-process modification script just before the final scene is committed to the disk by the primary importer.8

## **The Definitive SSoT Metadata Schema: A Blueprint for Pixel Editors**

Based on the stringent automation requirements of the Godot 4.6 engine architecture, if a developer is engineering a pixel art editor export pipeline, the optimal JSON structure must encompass temporal, geometric, and domain-specific property blocks in a highly structured format.

Below is the theoretical architectural schema required to support flawless, zero-touch imports for automated sprite and tileset integration.

### **The Ideal JSON Payload Structure**

JSON

{  
  "document\_meta": {  
    "app": "CustomPixelStudio\_2026",  
    "version": "1.0",  
    "format": "rgba8888",  
    "atlas\_size": {"w": 1024, "h": 1024},  
    "scale": "1"  
  },  
  "frames":,  
  "animations": \[  
    {  
      "name": "idle",  
      "from": 0,  
      "to": 5,  
      "direction": "ping-pong",  
      "loop": true  
    }  
  \],  
  "spatial\_slices": \[  
    {  
      "name": "hitbox\_sword\_swing",  
      "frame": 3,  
      "bounds": {"x": 40, "y": 10, "w": 30, "h": 15},  
      "pivot": {"x": 0, "y": 0},  
      "user\_data": {  
          "collision\_layer": 4,  
          "collision\_mask": 8,  
          "damage": 25,  
          "knockback\_vector": \[100, \-50\]  
      }  
    }  
  \],  
  "tileset\_metadata": {  
    "tile\_size": {"w": 32, "h": 32},  
    "custom\_data\_layers": \[  
      {"name": "movement\_penalty", "type": "float"},  
      {"name": "is\_water", "type": "bool"}  
    \],  
    "tiles": \[  
      {  
        "id": 4,  
        "atlas\_coords": {"x": 0, "y": 1},  
        "collision": \[  
          {"points": \[, , , \]}  
        \],  
        "navigation": \[  
          {"points": \[, , , \]}  
        \],  
        "peering\_bits": {  
          "top\_side": 1,  
          "bottom\_side": 1,  
          "top\_left\_corner": \-1  
        },  
        "custom\_data": {  
          "movement\_penalty": 0.75,  
          "is\_water": true  
        }  
      }  
    \]  
  }  
}

### **Schema Analysis and Systemic Implications**

This schema elegantly resolves multiple severe friction points inherent in traditional game development pipelines.

* **Trimmed and Source Sizes:** Godot's AtlasTexture uses these precise properties to reconstruct transparent bounds safely. This preserves the visual continuity of the sprite's placement while drastically optimizing the memory footprint of the atlas texture.23  
* **Normalized Pivots:** By expressing the pivot in normalized floating-point coordinates (0.5, 1.0 representing bottom-center), the Godot importer can easily map the offset parameter of a Sprite2D node regardless of arbitrary scaling artifacts or aspect ratio changes.  
* **Unified Combat and Art Layer:** Embedding the spatial\_slices dictionary directly into the frame data ensures that an animator is solely responsible for aligning the graphical sword swing with the numerical bounding box. By coupling visual and physics design at the authoring stage, SSoT pipelines completely eliminate "ghost hits" or desynchronized mechanics.  
* **All-in-One Tilesets:** The tileset\_metadata block entirely sidesteps the tedious, multi-click interface of Godot's built-in TileSet editor.36 The custom importer algorithmically spins up an entirely configured mapping of colliders, navigations, terrains, and gameplay data values perfectly aligned to the exported atlas, converting a multi-hour manual task into a sub-second automated script.

## **Visual Fidelity, Rendering Configurations, and Post-Processing**

To fully realize the automated import of 2D pixel art within Godot 4.6, the import plugin must not only construct metadata objects but also enforce rendering configurations to maintain the crisp, blocky aesthetic characteristic of pixel art.

When the importer processes the image file referenced by the JSON SSoT, it should systematically override Godot's default texture parameters.52 Standard image imports in Godot default to linear filtering, which severely blurs low-resolution pixel art textures.53 The automation script must actively parse the texture import configurations and set the filter type to CanvasItem.TEXTURE\_FILTER\_NEAREST.52

Furthermore, to optimize rendering performance and prevent compression artifacts on hard color boundaries, the script should invoke Texture2D import settings to disable VRAM compression, favoring "Lossless" or "VRAM Uncompressed" modes.54 For projects rendering large numbers of sprites, keeping images out of standard VRAM compression routines avoids subtle color-banding and prevents automatic mipmap generation, which is highly detrimental to low-resolution pixel art styles.54

## **Algorithmic Integration of Polygon Arrays**

When dealing with non-rectangular bounds—such as angled slopes in a platformer tileset or the irregular shape of a space asteroid—the metadata must dictate raw vertex arrays. As demonstrated in the JSON schema above, the collision and navigation objects contain arrays of Cartesian points.

The Godot implementation inside the EditorImportPlugin translates these multidimensional arrays directly into engine-native vector types using an iterative loop:

GDScript

var polygon \= PackedVector2Array()  
for point in tile\_data\["collision"\]\["points"\]:  
    polygon.append(Vector2(point, point))

\# Applying the geometric vertices to the TileData object  
var physics\_layer \= 0  
tile\_data\_obj.add\_collision\_polygon(physics\_layer)  
tile\_data\_obj.set\_collision\_polygon\_points(physics\_layer, 0, polygon)

This translation logic establishes a mathematically identical physical boundary in the Godot engine matching the visual boundary authored in the pixel editor.35 For NavigationPolygon data utilized by the NavigationServer2D, the processing mechanism is identical. The generated navmesh arrays provide artificial intelligence pathfinding agents (NavigationAgent2D) with immediate spatial awareness of the terrain, entirely bypassing the need for secondary manual baking passes inside Godot's editor interface.41

## **Concluding Framework for SSoT Integration**

The 2D asset import pipeline in the Godot 4.6 engine architecture provides technical artists and developers with highly robust, scriptable tools for achieving full pipeline automation. By decisively shifting the generation of critical gameplay data—ranging from bounding box geometries and custom data layer injection, to terrain peering bits and complex animation tracking—into external pixel art and tile editors, studios establish an impenetrable Single Source of Truth.5

When a pixel editor is engineered to export comprehensive JSON metadata, the implementation of a custom EditorImportPlugin within Godot seamlessly converts static text payloads into complex, interlocking node structures such as TileMapLayer, AnimatedSprite2D, and deeply configured Area2D sub-systems. This architecture completely eliminates manual transcription, prevents temporal desynchronization between sprite frames and combat hitboxes, drastically accelerates the iterative testing process, and capitalizes on Godot 4.6's optimized delta patch and rendering pipelines.2 As SSoT automation frameworks continue to mature into the late 2026 development cycles, the schema design of the JSON payload will function as the definitive, unbreakable contract between artistic design and backend engine logic.

#### **Works cited**

1. Blog \- Godot Engine, accessed February 21, 2026, [https://godotengine.org/blog/](https://godotengine.org/blog/)  
2. Godot 4.6 Release: It's all about your flow, accessed February 21, 2026, [https://godotengine.org/releases/4.6/](https://godotengine.org/releases/4.6/)  
3. Release candidate: Godot 4.5.2 RC 1, accessed February 21, 2026, [https://godotengine.org/article/release-candidate-godot-4-5-2-rc-1/](https://godotengine.org/article/release-candidate-godot-4-5-2-rc-1/)  
4. I created this plugin to help me import animations from Aseprite as SpriteFrames. It's saving me a bunch of time and I hope it may be useful for other people as well. : r/godot \- Reddit, accessed February 21, 2026, [https://www.reddit.com/r/godot/comments/iloygq/i\_created\_this\_plugin\_to\_help\_me\_import/](https://www.reddit.com/r/godot/comments/iloygq/i_created_this_plugin_to_help_me_import/)  
5. viniciusgerevini/godot-aseprite-wizard \- GitHub, accessed February 21, 2026, [https://github.com/viniciusgerevini/godot-aseprite-wizard](https://github.com/viniciusgerevini/godot-aseprite-wizard)  
6. GitHub \- afk-mario/amano-ldtk-importer, accessed February 21, 2026, [https://github.com/afk-mario/amano-ldtk-importer](https://github.com/afk-mario/amano-ldtk-importer)  
7. JSON — Godot Engine (stable) documentation in English, accessed February 21, 2026, [https://docs.godotengine.org/en/stable/classes/class\_json.html](https://docs.godotengine.org/en/stable/classes/class_json.html)  
8. EditorScenePostImport — Godot Engine (4.4) documentation in English, accessed February 21, 2026, [https://docs.godotengine.org/en/4.4/classes/class\_editorscenepostimport.html](https://docs.godotengine.org/en/4.4/classes/class_editorscenepostimport.html)  
9. EditorImportPlugin — Godot Engine (stable) documentation in English, accessed February 21, 2026, [https://docs.godotengine.org/en/stable/classes/class\_editorimportplugin.html](https://docs.godotengine.org/en/stable/classes/class_editorimportplugin.html)  
10. Dev snapshot: Godot 4.5 beta 1, accessed February 21, 2026, [https://godotengine.org/article/dev-snapshot-godot-4-5-beta-1/](https://godotengine.org/article/dev-snapshot-godot-4-5-beta-1/)  
11. TileMapLayer — Godot Engine (stable) documentation in English, accessed February 21, 2026, [https://docs.godotengine.org/en/stable/classes/class\_tilemaplayer.html](https://docs.godotengine.org/en/stable/classes/class_tilemaplayer.html)  
12. Kiamo2/YATI: Addon to import Tiled maps into Godot 4 \- GitHub, accessed February 21, 2026, [https://github.com/Kiamo2/YATI](https://github.com/Kiamo2/YATI)  
13. Import Tiled Maps into Godot 4 with Tile Map Layers \- YouTube, accessed February 21, 2026, [https://www.youtube.com/watch?v=Hm94HRIJRGc](https://www.youtube.com/watch?v=Hm94HRIJRGc)  
14. Import configuration — Godot Engine (stable) documentation in English, accessed February 21, 2026, [https://docs.godotengine.org/en/stable/tutorials/assets\_pipeline/importing\_3d\_scenes/import\_configuration.html](https://docs.godotengine.org/en/stable/tutorials/assets_pipeline/importing_3d_scenes/import_configuration.html)  
15. Godot 4.4, a unified experience, accessed February 21, 2026, [https://godotengine.org/releases/4.4/](https://godotengine.org/releases/4.4/)  
16. Troubleshooting physics issues — Godot Engine (stable) documentation in English, accessed February 21, 2026, [https://docs.godotengine.org/en/stable/tutorials/physics/troubleshooting\_physics\_issues.html](https://docs.godotengine.org/en/stable/tutorials/physics/troubleshooting_physics_issues.html)  
17. Aseprite Wizard \- Godot Asset Library, accessed February 21, 2026, [https://godotengine.org/asset-library/asset/1572](https://godotengine.org/asset-library/asset/1572)  
18. SpriteFrames — Godot Engine (stable) documentation in English, accessed February 21, 2026, [https://docs.godotengine.org/en/stable/classes/class\_spriteframes.html](https://docs.godotengine.org/en/stable/classes/class_spriteframes.html)  
19. Getting started \- Aseprite Wizard \- This is Vini\!, accessed February 21, 2026, [https://thisisvini.com/aseprite-wizard/en/9.x-4/introduction/index.html](https://thisisvini.com/aseprite-wizard/en/9.x-4/introduction/index.html)  
20. AnimatedSprite2D — Godot Engine (stable) documentation in English, accessed February 21, 2026, [https://docs.godotengine.org/en/stable/classes/class\_animatedsprite2d.html](https://docs.godotengine.org/en/stable/classes/class_animatedsprite2d.html)  
21. Docs \- Tags \- Aseprite, accessed February 21, 2026, [https://www.aseprite.org/docs/tags/](https://www.aseprite.org/docs/tags/)  
22. vormag/godot-aseprite-importer \- GitHub, accessed February 21, 2026, [https://github.com/vormag/godot-aseprite-importer](https://github.com/vormag/godot-aseprite-importer)  
23. Import Sprites From Sprite sheet \- Archive \- Godot Forum, accessed February 21, 2026, [https://forum.godotengine.org/t/import-sprites-from-sprite-sheet/7971](https://forum.godotengine.org/t/import-sprites-from-sprite-sheet/7971)  
24. Handling mêlée attacks and damage with hitboxes and hurtboxes | GDQuest Library, accessed February 21, 2026, [https://www.gdquest.com/library/hitbox\_hurtbox\_godot4/](https://www.gdquest.com/library/hitbox_hurtbox_godot4/)  
25. My method for Hitboxes in Godot\! (hitlogging included) \- YouTube, accessed February 21, 2026, [https://www.youtube.com/watch?v=cX-vzfmzjnE\&vl=en](https://www.youtube.com/watch?v=cX-vzfmzjnE&vl=en)  
26. Docs \- Slices \- Aseprite, accessed February 21, 2026, [https://www.aseprite.org/docs/slices/](https://www.aseprite.org/docs/slices/)  
27. How to Make a Hitbox in Godot \- YouTube, accessed February 21, 2026, [https://www.youtube.com/watch?v=tHEr7x5Un9c](https://www.youtube.com/watch?v=tHEr7x5Un9c)  
28. How to Implement Hitboxes and Hurtboxes in Godot | Area2D Tutorial \- YouTube, accessed February 21, 2026, [https://www.youtube.com/watch?v=rU-JfP2nOpo](https://www.youtube.com/watch?v=rU-JfP2nOpo)  
29. Enhance AnimatedSprite2D with Frame-Specific Offset Support for Complex 2D Sprite Animations\!\!\! · Issue \#10937 · godotengine/godot-proposals \- GitHub, accessed February 21, 2026, [https://github.com/godotengine/godot-proposals/issues/10937](https://github.com/godotengine/godot-proposals/issues/10937)  
30. HitBox/HurtBox with CharacterBody2D and queue\_free() \- Physics \- Godot Forum, accessed February 21, 2026, [https://forum.godotengine.org/t/hitbox-hurtbox-with-characterbody2d-and-queue-free/97442](https://forum.godotengine.org/t/hitbox-hurtbox-with-characterbody2d-and-queue-free/97442)  
31. Pixel-perfect collisions on sprites in Godot \- YouTube, accessed February 21, 2026, [https://www.youtube.com/watch?v=Btk8IzhvaDo](https://www.youtube.com/watch?v=Btk8IzhvaDo)  
32. Trying to generate collision from sprite2D's texture, texture is a subviewport : r/godot \- Reddit, accessed February 21, 2026, [https://www.reddit.com/r/godot/comments/1j1znix/trying\_to\_generate\_collision\_from\_sprite2ds/](https://www.reddit.com/r/godot/comments/1j1znix/trying_to_generate_collision_from_sprite2ds/)  
33. How to generate hitboxes automatically : r/godot \- Reddit, accessed February 21, 2026, [https://www.reddit.com/r/godot/comments/1aewsy5/how\_to\_generate\_hitboxes\_automatically/](https://www.reddit.com/r/godot/comments/1aewsy5/how_to_generate_hitboxes_automatically/)  
34. Area2D — Godot Engine (stable) documentation in English, accessed February 21, 2026, [https://docs.godotengine.org/en/stable/classes/class\_area2d.html](https://docs.godotengine.org/en/stable/classes/class_area2d.html)  
35. TileSet — Godot Engine (stable) documentation in English, accessed February 21, 2026, [https://docs.godotengine.org/en/stable/classes/class\_tileset.html](https://docs.godotengine.org/en/stable/classes/class_tileset.html)  
36. Using TileSets — Godot Engine (stable) documentation in English, accessed February 21, 2026, [https://docs.godotengine.org/en/stable/tutorials/2d/using\_tilesets.html](https://docs.godotengine.org/en/stable/tutorials/2d/using_tilesets.html)  
37. TileSet — Godot Engine (4.4) documentation in English, accessed February 21, 2026, [https://docs.godotengine.org/en/4.4/classes/class\_tileset.html](https://docs.godotengine.org/en/4.4/classes/class_tileset.html)  
38. Add support for defining node metadata in the Advanced Import Settings dialog · Issue \#12584 · godotengine/godot-proposals \- GitHub, accessed February 21, 2026, [https://github.com/godotengine/godot-proposals/issues/12584](https://github.com/godotengine/godot-proposals/issues/12584)  
39. TileData — Godot Engine (stable) documentation in English, accessed February 21, 2026, [https://docs.godotengine.org/en/stable/classes/class\_tiledata.html](https://docs.godotengine.org/en/stable/classes/class_tiledata.html)  
40. How the F do I add collision to my tiles?\! I've been looking everywhere for like an hour\! : r/godot \- Reddit, accessed February 21, 2026, [https://www.reddit.com/r/godot/comments/18tsssj/how\_the\_f\_do\_i\_add\_collision\_to\_my\_tiles\_ive\_been/](https://www.reddit.com/r/godot/comments/18tsssj/how_the_f_do_i_add_collision_to_my_tiles_ive_been/)  
41. 2D navigation overview — Godot Engine (stable) documentation in English, accessed February 21, 2026, [https://docs.godotengine.org/en/stable/tutorials/navigation/navigation\_introduction\_2d.html](https://docs.godotengine.org/en/stable/tutorials/navigation/navigation_introduction_2d.html)  
42. 2D Navigation in Godot 4 \- Stephan Bester \- Medium, accessed February 21, 2026, [https://stephan-bester.medium.com/2d-navigation-in-godot-4-b710902e609c](https://stephan-bester.medium.com/2d-navigation-in-godot-4-b710902e609c)  
43. TileSet — Godot Engine (4.3) documentation in English, accessed February 21, 2026, [https://docs.godotengine.org/en/4.3/classes/class\_tileset.html](https://docs.godotengine.org/en/4.3/classes/class_tileset.html)  
44. Guide to TileSet Terrains : r/godot \- Reddit, accessed February 21, 2026, [https://www.reddit.com/r/godot/comments/1ckv9mj/guide\_to\_tileset\_terrains/](https://www.reddit.com/r/godot/comments/1ckv9mj/guide_to_tileset_terrains/)  
45. Terrain set gives unexpected results, algorithm creates bit masks impossible to express in 3x3 minimal · Issue \#70218 · godotengine/godot \- GitHub, accessed February 21, 2026, [https://github.com/godotengine/godot/issues/70218](https://github.com/godotengine/godot/issues/70218)  
46. Import plugins — Godot Engine (stable) documentation in English, accessed February 21, 2026, [https://docs.godotengine.org/en/stable/tutorials/plugins/editor/import\_plugins.html](https://docs.godotengine.org/en/stable/tutorials/plugins/editor/import_plugins.html)  
47. Allow importing a 3D model file as a mesh resource (or material/etc) instead of a scene · Issue \#7494 · godotengine/godot-proposals \- GitHub, accessed February 21, 2026, [https://github.com/godotengine/godot-proposals/issues/7494](https://github.com/godotengine/godot-proposals/issues/7494)  
48. Resources — Godot Engine (stable) documentation in English, accessed February 21, 2026, [https://docs.godotengine.org/en/stable/tutorials/scripting/resources.html](https://docs.godotengine.org/en/stable/tutorials/scripting/resources.html)  
49. nklbdev/godot-4-importality: Universal raster graphics and animations importers pack, accessed February 21, 2026, [https://github.com/nklbdev/godot-4-importality](https://github.com/nklbdev/godot-4-importality)  
50. Tiled Documentation, accessed February 21, 2026, [https://media.readthedocs.org/pdf/tiled/stable/tiled.pdf](https://media.readthedocs.org/pdf/tiled/stable/tiled.pdf)  
51. Do I use \`EditorImportPlugin\` or \`EditorScenePostImportPlugin\` for AnimationLibrary import automation? \- Plugins \- Godot Forum, accessed February 21, 2026, [https://forum.godotengine.org/t/do-i-use-editorimportplugin-or-editorscenepostimportplugin-for-animationlibrary-import-automation/125187](https://forum.godotengine.org/t/do-i-use-editorimportplugin-or-editorscenepostimportplugin-for-animationlibrary-import-automation/125187)  
52. How to Import Pixel Art Into Godot (Stop Blurry Pixel Art) \- YouTube, accessed February 21, 2026, [https://www.youtube.com/watch?v=qaz4iK7D6cg](https://www.youtube.com/watch?v=qaz4iK7D6cg)  
53. How to import pixel art in Godot 4? \- Archive, accessed February 21, 2026, [https://forum.godotengine.org/t/how-to-import-pixel-art-in-godot-4/7105](https://forum.godotengine.org/t/how-to-import-pixel-art-in-godot-4/7105)  
54. Importing images — Godot Engine (stable) documentation in English, accessed February 21, 2026, [https://docs.godotengine.org/en/stable/tutorials/assets\_pipeline/importing\_images.html](https://docs.godotengine.org/en/stable/tutorials/assets_pipeline/importing_images.html)

[image1]: <data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABYAAAAYCAYAAAD+vg1LAAABN0lEQVR4Xu2UsSvEYRzGH2URbrSIkmI8kUGSmMSk+ydsJgb+AjdcyW5RFmWQiYRQBgNSN5xNGYWNheft+eG9584PHYvuU5/hvs/7fvv2vr/3gDr/hn66S+/oCy0mv4MH9JEe0rFk/Y9Zhxp3WL2FbtMnOmLZt7ihF15MaIMmP/LgK7LQtHkPIvahNU0epDEHbZrwIOIYWtPtQRo79Bk6z2o0QkcRGmcs+5TQLFzMngcRo1DTM6tv0mmrvTMFbVrwIGIFWjNj9Rx0sVVZhjYNeZDQSR+gaZstS6VE76FzdFrpCb1C+WR9dIluRLUyuqBpt6zeQMehV7iGykudpb302uoYpqfQlxAa3+LjGQdDw1U6+bbBCK9zkRY8+A0u6SAq/wJqYoCe03Y6b1lN9EAvMXxRfv51/pBXJMg9y0RgrdcAAAAASUVORK5CYII=>

[image2]: <data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAcAAAAXCAYAAADHhFVIAAAAa0lEQVR4XmNgGOQgEIifA3EAugQIxALxRSDWQJcgD6QA8T4oNkOWUAXidVD2CSBehiTHUA3E1kCsCMT/GSCmoAAWIL4LxIvQJUAgjAGiyxKIZYC4DlmyD4ivI7F1keTAnt7JAHGMH7LEMAEAhkkREHK1PNMAAAAASUVORK5CYII=>

[image3]: <data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABEAAAAYCAYAAAAcYhYyAAABEklEQVR4Xu2SsUtCURTGvxBMB8tBcRJEaGioSdp0qtHNqc2tNZydJBw1ov9EEAwChyA0cHARhHBpcBZqkKjvep50PD3hKbj5gx88vu/dw73vPmDPTinRH/pNR/SJzrxsTl9p1+tdlpdlq7RolR6rrANZcKKyc/pJEypbcETbJotAXh6b3DG0gaNMr012BdnFo8mjkKP+w2330GR3kCHuW2nC9NRka3mBDInbIigxyI30bKG4pQ0baoqQXdRtocjRCxtq7iFDLm2xCQP6BblmiztqjT7D519ZkoHswvcayQ1k+IRmdZGELHJ+QIY4370s/ffq4rlA31S2FQ+0gtXhGxGiU5qiTdMF5oD2IQPOTLdH8QtkQjKi8EXKiQAAAABJRU5ErkJggg==>

[image4]: <data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAmwAAABCCAYAAADqrIpKAAAFPklEQVR4Xu3dW+jfYxwH8MeGhiYJKzXNzDmJnM3ILuRCEpIr5rjhAhPFkEM5XNhyzKGcw40irpY1h5Bj4kLElkO4wShC4vn0fH/+z57//7//wX7//bf/61Xv/t/n8/yetstPz/fwpAQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAwGbpipzlbXEYR+QsaIsAAEweK3POa4sAAPTPzJxVObu0E8PQsAEATLDFOWtz5jb14WjYAAA2gaU5s9viMKJhu6AtAgDQP9NzZuWsaCeGEQ3bhW0RAIAtz5Kcf5raTUPUAADYRJ5MQzdnb6XRvwABAECfTMv5IZXmrHVzzkltEQCAibUsld21oRqzl3NOaYsAAEys1Tl/5Wzf1GO8Lme3bhynKjw7MA0AMPXELldk63aisVXOnJyFqTx79kcq686sfjMWsfaatpi9m/NTUzu0GQMATCmfpdI83dZOjGDnVHbIXm8nRin+zaOaWjSFP+fMr2p7pfLZkWgMT6vqAABTxjE5f6fSQMXu2VjE76PBOqidGIXYRat39fbJeSmVBq12Ts6irn5WMwcAMGXEG5u9W6MvNHOjcWBb2IjW5NyRyg5g77k2AIAJF41S7HJ9mvNrN34759WuftzAT/vmxzTQtE0W83K+yjk/5+E09h1AAICNYsdm/FvO501totyfSsP2cc4OzRwAwJQVz2fVomG6rxpvV13324ycj1L5PzzezAEATFl7N+Nols6oxttW10P5MA3cyhwut/7365EdnibfrVEAgEljZs47bTG7Imd5W+yjT1Jp2N5M5ZMaAAB04jimob6HdlgqX/yfKPGZjt7LDwuaubFod/r6HQCAvovbm/EcWS123Vbl7NLU+yk+YBunGcRfAAA6c9LQu0SLc9bmzG3q/bQi5422CAAwVe2aszLn21Qati+7cc/snPeq8USI46o29o7eHmnw83BH5zyfykHw7a3Xm1PZWXw/DX5TNtbFN+pWN3UAgE0impxZqex69Vs0Teva4v/0dSoNaDSj8SxeTxzyfnc1fjrnxe761LT+qQax9sjuul3XWwMAsMnEc2TRrI3nvM6x2D+V0w7ObidG4by20Lg6DW7YYnxZNb4x55fuuv0GXJz2cG0qn0Bp18Wa+kxSAIAt0japvGQwVnFk1ndp5DdYh2vY6sPcL+1qIQ6Ur32f80XOlWnwuhiP1DACAGz2HkqlaRuLuE37Vyrnn45kNA1bvFzRa9jaly/i+b5vcpZ1c23DdnE1BgDY4sStxg/a4hDiwf/9ck5MZTfuz1SapevrHw1jNA1bNF29Ri3OU61Fs7Ym55o0eF2M43B4AIAtUnzjLV4IGG8eTKPTa9ji2KueGJ9bjZd2tdA2kPEiRPx7p6fB62J8QjUGAGAceg1b/axbjC+vxnHCw+/d9SNVPcRvb08D36qr18WanaoxAADjcEMqjdbCqrZnKi8S7J5zQCpvqO5bzd9VXdc7eb11IdbVawAAGIfHUmnWIvHc2yXVXDwTd1POAzkHV/UQz7Tdm8pu27RmLtY9k8o6AAAAAJgcDmkLGxAvAITXUvmYLQAAfTYvDb7tuCF3dn8fzbmqngAAoD/ipIAZqZw2EGdzzk/l+2ptrkulsYuD2UM8Y3ZPdw0AQB/FW5fHt8UNuKX7Gw1bfRA7AAB9ELdDv855JefkVD6me2wavLvWy/Q08MmNJ1I53xMAgD5anrMo56Kc53KWrD89pDjO6qlUzvYEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAGBz9S+JfBIYUzdHWQAAAABJRU5ErkJggg==>

[image5]: <data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACcAAAAYCAYAAAB5j+RNAAAB6klEQVR4Xu2VSyimURjHH9fcGveFMBmUhJKUzGLCxsLKguVslAUTNe65LCzIJSVZaDKhiIUNsSGXErkkNSVly9TMSspYWPB/ep73+873uiwY37t5f/Wrc/7nPb3nPZf3ELm4uDzLZ7gP7+A9/AXX4A78rZllkvbxOzwgHkCqvQFUwRsYaG/wBxHwH9yzNyjB8Nge+otyklnrNLJk2K7lSPjDaPMrAySDK9B6AJyA9Z4nHGSXfDe+ZY75kBPEkpzUZSPjQV0YdeYbvIYVtvxdqSSZpVYjy4JTRp3hQ8EnNsGWvytjJIMrNrIoGG/UmRJy4MSewiuSmXmJbngIu+AqTNO8FP6Eg3AIdmjOpMBe2EO+h+sLnCTp02fkPmSTzNqSveEJ+Cddo2XeAqMwHf6FHzXfgNVaZmZgHsyF25rxx6zAEBgNZzX3UEbyshPynsxzerzPLEJJDgMvNzNC8uXj5O3Dt8cf8r3i+Hd0CfuNfAvOk8xoG8zQ/NXkwwOjzjdJI8n9a80mP8Nb5AMMhzEky1oH1+GwPndL//kX9QluarkIHsEwuEhyuzC8J6fhd5hJMqBmbWuCDVo+g4VaTiTZd2+Gl5JdgHGa8Y3Cp52vvVpt49uG+QpbSF7Oyx+kOfeZI+/WsPari4sjPADKpWB5oc53IwAAAABJRU5ErkJggg==>

[image6]: <data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAB4AAAAYCAYAAADtaU2/AAABgklEQVR4Xu2UPSiFURjH/z4SiZKPhUkpsjDZKCnKwGAyXaIoJBubQtkNFkq+2XyVryLFxi5mAymTSfyf/qd7z/tyu7jK8v7qV+c8z3mf97znPPcCEREREX9AjF7RG7pMG+gm3aDtiWUpqaXr9BSq6WP1Rv1AjE7QLJpH3+k1Labn0Ia+gz1/QYvoLH3wchVQ3R4vhh2a4cbV0IJhaBP2xU0ul4pGOg7VuqX7Xq4XqlvlxQIMQgsqw4kf0AbV6PZiSwiewCfWoN2mwxx9oblungm9dCu+gmTTadpFc+gTXfDynQjei92fze0+k2F9ceDN66ETGPFiaHbBITrgxjMuV0oPaYGbGyvQmkB3hlilJ25s970HPVMXX0EKoQayXdpLWugl3aaTUGf7TNE36EqSUQ5tcBeqdUcfoSNPixKoWb4iH8HGtPkzXfRiv6aD9oWDDvvCVyR6YAw6IbvntLA7O6Jl4YTjns67cQ3UrP2J9O+xZrTfaTJaob/cY3oGrY/4Pz4AdglIb1AxrVQAAAAASUVORK5CYII=>

[image7]: <data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACIAAAAYCAYAAACfpi8JAAABk0lEQVR4Xu2UyysFcRTHj0QRidiQjUeWbJXXSkpJKVKShdhYUJKSBbKjbGzk2lCSJDaKUhSShWw8yqPIP0BSSnzPPb+ZzvxmFiO5tzSf+tScx/3dmd+LKCIiwqUInsEv+GzVkgK/xJKdTDQVJDPSbhcSzQD8gDl2waYFHsI9WK3yNfAaZsAUeAC3VD0sGyS/HYZr8BQuwDzdVACXzfMxXFG1Rfio4k34SfJSYUmDr/ANNppcLslSDTlNzAishaUBxQcYU3EZvFFxGOpJxu1TuWyTG1Q5l2mSYqGJy03c4zSQvKwze2GZgu8ky+vAW4HHrlQ5l3O4o+J+kuYSleuF3SoOwwl5x2X4Y26tXJxUkj8dV7k5+KJi7tkm75dxrotknwWRT/7l5l6eoQkT++6WKzhvnnkzXZIMUkyyOcdgm6k7OLPGpyKIDvIvQbPJVcFOOKpqcergPdyHF7AVrsM7eERyF9g0kZyiJ7tgmIS7Vi4TrpJcFTMw3Vv+HfYeSAp8Kf30JP0Js7DBTiaaLPKetIj/xzfKtE5C5X5nNQAAAABJRU5ErkJggg==>

[image8]: <data:image/png;base64,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>