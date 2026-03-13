# Blob47 Reference

Complete bitmask table, canonical slot positions, corner constraints, and visual appearance guide for the blob47 autotile system.

## Bit Assignment

Each of the 8 neighbors is assigned a power-of-2 bit:

```
NW=128  N=1   NE=2
W=64    [X]   E=4
SW=32   S=16  SE=8
```

A bitmask is the sum of the bits for all present neighbors. Example: tile surrounded on N, E, S = 1+4+16 = **21**.

## Corner Constraint Rule

**A diagonal neighbor only counts if both adjacent orthogonal neighbors are also present.** This prevents impossible configurations (e.g., a northeast neighbor without a north or east neighbor).

| Corner | Requires |
|--------|---------|
| NE (2) | N (1) AND E (4) must be present |
| SE (8) | E (4) AND S (16) must be present |
| SW (32) | S (16) AND W (64) must be present |
| NW (128) | W (64) AND N (1) must be present |

When computing a tile's bitmask, apply this constraint first — strip diagonal bits that don't have both orthogonals.

## 47 Canonical Bitmask Values

Grouped by visual category:

**Isolated (no neighbors):**
- `0` — fully isolated, no neighbors

**Single-edge (one orthogonal side):**
- `1` (N), `4` (E), `16` (S), `64` (W)

**Single-edge with corner extensions:**
- `5` (N+E), `17` (N+S), `20` (E+S), `65` (N+W), `68` (E+W), `80` (S+W)
- `7` (N+NE+E), `21` (N+E+S), `23` (N+NE+E+S), `69` (N+E+W), `71` (N+NE+E+W)
- Plus all their NE/SE/SW/NW corner extensions

**Straight corridors:**
- `17` (N+S vertical), `68` (E+W horizontal)

**T-junctions (three orthogonals):**
- `21` (N+E+S), `69` (N+E+W), `84` (E+S+W), `81` (N+S+W)
- Plus variants with diagonal corners filled in

**Interior (all 8 neighbors):**
- `255` — completely surrounded, no visible edges

**Full canonical list (47 values, sorted):**
`0, 1, 4, 5, 7, 16, 17, 20, 21, 23, 28, 29, 31, 64, 65, 68, 69, 71, 80, 81, 84, 85, 87, 92, 93, 95, 112, 113, 116, 117, 119, 124, 125, 127, 193, 197, 199, 209, 213, 215, 221, 223, 241, 245, 247, 253, 255`

These are derived by applying the corner constraint to all 256 possible raw bitmasks and collecting unique results. For example, raw bitmask 220 (NW+W+SE+S+E) has NW set but N is absent, so the corner constraint strips the NW bit — 220 collapses to canonical value 92 (E+SE+S+W).

## Pixel Position Formula

For tile_width=16, tile_height=16:

```
x = (bitmask % 8) * 16
y = Math.floor(bitmask / 8) * 16
```

| Bitmask | Grid Col | Grid Row | Pixel X | Pixel Y |
|---------|----------|----------|---------|---------|
| 0       | 0        | 0        | 0       | 0       |
| 1       | 1        | 0        | 16      | 0       |
| 4       | 4        | 0        | 64      | 0       |
| 16      | 0        | 2        | 0       | 32      |
| 64      | 0        | 8        | 0       | 128     |
| 255     | 7        | 31       | 112     | 496     |

This means a full blob47 canvas for 16px tiles needs to be **128×512 pixels**.

## Visual Appearance Guide

| Category | Appearance Description |
|----------|----------------------|
| Isolated (0) | Small dot or chunk, all edges visible |
| Single-edge N/E/S/W | Open on one side, three edges visible |
| Two-edge corner (e.g., N+E=5) | Open L-shape, convex corner at NE |
| Two-edge straight (N+S=17) | Vertical bar, open left and right |
| Three-edge T (N+E+S=21) | T-shape, open on west side |
| Interior (255) | No visible edges, full solid interior |
| Near-interior (253, etc.) | One small concave notch on the inside corner |

**Outside corner** (e.g., bitmask 5 = N+E, no NE neighbor): The tile has a convex corner protruding at NE. Draw a rounded or angular corner shape there.

**Inside corner** (e.g., bitmask 253 = all except NE=2): The tile has all neighbors except the NE diagonal. Draw the interior tile with a small concave notch cut at the top-right inner corner.

## Drawing Priority Order

Draw in this order to build up understanding progressively:

1. `255` — interior tile (defines main surface texture)
2. `0` — isolated (defines minimum island look)
3. `17`, `68` — straight corridors (N+S, E+W)
4. `1`, `4`, `16`, `64` — single orthogonal edges
5. `5`, `20`, `80`, `65` — two orthogonal corners (no diagonal)
6. `7`, `28`, `112`, `193` — two orthogonal + diagonal corner filled
7. All remaining variants

This order lets you establish the visual language at extremes first, then fill in transitions.
