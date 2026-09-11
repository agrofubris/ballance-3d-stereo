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
  then the smoke burst and white flash unveil the ball at 2.5 s; physics
  enables at 3 s.
- Death respawn reuses the same effect for the `forming` stage between the
  existing `position-ball` and `physicalize-ball` events, with the same sound.

Ease curves inside the `Bezier Progression` blocks and the exact light
intensities were not decoded, so growth easing, flicker rate, flash envelope
and light gain are reconstructions. Durations, mesh, texture order, particle
count, blend, sound and the unveil order are original.
