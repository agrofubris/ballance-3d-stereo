# Changelog

Based on [fayazara/ballance](https://github.com/fayazara/ballance) by Fayaz Ahmed.
This file tracks what changed in this fork. Upstream fixes can be merged in at
any time; entries below are fork-only unless noted.

## [Unreleased]

Planned next release: `v0.2.0` (see [release policy](docs/release.md)).

### Added
- Recovered original data now drives more of the port: finish-part rigid-body
  masses and force-direction frames, per-material specular response
  (`specularPower`), and the exact level sky mapping from `AllLevel`
  (`Sky_L`, `Sky_E`, …, not `A + level`) with the authored scrolling
  `SkyLayer` quad/vortex, its `Clouds?` gate and its ending fade. The bounded
  finish solver difference is recorded in
  [known fidelity gaps](docs/known-fidelity-gaps.md).
- Harness runs write `meta.json` with the source revision, dirty flag and
  branch so saved traces identify the build that produced them
  ([harness](docs/harness.md)).
- Spawn teleport: level start and death respawn now play the recovered
  `Ball_LightningSphere` script (spinning/cycling sphere, 1.5 s growth,
  blue point light, 2.5 s smoke burst and white flash unveiling the ball)
  with `Misc_Lightning` over the original 3 s `New Ball` forming delay.
- Spawn rays: the lightning arcs were invisible (smooth shell) because the
  effect loader used clamp addressing while the authored UVs span U 1-2,
  V 1.25-2; `RepeatWrapping` restores them.
- Repository hygiene: `Setup-Ballance.bat` accepts both `3D Entities` and
  `3D_Entities` installs, rejects ISO/file paths with an actionable message,
  verifies every downloaded tool archive (Node, Python, CMake, FFmpeg,
  MinGit, LLVM) against recorded SHA-256 hashes, pins FFmpeg to a versioned
  immutable package URL, and installs dependencies with `npm ci`. The public
  test/build contract is now documented (the maintainer suite in `tests/` is
  not shipped), and [release policy](docs/release.md) documents tag/asset
  provenance for the next release.

### Fixed
- Level-ending assembly: the Rapier path baked every `PE_Balloon_*` visual
  (entry plates, platform, balloons, ropes) as permanent static collision,
  while the original spawns them managed on final-sector activation (ropes
  and balloons never collide; the platform departs). A new Rapier finish
  adapter instantiates the recovered lifecycle instead — frozen plates that
  enable on activation, platform on hidden proxy hulls that wakes, departs
  and resets deterministically, visual-only balloons/ropes/slide — with
  boarding ride, sky fade and timed completion.
- Finish force direction frames now match the native assembly, and the
  platform carries its recovered rigid-body state and mass properties.
- Lantern glow: removed the `Laterne_Verlauf` name-hack (forced additive
  blending, no depth write, no alpha test, 2x emissive gain) so the
  recovered material state applies — ordinary alpha blending, alpha test,
  depth write, unity gain. Oracle-measured against the original game: the
  hot highlight tail and midband now track the reference instead of
  overshooting it.
- Stereo correctness pass: removed physical-pixel `setViewport` calls (they
  double-scaled with the pixel ratio), eye targets now resync to the live
  drawing-buffer size every frame, interlaced canvas runs at the exact live
  device pixel ratio with adaptive scaling moved to the eye buffers, toe-in
  replaced by parallel off-axis projection, and the shadow map updates once
  per stereo frame with caller state restored.
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
