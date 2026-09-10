# Changelog

Based on [fayazara/ballance](https://github.com/fayazara/ballance) by Fayaz Ahmed.
This file tracks what changed in this fork. Upstream fixes can be merged in at
any time; entries below are fork-only unless noted.

## [Unreleased]

### Fixed
- Checkpoint handoff: the next trigger now waits the recovered two script
  frames before going live (Gameplay `activate next Checkpoint` link).

## [0.1.0] - 2026-09-10

First public test package.

### Added
- Stereo 3D output: SBS, cross-view, interlaced and reversed, with
  separation/convergence settings that persist between runs.
- Controller support: button rebinding, dead zone, vertical invert, optional
  right-stick camera turns.
- Portable Windows setup: `Setup-Ballance.bat` downloads repo-local Node,
  Python and FFmpeg, converts the player's own Ballance folder and launches
  the game. No system install. Exact IVP physics is an opt-in second step.
- Vendored `vendor/bmap-win-x64` converter (MIT LibCmo21 build), so no
  compiler is needed.
- Ending sky fade: the recovered `fadeout Sky` ramp (overbright gray to
  black over 3000 ms) now renders during the finish sequence.

### Fixed
- HUD renders per eye in all stereo modes (was full-screen mono in SBS).
- Menu lists scroll as one across eyes; removed the dead second scrollbar.
- Cold boot with a remembered stereo mode: menu backdrop, engine and HUD
  all come up stereo (each was stuck mono until the mode was touched).
- Windows launchers require CRLF line endings for `cmd.exe`.

### Credits
- Upstream port: Fayaz Ahmed ([fayazara/ballance](https://github.com/fayazara/ballance)).
- Original game: Ballance by Cyparade, published by Atari. Game assets are
  not included; each player uses their own copy.
