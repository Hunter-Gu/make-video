# Review and iteration

Use `scripts/build-review.mjs <video-id>` to assemble the production plan,
script, storyboard, source index, generation manifests, voice manifest, and QA
report into `output/<video-id>/review.html`. Refresh it with `--force` after an
intentional change.

## Approval state

Record approved scene and asset IDs in `STORYBOARD.md`. Treat approval as a
lock: do not rewrite the scene, replace its source, regenerate its media, or
change its timing unless the requested revision affects it. Existing output
protection still applies; approval to revise one scene does not authorize
`--force` for unrelated outputs.

When presenting candidates, keep each candidate in a distinct path and record
its prompt, model, cost, and intended scene. After the user selects one, update
the storyboard and composition to reference it. Preserve rejected candidates
until the user approves disposal.

## Incremental changes

Trace feedback from timestamp to scene ID, then to narration blocks, sources,
and assets. Classify the change before rebuilding:

- Copy changes affect script, captions, narration, and scenes using that text.
- Visual changes affect only the named asset and its scene.
- Timing changes affect the scene and later timeline offsets.
- Global style changes may affect every scene and require renewed approval.
- Source corrections affect every claim derived from the corrected block.

List the outputs that will be replaced and obtain explicit regeneration
approval before using `--force`.

## Delivery variants

Derive variants from the approved master composition where practical. Keep
captioned and clean, horizontal and vertical, translated, trailer, and short
extract outputs distinct. Check each actual file with QA; passing the master
does not prove a differently cropped or translated variant is correct.
