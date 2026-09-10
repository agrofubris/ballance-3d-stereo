# Spawn teleport

`Gameplay.nmo` builds every new ball in `New Ball 2921`: after positioning it
activates the `Ball_LightningSphere` script, waits the recovered 3000 ms
`Delayer`, then physicalizes the player. The sphere mesh, its additive
`Ball_LightningSphere` material and the three `Ball_LightningSphere`
textures all come from `Balls.nmo`; the sting is `Sounds/Misc_Lightning.wav`.
See `scripts/prepare-original.py` (audio list) and
`src/game/original-spawn.ts`.

The port renders that sequence in both places a ball appears:

- Level start holds the reset ball hidden for the recovered 3 s while the
  lightning sphere flickers around the reset point, then enables physics.
- Death respawn reuses the same effect for the `forming` stage between the
  existing `position-ball` and `physicalize-ball` events, with the same sound.

Exact Virtools curve data for the sphere (scale envelope, texture order) was
not recovered, so the flicker rate, growth ramp and final half-second fade
are reconstructions. Duration, mesh, material blend and sound are original.
