import { expect, test, describe } from 'vitest';
import { AssetClass } from '../classes/asset.js';
import {
  generateGodotSpriteFrames,
  generateGodotShapesAnimation,
  generateGodotTileSet,
  generateGodotStyleBoxTexture,
  generateGodotAtlasTextures,
} from './godot-resources.js';
import { type Asset } from '../types/asset.js';
import { type PackPlacement } from '../algorithms/bin-pack.js';

function createDummyAsset(data: Partial<Asset> = {}): AssetClass {
  return new AssetClass({
    name: 'test',
    width: 16,
    height: 16,
    perspective: 'flat',
    palette: [],
    layers: [],
    frames: [],
    cels: {},
    tags: [],
    ...data,
  });
}

describe('godot-resources', () => {
  describe('generateGodotSpriteFrames', () => {
    test('generates SpriteFrames with default animation when no tags exist', () => {
      const asset = createDummyAsset({
        width: 16,
        height: 16,
        frames: [
          { index: 0, duration_ms: 100 },
          { index: 1, duration_ms: 100 },
        ],
        tags: [],
      });
      const res = generateGodotSpriteFrames(asset, 'test_strip.png', 1);

      expect(res).toContain('[gd_resource type="SpriteFrames" load_steps=4 format=3]');
      expect(res).toContain('path="res://test_strip.png"');
      expect(res).toContain('region = Rect2(0, 0, 16, 16)');
      expect(res).toContain('region = Rect2(16, 0, 16, 16)');
      expect(res).toContain('"name": &"default"');
      expect(res).toContain('"speed": 10.00'); // 1000/100
    });

    test('generates animations expanding ping-pong tags', () => {
      const asset = createDummyAsset({
        width: 10,
        height: 10,
        frames: [
          { index: 0, duration_ms: 200 },
          { index: 1, duration_ms: 200 },
          { index: 2, duration_ms: 200 },
        ],
        tags: [{ name: 'idle', type: 'frame', start: 0, end: 2, direction: 'ping_pong' }],
      });
      const res = generateGodotSpriteFrames(asset, 'test_strip.png', 1);

      expect(res).toContain('"name": &"idle"');
      expect(res).toContain('SubResource("AtlasTexture_f0")');
      expect(res).toContain('SubResource("AtlasTexture_f1")');
      expect(res).toContain('SubResource("AtlasTexture_f2")');
      // ping_pong of 0, 1, 2 = 0, 1, 2, 1
      expect(res.split('AtlasTexture_f1').length).toBe(4); // 1 declaration + 2 usages + 1 original declaration
    });

    test('scales region sizes appropriately', () => {
      const asset = createDummyAsset({
        width: 10,
        height: 10,
        frames: [{ index: 0, duration_ms: 100 }],
      });
      const res = generateGodotSpriteFrames(asset, 'test_strip.png', 2);
      expect(res).toContain('region = Rect2(0, 0, 20, 20)');
    });
  });

  describe('generateGodotShapesAnimation', () => {
    test('returns empty if no shape layers', () => {
      const asset = createDummyAsset({ layers: [] });
      const res = generateGodotShapesAnimation(asset);
      expect(res).toBe('');
    });

    test('generates Animation resource with tracks for shape layers', () => {
      const asset = createDummyAsset({
        layers: [
          {
            id: 1,
            name: 'hitbox',
            type: 'shape',
            visible: true,
            opacity: 255,
            role: 'hitbox',
            physics_layer: 1,
          },
        ],
        frames: [
          { index: 0, duration_ms: 200 },
          { index: 1, duration_ms: 200 },
        ],
        tags: [],
        cels: {
          '1/0': { shapes: [{ type: 'rect', name: 'main', x: 2, y: 2, width: 4, height: 4 }] },
          '1/1': {
            shapes: [
              {
                type: 'polygon',
                name: 'main',
                points: [
                  [0, 0],
                  [4, 0],
                  [4, 4],
                  [0, 4],
                ],
              },
            ],
          },
        },
      });
      const res = generateGodotShapesAnimation(asset, 2); // scale by 2

      expect(res).toContain('resource_name = "test_shapes"');
      expect(res).toContain('length = 0.400'); // 2 * 200ms
      expect(res).toContain('path = NodePath("hitbox:shape")');
      expect(res).toContain('SubResource("RectangleShape2D_1_0_1")');
      expect(res).toContain('size = Vector2(8, 8)'); // 4 * 2 = 8
      expect(res).toContain('SubResource("ConvexPolygonShape2D_1_1_2")');
      expect(res).toContain('points = PackedVector2Array(0, 0, 8, 0, 8, 8, 0, 8)');

      // key times
      expect(res).toContain('"times": PackedFloat32Array(0.000, 0.200)');
    });
  });

  describe('generateGodotStyleBoxTexture', () => {
    test('generates StyleBoxTexture with correct margins', () => {
      const res = generateGodotStyleBoxTexture('panels/dialog.png', {
        top: 4,
        right: 6,
        bottom: 8,
        left: 10,
      });
      expect(res).toContain('[gd_resource type="StyleBoxTexture" load_steps=2 format=3]');
      expect(res).toContain('path="res://panels/dialog.png"');
      expect(res).toContain('texture_margin_left = 10.0');
      expect(res).toContain('texture_margin_top = 4.0');
      expect(res).toContain('texture_margin_right = 6.0');
      expect(res).toContain('texture_margin_bottom = 8.0');
    });

    test('scales margins by scaleFactor', () => {
      const res = generateGodotStyleBoxTexture(
        'panel.png',
        { top: 4, right: 4, bottom: 4, left: 4 },
        3,
      );
      expect(res).toContain('texture_margin_left = 12.0');
      expect(res).toContain('texture_margin_top = 12.0');
      expect(res).toContain('texture_margin_right = 12.0');
      expect(res).toContain('texture_margin_bottom = 12.0');
    });

    test('formats margins with one decimal place', () => {
      const res = generateGodotStyleBoxTexture('panel.png', {
        top: 8,
        right: 8,
        bottom: 8,
        left: 8,
      });
      expect(res).toContain('texture_margin_left = 8.0');
      expect(res).toContain('texture_margin_top = 8.0');
      // Should NOT have "8" without decimal
      expect(res).not.toMatch(/texture_margin_left = 8\n/);
    });
  });

  describe('generateGodotAtlasTextures', () => {
    test('generates Resource with AtlasTexture sub-resources', () => {
      const placements: PackPlacement[] = [
        { id: 'icon_sword', x: 0, y: 0, width: 16, height: 16 },
        { id: 'icon_shield', x: 16, y: 0, width: 16, height: 16 },
      ];
      const res = generateGodotAtlasTextures('atlas.png', placements);

      expect(res).toContain('[gd_resource type="Resource"');
      expect(res).toContain('type="AtlasTexture" id="AtlasTexture_icon_sword"');
      expect(res).toContain('type="AtlasTexture" id="AtlasTexture_icon_shield"');
      expect(res).toContain('region = Rect2(0, 0, 16, 16)');
      expect(res).toContain('region = Rect2(16, 0, 16, 16)');
    });

    test('sanitizes IDs (hyphens to underscores)', () => {
      const placements: PackPlacement[] = [{ id: 'my-icon', x: 0, y: 0, width: 8, height: 8 }];
      const res = generateGodotAtlasTextures('atlas.png', placements);
      expect(res).toContain('AtlasTexture_my_icon');
      expect(res).not.toContain('my-icon');
    });

    test('calculates load_steps correctly', () => {
      const placements: PackPlacement[] = [
        { id: 'a', x: 0, y: 0, width: 8, height: 8 },
        { id: 'b', x: 8, y: 0, width: 8, height: 8 },
        { id: 'c', x: 0, y: 8, width: 8, height: 8 },
      ];
      // N=3 placements → load_steps = 3 + 2 = 5
      const res = generateGodotAtlasTextures('atlas.png', placements);
      expect(res).toContain('load_steps=5');
    });

    test('assigns atlas ExtResource to all sub-resources', () => {
      const placements: PackPlacement[] = [
        { id: 'a', x: 0, y: 0, width: 8, height: 8 },
        { id: 'b', x: 8, y: 0, width: 8, height: 8 },
      ];
      const res = generateGodotAtlasTextures('atlas.png', placements);
      const matches = res.match(/atlas = ExtResource\("1_tex"\)/g);
      expect(matches).toHaveLength(2);
    });
  });

  describe('generateGodotTileSet', () => {
    test('generates basic TileSet without terrain/physics', () => {
      const asset = createDummyAsset({
        tile_width: 8,
        tile_height: 8,
        tile_count: 4,
      });
      const res = generateGodotTileSet(asset, 'atlas.png', 1);

      expect(res).toContain('[gd_resource type="TileSet"');
      expect(res).toContain('texture_region_size = Vector2i(8, 8)');
      expect(res).toContain('path="res://atlas.png"');
    });

    test('embeds physics and terrain peering bits', () => {
      const asset = createDummyAsset({
        tile_width: 8,
        tile_height: 8,
        tile_count: 4,
        tile_physics: {
          physics_layers: [{ collision_layer: 1, collision_mask: 1 }],
          tiles: {
            '1': {
              polygon: [
                [0, 0],
                [16, 0],
                [16, 16],
                [0, 16],
              ],
            },
          },
        },
        tile_terrain: {
          pattern: 'blob47',
          terrain_name: 'Grass',
          peering_bits: {
            '1': {
              bottom: 0,
              right: 0,
              top: -1,
              top_right: -1,
              bottom_right: -1,
              bottom_left: -1,
              left: -1,
              top_left: -1,
            },
          },
        },
      });
      const res = generateGodotTileSet(asset, 'atlas.png', 2); // scale 2

      expect(res).toContain('tile_size = Vector2i(16, 16)');
      // Tiles are in a horizontal strip: col=slot_index, row=0 always
      expect(res).toContain(
        '1:0/0/physics_layer_0/polygon_0/points = PackedVector2Array(0, 0, 32, 0, 32, 32, 0, 32)',
      );
      expect(res).toContain('physics_layer_0/collision_layer = 1');
      expect(res).toContain('terrain_set_0/terrain_0/name = "Grass"');

      // terrain peering bits
      expect(res).toContain('1:0/0/terrains_peering_bit/bottom = 0');
      expect(res).toContain('1:0/0/terrains_peering_bit/right = 0');
    });

    test('emits animation properties for animated tiles', () => {
      const asset = createDummyAsset({
        tile_width: 16,
        tile_height: 16,
        tile_count: 4,
        tile_animation: {
          '0': { frame_count: 4, frame_duration_ms: 200, separation: 0 },
        },
      });
      const res = generateGodotTileSet(asset, 'atlas.png', 1);

      expect(res).toContain('0:0/0 = 0');
      expect(res).toContain('0:0/0/animation_columns = 4');
      expect(res).toContain('0:0/0/animation_speed_fps = 5.0'); // 1000/200
      expect(res).toContain('0:0/0/animation_frames_count = 4');
    });

    test('does NOT emit animation_separation when separation is 0', () => {
      const asset = createDummyAsset({
        tile_width: 16,
        tile_height: 16,
        tile_count: 4,
        tile_animation: {
          '2': { frame_count: 2, frame_duration_ms: 100, separation: 0 },
        },
      });
      const res = generateGodotTileSet(asset, 'atlas.png', 1);

      expect(res).not.toContain('animation_separation');
    });

    test('emits animation_separation when separation > 0', () => {
      const asset = createDummyAsset({
        tile_width: 16,
        tile_height: 16,
        tile_count: 4,
        tile_animation: {
          '1': { frame_count: 3, frame_duration_ms: 100, separation: 4 },
        },
      });
      const res = generateGodotTileSet(asset, 'atlas.png', 1);

      expect(res).toContain('1:0/0/animation_separation = Vector2i(4, 0)');
    });

    test('scales separation by scaleFactor', () => {
      const asset = createDummyAsset({
        tile_width: 16,
        tile_height: 16,
        tile_count: 4,
        tile_animation: {
          '0': { frame_count: 2, frame_duration_ms: 100, separation: 4 },
        },
      });
      const res = generateGodotTileSet(asset, 'atlas.png', 2);

      expect(res).toContain('0:0/0/animation_separation = Vector2i(8, 0)');
    });

    test('emits animation alongside physics (both present in output)', () => {
      const asset = createDummyAsset({
        tile_width: 16,
        tile_height: 16,
        tile_count: 4,
        tile_physics: {
          physics_layers: [{ collision_layer: 1, collision_mask: 1 }],
          tiles: {
            '0': {
              polygon: [
                [0, 0],
                [16, 0],
                [16, 16],
                [0, 16],
              ],
            },
          },
        },
        tile_animation: {
          '1': { frame_count: 3, frame_duration_ms: 150, separation: 0 },
        },
      });
      const res = generateGodotTileSet(asset, 'atlas.png', 1);

      expect(res).toContain('0:0/0/physics_layer_0/polygon_0/points');
      expect(res).toContain('1:0/0/animation_columns = 3');
      expect(res).toContain('physics_layer_0/collision_layer = 1');
    });

    test('emits custom data layer definitions in [resource] section', () => {
      const asset = createDummyAsset({
        tile_width: 16,
        tile_height: 16,
        tile_count: 4,
        tile_custom_data: {
          layers: [
            { name: 'movement_cost', type: 'int' },
            { name: 'terrain_type', type: 'string' },
          ],
          tiles: { '0': { movement_cost: 2, terrain_type: 'grass' } },
        },
      });
      const res = generateGodotTileSet(asset, 'atlas.png', 1);

      expect(res).toContain('custom_data_layer_0/name = "movement_cost"');
      expect(res).toContain('custom_data_layer_0/type = 2');
      expect(res).toContain('custom_data_layer_1/name = "terrain_type"');
      expect(res).toContain('custom_data_layer_1/type = 4');
    });

    test('emits per-tile custom data values in sub_resource section', () => {
      const asset = createDummyAsset({
        tile_width: 16,
        tile_height: 16,
        tile_count: 4,
        tile_custom_data: {
          layers: [
            { name: 'movement_cost', type: 'int' },
            { name: 'terrain_type', type: 'string' },
          ],
          tiles: { '0': { movement_cost: 2, terrain_type: 'grass' } },
        },
      });
      const res = generateGodotTileSet(asset, 'atlas.png', 1);

      expect(res).toContain('0:0/0/custom_data_0 = 2');
      expect(res).toContain('0:0/0/custom_data_1 = "grass"');
    });

    test('formats bool custom data as true/false', () => {
      const asset = createDummyAsset({
        tile_width: 16,
        tile_height: 16,
        tile_count: 4,
        tile_custom_data: {
          layers: [{ name: 'is_destructible', type: 'bool' }],
          tiles: { '0': { is_destructible: true } },
        },
      });
      const res = generateGodotTileSet(asset, 'atlas.png', 1);

      expect(res).toContain('0:0/0/custom_data_0 = true');
    });

    test('formats float custom data as number', () => {
      const asset = createDummyAsset({
        tile_width: 16,
        tile_height: 16,
        tile_count: 4,
        tile_custom_data: {
          layers: [{ name: 'speed_mult', type: 'float' }],
          tiles: { '0': { speed_mult: 1.5 } },
        },
      });
      const res = generateGodotTileSet(asset, 'atlas.png', 1);

      expect(res).toContain('0:0/0/custom_data_0 = 1.5');
    });

    test('emits custom data alongside physics and animation', () => {
      const asset = createDummyAsset({
        tile_width: 16,
        tile_height: 16,
        tile_count: 4,
        tile_physics: {
          physics_layers: [{ collision_layer: 1, collision_mask: 1 }],
          tiles: {
            '0': {
              polygon: [
                [0, 0],
                [16, 0],
                [16, 16],
                [0, 16],
              ],
            },
          },
        },
        tile_animation: {
          '1': { frame_count: 2, frame_duration_ms: 100, separation: 0 },
        },
        tile_custom_data: {
          layers: [{ name: 'movement_cost', type: 'int' }],
          tiles: { '2': { movement_cost: 3 } },
        },
      });
      const res = generateGodotTileSet(asset, 'atlas.png', 1);

      expect(res).toContain('0:0/0/physics_layer_0/polygon_0/points');
      expect(res).toContain('1:0/0/animation_columns = 2');
      expect(res).toContain('2:0/0/custom_data_0 = 3');
      expect(res).toContain('custom_data_layer_0/name = "movement_cost"');
    });

    test('does not emit custom data when tile_custom_data is undefined', () => {
      const asset = createDummyAsset({
        tile_width: 16,
        tile_height: 16,
        tile_count: 4,
        tile_physics: {
          physics_layers: [{ collision_layer: 1, collision_mask: 1 }],
          tiles: {
            '0': {
              polygon: [
                [0, 0],
                [16, 0],
                [16, 16],
                [0, 16],
              ],
            },
          },
        },
      });
      const res = generateGodotTileSet(asset, 'atlas.png', 1);

      expect(res).not.toContain('custom_data_layer');
    });

    test('emits occlusion layer definition when tiles have occlusion data', () => {
      const asset = createDummyAsset({
        tile_width: 16,
        tile_height: 16,
        tile_count: 2,
        tile_physics: {
          physics_layers: [{ collision_layer: 1, collision_mask: 1 }],
          tiles: {
            '0': {
              occlusion_polygon: [
                [0, 0],
                [16, 0],
                [16, 16],
                [0, 16],
              ],
            },
          },
        },
      });
      const res = generateGodotTileSet(asset, 'atlas.png', 1);

      expect(res).toContain('occlusion_layer_0/light_mask = 1');
    });

    test('emits per-tile occlusion polygon', () => {
      const asset = createDummyAsset({
        tile_width: 16,
        tile_height: 16,
        tile_count: 2,
        tile_physics: {
          physics_layers: [{ collision_layer: 1, collision_mask: 1 }],
          tiles: {
            '1': {
              occlusion_polygon: [
                [0, 0],
                [16, 0],
                [16, 16],
                [0, 16],
              ],
            },
          },
        },
      });
      const res = generateGodotTileSet(asset, 'atlas.png', 1);

      expect(res).toContain(
        '1:0/0/occlusion_layer_0/polygon = PackedVector2Array(0, 0, 16, 0, 16, 16, 0, 16)',
      );
    });

    test('scales occlusion polygon by scaleFactor', () => {
      const asset = createDummyAsset({
        tile_width: 16,
        tile_height: 16,
        tile_count: 2,
        tile_physics: {
          physics_layers: [{ collision_layer: 1, collision_mask: 1 }],
          tiles: {
            '0': {
              occlusion_polygon: [
                [0, 0],
                [8, 0],
                [8, 8],
                [0, 8],
              ],
            },
          },
        },
      });
      const res = generateGodotTileSet(asset, 'atlas.png', 2);

      expect(res).toContain(
        '0:0/0/occlusion_layer_0/polygon = PackedVector2Array(0, 0, 16, 0, 16, 16, 0, 16)',
      );
    });

    test('does not emit occlusion layer when no tiles have occlusion data', () => {
      const asset = createDummyAsset({
        tile_width: 16,
        tile_height: 16,
        tile_count: 2,
        tile_physics: {
          physics_layers: [{ collision_layer: 1, collision_mask: 1 }],
          tiles: {
            '0': {
              polygon: [
                [0, 0],
                [16, 0],
                [16, 16],
                [0, 16],
              ],
            },
          },
        },
      });
      const res = generateGodotTileSet(asset, 'atlas.png', 1);

      expect(res).not.toContain('occlusion_layer');
    });

    test('uses col=slot_index row=0 for high tile indices (horizontal strip layout)', () => {
      // blob47 uses bitmask values as slot indices — some are >= tile_count.
      // With the old sqrt(tile_count) formula, tile 255 on a 47-tile set would have
      // wrapped to a non-zero row. With the correct formula it must always be row 0.
      const asset = createDummyAsset({
        tile_width: 16,
        tile_height: 16,
        tile_count: 47,
        tile_physics: {
          physics_layers: [{ collision_layer: 1, collision_mask: 1 }],
          tiles: {
            '255': {
              polygon: [
                [0, 0],
                [16, 0],
                [16, 16],
                [0, 16],
              ],
            },
          },
        },
        tile_terrain: {
          pattern: 'blob47',
          terrain_name: 'terrain',
          peering_bits: {
            '255': {
              top: 0,
              top_right: 0,
              right: 0,
              bottom_right: 0,
              bottom: 0,
              bottom_left: 0,
              left: 0,
              top_left: 0,
            },
          },
        },
      });
      const res = generateGodotTileSet(asset, 'atlas.png', 1);

      // Tile 255 must be at col=255, row=0 — not wrapped into a square grid
      expect(res).toContain('255:0/0 = 0');
      expect(res).toContain('255:0/0/physics_layer_0/polygon_0/points');
      expect(res).toContain('255:0/0/terrain_set = 0');
      expect(res).toContain('255:0/0/terrains_peering_bit/top = 0');
      // Must NOT appear as a non-zero row
      expect(res).not.toMatch(/255:\d+\/0\/0/); // not 255:1/0, 255:2/0, etc.
    });

    test('emits alternative tile with flip_h', () => {
      const asset = createDummyAsset({
        tile_width: 16,
        tile_height: 16,
        tile_count: 1,
        tile_alternatives: {
          '0': [{ alternative_id: 1, flip_h: true, flip_v: false, transpose: false }],
        },
      });
      const res = generateGodotTileSet(asset, 'atlas.png', 1);

      expect(res).toContain('0:0/1 = 0');
      expect(res).toContain('0:0/1/flip_h = true');
      expect(res).not.toContain('0:0/1/flip_v');
      expect(res).not.toContain('0:0/1/transpose');
    });

    test('emits alternative with all transform flags', () => {
      const asset = createDummyAsset({
        tile_width: 16,
        tile_height: 16,
        tile_count: 1,
        tile_alternatives: {
          '0': [{ alternative_id: 2, flip_h: true, flip_v: true, transpose: true }],
        },
      });
      const res = generateGodotTileSet(asset, 'atlas.png', 1);

      expect(res).toContain('0:0/2 = 0');
      expect(res).toContain('0:0/2/flip_h = true');
      expect(res).toContain('0:0/2/flip_v = true');
      expect(res).toContain('0:0/2/transpose = true');
    });

    test('emits multiple alternatives for same tile', () => {
      const asset = createDummyAsset({
        tile_width: 16,
        tile_height: 16,
        tile_count: 1,
        tile_alternatives: {
          '0': [
            { alternative_id: 1, flip_h: true, flip_v: false, transpose: false },
            { alternative_id: 2, flip_h: false, flip_v: true, transpose: false },
          ],
        },
      });
      const res = generateGodotTileSet(asset, 'atlas.png', 1);

      expect(res).toContain('0:0/1 = 0');
      expect(res).toContain('0:0/1/flip_h = true');
      expect(res).toContain('0:0/2 = 0');
      expect(res).toContain('0:0/2/flip_v = true');
    });

    test('does not emit false transform flags', () => {
      const asset = createDummyAsset({
        tile_width: 16,
        tile_height: 16,
        tile_count: 1,
        tile_alternatives: {
          '0': [{ alternative_id: 1, flip_h: false, flip_v: false, transpose: false }],
        },
      });
      const res = generateGodotTileSet(asset, 'atlas.png', 1);

      expect(res).toContain('0:0/1 = 0');
      expect(res).not.toContain('flip_h');
      expect(res).not.toContain('flip_v');
      expect(res).not.toContain('transpose');
    });
  });
});
