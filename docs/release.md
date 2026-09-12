# Release and versioning policy

This file defines how public releases are cut so that a tag, its generated
source archives, and the custom `ballance-3d-stereo.zip` asset all identify the
same source revision.

## Known v0.1.0 inconsistency (do not rewrite)

- `v0.1.0` tag target: `b98e4d5e34f8bb6600616e7c5a2095a6f2c16458`.
- The attached `ballance-3d-stereo.zip` is a source snapshot of a later
  `main` (most recently `97b02f603f9bb87c40d2fc00e83c5e0fbe9fd91d`), so the
  tag archive and the custom ZIP do not describe the same revision.
- The tag and release are left in place for history. The next release must use
  the policy below.

## Rules for the next and later releases

1. Tag the exact reviewed commit on `main` with an annotated tag
   `vMAJOR.MINOR.PATCH`; never move or recreate an existing tag.
2. Build the asset from that tag, never from a working tree:
   `git archive --format=zip -o ballance-3d-stereo.zip vX.Y.Z`
3. The ZIP must contain exactly the tracked tree at the tag (the tracked-tree
   manifest check used by previous updates) and no game content: no original
   or converted Ballance media, `.local/`, `tests/`, `shareable/`, captures,
   traces, or generated solver binaries.
4. `SOURCE_REVISION.txt` inside the ZIP records the archived commit through
   `export-subst` (`$Format:%H$`), so a downloaded source snapshot identifies
   its revision without a tag.
5. Record the source commit, ZIP size and SHA-256 before upload; after upload,
   download the asset again and compare the SHA-256 (and the API digest when
   available).
6. Release notes come from `CHANGELOG.md`; do not alter older release notes.
7. Replace an asset only as part of a new tag, with `gh release upload
   vX.Y.Z ballance-3d-stereo.zip --clobber`. `v0.1.0` stays as published.

## Versioning

- `vMAJOR.MINOR.PATCH`; minor for feature batches, patch for fixes.
- Next release recommendation: **v0.2.0**. Since `v0.1.0` the port gained the
  recovered Stage 1 finish lifecycle and rigid-body data, harness provenance
  stamping, recovered material specular response, and the recovered level sky
  mapping with the animated `SkyLayer` — a feature-scale change, not a patch.

## Steps after review

1. Merge `review/repository-hygiene` into `main` (fast-forward only when
   possible).
2. `git tag -a v0.2.0 -m "Ballance 3D Stereo v0.2.0"` at that commit and push
   the tag.
3. `git archive --format=zip -o ballance-3d-stereo.zip v0.2.0`.
4. Inspect the manifest (`git ls-files`) and confirm no game content.
5. Create the `v0.2.0` release with notes from `CHANGELOG.md` and upload the
   ZIP; verify size, SHA-256 and API digest after upload.
