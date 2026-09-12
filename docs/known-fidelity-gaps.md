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
