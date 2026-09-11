# Spawn teleport

`Balls.nmo` `Ball_LightningSphere 437` runs every materialization, triggered
by `Gameplay.nmo` `New Ball 2921` after positioning: `Show` the lightning
sphere while `Rotate Lighting Sphere` spins it at 2 PI/s around Y and cycles
textures 1-2-3, `Scale Lighting Sphere` grows 0-1 over 1500 ms, `Light Anim`
ramps `Ball_Lightning_PointLight` blue over 2500 ms then white, `Wave Player`
plays `Misc_Lightning Sound`, and a 2500 ms `Delayer` fires the 60-particle
`BallParticle_Frame` smoke burst. `Rotate` ends at 3000 ms and hides the
sphere; `New Ball` physicalizes the player at the same 3000 ms.
See `src/game/original-spawn.ts` and `scripts/prepare-original.py`.

The port plays that sequence in both places a ball appears:

- Level start holds the reset ball hidden while the sphere grows and crackles,
  then the smoke burst and white flash unveil the ball at 2.5 s while the
  lightning keeps running underneath; sphere hides and physics enables at 3 s.
- Death respawn reuses the same effect for the `forming` stage between the
  existing `position-ball` and `physicalize-ball` events, with the same sound.

Blend fidelity: material 185 recovers as `sourceBlend = 2, destBlend = 2`,
i.e. Virtools `VXBLEND_ONE, VXBLEND_ONE` (`ONE * src + ONE * dst`, matching
D3D9), rendered via `CustomBlending` rather than Three's `SRC_ALPHA, ONE`
`AdditiveBlending`. The PNGs have no alpha channel so both agree while
opacity is 1; the authentic equation is what lets the bolts hold full
intensity through the flash instead of fading with opacity.

Sampler state (extracted, not inferred): `textureBlendMode = 2
(MODULATE)`, `textureMinMode = textureMagMode = 2 (LINEAR)`,
`textureAddressMode = 1 (WRAP)`. The effect therefore uses repeating
linear-filtered sampling with no mipmaps. The extractor exports these
fields for every material; see `scripts/extract-original.py`.

Ease curves inside the `Bezier Progression` blocks, per-particle smoke
velocities and the exact light intensities were not decoded, so growth
easing, flicker rate, flash envelope, cluster layout and light gain are
reconstructions. Durations, mesh, texture order, particle count, blend,
sound and the unveil order are original.

Resolved visibility bug: the rays initially rendered as a smooth blue shell
because the effect's texture loader kept Three's `ClampToEdgeWrapping`
default while the authored sphere UVs span U 1-2, V 1.25-2. The whole mesh
sampled one clamped border texel. `RepeatWrapping` (matching
`OriginalMaterials` and the authored Virtools addressing) restores the
arcs. Isolated with solid-magenta and opaque-bitmap diagnostic builds
before removal; UV report read 118/118 verts, 0 non-finite, 3 textures.
