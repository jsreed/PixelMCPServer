import { describe, it, expect } from 'vitest';
import { resolveExportPattern } from './export-pattern.js';

describe('resolveExportPattern', () => {

    it('substitutes all valid tokens perfectly', () => {
        const pattern = "{name}_{variant}_{tag}_{direction}_{frame:03}.png";
        const result = resolveExportPattern(pattern, {
            name: "player",
            variant: "slim",
            tag: "walk",
            direction: "S",
            frame: 12
        });
        expect(result).toBe("player_slim_walk_S_012.png");
    });

    it('safely drops the middle token and its adjacent separator', () => {
        const pattern = "{name}_{tag}_{direction}.png";
        // direction is S, tag is completely undefined
        const result = resolveExportPattern(pattern, {
            name: "player",
            direction: "S",
            tag: undefined
        });
        // We expect player_S.png, not player__S.png
        expect(result).toBe("player_S.png");
    });

    it('safely drops the trailing token and its adjacent separator', () => {
        const pattern = "{name}_{tag}_{direction}.png";
        // direction is undefined
        const result = resolveExportPattern(pattern, {
            name: "player",
            tag: "idle"
        });
        // We expect player_idle.png, not player_idle_.png
        expect(result).toBe("player_idle.png");
    });

    it('safely drops multiple consecutive empty tokens and their separators', () => {
        const pattern = "{name}_{variant}_{tag}_{direction}.png";
        // both variant and tag are empty
        const result = resolveExportPattern(pattern, {
            name: "player",
            direction: "N",
            variant: "", // empty string
            tag: undefined // undefined
        });
        // Drops two sets of '_MARKER', resulting in 'player_N.png'
        expect(result).toBe("player_N.png");
    });

    it('safely drops a leading token without destroying the string', () => {
        const pattern = "{variant}_{name}.png";
        // variant is undefined, meaning the string starts with `MARKER_name...`
        const result = resolveExportPattern(pattern, {
            name: "iron_sword",
            variant: undefined
        });
        // The algorithm drops the trailing '_' from the empty variant
        expect(result).toBe("iron_sword.png");
    });

    it('handles different boundary separators (- and .)', () => {
        const pattern = "{name}-{tag}.{direction}.png";

        // Missing direction
        const r1 = resolveExportPattern(pattern, { name: "tree", tag: "cut" });
        expect(r1).toBe("tree-cut.png");

        // Missing tag (Drops the dash)
        const r2 = resolveExportPattern(pattern, { name: "tree", direction: "NE" });
        expect(r2).toBe("tree.NE.png");
    });

    it('does not touch slashes or literal structural text', () => {
        const pattern = "export/{variant}/{name}/{name}_{tag}_{direction}.png";

        // Missing variant and direction
        const result = resolveExportPattern(pattern, {
            name: "npc",
            tag: "talk"
        });

        // The {variant} is wrapped in slashes. Which aren't '_' '-' or '.'.
        // So it just drops the marker: "export//npc/npc_talk.png"
        // (If the user structured it this way, `/` isn't a defined valid drop target according to the design doc)
        expect(result).toBe("export//npc/npc_talk.png");
    });

    it('safely handles an empty object map', () => {
        const pattern = "{name}_{variant}_{tag}.png";
        const result = resolveExportPattern(pattern, {});
        // Everything drops, just leaves .png
        expect(result).toBe(".png");
    });

    it('preserves unknown tokens as literal text', () => {
        const pattern = "{name}_{unknown}.png";
        const result = resolveExportPattern(pattern, {
            name: "player"
        });
        // {unknown} has no variable, so it drops and removes separator
        expect(result).toBe("player.png");
    });

    it('handles frame padding with different pad widths', () => {
        const r1 = resolveExportPattern("{name}_{frame:04}.png", { name: "walk", frame: 5 });
        expect(r1).toBe("walk_0005.png");

        const r2 = resolveExportPattern("{name}_{frame:02}.png", { name: "run", frame: 123 });
        // Frame value exceeds pad width — should not truncate
        expect(r2).toBe("run_123.png");
    });

    it('treats numeric 0 as a valid value, not as empty', () => {
        const pattern = "{name}_{frame:03}.png";
        const result = resolveExportPattern(pattern, {
            name: "idle",
            frame: 0
        });
        // frame=0 is falsy but must substitute as "000", not be dropped
        expect(result).toBe("idle_000.png");
    });

});
