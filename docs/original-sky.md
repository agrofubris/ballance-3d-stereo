# Original sky recovery

Recovered by static analysis of the original NMO data (no script execution).
The authoritative extractor is `scripts/read-original-sky.py`; it asserts every
value below and emits `src/game/original-sky-data.json`.

## Who populates the sky at runtime

`Gameplay.nmo` keeps a local DataArray reference named `Skytextures Array`
(null when authored). `Gameplay_Init` resolves the object named **`Skytextures`**
(Levelinit.nmo) into that local, and `Gameplay_Sky` reads row 0 with `Get Row`.

`Levelinit.nmo` `Skytextures` holds one row with five cells that are references
to the five shared materials:

| column | material |
|---|---|
| Back | Sky_Back |
| Right | Sky_Right |
| Front | Sky_Front |
| Left | Sky_Left |
| Down | Sky_Down |

The materials are authored, but their textures are loaded per level by
`Load Sky-Textures` (Levelinit.nmo): it reads the current level row of the
`AllLevel` DataArray, takes the `Sky` cell (for example `Sky_L`), picks
`Textures\sky\` or `Textures\sky_low\` from the `GameSettings` quality column,
builds `<Sky>\<X>_<suffix>.bmp` for the five face suffixes
(`_Back, _Right, _Front, _Left, _Down`), loads each as a texture and assigns it
to the matching `Sky_*` material. `Gameplay_Sky` then feeds the array row into
`TT Sky`, which builds the five-face dome.

## Exact level to sky-set mapping (`AllLevel` rows, 1-based)

| level | file | sky | scroll (u/s, v/s) |
|---|---|---|---|
| 1 | Level_01.nmo | Sky_L | 0.01, 0.01 |
| 2 | Level_02.nmo | Sky_E | -0.01, 0.005 |
| 3 | Level_03.nmo | Sky_A | 0.02, 0.01 |
| 4 | Level_04.nmo | Sky_F | -0.01, 0.005 |
| 5 | Level_05.nmo | Sky_C | 0.01, 0.005 |
| 6 | Level_06.nmo | Sky_H | -0.01, 0.005 |
| 7 | Level_07.nmo | Sky_D | -0.005, -0.005 |
| 8 | Level_08.nmo | Sky_G | 0.01, 0 |
| 9 | Level_09.nmo | Sky_K | -0.005, 0.01 |
| 10 | Level_10.nmo | Sky_B | 0.02, 0.01 |
| 11 | Level_11.nmo | Sky_J | 0.01, 0.01 |
| 12 | Level_12.nmo | Sky_I | 0.01, 0.04 |

The same rows carry a per-level `Light` color (`Set Light Color` on
`Light_Ingame`); the port does not consume it.

## SkyLayer positioning, scrolling and gating

- **Positioning** is authored per level: each level NMO owns the `SkyLayer`
  entity (invisible by default) with its `SkyLayer_Mesh` and material. Levels
  1-11 use a two-triangle quad with `SkyLayer.bmp`; level 12 uses a 400-vertex
  vortex with `Sky_Vortex.bmp`.
- **Scrolling**: `Gameplay_Sky` → `animate SkyLayer` runs `Per Second`
  (`Skytranslation` from the level's `AllLevel` row) into `Texture Scroller`
  targeting the `SkyLayer_Mesh`, channel -1. The scroll vector is texture units
  per second.
- **Gating**: both `Binary Switch` nodes of `animate SkyLayer` test the shared
  local `Skylayer ein?`, which `Gameplay_Sky` sets from `Get Cell` on
  `DB_Options`, row 0, column 10 — the options-menu entry
  `Menu_Opt_Graphics Clouds` ("Clouds?"). When on, the entity is shown and
  scrolls; when off it is hidden. The layer is shown in all shipped levels
  (the port has no options UI, so it gates it on).
- **Runtime material state** (`init SkyLayer`, Levelinit.nmo): entity filter
  color 200/255 = 0.7843137 gray, additional color 0, blend enabled with
  source/destination ONE/ONE and texture blend MODULATE, Z buffer write off.
  The port maps this to a `CustomBlending` One/One material.
- **Ending fade** (`fadeout Sky`, Gameplay.nmo): the same prelit color is
  interpolated 0.7843137 → black over 3000 ms while the layer stays visible.

## Port behavior

`src/game/original-sky.ts` reads only `original-sky-data.json`:

- `originalSkyLetter(index)` replaces the previous `A + levelIndex` guess, so
  the dome faces come from the recovered set per level.
- `OriginalSkyLayer` rebuilds the level's `SkyLayer` object with its authored
  matrix (positions/scale) and scrolls its texture map by the level vector
  (V sign inverted because the port flips UV `v` to match Three).
- `setFade` mirrors the recovered 3000 ms prelit fade during the ending.

Known residual: `Database.tdb` (the options database that would hold the
"Clouds?" default) is obfuscated, so the shipped toggle value is not statically
recoverable; the original levels show the layer and the port matches that.
