# Example Art Asset Directory
An example of a realistic art asset directory for a 2D Godot game. 
This is not a real game, just an example of how a 2D Godot game would organize its art assets.

**!! NOTES !!**
- Shaders are only for reference, pixelMCP won't support shader design


**Example Asset Directory Structure**
```text
assets/art/
├── characters/
│   ├── base_bodies/              # Base body sprite sheets (per body type)
│   │   ├── human_male_a/
│   │   │   ├── human_male_a.json                 # Source asset (all directions + states)
│   │   │   ├── human_male_a_strip.png            # Exported: Spritesheet strip
│   │   │   ├── human_male_a_strip.png.import     # Exported: Godot import settings
│   │   │   ├── human_male_a.tres                 # Exported: Godot SpriteFrames
│   │   │   └── human_male_a_shapes.tres          # Exported: Godot Animation (hitboxes)
│   │   └── human_female_a/
│   │       └── ...
│   ├── body_details/             # Hair, scars, facial features (per body type)
│   │   ├── hair_styles/
│   │   │   ├── hair_short_a.json
│   │   │   ├── hair_short_a_strip.png            # Exported: Spritesheet strip
│   │   │   ├── hair_short_a_strip.png.import
│   │   │   └── hair_short_a.tres
│   │   └── faces/
│   │       └── ...
│   ├── corruption/               # Corrupted body variants + overlays
│   │   ├── stage_1_recolor/      # Palette-swap lookup textures
│   │   ├── stage_2_distort/      # Alternate body-part sprite overlays
│   │   └── stage_3_replace/      # Full replacement base bodies
│   └── shaders/                      
│       ├── palette_swap.gdshader
│       ├── hit_flash.gdshader
│       └── corruption_overlay.gdshader
│
├── equipment/                    # Modular paper-doll equipment, organized by proportional fit
│   │                             # Variant keys = proportional canvas categories (not race names, not gender).
│   │                             # Gender is NOT a fit category at pixel art scales — male/female differences
│   │                             # are 1-2px and are expressed through the base body sprite + hair/clothing
│   │                             # layers. All bodies in a category share identical anchor points (hands,
│   │                             # feet, eye line), so equipment aligns correctly across M/F within a fit.
│   │                             # Exception: form-fitting items (chest armor, dresses) use standard_m /
│   │                             # standard_f sub-variants when the silhouette difference is visible.
│   ├── weapons/                  # Non-form-fitting — anchor-normalized, one variant per size category
│   │   ├── one_handed_melee/
│   │   │   ├── iron_sword/
│   │   │   │   └── standard/                 # Fits all standard-proportioned humanoids (M + F)
│   │   │   │       ├── iron_sword.json
│   │   │   │       ├── iron_sword_strip.png
│   │   │   │       ├── iron_sword_strip.png.import
│   │   │   │       ├── iron_sword.tres
│   │   │   │       └── iron_sword_shapes.tres
│   │   │   └── ...
│   │   ├── two_handed_melee/
│   │   ├── ranged/
│   │   └── aoe_spell/
│   ├── armor/
│   │   ├── head/                 # Helmets: non-form-fitting — one variant per size category
│   │   │   ├── iron_helm/
│   │   │   │   ├── standard/                 # Fits standard-proportioned humanoids (M + F)
│   │   │   │   │   ├── iron_helm.json
│   │   │   │   │   ├── iron_helm_strip.png
│   │   │   │   │   ├── iron_helm_strip.png.import
│   │   │   │   │   └── iron_helm.tres
│   │   │   │   ├── slim/                     # Fits slim-proportioned bodies (halfling, gnome)
│   │   │   │   │   └── ...
│   │   │   │   └── large/                    # Fits large-proportioned bodies (half-orc, goliath)
│   │   │   │       └── ...
│   │   │   └── ...
│   │   ├── chest/                # Form-fitting — split M/F when silhouette difference is visible
│   │   │   ├── iron_cuirass/
│   │   │   │   ├── standard_m/               # Standard canvas, male silhouette
│   │   │   │   │   ├── iron_cuirass.json
│   │   │   │   │   ├── iron_cuirass_strip.png
│   │   │   │   │   ├── iron_cuirass_strip.png.import
│   │   │   │   │   └── iron_cuirass.tres
│   │   │   │   └── standard_f/               # Standard canvas, female silhouette
│   │   │   │       └── ...
│   │   │   └── ...
│   │   ├── legs/
│   │   ├── boots/
│   │   └── cloaks/               # Non-form-fitting — one variant per size category
│   └── shared/
│       └── shaders/
│
├── environments/
│   ├── tilesets/
│   │   ├── fishing_village/
│   │   │   ├── terrain/
│   │   │   │   ├── ground_base.json      # Blob47 tileset source
│   │   │   │   ├── ground_base.png           # Exported: Godot tileset atlas
│   │   │   │   ├── ground_base.png.import    # Exported: Godot import settings
│   │   │   │   ├── ground_base.tres          # Exported: Godot TileSet (with collision)
│   │   │   │   ├── ground_detail.json    # Ground detail overlay tileset
│   │   │   │   ├── ground_detail.png
│   │   │   │   ├── ground_detail.png.import
│   │   │   │   ├── ground_detail.tres
│   │   │   │   ├── water.json            # Animated water (4 frames × 47 tiles)
│   │   │   │   ├── water.png
│   │   │   │   ├── water.png.import
│   │   │   │   └── water.tres
│   │   │   ├── structures/
│   │   │   │   ├── walls.json
│   │   │   │   ├── walls.png
│   │   │   │   ├── walls.png.import
│   │   │   │   ├── walls.tres
│   │   │   │   ├── doors.json
│   │   │   │   ├── doors.png
│   │   │   │   ├── doors.png.import
│   │   │   │   └── doors.tres
│   │   │   ├── corruption/       # Corrupted variants of this realm's tiles
│   │   │   │   ├── ground_corrupted.json
│   │   │   │   ├── ground_corrupted.png
│   │   │   │   ├── ground_corrupted.png.import
│   │   │   │   └── ground_corrupted.tres
│   │   │   └── palette/
│   │   │       └── fishing_village_palette.json  # Reference palette swatch
│   │   ├── house_in_woods/
│   │   │   └── ...               # Same internal structure
│   │   ├── lost_island/
│   │   │   └── ...
│   │   └── home_base/
│   │       └── ...
│   ├── props/
│   │   ├── interactables/        # Chests, altars, crafting stations
│   │   │   ├── chest_basic/
│   │   │   │   ├── chest_basic.json
│   │   │   │   ├── chest_basic_strip.png     # Exported: Idle + open animation strip
│   │   │   │   ├── chest_basic_strip.png.import
│   │   │   │   ├── chest_basic.tres          # Exported: Godot SpriteFrames
│   │   │   │   └── chest_basic_shapes.tres   # Exported: Godot Animation (hitboxes/interactables)
│   │   │   └── ...
│   │   ├── decorative/           # Non-interactive scenery
│   │   │   ├── brazier/
│   │   │   │   ├── brazier.json
│   │   │   │   ├── brazier_strip.png         # Exported: Animated flame loop
│   │   │   │   ├── brazier_strip.png.import
│   │   │   │   └── brazier.tres
│   │   │   └── ...
│   │   ├── destructibles/
│   │   │   └── ...
│   │   └── shared/               # Props reused across realms (crates, barrels)
│   │       └── ...
│   └── foreground/               # Occlusion layer assets (tree canopy, overhangs)
│       ├── tree_canopy_a.json
│       ├── tree_canopy_a.png                 # Exported: godot_static
│       └── tree_canopy_a.png.import          # Exported: Godot import settings
│
├── effects/
│   ├── particles/                # Particle textures (single-frame sprites)
│   │   ├── dust_mote.json
│   │   ├── dust_mote.png                 # Exported: godot_static
│   │   ├── dust_mote.png.import
│   │   ├── ember.json
│   │   ├── ember.png
│   │   ├── ember.png.import
│   │   ├── firefly.json
│   │   ├── firefly.png
│   │   ├── firefly.png.import
│   │   ├── corruption_wisp.json
│   │   ├── corruption_wisp.png
│   │   ├── corruption_wisp.png.import
│   │   ├── void_particle.json
│   │   ├── void_particle.png
│   │   └── void_particle.png.import
│   ├── vfx/                      # Visual effect sprite animations
│   │   ├── hit_spark/
│   │   ├── slash_trail/
│   │   ├── alchemical_burst/
│   │   └── corruption_tendril/
│   ├── post_processing/          # Full-screen shader files
│   │   ├── chromatic_aberration.gdshader
│   │   ├── vignette.gdshader
│   │   └── crt_scanline.gdshader
│   └── shaders/
│       └── shared/               # Reusable shader includes
│           ├── noise.gdshaderinc
│           └── palette_mapping.gdshaderinc
│
└── ui/                           # UI-specific art (icons, frames, etc.)
    ├── icons/
    │   ├── items/
    │   ├── status_effects/
    │   └── abilities/
    ├── frames/                   # Panel borders, dialog boxes
    └── hud/                      # Health bars, resource meters
pixelmcp.json                     # pixelmcp project file at the root of the game project
```
