# Roadmap

## Implementation status

All six phases are implemented. The reproducible acceptance case is
`library-of-alexandria`: 14 scenes, 1,551 frames, seven delivery variants, a
rendered 51.754-second master, and deterministic source, series, media, and
final-video QA.

Run the release gate after rendering the example:

```bash
pnpm roadmap:verify library-of-alexandria
```

| Phase | Shipped evidence |
| --- | --- |
| Topic to video | Approved plan, script, storyboard, narration-derived timing, Remotion render, captions, configurable audio mix, and final-file QA |
| Visual storytelling | Fourteen scene examples, 2.5D/focus motion, visual and character bibles, historical constraints, image QA, and render QA |
| Source to video | Markdown/text/web/PDF/DOCX/EPUB ingestion, location-preserving index, annotations, claim checks, catalog, rights, and source list |
| Book to series | Adaptation modes, compression estimate, episode/source allocation, continuity checks, and shared series bibles |
| Hybrid scenes | Replaceable image/video adapters, conditioning and resume support, estimates and approval, provenance, clip QA, and Remotion video scenes |
| Review and delivery | Contact sheet, interactive review, candidates, locks, revision mapping, review package, and seven delivery variants |

Paid model calls remain explicit approval steps and require the caller's API
credentials. The acceptance gate uses checked local fixtures, so verifying the
workflow cannot create model charges.

## Product direction

`make-video` is an agent skill for turning knowledge into image-led videos.
Its primary subjects are history, biography, science, education, books,
papers, reports, and other explanatory material.

The long-term workflow is:

```text
topic / document / book
  -> source understanding and research
  -> video or series plan
  -> sourced narration script
  -> storyboard
  -> images, maps, charts, documents, and later generated video
  -> Remotion composition and motion
  -> voiceover, captions, and music
  -> rendered and checked deliverables
```

The goal is not to become a general-purpose editor for every kind of footage.
The product should be especially good at turning complex source material into
clear visual explanations. A useful shorthand for the long-term vision is:

> Upload a book. Get a documentary series.

Images remain the default visual medium because they are controllable,
affordable, and appropriate for knowledge videos. Generated video is a future
shot type, not a replacement for the rest of the visual system.

## Phase 1 — Topic to video

Prove the complete production loop with a single image-led explanatory video.

- Generate a structured plan from a topic, target audience, duration, language,
  and visual direction.
- Turn the plan into chapters, scenes, narration, and image prompts.
- Generate images through a script-driven model adapter while also allowing
  supplied or manually sourced images.
- Compose the result in Remotion with voiceover, captions, music, and sound
  effects where appropriate.
- Make narration timing the source of scene duration instead of forcing speech
  into arbitrary pre-existing slots.
- Render and verify the actual final file: duration, streams, dimensions,
  frame rate, loudness, true peak, caption timing, and output presence.
- Ship at least one complete, reproducible history, biography, or science
  example with its plan, assets, configuration, storyboard, and final video.

## Phase 2 — Visual storytelling system

Move beyond a slideshow of AI images with identical zoom animations.

- Add reusable knowledge-video scene types: portrait reveal, timeline, map
  route, archival-photo move, document close-up, quotation, relationship
  diagram, comparison, statistic, chart, multi-image montage, and chapter card.
- Support 2.5D depth, focus changes, masks, pans, crops, and motion that follows
  the narrative purpose of a scene.
- Maintain a visual bible for palette, typography, image treatment, motion,
  aspect ratio, and recurring graphic elements.
- Maintain character bibles with age/stage descriptions and reference images so
  recurring historical or biographical subjects remain visually consistent.
- Add historical prompt constraints for period, geography, clothing,
  architecture, technology, and prohibited anachronisms.
- Detect duplicate or low-value images and avoid showing the same visual idea
  repeatedly.
- Add deterministic QA for unsafe text, caption overlaps, black or frozen
  frames, missing audio, duration mismatches, and loudness failures.

## Phase 3 — Source to video

Ground videos in user-provided material rather than relying only on free-form
model generation.

