# Book and series workflow

Use this workflow when a book, long report, course, archive, or body of research
may require more than one video.

## Understand the whole source first

Ingest the material and review its full structure before selecting chapters for
episode one. Build working indexes for:

- Chapters and major arguments.
- People and their names, ages, roles, and relationships.
- Places, dates, events, chronology, and causal links.
- Terms, recurring examples, disputed claims, and unresolved questions.
- Illustrations, tables, maps, quotations, and other reusable source assets.

Do not infer the shape of the entire work from its opening chapters.

## Choose an adaptation mode

Present the mode explicitly:

- **Overview** — a selective explanation of the whole work.
- **Chapter focus** — one source section explained in depth.
- **Documentary adaptation** — reorganized around a narrative question rather
  than source chapter order.
- **Series** — multiple episodes with deliberate boundaries and progression.

Estimate the narration and episode count needed for useful coverage. State
what will be omitted when the requested runtime requires heavy compression.
Recommend a series instead of silently flattening a book into a shallow recap.

## Plan the series

For each proposed episode provide:

- Stable episode ID, title, central question, and intended takeaway.
- Source ranges and any necessary context drawn from elsewhere.
- Narrative structure and estimated runtime.
- Required people, places, visuals, and specialist scene types.
- Relationship to the previous and next episode.
- Material intentionally reserved for later episodes.

Check the plan for unsupported leaps, repeated explanations, missing chronology,
and episodes that depend on concepts not yet introduced. Obtain user approval
before writing an episode script.

Save the approved overview as `series/PRODUCTION_PLAN.md`. Give each episode its
own directory and the same plan, script, storyboard, configuration, render, and
QA lifecycle as a standalone video.

## Maintain series bibles

Keep shared, inspectable files under `series/` when they are relevant:

- `SOURCE_INDEX.md` — source coverage and citation conventions.
- `CHARACTERS.md` — identity, age stages, pronunciation, and reference images.
- `TIMELINE.md` — dates, ordering, uncertainty, and episode coverage.
- `VISUAL_BIBLE.md` — typography, palette, image style, maps, and motion.
- `AUDIO_BIBLE.md` — voices, pronunciation, music, and recurring sound.
- `COVERAGE.md` — what each episode uses, omits, or reserves.

Update the shared bibles when an approved episode introduces new canonical
information. Do not let an episode silently contradict them.

Store the machine-checkable plan as `series/<series-id>/series-plan.json` with
an ordered `episodes` array, project-relative `sourceIndex`, explicit
`previous`/`next` links, topics, source block IDs, and estimated minutes. Run
`scripts/verify-series.mjs <series-id>` to detect invalid sources, accidental
source/topic reuse, broken order links, and to generate `COVERAGE.md`.

## Regeneration boundaries

Treat each episode and approved asset as independently preservable. A change to
one episode must not overwrite another episode, shared reference image, intro,
outro, or published deliverable. Escalate a change for new approval when it
alters the series premise, episode boundaries, shared visual identity, or source
interpretation.

## Rights

Record whether the material is public domain, original, licensed, used for
private study, or intended for commentary. Possession of a book file does not
establish adaptation or publication rights. Keep the planned output within the
user's stated rights and intended use.
