# Known solver-fidelity gaps

Confirmed behavioral differences between the deployed Rapier path and the
original IVP solver that are understood, documented, and deliberately left
unfixed. Do not "fix" these by retuning friction, mass, drive strength, or
global solver settings without new evidence.

## Stage 1 crowned bridge — Rapier contact-manifold difference

At the crowned entry bridge of Level 1, a full-throttle stone ball falls
off in the original game and stays centered in this port.

Native IVP resolves the initial centered stone contact with a single
slightly −Z-tilted contact, which seeds a deterministic lateral walk off
the crown (reproducible from any microscopic start offset, and still
present when friction is raised to wood's value). Rapier resolves the same
placement as a balanced two-contact manifold with zero net lateral normal
component and therefore remains centered; tiny lateral offsets persist
unchanged rather than amplifying, and flank starts roll downhill normally.

Longitudinal drive, friction coefficients, geometry, solver iteration
count, and downhill response have been independently ruled out. A forced
lateral seed is preserved faithfully by both solvers, so the entire
divergence reduces to initial contact resolution at placement, not to
sustained dynamics.

No tuning workaround is applied; a future fidelity fix would need to
target contact generation/manifold selection, not material or solver
magnitudes.

## Stage 1 Rapier finish-adapter activation (fixed)

`PE_Balloon_01` is not a member of any `Sector_XX` group in the converted
levels, so the generic sector lookup assigned the Rapier `OriginalFinish`
adapter to sector 1. The engine now scopes `PE_Levelende`-owned objects to the
final reset-point sector, matching `OriginalIvpRuntime`, and a sector-owned
managed ending takes precedence over the raw level-end proximity shortcut, so
Rapier wakes, boards, rides, departs and completes through the same lifecycle
as native. Verified by `stage1_wood_finish` and `stage1_finish_reset` on both
solvers.
