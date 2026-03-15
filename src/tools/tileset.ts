import { z } from 'zod';
import { type McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { getWorkspace } from '../classes/workspace.js';
import * as errors from '../errors.js';
import { createResourceLink } from '../utils/resource-link.js';
import { TilesetCommand } from '../commands/tileset-command.js';
import { TileAnimationCommand } from '../commands/tile-animation-command.js';
import { TileDataCommand } from '../commands/tile-data-command.js';
import { getCanonicalSlots, assignPeeringBits } from '../algorithms/autotile.js';
import { isoToPixel } from '../algorithms/isometric.js';
import { type ImageCel } from '../types/cel.js';
import { type TileTerrain } from '../types/asset.js';

const tilesetInputSchema = {
  action: z
    .enum([
      'extract_tile',
      'place_tile',
      'autotile_generate',
      'set_tile_physics',
      'set_tile_animation',
      'clear_tile_animation',
      'set_tile_data',
      'clear_tile_data',
    ])
    .describe('Action to perform'),
  asset_name: z.string().optional().describe('Target asset. Defaults to first loaded.'),
  layer_id: z.number().int().optional().describe('Target layer ID. Defaults to 0.'),
  frame_index: z.number().int().optional().describe('Target frame index. Defaults to 0.'),

  // extract_tile args
  tile_width: z.number().int().optional().describe('Tile width (if not set on asset)'),
  tile_height: z.number().int().optional().describe('Tile height (if not set on asset)'),

  // place_tile / set_tile_physics args
  tile_index: z.number().int().optional().describe('Tile slot index to place or configure'),

  // generic coordinate args
  x: z.number().int().optional().describe('Source/Dest X coordinate'),
  y: z.number().int().optional().describe('Source/Dest Y coordinate'),
  col: z.number().int().optional().describe('Dest iso-grid column'),
  row: z.number().int().optional().describe('Dest iso-grid row'),

  // autotile args
  pattern: z.enum(['blob47', '4side', '4corner']).optional().describe('Autotile pattern type'),
  terrain_name: z
    .string()
    .optional()
    .describe('Assign this name to the terrain. If omitted, performs query-only.'),

  // physics args
  physics_polygon: z
    .array(z.tuple([z.number(), z.number()]))
    .optional()
    .describe('Collision polygon vertices. Empty array to clear.'),
  navigation_polygon: z
    .array(z.tuple([z.number(), z.number()]))
    .optional()
    .describe('Navigation polygon vertices. Empty array to clear.'),
  occlusion_polygon: z
    .array(z.tuple([z.number(), z.number()]))
    .optional()
    .describe('Occlusion polygon vertices for light masking. Empty array to clear.'),
  physics_layer_index: z
    .number()
    .int()
    .optional()
    .describe('Which physics layer to assign (defaults to 0)'),

  // set_tile_data args
  data_layer_name: z.string().optional().describe('Custom data layer name'),
  data_layer_type: z
    .enum(['string', 'int', 'float', 'bool'])
    .optional()
    .describe('Custom data layer type'),
  data_value: z
    .union([z.string(), z.number(), z.boolean()])
    .optional()
    .describe('Custom data value to set'),

  // set_tile_animation args
  frame_count: z.number().int().optional().describe('Number of animation frames'),
  frame_duration_ms: z
    .number()
    .int()
    .optional()
    .describe('Per-frame duration in ms; defaults to 100'),
  separation: z
    .number()
    .int()
    .optional()
    .describe('Horizontal pixel gap between animation frames; defaults to 0'),
};

const tilesetInputZodSchema = z.object(tilesetInputSchema);
type TilesetInput = z.infer<typeof tilesetInputZodSchema>;

export function registerTilesetTool(server: McpServer): void {
  server.registerTool(
    'tileset',
    {
      title: 'Tileset Operations',
      description:
        'Manage tileset assets: extract tiles, place tiles, generate autotile metadata, and configure physics.',
      inputSchema: tilesetInputZodSchema,
    },
    (args: TilesetInput) => {
      const workspace = getWorkspace();

      let assetName = args.asset_name;
      if (!assetName) {
        if (workspace.loadedAssets.size === 0) {
          return errors.domainError('No assets loaded in workspace.');
        }
        assetName = [...workspace.loadedAssets.keys()][0];
      }

      const asset = workspace.loadedAssets.get(assetName);
      if (!asset) return errors.assetNotLoaded(assetName);

      const layerId = args.layer_id !== undefined ? args.layer_id : (asset.layers[0]?.id ?? 1);
      const frameIndex = args.frame_index ?? 0;

      // Extract and Place need specific layers. Autotile and physics operate on the asset metadata.
      try {
        if (args.action === 'extract_tile') {
          // ensure tile dims existing or provided
          const tw = asset.tile_width ?? args.tile_width;
          const th = asset.tile_height ?? args.tile_height;
          if (!tw || !th) return errors.notATileset(assetName);

          const layer = asset.layers.find((l) => l.id === layerId);
          if (!layer) return errors.layerNotFound(layerId, assetName);
          if (layer.type !== 'image') return errors.notAnImageLayer(layerId);

          const cmd = new TilesetCommand(asset, () => {
            // Apply dimensions if they were provided and not already on asset
            if (asset.tile_width === undefined) asset.tile_width = tw;
            if (asset.tile_height === undefined) asset.tile_height = th;

            const count = asset.tile_count ?? 0;
            const slotIndex = count;

            // source region
            const srcCel = asset.getCel(layerId, frameIndex) as ImageCel | undefined;
            const srcGrid = srcCel && 'data' in srcCel ? srcCel.data : [];
            const srcH = srcGrid.length;
            const srcW = srcH > 0 ? srcGrid[0].length : 0;
            const sx = args.x ?? 0;
            const sy = args.y ?? 0;

            // Extract region
            const extracted: number[][] = [];
            for (let r = 0; r < th; r++) {
              const row: number[] = [];
              for (let c = 0; c < tw; c++) {
                const py = sy + r;
                const px = sx + c;
                if (py >= 0 && py < srcH && px >= 0 && px < srcW) {
                  row.push(srcGrid[py][px]);
                } else {
                  row.push(0);
                }
              }
              extracted.push(row);
            }

            // Target is always the first image layer (index-wise).
            // Actually spec says "asset's first image layer" for tile slot storage
            const targetLayer = asset.layers.find((l) => l.type === 'image');
            if (!targetLayer) throw new Error('No image layer found to store tile slot');

            let targetCel = asset.getMutableCel(targetLayer.id, 0); // frame 0
            if (!targetCel || !('data' in targetCel)) {
              asset.setCel(targetLayer.id, 0, { x: 0, y: 0, data: [] });
              targetCel = asset.getMutableCel(targetLayer.id, 0);
            }
            if (!targetCel || !('data' in targetCel))
              throw new Error('Failed to resolve target cel');

            // Extend canvas width if needed
            const requiredWidth = Math.max(asset.width, (slotIndex + 1) * tw);
            if (asset.width < requiredWidth) {
              asset.resize(requiredWidth, Math.max(asset.height, th), 'top_left');
              // resizing might have replaced cels
              targetCel = asset.getMutableCel(targetLayer.id, 0) as ImageCel;
            }

            const destX = slotIndex * tw;
            const destY = 0;

            // Write into cel
            for (let r = 0; r < th; r++) {
              const cy = destY + r;
              while (targetCel.data.length <= cy)
                targetCel.data.push(new Array<number>(asset.width).fill(0));
              for (let c = 0; c < tw; c++) {
                const cx = destX + c;
                while (targetCel.data[cy].length <= cx) targetCel.data[cy].push(0);
                targetCel.data[cy][cx] = extracted[r][c];
              }
            }

            asset.tile_count = count + 1;
          });
          workspace.pushCommand(cmd);

          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  message: 'Tile extracted successfully',
                  slot_index: (asset.tile_count ?? 1) - 1,
                }),
              },
              createResourceLink(assetName, `pixel://view/tileset/${assetName}`),
            ],
          };
        }

        if (args.action === 'place_tile') {
          if (args.tile_index === undefined)
            return errors.invalidArgument('place_tile requires tile_index');

          const tw = asset.tile_width;
          const th = asset.tile_height;
          if (!tw || !th) return errors.notATileset(assetName);

          const count = asset.tile_count ?? 0;
          if (args.tile_index < 0 || args.tile_index >= count) {
            return errors.tileIndexNotFound(args.tile_index, assetName);
          }

          const layer = asset.layers.find((l) => l.id === layerId);
          if (!layer) return errors.layerNotFound(layerId, assetName);

          let px = args.x ?? 0;
          let py = args.y ?? 0;

          if (asset.perspective === 'isometric') {
            if (args.col === undefined || args.row === undefined) {
              return errors.invalidArgument(
                'col and row are required for isometric perspective place_tile',
              );
            }
            const pt = isoToPixel(args.col, args.row, 0, tw, th);
            px = pt.x;
            py = pt.y;
          } else {
            if (args.x === undefined || args.y === undefined) {
              return errors.invalidArgument('x and y are required for flat perspective place_tile');
            }
          }

          const firstImageLayer = asset.layers.find((l) => l.type === 'image');
          if (!firstImageLayer) return errors.domainError('Tileset has no tile storage layer');

          const tileStorageCel = asset.getCel(firstImageLayer.id, 0); // Tile slots on frame 0
          if (!tileStorageCel || !('data' in tileStorageCel))
            return errors.domainError('Tile storage cel not initialized');
          const storageGrid = tileStorageCel.data;

          const cmd = new TilesetCommand(asset, () => {
            if (layer.type === 'tilemap') {
              let cel = asset.getMutableCel(layerId, frameIndex);
              if (!cel) {
                asset.setCel(layerId, frameIndex, { grid: [] });
                cel = asset.getMutableCel(layerId, frameIndex);
              }
              if (!cel || !('grid' in cel))
                throw new Error('Could not resolve mutable tilemap cel');

              let tRow: number, tCol: number;
              if (asset.perspective === 'isometric') {
                tCol = args.col ?? 0;
                tRow = args.row ?? 0;
              } else {
                tCol = Math.floor(px / tw);
                tRow = Math.floor(py / th);
              }

              while (cel.grid.length <= tRow) cel.grid.push([]);
              while (cel.grid[tRow].length <= tCol) cel.grid[tRow].push(-1);
              cel.grid[tRow][tCol] = args.tile_index ?? 0;
            } else if (layer.type === 'image') {
              let cel = asset.getMutableCel(layerId, frameIndex);
              if (!cel) {
                const data = Array.from({ length: asset.height }, () =>
                  new Array<number>(asset.width).fill(0),
                );
                asset.setCel(layerId, frameIndex, { x: 0, y: 0, data });
                cel = asset.getMutableCel(layerId, frameIndex);
              }
              if (!cel || !('data' in cel)) throw new Error('Could not resolve mutable image cel');

              const srcX = (args.tile_index ?? 0) * tw;
              for (let r = 0; r < th; r++) {
                const dy = py + r;
                if (dy < 0 || dy >= asset.height) continue;
                while (cel.data.length <= dy) cel.data.push(new Array<number>(asset.width).fill(0));
                for (let c = 0; c < tw; c++) {
                  const dx = px + c;
                  if (dx < 0 || dx >= asset.width) continue;

                  const sy = r;
                  const sx = srcX + c;
                  let colorIndex = 0;
                  if (sy < storageGrid.length && sx < storageGrid[sy].length) {
                    colorIndex = storageGrid[sy][sx];
                  }
                  if (colorIndex !== 0) {
                    // respect transparency
                    while (cel.data[dy].length <= dx) cel.data[dy].push(0);
                    cel.data[dy][dx] = colorIndex;
                  }
                }
              }
            } else {
              throw new Error('Can only place tiles on image or tilemap layers.');
            }
          });
          workspace.pushCommand(cmd);
          return {
            content: [
              { type: 'text', text: JSON.stringify({ message: 'Tile placed successfully' }) },
              createResourceLink(assetName, `pixel://view/tileset/${assetName}`),
            ],
          };
        }

        if (args.action === 'autotile_generate') {
          if (!args.pattern) return errors.autotilePatternRequired();
          if (!asset.tile_width || !asset.tile_height) return errors.notATileset(assetName);

          const expected = getCanonicalSlots(args.pattern);
          const count = asset.tile_count ?? 0;
          const occupied = Array.from({ length: count }, (_, i) => i).filter((i) =>
            expected.includes(i),
          );
          const missing = expected.filter((s) => !occupied.includes(s));

          if (!args.terrain_name) {
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify({
                    expected_slots: expected,
                    occupied_slots: occupied,
                    missing_slots: missing,
                  }),
                },
              ],
            };
          }

          const cmd = new TilesetCommand(asset, () => {
            let terrain = asset.tile_terrain;
            if (!terrain) {
              terrain = {
                pattern: args.pattern as 'blob47' | '4side' | '4corner',
                terrain_name: args.terrain_name ?? '',
                peering_bits: {},
              };
            } else {
              terrain.pattern = args.pattern as 'blob47' | '4side' | '4corner';
              terrain.terrain_name = args.terrain_name ?? '';
            }

            for (const slot of occupied) {
              const bits = assignPeeringBits(slot, args.pattern as 'blob47' | '4side' | '4corner');
              terrain.peering_bits[slot.toString()] = bits as NonNullable<
                TileTerrain['peering_bits'][string]
              >;
            }
            // Trigger dirty
            asset.tile_terrain = Object.assign({}, terrain);
          });
          workspace.pushCommand(cmd);

          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  assigned: occupied,
                  missing_slots: missing,
                }),
              },
              createResourceLink(assetName, `pixel://view/tileset/${assetName}`),
            ],
          };
        }

        if (args.action === 'set_tile_animation') {
          if (args.tile_index === undefined)
            return errors.invalidArgument('set_tile_animation requires tile_index');
          if (!asset.tile_width || !asset.tile_height) return errors.notATileset(assetName);
          const animCount = asset.tile_count ?? 0;
          if (args.tile_index < 0 || args.tile_index >= animCount) {
            return errors.tileIndexNotFound(args.tile_index, assetName);
          }
          const frameCount = args.frame_count;
          if (frameCount === undefined || frameCount < 1) {
            return errors.domainError('set_tile_animation requires frame_count ≥ 1.');
          }
          const frameDurationMs = args.frame_duration_ms ?? 100;
          const sep = args.separation ?? 0;
          const tileIdx = args.tile_index;
          const animCmd = new TileAnimationCommand(asset, () => {
            const anim = asset.tile_animation ?? {};
            anim[tileIdx.toString()] = {
              frame_count: frameCount,
              frame_duration_ms: frameDurationMs,
              separation: sep,
            };
            asset.tile_animation = { ...anim };
          });
          workspace.pushCommand(animCmd);
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  message: 'Tile animation set.',
                  tile_index: tileIdx,
                  frame_count: frameCount,
                  frame_duration_ms: frameDurationMs,
                  separation: sep,
                }),
              },
            ],
          };
        }

        if (args.action === 'clear_tile_animation') {
          if (args.tile_index === undefined)
            return errors.invalidArgument('clear_tile_animation requires tile_index');
          if (!asset.tile_width || !asset.tile_height) return errors.notATileset(assetName);
          const clearCount = asset.tile_count ?? 0;
          if (args.tile_index < 0 || args.tile_index >= clearCount) {
            return errors.tileIndexNotFound(args.tile_index, assetName);
          }
          const clearTileIdx = args.tile_index;
          const clearCmd = new TileAnimationCommand(asset, () => {
            const anim = asset.tile_animation;
            if (anim) {
              // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
              delete anim[clearTileIdx.toString()];
              if (Object.keys(anim).length === 0) {
                asset.tile_animation = undefined;
              } else {
                asset.tile_animation = { ...anim };
              }
            }
          });
          workspace.pushCommand(clearCmd);
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  message: 'Tile animation cleared.',
                  tile_index: clearTileIdx,
                }),
              },
            ],
          };
        }

        if (args.action === 'set_tile_data') {
          if (args.tile_index === undefined)
            return errors.invalidArgument('set_tile_data requires tile_index');
          if (!asset.tile_width || !asset.tile_height) return errors.notATileset(assetName);
          const count = asset.tile_count ?? 0;
          if (args.tile_index < 0 || args.tile_index >= count) {
            return errors.tileIndexNotFound(args.tile_index, assetName);
          }
          if (!args.data_layer_name || !args.data_layer_type) {
            return errors.domainError(
              'set_tile_data requires data_layer_name and data_layer_type.',
            );
          }
          if (args.data_value === undefined) {
            return errors.invalidArgument('set_tile_data requires data_value');
          }
          const tileIdx = args.tile_index;
          const layerName = args.data_layer_name;
          const layerType = args.data_layer_type;
          const dataValue = args.data_value;

          const dataCmd = new TileDataCommand(asset, () => {
            const customData = asset.tile_custom_data ?? { layers: [], tiles: {} };

            // Auto-create data layer if it doesn't exist
            if (!customData.layers.find((l) => l.name === layerName)) {
              customData.layers.push({ name: layerName, type: layerType });
            }

            // Store the value per-tile
            if (!(tileIdx.toString() in customData.tiles)) {
              customData.tiles[tileIdx.toString()] = {};
            }
            customData.tiles[tileIdx.toString()][layerName] = dataValue;

            asset.tile_custom_data = { ...customData, layers: [...customData.layers] };
          });
          workspace.pushCommand(dataCmd);
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  message: 'Tile custom data set.',
                  tile_index: tileIdx,
                  data_layer_name: layerName,
                  data_value: dataValue,
                }),
              },
            ],
          };
        }

        if (args.action === 'clear_tile_data') {
          if (args.tile_index === undefined)
            return errors.invalidArgument('clear_tile_data requires tile_index');
          if (!asset.tile_width || !asset.tile_height) return errors.notATileset(assetName);
          const count = asset.tile_count ?? 0;
          if (args.tile_index < 0 || args.tile_index >= count) {
            return errors.tileIndexNotFound(args.tile_index, assetName);
          }
          const clearTileIdx = args.tile_index;
          const clearLayerName = args.data_layer_name;

          const clearDataCmd = new TileDataCommand(asset, () => {
            const customData = asset.tile_custom_data;
            if (!customData) return;

            const tileKey = clearTileIdx.toString();
            if (!(tileKey in customData.tiles)) return;

            if (clearLayerName) {
              // Remove specific data layer value
              // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
              delete customData.tiles[tileKey][clearLayerName];
              // If tile has no more data, remove the tile entry
              if (Object.keys(customData.tiles[tileKey]).length === 0) {
                // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
                delete customData.tiles[tileKey];
              }
            } else {
              // Clear all custom data for the tile
              // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
              delete customData.tiles[tileKey];
            }

            // If no tiles have custom data left, clean up entirely
            if (Object.keys(customData.tiles).length === 0) {
              asset.tile_custom_data = undefined;
            } else {
              asset.tile_custom_data = { ...customData, layers: [...customData.layers] };
            }
          });
          workspace.pushCommand(clearDataCmd);
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  message: clearLayerName
                    ? `Tile custom data '${clearLayerName}' cleared.`
                    : 'All tile custom data cleared.',
                  tile_index: clearTileIdx,
                }),
              },
            ],
          };
        }

        // args.action === 'set_tile_physics' (narrowed by discriminated union)
        if (args.tile_index === undefined)
          return errors.invalidArgument('set_tile_physics requires tile_index');

        const count = asset.tile_count ?? 0;
        if (args.tile_index < 0 || args.tile_index >= count) {
          return errors.tileIndexNotFound(args.tile_index, assetName);
        }

        const cmd = new TilesetCommand(asset, () => {
          let physics = asset.tile_physics;
          if (!physics) {
            physics = { physics_layers: [{ collision_layer: 1, collision_mask: 1 }], tiles: {} };
            asset.tile_physics = physics;
          }
          if (!((args.tile_index ?? 0).toString() in physics.tiles)) {
            physics.tiles[(args.tile_index ?? 0).toString()] = {};
          }
          const entry = physics.tiles[(args.tile_index ?? 0).toString()];

          if (args.physics_polygon) {
            if (args.physics_polygon.length === 0) delete entry.polygon;
            else entry.polygon = args.physics_polygon;
          }

          if (args.navigation_polygon) {
            if (args.navigation_polygon.length === 0) delete entry.navigation_polygon;
            else entry.navigation_polygon = args.navigation_polygon;
          }

          if (args.occlusion_polygon) {
            if (args.occlusion_polygon.length === 0) delete entry.occlusion_polygon;
            else entry.occlusion_polygon = args.occlusion_polygon;
          }

          asset.tile_physics = Object.assign({}, physics); // trigger dirty
        });
        workspace.pushCommand(cmd);

        return {
          content: [{ type: 'text', text: JSON.stringify({ message: 'Tile physics updated.' }) }],
        };
      } catch (e: unknown) {
        return errors.domainError(e instanceof Error ? e.message : String(e));
      }

      return errors.domainError(
        `Unknown action: ${String((args as Record<string, unknown>).action)}`,
      );
    },
  );
}
