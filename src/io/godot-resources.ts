import { type AssetClass } from '../classes/asset.js';

function gcd(a: number, b: number): number {
  return b === 0 ? a : gcd(b, a % b);
}

function computeGCDOfArray(arr: number[]): number {
  if (arr.length === 0) return 1;
  let result = arr[0];
  for (let i = 1; i < arr.length; i++) {
    result = gcd(result, arr[i]);
  }
  return Math.abs(result);
}

export function generateGodotSpriteFrames(
  asset: AssetClass,
  stripPngPath: string,
  scaleFactor: number = 1,
): string {
  const width = asset.width * scaleFactor;
  const height = asset.height * scaleFactor;

  let tres = `[gd_resource type="SpriteFrames" load_steps=${String(asset.frames.length + 2)} format=3]\n\n`;
  tres += `[ext_resource type="Texture2D" path="res://${stripPngPath}" id="1_tex"]\n\n`;

  for (let i = 0; i < asset.frames.length; i++) {
    tres += `[sub_resource type="AtlasTexture" id="AtlasTexture_f${String(i)}"]\n`;
    tres += `atlas = ExtResource("1_tex")\n`;
    tres += `region = Rect2(${String(i * width)}, 0, ${String(width)}, ${String(height)})\n\n`;
  }

  tres += `[resource]\n`;
  tres += `animations = [`;

  const frameTags = asset.tags.filter((t) => t.type === 'frame');
  const animations: string[] = [];

  if (frameTags.length === 0) {
    const durations = asset.frames.map((f) => f.duration_ms || 100);
    const gcdDuration = computeGCDOfArray(durations);
    const fps = 1000 / (gcdDuration > 0 ? gcdDuration : 100);

    let animDef = `{\n"frames": [`;
    const frameRefs = asset.frames.map((f, i) => {
      const durMultiplier = (f.duration_ms || 100) / (gcdDuration > 0 ? gcdDuration : 100);
      return `{\n"duration": ${durMultiplier.toFixed(1)},\n"texture": SubResource("AtlasTexture_f${String(i)}")\n}`;
    });
    animDef +=
      frameRefs.join(', ') +
      `],\n"loop": true,\n"name": &"default",\n"speed": ${fps.toFixed(2)}\n}`;
    animations.push(animDef);
  } else {
    for (const tag of frameTags) {
      const start = tag.start;
      const end = tag.end;

      const sequence: number[] = [];
      const dir = tag.direction;
      if (dir === 'forward') {
        for (let i = start; i <= end; i++) sequence.push(i);
      } else if (dir === 'reverse') {
        for (let i = end; i >= start; i--) sequence.push(i);
      } else {
        for (let i = start; i <= end; i++) sequence.push(i);
        if (end > start) {
          for (let i = end - 1; i > start; i--) sequence.push(i);
        }
      }

      const seqDurations = sequence.map((idx) => asset.frames[idx].duration_ms || 100);
      let gcdDuration = computeGCDOfArray(seqDurations);
      if (gcdDuration === 0) gcdDuration = 100;
      const fps = 1000 / gcdDuration;

      const animName = tag.facing ? `${tag.name}_${tag.facing}` : tag.name;

      let animDef = `{\n"frames": [`;
      const frameRefs = sequence.map((idx) => {
        const durMultiplier = (asset.frames[idx].duration_ms || 100) / gcdDuration;
        return `{\n"duration": ${durMultiplier.toFixed(1)},\n"texture": SubResource("AtlasTexture_f${String(idx)}")\n}`;
      });
      animDef +=
        frameRefs.join(', ') +
        `],\n"loop": true,\n"name": &"${animName}",\n"speed": ${fps.toFixed(2)}\n}`;
      animations.push(animDef);
    }
  }

  tres += animations.join(', ') + `]\n`;
  return tres;
}