- Ingest Markdown, text, web pages, PDF, DOCX, and EPUB.
- Preserve chapter, page, section, and paragraph locations while extracting
  source material.
- Build a source index for people, places, dates, events, concepts, quotations,
  claims, and supplied illustrations.
- Attach source references to important narration claims and storyboard scenes.
- Distinguish direct source statements, paraphrases, and model inferences.
- Check the completed script against the source and flag unsupported claims.
- Produce a human-readable source list alongside the final video.
- Reuse illustrations and figures from the source when permitted, while keeping
  canonical files separate from runtime assets.

This phase enables requests such as: "Turn this paper into an eight-minute
explanation" or "Make a documentary-style video from these research notes."

## Phase 4 — Book to series

Scale source-grounded production from one video to a coherent series.

- Understand the structure of a whole book before planning individual videos.
- Offer explicit adaptation modes: short overview, chapter explanation,
  documentary adaptation, or multi-episode series.
- Estimate how much source material can reasonably fit the requested runtime
  instead of silently over-compressing a book.
- Generate a series plan with episode boundaries, objectives, source ranges,
  expected runtime, and narrative progression.
- Track people, locations, terminology, chronology, and unresolved ideas across
  chapters and episodes.
- Prevent accidental repetition and contradictions between episodes.
- Share character, visual, pronunciation, music, intro, outro, and citation
  bibles across the series.
- Allow one episode or scene to be regenerated without rebuilding completed
  episodes or replacing approved assets.
- Record rights and intended-use status for supplied books and source assets;
  do not assume possession of a file grants publication or adaptation rights.

## Phase 5 — Hybrid image and generated-video scenes

Add video models only where motion materially improves the explanation.

- Support text-to-video, image-to-video, reference-image conditioning, and
  first/last-frame-controlled generation through replaceable adapters.
- Let the planner choose among a still image, map, timeline, chart, document,
  Remotion motion graphic, supplied footage, or generated video for each scene.
- Estimate cost and latency before generation and require approval for expensive
  batches.
- Preserve prompt, model, parameters, reference assets, cost, and provenance for
  each generated shot.
- Verify generated clips for duration, resolution, unwanted text, visual
  discontinuity, subject consistency, and suitability for the assigned scene.
- Mix generated clips with the existing image-led Remotion composition rather
  than turning every scene into generated video.

## Phase 6 — Review, iteration, and delivery

Make collaboration with the agent practical for long videos and series.

- Generate a storyboard/contact sheet before expensive asset generation.
- Present multiple image, voice, music, caption, or motion candidates and allow
  the user to approve one.
- Lock approved scenes and assets so later changes cannot replace them by
  accident.
- Support time- and region-specific feedback that maps back to the relevant
  scene, source claim, asset, and composition code.
- Rebuild only the affected outputs after a script, prompt, asset, or styling
  change.
- Provide a review package containing the storyboard, narration, sources,
  asset provenance, generation costs, technical QA, and known limitations.
- Export multiple aspect ratios, captioned and clean versions, translated
  versions, thumbnails, trailers, and short-form extracts where requested.
- Add an interactive review interface on top of the same project files and
  production state; the interface must not become a second source of truth.

## Cross-cutting principles

- `video.config.json` and its future planning/source manifests remain explicit,
  inspectable project files rather than hidden agent state.
- Generated media is valuable output, not a disposable cache. Never overwrite
  it implicitly.
- Preserve provenance for supplied, sourced, and generated assets.
- Prefer deterministic Remotion and FFmpeg operations where an AI call is not
  necessary.
- Separate planning, approval, generation, composition, rendering, and QA so an
  inexpensive check cannot accidentally trigger an expensive generation step.
- Optimize for source faithfulness, narrative clarity, visual consistency, and
  a checked final file—not the number of integrated model providers.

## Adjacent ideas, not the main product direction

These may be useful later but should not displace the knowledge-video roadmap:

- Multi-language caption and narration translation.
- Dead-air and filler-word removal for supplied footage.
- Word-level transcript editing and multi-take selection.
- General-purpose talking-head or podcast editing.
- Host edit hooks that run deterministic QA automatically.
