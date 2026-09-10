# Ballance 3D Stereo (browser port)

Twelve original Ballance courses in the browser, with menus, stereo 3D,
and gamepad support. The 1:1 port is in progress; Level 1 is the most
playable. See [limitations](docs/original-import.md).

## Play in 3 steps (Windows)

1. Copy this folder somewhere writable, e.g. `C:\Games\Ballance-3D-source`.
2. Double-click `Setup-Ballance.bat`. Press `Y` for the licenses, then type
   your own Ballance folder (e.g. `C:\Games\Ballance`) and wait. It fetches
   its own portable tools, converts your levels, and opens the game.
3. Next time, double-click `Launch-Ballance.bat` and open
   `http://127.0.0.1:5173/` if the browser does not open by itself.

No system install. Everything stays inside this folder under
`.tools/` and `.local/`. Without the optional exact-physics build the game
uses built-in Rapier physics (`?physics=rapier`).

## Controls

- **Arrows:** roll. **Shift + left/right:** camera. **Space:** raise camera.
- **Escape:** pause. Rebind everything in Options.
- **Gamepad:** left stick/D-pad rolls, LB/RB turn camera, Start pauses.
  Rebind in Options → Controls. No driver install needed.
- **3D Stereo:** Options → 3D Stereo (SBS, Crossview, Interlaced).

## Legal

- Ballance was created by Cyparade and originally published by Atari.
- Original game assets and the separately supplied IVP SDK have their own
  rights and are NOT included. Each player must use their own legally
  acquired copy. Do not redistribute the installer, EXE, converted levels,
  textures, audio, or built IVP files unless you have permission. See
  [third-party references](THIRD_PARTY.md).
- The `vendor/bmap-win-x64` converter is built from MIT-licensed LibCmo21
  plus YYCCommonplace, stb, and zlib, and may stay in shared copies.

## For developers

```sh
npm install
npm run dev
npm test
npm run lint
npm run build
```

Converted pack lives at `.local/original`; optional IVP runtime at
`.local/ivp-simulation` via `python3 scripts/build-ivp-simulation.py`.
Details: [import](docs/original-import.md),
[runtime](docs/original-ivp-wasm.md), [routes](docs/original-native-routes.md).