export function generateGodotShapesAnimation(asset: AssetClass, scaleFactor: number = 1): string {
  const shapeLayers = asset.layers.filter((l) => l.type === 'shape');
  if (shapeLayers.length === 0) return ''; // Should not be called if no shape layers

  let subResources = '';
  let subResIdNum = 1;

  const shapeMap = new Map<string, string>();

  for (const layer of shapeLayers) {
    for (let f = 0; f < asset.frames.length; f++) {
      const shapes = asset.getShapes(layer.id, f);
      if (shapes.length > 0) {
        const shape = shapes[0];
        let subResId = '';
        if (shape.type === 'rect') {
          subResId = `RectangleShape2D_${String(layer.id)}_${String(f)}_${String(subResIdNum++)}`;
          subResources += `[sub_resource type="RectangleShape2D" id="${subResId}"]\n`;
          subResources += `size = Vector2(${String(shape.width * scaleFactor)}, ${String(shape.height * scaleFactor)})\n\n`;
        } else {
          subResId = `ConvexPolygonShape2D_${String(layer.id)}_${String(f)}_${String(subResIdNum++)}`;
          subResources += `[sub_resource type="ConvexPolygonShape2D" id="${subResId}"]\n`;
          const pts = shape.points
            .map((pt) => `${String(pt[0] * scaleFactor)}, ${String(pt[1] * scaleFactor)}`)
            .join(', ');
          subResources += `points = PackedVector2Array(${pts})\n\n`;
        }
        shapeMap.set(`${String(layer.id)}_${String(f)}`, subResId);
      }
    }
  }

  let tres = `[gd_resource type="Animation" load_steps=${String(subResIdNum)} format=3]\n\n`;
  if (subResources) {
    tres += subResources;
  }

  tres += `[resource]\n`;
  tres += `resource_name = "${asset.name}_shapes"\n`;

  const durations = asset.frames.map((f) => f.duration_ms || 100);
  const totalLength = durations.reduce((a, b) => a + b, 0) / 1000.0;
  tres += `length = ${totalLength.toFixed(3)}\n`;

  for (let i = 0; i < shapeLayers.length; i++) {
    const layer = shapeLayers[i];
    const role = layer.role ? layer.role : layer.name;
    tres += `tracks/${String(i)}/type = "value"\n`;
    tres += `tracks/${String(i)}/imported = false\n`;
    tres += `tracks/${String(i)}/enabled = true\n`;
    tres += `tracks/${String(i)}/path = NodePath("${role}:shape")\n`;
    tres += `tracks/${String(i)}/interp = 1\n`;
    tres += `tracks/${String(i)}/loop_wrap = true\n`;
    tres += `tracks/${String(i)}/keys = {\n"times": PackedFloat32Array(`;

    const times: number[] = [];
    let currentTime = 0;
    for (let f = 0; f < asset.frames.length; f++) {
      times.push(currentTime);
      currentTime += durations[f] / 1000.0;
    }
    tres += times.map((t) => t.toFixed(3)).join(', ') + `),\n"transitions": PackedFloat32Array(`;
    tres += times.map(() => '1').join(', ') + `),\n"update": 1,\n"values": [`;

    const values = times.map((_, f) => {
      const subResId = shapeMap.get(`${String(layer.id)}_${String(f)}`);
      return subResId ? `SubResource("${subResId}")` : 'null';
    });

    tres += values.join(', ') + `]\n}\n`;
  }

  return tres;
}

export function generateGodotTileSet(
  asset: AssetClass,
  atlasPngPath: string,
  scaleFactor: number = 1,
): string {
  const tileW = (asset.tile_width ?? 16) * scaleFactor;
  const tileH = (asset.tile_height ?? 16) * scaleFactor;

  let tres = `[gd_resource type="TileSet" load_steps=3 format=3]\n\n`;
  tres += `[ext_resource type="Texture2D" path="res://${stripPngPath(atlasPngPath)}" id="1_tex"]\n\n`;

  tres += `[sub_resource type="TileSetAtlasSource" id="TileSetAtlasSource_1"]\n`;
  tres += `texture = ExtResource("1_tex")\n`;
  tres += `texture_region_size = Vector2i(${String(tileW)}, ${String(tileH)})\n`;

  const cols = Math.ceil(Math.sqrt(asset.tile_count ?? 1));

  if (asset.tile_physics || asset.tile_terrain) {
    if (asset.tile_physics) {
      for (const tileStr of Object.keys(asset.tile_physics.tiles)) {
        const idx = parseInt(tileStr, 10);
        const col = idx % cols;
        const row = Math.floor(idx / cols);
        const poly = asset.tile_physics.tiles[tileStr].polygon;
        if (poly && poly.length > 0) {
          tres += `${String(col)}:${String(row)}/0 = 0\n`;
          const points = poly
            .map(
              (pt: [number, number]) =>
                `${String(pt[0] * scaleFactor)}, ${String(pt[1] * scaleFactor)}`,
            )
            .join(', ');
          tres += `${String(col)}:${String(row)}/0/physics_layer_0/polygon_0/points = PackedVector2Array(${points})\n`;
        }
      }
    }
    if (asset.tile_terrain) {
      const terrain = asset.tile_terrain;
      for (const tileStr of Object.keys(terrain.peering_bits)) {
        const idx = parseInt(tileStr, 10);
        const col = idx % cols;
        const row = Math.floor(idx / cols);
        const bits = terrain.peering_bits[tileStr];
        tres += `${String(col)}:${String(row)}/0 = 0\n`;
        tres += `${String(col)}:${String(row)}/0/terrain_set = 0\n`;
        tres += `${String(col)}:${String(row)}/0/terrain = 0\n`;
        for (const [side, bitVal] of Object.entries(bits)) {
          tres += `${String(col)}:${String(row)}/0/terrains_peering_bit/${side} = ${String(bitVal)}\n`;
        }
      }
    }
  }

  tres += `\n[resource]\n`;
  tres += `tile_size = Vector2i(${String(tileW)}, ${String(tileH)})\n`;
  if (asset.tile_physics) {
    tres += `physics_layer_0/collision_layer = 1\n`;
  }
  if (asset.tile_terrain) {
    let mode = 0; // MATCH_CORNERS_AND_SIDES
    if (asset.tile_terrain.pattern === '4corner') mode = 1; // MATCH_CORNERS
    if (asset.tile_terrain.pattern === '4side') mode = 2; // MATCH_SIDES

    tres += `terrain_set_0/mode = ${String(mode)}\n`;
    const terrainName = asset.tile_terrain.terrain_name || 'Terrain';
    tres += `terrain_set_0/terrain_0/name = "${terrainName}"\n`;
    tres += `terrain_set_0/terrain_0/color = Color(0.5, 0.5, 0.5, 1)\n`;
  }
  tres += `sources/0 = SubResource("TileSetAtlasSource_1")\n`;

  return tres;
}

function stripPngPath(path: string): string {
  return path;
}
