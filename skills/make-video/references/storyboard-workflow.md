# Script and storyboard workflow

Use this reference after the host agent has produced the plan and before
generating visual assets or audio.

## Create the narration

Turn the planned narrative structure into spoken language. Preserve its scope,
audience, tone, source policy, and target runtime.

- Open with the promised hook; do not spend the opening on generic context.
- Give each section one clear job and connect it to the next section.
- Prefer concrete people, actions, places, dates, mechanisms, and consequences.
- Explain necessary terms before relying on them.
- Write for listening rather than silently reading an essay.
- Mark uncertain, disputed, reconstructed, or inferred material honestly.
- Keep important claims traceable to the planned sources.
- End with the conclusion or insight promised by the plan.

Estimate spoken duration and revise the script until it fits. Treat the voice
model's real output as authoritative once narration is generated.

Define scene timing rules in `TIMING_PLAN.json`, then run
`<skill-dir>/scripts/audio.mjs timing <video-id> --force` after voice generation.
Narrated scenes derive their duration from measured voice segments plus explicit
lead/tail handles; non-narrated transitions may keep a fixed duration. The
script writes `SCENE_INDEX.json` and updates the composition duration.

Save the narration as `src/<video-id>/SCRIPT.md`. Give stable IDs to
narration blocks so storyboard scenes and later source citations can refer to
them without matching prose by position.

## Design the storyboard

Break the narration into scenes according to visual ideas, not arbitrary equal
intervals. One narration block may use several shots; a strong visual may span
multiple related sentences.

For each scene record:

- Stable scene ID and the narration block IDs it covers.
- Narrative purpose: establish, explain, locate, compare, prove, transition, or
  conclude.
- Approximate duration and key sync moment.
- Primary visual and any supporting layers.
- Asset source: supplied, sourced, generated image, programmatic graphic, or
  generated video when supported.
- Motion treatment and transition intent.
- On-screen text, map labels, dates, quotations, or source disclosure.
- Source references and factual or visual uncertainty.
- Generation prompt direction when an asset must be generated.

Choose visuals that add information. Use maps for place and movement, timelines
for chronology, charts for magnitude or change, documents for evidence,
portraits for people, and reconstructed illustrations for scenes without direct
records. Do not default every scene to a full-screen generated image with a
slow zoom.

For still-image motion, choose explicit purpose: `portrait` for a masked reveal,
`image` with pan/crop and archival treatment for evidence, or `depth` with
separated layers, masks, parallax, and a focus-depth transition. The motion
should direct attention to the narrated idea.

Treat the bottom caption band as protected. Video, portrait, and depth scene
titles automatically move above it when narration is present; do not place
important generated-image details or source text in that safe area.

Save the storyboard as `src/<video-id>/STORYBOARD.md`. Include an asset summary
with approximate supplied, sourced, generated, and programmatic counts so the
user can understand cost and workload.

Persist the renderable scene content alongside timing in `SCENE_INDEX.json`.
Use the optional `content` object for the scene type and its visual data so the
GUI Player and the Remotion renderer can consume the same scene description.

## Before generation

Before generating media, make sure that:

- The narration fits the target runtime.
- Every planned section appears in the script.
- Every narration block has a meaningful visual treatment.
- Visuals do not assert more certainty than the sources support.
- Recurring people and locations have consistent descriptions.
- On-screen text is concise enough to read during its scene.
- Expensive assets are justified by narrative value.
