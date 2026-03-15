import { describe, it, expect, beforeEach } from 'vitest';
import { getWorkspace } from '../classes/workspace.js';
import { AssetClass } from '../classes/asset.js';
import { registerTilesetTool } from './tileset.js';
import { type ImageCel, type TilemapCel } from '../types/cel.js';

type ToolCallback = (args: Record<string, unknown>) => unknown;
type HandlerResult = { isError?: boolean; content?: { text: string }[] };

function captureToolCallback(
  registerFn: (server: import('@modelcontextprotocol/sdk/server/mcp.js').McpServer) => void,
): ToolCallback {
  let cb!: ToolCallback;
  const mockServer = {
    registerTool(_name: string, _config: unknown, callback: ToolCallback) {
      cb = callback;
    },
  };
  registerFn(mockServer as unknown as import('@modelcontextprotocol/sdk/server/mcp.js').McpServer);
  return cb;
}

describe('tileset tool', () => {
  let handler: ToolCallback;
  let workspace: ReturnType<typeof getWorkspace>;

  beforeEach(() => {
    handler = captureToolCallback(registerTilesetTool);
    workspace = getWorkspace();
    workspace.loadedAssets.clear();

    // reset undo/redo using the singleton method since undoStack is private
    // or just assume we don't need to manually clear it if it's fine, but let's clear loadedAssets

    const asset = new AssetClass({
      name: 'test_tileset',
      width: 32,
      height: 32,
      perspective: 'flat',
      palette: Array.from({ length: 256 }, () => [0, 0, 0, 0]),
      layers: [],
      frames: [],
      tags: [],
      cels: {},
      tile_width: 16,
      tile_height: 16,
    });

    // Add image layer
    asset.addLayer({ name: 'Layer 1', type: 'image', opacity: 255, visible: true });
    // Add tilemap layer
    asset.addLayer({ name: 'Tilemap 1', type: 'tilemap', opacity: 255, visible: true });

    // Set some data on image layer to extract
    const data = Array.from({ length: 32 }, (_, r) =>
      Array.from({ length: 32 }, (_, c) => (r < 16 && c < 16 ? 1 : 0)),
    );
    asset.setCel(1, 0, { x: 0, y: 0, data });

    workspace.loadedAssets.set('test_tileset', asset);
  });

  const callTool = async (args: Record<string, unknown>): Promise<HandlerResult> => {
    const result = (await handler(args)) as HandlerResult;
    if (result.isError) {
      console.error('Tool error:', result.content?.[0]?.text);
    }
    return result;
  };

  describe('extract_tile', () => {
    it('extracts tile and extends canvas', async () => {
      const result = await callTool({
        action: 'extract_tile',
        x: 0,
        y: 0,
      });

      expect(result.isError).toBeFalsy();
      const content = JSON.parse(result.content?.[0]?.text ?? '{}') as { slot_index: number };
      expect(content.slot_index).toBe(0);

      const asset = workspace.loadedAssets.get('test_tileset');
      if (!asset) throw new Error('Asset missing');
      expect(asset.tile_count).toBe(1);

      const cel = asset.getCel(1, 0) as ImageCel;

      // Since canvas was 32, and slot 0 is at (0,0) width 16, it doesn't need to extend width.
      expect(cel.data[0][0]).toBe(1);

      // Extract another one, which will go to slot 1 (16 to 31). Still fits in 32 width
      await callTool({
        action: 'extract_tile',
        x: 0,
        y: 0,
      });
      expect(asset.tile_count).toBe(2);

      // Extract third one. Slot 2 is at x=32, so canvas should extend to 48.
      await callTool({
        action: 'extract_tile',
        x: 0,
        y: 0,
      });
      expect(asset.tile_count).toBe(3);
      expect(asset.width).toBe(48);

      const cel2 = asset.getCel(1, 0) as ImageCel;
      expect(cel2.data[0][32]).toBe(1);

      // Undo checks
      workspace.undo();
      expect(asset.tile_count).toBe(2);
      expect(asset.width).toBe(32);
    });
  });

  describe('place_tile', () => {
    beforeEach(async () => {
      // populate slot 0
      await callTool({ action: 'extract_tile', x: 0, y: 0 });
    });

    it('places tile on image layer (flat)', async () => {
      const result = await callTool({
        action: 'place_tile',
        tile_index: 0,
        x: 16,
        y: 16,
        layer_id: 1,
      });

      expect(result.isError).toBeFalsy();
      const asset = workspace.loadedAssets.get('test_tileset');
      if (!asset) throw new Error('Asset missing');
      const cel = asset.getCel(1, 0) as ImageCel;
      expect(cel.data[16][16]).toBe(1);

      workspace.undo();
      const celUndo = asset.getCel(1, 0) as ImageCel;
      expect(celUndo.data[16][16]).toBe(0);
    });

    it('places tile on tilemap layer (flat)', async () => {
      const result = await callTool({
        action: 'place_tile',
        tile_index: 0,
        x: 16,
        y: 16,
        layer_id: 2, // Tilemap layer
      });

      expect(result.isError).toBeFalsy();
      const asset = workspace.loadedAssets.get('test_tileset');
      if (!asset) throw new Error('Asset missing');
      const cel = asset.getCel(2, 0) as TilemapCel;

      // x=16, y=16 in tile coords is col=1, row=1
      expect(cel.grid[1][1]).toBe(0);

      workspace.undo();
      const celUndo = asset.getCel(2, 0) as TilemapCel | undefined;
      expect(celUndo).toBeUndefined();
    });

    it('places tile on tilemap layer (isometric)', async () => {
      const asset = workspace.loadedAssets.get('test_tileset');
      if (!asset) throw new Error('Asset missing');
      Object.defineProperty(asset['_data'], 'perspective', { value: 'isometric', writable: true });

      const result = await callTool({
        action: 'place_tile',
        tile_index: 0,
        col: 2,
        row: 1,
        layer_id: 2,
      });

      expect(result.isError).toBeFalsy();
      const cel = asset.getCel(2, 0) as TilemapCel;
      expect(cel.grid[1][2]).toBe(0);
    });

    it('places tile on image layer (isometric)', async () => {
      const asset = workspace.loadedAssets.get('test_tileset');
      if (!asset) throw new Error('Asset missing');
      Object.defineProperty(asset['_data'], 'perspective', { value: 'isometric', writable: true });

      // col=2, row=1
      // dimetric: dx = (2 - 1) * 8 = 8
      // dy = (2 + 1) * 8 - 0 = 24
      const result = await callTool({
        action: 'place_tile',
        tile_index: 0,
        col: 2,
        row: 1,
        layer_id: 1,
      });

      expect(result.isError).toBeFalsy();
      const cel = asset.getCel(1, 0) as ImageCel;
      // top left corner of the placed tile should correspond to the top left of the slot matching non-zero pixels.
      expect(cel.data[24][8]).toBe(1);
    });
  });

  describe('autotile_generate', () => {
    it('queries expected and missing slots', async () => {
      const result = await callTool({
        action: 'autotile_generate',
        pattern: '4side',
      });

      expect(result.isError).toBeFalsy();
      const content = JSON.parse(result.content?.[0]?.text ?? '{}') as {
        expected_slots: number[];
        missing_slots: number[];
      };
      expect(content.expected_slots).toContain(0); // 0 (none) is valid for 4side
      expect(content.expected_slots.length).toBe(16); // 2^4
      expect(content.missing_slots.length).toBe(16); // no tiles assigned yet
    });

    it('assigns peering bits for occupied slots', async () => {
      // Populate slot 0 (0-bits / completely isolated in 4side)
      await callTool({ action: 'extract_tile', x: 0, y: 0 });

      const result = await callTool({
        action: 'autotile_generate',
        pattern: '4side',
        terrain_name: 'grass',
      });

      expect(result.isError).toBeFalsy();
      const asset = workspace.loadedAssets.get('test_tileset');
      if (!asset) throw new Error('Asset missing');
      expect(asset.tile_terrain?.terrain_name).toBe('grass');
      expect(asset.tile_terrain?.peering_bits['0']).toBeDefined();
      expect(asset.tile_terrain?.peering_bits['0'].top).toBe(-1); // Not connected

      workspace.undo();
      expect(asset.tile_terrain).toBeUndefined();
    });
  });

  describe('set_tile_physics', () => {
    beforeEach(async () => {
      await callTool({ action: 'extract_tile', x: 0, y: 0 });
    });

    it('sets physics and navigation polygons', async () => {
      const result = await callTool({
        action: 'set_tile_physics',
        tile_index: 0,
        physics_polygon: [
          [0, 0],
          [16, 0],
          [16, 16],
          [0, 16],
        ],
      });

      expect(result.isError).toBeFalsy();
      const asset = workspace.loadedAssets.get('test_tileset');
      if (!asset) throw new Error('Asset missing');
      expect(asset.tile_physics?.tiles['0'].polygon).toEqual([
        [0, 0],
        [16, 0],
        [16, 16],
        [0, 16],
      ]);

      // Update nav poly
      await callTool({
        action: 'set_tile_physics',
        tile_index: 0,
        navigation_polygon: [
          [2, 2],
          [14, 2],
          [14, 14],
          [2, 14],
        ],
      });

      expect(asset.tile_physics?.tiles['0'].navigation_polygon).toBeDefined();
      expect(asset.tile_physics?.tiles['0'].polygon).toBeDefined(); // Still there

      // Clear polygon by passing empty array
      await callTool({
        action: 'set_tile_physics',
        tile_index: 0,
        physics_polygon: [],
      });
      expect(asset.tile_physics?.tiles['0'].polygon).toBeUndefined();

      workspace.undo(); // undo clear
      expect(asset.tile_physics?.tiles['0'].polygon).toBeDefined();

      workspace.undo(); // undo nav
      expect(asset.tile_physics?.tiles['0'].navigation_polygon).toBeUndefined();

      workspace.undo(); // undo set
      expect(asset.tile_physics?.tiles['0'].polygon).toBeUndefined();
    });
  });

  describe('set_tile_animation', () => {
    beforeEach(async () => {
      await callTool({ action: 'extract_tile', x: 0, y: 0 });
    });

    it('sets animation metadata with full params', async () => {
      const result = await callTool({
        action: 'set_tile_animation',
        tile_index: 0,
        frame_count: 4,
        frame_duration_ms: 200,
        separation: 2,
      });

      expect(result.isError).toBeFalsy();
      const asset = workspace.loadedAssets.get('test_tileset');
      if (!asset) throw new Error('Asset missing');
      expect(asset.tile_animation?.['0']?.frame_count).toBe(4);
      expect(asset.tile_animation?.['0']?.frame_duration_ms).toBe(200);
      expect(asset.tile_animation?.['0']?.separation).toBe(2);
    });

    it('uses defaults for frame_duration_ms (100) and separation (0)', async () => {
      const result = await callTool({
        action: 'set_tile_animation',
        tile_index: 0,
        frame_count: 2,
      });

      expect(result.isError).toBeFalsy();
      const asset = workspace.loadedAssets.get('test_tileset');
      if (!asset) throw new Error('Asset missing');
      expect(asset.tile_animation?.['0']?.frame_duration_ms).toBe(100);
      expect(asset.tile_animation?.['0']?.separation).toBe(0);
    });

    it('returns isError for frame_count < 1', async () => {
      const result = await callTool({
        action: 'set_tile_animation',
        tile_index: 0,
        frame_count: 0,
      });

      expect(result.isError).toBeTruthy();
    });

    it('returns isError for nonexistent tile_index', async () => {
      const result = await callTool({
        action: 'set_tile_animation',
        tile_index: 99,
        frame_count: 2,
      });

      expect(result.isError).toBeTruthy();
    });

    it('undo removes animation metadata', async () => {
      await callTool({
        action: 'set_tile_animation',
        tile_index: 0,
        frame_count: 3,
      });

      const asset = workspace.loadedAssets.get('test_tileset');
      if (!asset) throw new Error('Asset missing');
      expect(asset.tile_animation?.['0']).toBeDefined();

      workspace.undo();
      expect(asset.tile_animation).toBeUndefined();
    });
  });

  describe('clear_tile_animation', () => {
    beforeEach(async () => {
      await callTool({ action: 'extract_tile', x: 0, y: 0 });
      await callTool({
        action: 'set_tile_animation',
        tile_index: 0,
        frame_count: 4,
        frame_duration_ms: 150,
        separation: 0,
      });
    });

    it('clears animation from a tile', async () => {
      const asset = workspace.loadedAssets.get('test_tileset');
      if (!asset) throw new Error('Asset missing');
      expect(asset.tile_animation?.['0']).toBeDefined();

      const result = await callTool({
        action: 'clear_tile_animation',
        tile_index: 0,
      });

      expect(result.isError).toBeFalsy();
      expect(asset.tile_animation).toBeUndefined();
    });

    it('returns isError for nonexistent tile_index', async () => {
      const result = await callTool({
        action: 'clear_tile_animation',
        tile_index: 99,
      });

      expect(result.isError).toBeTruthy();
    });

    it('clearing last entry makes tile_animation undefined', async () => {
      const asset = workspace.loadedAssets.get('test_tileset');
      if (!asset) throw new Error('Asset missing');

      await callTool({ action: 'clear_tile_animation', tile_index: 0 });
      expect(asset.tile_animation).toBeUndefined();
    });

    it('undo restores animation metadata', async () => {
      const asset = workspace.loadedAssets.get('test_tileset');
      if (!asset) throw new Error('Asset missing');

      await callTool({ action: 'clear_tile_animation', tile_index: 0 });
      expect(asset.tile_animation).toBeUndefined();

      workspace.undo();
      expect(asset.tile_animation?.['0']?.frame_count).toBe(4);
    });
  });

  describe('set_tile_data', () => {
    beforeEach(async () => {
      await callTool({ action: 'extract_tile', x: 0, y: 0 });
    });

    it('sets custom data with auto-created layer', async () => {
      const result = await callTool({
        action: 'set_tile_data',
        tile_index: 0,
        data_layer_name: 'movement_cost',
        data_layer_type: 'int',
        data_value: 2,
      });

      expect(result.isError).toBeFalsy();
      const asset = workspace.loadedAssets.get('test_tileset');
      if (!asset) throw new Error('Asset missing');
      expect(asset.tile_custom_data?.layers[0]).toEqual({ name: 'movement_cost', type: 'int' });
      expect(asset.tile_custom_data?.tiles['0']?.['movement_cost']).toBe(2);
    });

    it('does not duplicate data layer on subsequent set', async () => {
      await callTool({
        action: 'set_tile_data',
        tile_index: 0,
        data_layer_name: 'movement_cost',
        data_layer_type: 'int',
        data_value: 2,
      });
      await callTool({
        action: 'set_tile_data',
        tile_index: 0,
        data_layer_name: 'movement_cost',
        data_layer_type: 'int',
        data_value: 3,
      });

      const asset = workspace.loadedAssets.get('test_tileset');
      if (!asset) throw new Error('Asset missing');
      expect(asset.tile_custom_data?.layers.length).toBe(1);
      expect(asset.tile_custom_data?.tiles['0']?.['movement_cost']).toBe(3);
    });

    it('stores multiple data types', async () => {
      await callTool({
        action: 'set_tile_data',
        tile_index: 0,
        data_layer_name: 'terrain_type',
        data_layer_type: 'string',
        data_value: 'grass',
      });
      await callTool({
        action: 'set_tile_data',
        tile_index: 0,
        data_layer_name: 'cost',
        data_layer_type: 'int',
        data_value: 1,
      });
      await callTool({
        action: 'set_tile_data',
        tile_index: 0,
        data_layer_name: 'passable',
        data_layer_type: 'bool',
        data_value: true,
      });

      const asset = workspace.loadedAssets.get('test_tileset');
      if (!asset) throw new Error('Asset missing');
      expect(asset.tile_custom_data?.tiles['0']?.['terrain_type']).toBe('grass');
      expect(asset.tile_custom_data?.tiles['0']?.['cost']).toBe(1);
      expect(asset.tile_custom_data?.tiles['0']?.['passable']).toBe(true);
    });

    it('returns isError when data_layer_name missing', async () => {
      const result = await callTool({
        action: 'set_tile_data',
        tile_index: 0,
        data_layer_type: 'int',
        data_value: 2,
      });
      expect(result.isError).toBeTruthy();
    });

    it('returns isError when data_layer_type missing', async () => {
      const result = await callTool({
        action: 'set_tile_data',
        tile_index: 0,
        data_layer_name: 'movement_cost',
        data_value: 2,
      });
      expect(result.isError).toBeTruthy();
    });

    it('returns isError for nonexistent tile_index', async () => {
      const result = await callTool({
        action: 'set_tile_data',
        tile_index: 99,
        data_layer_name: 'movement_cost',
        data_layer_type: 'int',
        data_value: 2,
      });
      expect(result.isError).toBeTruthy();
    });

    it('undo removes custom data', async () => {
      await callTool({
        action: 'set_tile_data',
        tile_index: 0,
        data_layer_name: 'movement_cost',
        data_layer_type: 'int',
        data_value: 2,
      });

      const asset = workspace.loadedAssets.get('test_tileset');
      if (!asset) throw new Error('Asset missing');
      expect(asset.tile_custom_data).toBeDefined();

      workspace.undo();
      expect(asset.tile_custom_data).toBeUndefined();
    });
  });

  describe('clear_tile_data', () => {
    beforeEach(async () => {
      await callTool({ action: 'extract_tile', x: 0, y: 0 });
      await callTool({
        action: 'set_tile_data',
        tile_index: 0,
        data_layer_name: 'movement_cost',
        data_layer_type: 'int',
        data_value: 2,
      });
      await callTool({
        action: 'set_tile_data',
        tile_index: 0,
        data_layer_name: 'terrain_type',
        data_layer_type: 'string',
        data_value: 'grass',
      });
    });

    it('clears specific data layer from tile', async () => {
      const result = await callTool({
        action: 'clear_tile_data',
        tile_index: 0,
        data_layer_name: 'movement_cost',
      });

      expect(result.isError).toBeFalsy();
      const asset = workspace.loadedAssets.get('test_tileset');
      if (!asset) throw new Error('Asset missing');
      expect(asset.tile_custom_data?.tiles['0']?.['movement_cost']).toBeUndefined();
      expect(asset.tile_custom_data?.tiles['0']?.['terrain_type']).toBe('grass');
    });

    it('clears all custom data for tile when no data_layer_name', async () => {
      const result = await callTool({
        action: 'clear_tile_data',
        tile_index: 0,
      });

      expect(result.isError).toBeFalsy();
      const asset = workspace.loadedAssets.get('test_tileset');
      if (!asset) throw new Error('Asset missing');
      expect(asset.tile_custom_data?.tiles['0']).toBeUndefined();
    });

    it('returns isError for nonexistent tile_index', async () => {
      const result = await callTool({
        action: 'clear_tile_data',
        tile_index: 99,
      });
      expect(result.isError).toBeTruthy();
    });

    it('clearing last tile data sets tile_custom_data to undefined', async () => {
      await callTool({ action: 'clear_tile_data', tile_index: 0 });

      const asset = workspace.loadedAssets.get('test_tileset');
      if (!asset) throw new Error('Asset missing');
      expect(asset.tile_custom_data).toBeUndefined();
    });

    it('undo restores custom data', async () => {
      const asset = workspace.loadedAssets.get('test_tileset');
      if (!asset) throw new Error('Asset missing');

      await callTool({ action: 'clear_tile_data', tile_index: 0 });
      expect(asset.tile_custom_data).toBeUndefined();

      workspace.undo();
      expect(asset.tile_custom_data?.tiles['0']?.['terrain_type']).toBe('grass');
    });
  });

  // ─── 4.1.8.8 Resource link in response ──────────────────────────

  it('extract_tile response includes pixel:// tileset resource link', async () => {
    const result = await callTool({ action: 'extract_tile', x: 0, y: 0 });

    expect(result.isError).toBeFalsy();
    const allContent = (result.content ?? []) as unknown as Array<{ type: string; uri?: string }>;
    const links = allContent.filter((c) => c.type === 'resource_link');
    expect(links.length).toBeGreaterThan(0);
    expect(links[0]?.uri).toContain('pixel://view/tileset/');
  });
});
