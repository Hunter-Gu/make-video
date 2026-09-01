# Book and series workflow

Use this workflow when a book, long report, course, archive, or body of research
may require more than one video.

## Understand the whole source first

Ingest the material and inspect its full structure before selecting chapters for
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
and episodes that depend on concepts not yet introduced before writing an episode
script.

Save the overview as `projects/<project-id>/PRODUCTION_PLAN.md`. Give each episode its
own directory and the same plan, script, storyboard, configuration, render, and
QA lifecycle as a standalone video.

Scaffold each episode with `make_video_create_project`, passing `seriesId` and
`episodeId` rather than writing a configuration by hand:

```bash
# over MCP: make_video_create_project {"seriesId": "…", "episodeId": "…"}
```

The series must verify first — an episode of a broken plan is not created. The
new project is `src/<series-id>-<episode-id>/` unless a `videoId` is given, takes
its title and runtime from the episode, reuses the source documents behind the
series `sourceIndex`, and records the link in `SERIES_EPISODE.json`. From there
the episode follows the standalone production workflow.

## Maintain series bibles

Keep shared, inspectable files under `projects/<project-id>/` when they are relevant:

- `SOURCE_INDEX.md` — source coverage and citation conventions.
- `CHARACTERS.md` — identity, age stages, pronunciation, and reference images.
- `TIMELINE.md` — dates, ordering, uncertainty, and episode coverage.
- `VISUAL_BIBLE.md` — typography, palette, image style, maps, and motion.
- `AUDIO_BIBLE.md` — voices, pronunciation, music, and recurring sound.
- `COVERAGE.md` — what each episode uses, omits, or reserves.

Update the shared bibles when an episode introduces new canonical
information. Do not let an episode silently contradict them.

Store the series plan as `projects/<project-id>/series-plan.json` with an ordered
`episodes` array, project-relative `sourceIndex`, explicit `previous`/`next`
links, topics, source block IDs, and estimated minutes.

Keep machine-checkable shared state in `SERIES_BIBLE.json`: adaptation mode,
words-per-minute assumption, rights and intended use, shared bible paths,
canonical positions, timeline events, and terminology. Episodes declare ideas
they introduce or require, canonical positions, and ordered timeline event IDs.
The verifier rejects missing bibles, premature dependencies, chronology errors,
and silent contradictions, and reports the source-to-narration compression ratio.
An episode that deliberately moves back in time declares `"outOfOrderTimeline":
true`; the chronology finding is then reported as a warning instead.

Run it before writing any episode script:

```bash
node <skill-dir>/scripts/series.mjs verify <series-id>
node <skill-dir>/scripts/series.mjs coverage <series-id> --force
```

Over MCP: `make_video_list_series`, `make_video_get_series`,
`make_video_verify_series`, and `make_video_build_series_coverage`. `COVERAGE.md`
is generated from the verified plan; do not hand-edit it.

## Regeneration boundaries

Treat each episode and generated asset as independently preservable. A change to
one episode must not overwrite another episode, shared reference image, intro,
outro, or published deliverable. Record changes when they alter the series
premise, episode boundaries, shared visual identity, or source interpretation.

## Rights

Record whether the material is public domain, original, licensed, used for
private study, or intended for commentary. Possession of a book file does not
establish adaptation or publication rights. Keep the planned output within the
user's stated rights and intended use.
