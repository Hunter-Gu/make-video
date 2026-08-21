# Review and iteration

Use `scripts/build-review.mjs <video-id>` to assemble the production plan,
script, storyboard, source index, generation manifests, voice manifest, and QA
report into `output/<video-id>/review.html`. Refresh it with `--force` after an
intentional change.

Run `scripts/build-contact-sheet.mjs <video-id>` to render the midpoint of every
scene and build `output/<video-id>/review/index.html`. The page shows the actual
storyboard frames, can play an existing preview, and exports feedback JSON with
scene, current time, optional x/y/width/height region, and note. It reads the
project scene index and does not maintain a second production state.

## Approval state

After approval, run `scripts/approval-lock.mjs lock <video-id>`. It records
content hashes for the plan, script, storyboard, claims, composition, source
index, canonical assets, and generated assets that exist. Run `verify` before
delivery. Image and video generators refuse to replace locked outputs.

For an approved revision, first record its scope, then run `unlock`. Make only
the approved changes and create a fresh lock with `lock --force`. Unlocking is
auditable in the retained lock file; `--force` alone does not bypass an active
lock.

When presenting candidates, keep each candidate in a distinct path and record
its prompt, model, cost, and intended scene. After the user selects one, update
the storyboard and composition to reference it. Preserve rejected candidates
until the user approves disposal.

Store candidate groups in `CANDIDATES.json`. Each group has a stable output,
scene, kind, candidate paths, provenance, and cost. Run
`scripts/select-candidate.mjs <video-id> <group-id> <candidate-id> --force` to
switch the stable runtime link. The unselected canonical files remain intact.

## Incremental changes

Trace feedback from timestamp to scene ID, then to narration blocks, sources,
and assets. Classify the change before rebuilding:

Maintain this mapping in `src/<video-id>/SCENE_INDEX.json`. Each scene records
its exact frame range plus narration, source-block, asset, and composition-code
IDs. Run `scripts/plan-revision.mjs <video-id> --time=<seconds>` for timestamped
feedback, or select by `--scene`, `--asset`, or `--source`. Add
`--region=x,y,w,h` to retain spatial feedback in the report.

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

Declare requested outputs in `DELIVERABLES.json`, including dimensions,
caption visibility, optional translation overrides, still frame, or extract
frame range. Run `scripts/render-deliverables.mjs <video-id>`, or use
`--variant=<id>` for one output. Every rendered file is probed independently
and recorded in `delivery-report.json`.
