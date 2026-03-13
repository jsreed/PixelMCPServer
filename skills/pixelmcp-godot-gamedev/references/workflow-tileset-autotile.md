# Workflow: Blob47 Tileset & Autotile

End-to-end workflow for creating a blob47 autotile tileset. Aligns with the `scaffold_tileset` built-in prompt.

## Canvas Layout

The blob47 system uses a **bitmask-as-slot-index** convention. The canvas is organized as an 8-column grid, with each tile's position derived from its bitmask value:

```
x = (bitmask % 8) * tile_width
y = Math.floor(bitmask / 8) * tile_height
```

For 16px tiles: canvas is 128×512 pixels — the bitmask-as-slot-index convention places bitmask 255 at y=496, requiring a full 512px tall canvas.

## Step-by-Step

### Step 1: Create the tileset asset

Blob47 uses bitmask-as-slot-index: the tile at bitmask value `v` occupies pixel position `x = (v % 8) * tile_width, y = floor(v / 8) * tile_height`. The highest canonical bitmask is 255, placing its top-left at pixel (112, 496). The canvas must be tall enough to hold it.

```
asset create
  name: "terrain_grass"
  width: 128          # tile_width * 8  (8-column grid)
  height: 512         # floor(255/8)*16 + 16 = 512 for 16px tiles
  tile_width: 16
  tile_height: 16
  perspective: "flat"
```

### Step 2: Set up the palette

```
palette fetch_lospec  slug="endesga-32"  asset_name="terrain_grass"
```

Plan your colors: darker tones for ground/shadow, mid tones for main surface, bright accent for highlights.

### Step 3: Dry-run autotile_generate

Call `tileset autotile_generate` **without** a `terrain_name` to get the list of canonical slot positions that need to be drawn:

```
tileset autotile_generate
  asset_name: "terrain_grass"
  pattern: "blob47"
  layer_id: <tiles_layer>
  # no terrain_name — dry run mode
```

The tool returns the 47 bitmask values you need to draw, with their pixel coordinates.

### Step 4: Draw tiles in priority order

Draw tiles from most general to most specific to build understanding:

1. **Interior (bitmask 255):** All 8 neighbors present. Full solid tile with no edge variations.
2. **Isolated (bitmask 0):** No neighbors. Tiny island tile — often a dot or small chunk.
3. **Single-edge variants (N/E/S/W only, bitmasks 1, 4, 16, 64):** One orthogonal neighbor. Edge tiles facing one direction.
4. **Corner variants:** Outside corners (e.g., bitmask 5 = N+E, no NE corner fill).
5. **T-junctions and other combinations:** Fill remaining slots.

For each tile at bitmask `v`, draw at pixel position `x = (v % 8) * 16, y = floor(v/8) * 16`.

Use `draw write_pixels` to fill each tile slot — the 2D array of palette indices maps directly.

Batch related tiles in one `draw` call using the `operations` array for a single undo step.

Show `pixel://view/tileset/terrain_grass` periodically to review coverage.

### Step 5: Assign terrain and peering bits

Once tiles are drawn, call `tileset autotile_generate` **with** a `terrain_name`:

```
tileset autotile_generate
  asset_name: "terrain_grass"
  pattern: "blob47"
  layer_id: <tiles_layer>
  terrain_name: "grass"
```

This assigns Godot 4 CellNeighbor peering bits to each tile slot, enabling Godot's autotile system to automatically place the correct tile based on neighbors.

### Step 6: Set physics collision

Use `tileset set_tile_physics` to define collision rectangles for tiles that should have collision (typically all solid tiles):

```
tileset set_tile_physics
  asset_name: "terrain_grass"
  tile_x: 0
  tile_y: 0
  shape: { type: "rect", x: 0, y: 0, width: 16, height: 16 }
```

For blob47, all solid tiles (non-empty bitmasks) typically get a full-tile collision rectangle. Water/transparent tiles get no collision.

For complex physics shapes (cliff edges, slopes), use `asset generate_collision_polygon` to trace pixel silhouettes and convert them to polygons automatically.

### Step 7: Export

```
workspace save  asset_name="terrain_grass"
export godot_tileset
  asset_name: "terrain_grass"
  output_path: "res://environments/tilesets/"
  terrain_name: "grass"
```

Output:
- `terrain_grass_atlas.png` — tile atlas image
- `terrain_grass_atlas.png.import` — import sidecar
- `terrain_grass.tres` — TileSetAtlasSource resource with terrain peering bits and physics

## Drawing Tips

- Use the interior tile (255) as your reference — establish the main surface look there first.
- Edge tiles should transition cleanly from the interior to the edge. Keep edges consistent across all bitmasks.
- Outside corners (e.g., NE corner with only N+E neighbors, bitmask 5) get a convex corner appearance.
- Inside corners (e.g., all neighbors present except NE, bitmask 253) get a concave corner — the "missing" diagonal creates an indented corner shape.
- Use `effect auto_aa` after drawing to smooth corners.

See `references/blob47-reference.md` for the complete bitmask table.
