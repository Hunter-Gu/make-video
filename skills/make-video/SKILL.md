---
name: make-video
description: Plan and produce image-led knowledge videos with Remotion, including history, biography, science, education, document, and book-based explanations. Use when the user wants a video plan, storyboard, narration, generated or supplied visuals, captions, voiceover, rendering, mastering, or final-video QA. Also use for other local Remotion productions that need this end-to-end pipeline. Do not use for standalone animation snippets with no production workflow.
license: MIT
metadata:
  tags: video, remotion, ffmpeg, ffprobe, tesseract, tts, captions, rendering, production
---

## What this skill does

This skill guides the host agent through an existing Make Video project's
plan, storyboard, media generation, Remotion edit, audio, render, and QA. The
host agent writes the creative plan; scripts are reserved for deterministic
media work and provider calls the host cannot perform itself.

The MCP server is the primary application interface. It reads and updates the
same project files used by the app and render CLI. Do not invent a second
project store or a second planning agent in code.

## Workflow

1. **Plan from the request.** Read
   [references/planning-workflow.md](references/planning-workflow.md). Resolve
   the intended subject, audience, scope, duration, format, narrative approach,
   visual direction, sources, audio, and output. Present the plan in plain
   language before research, scripting, or paid generation. The host agent
   authors the plan and saves it through `make_video_save_plan`; no model script
   generates the plan.
2. **Develop the plan.** For image-led knowledge videos, read
   [references/storyboard-workflow.md](references/storyboard-workflow.md).
   Write the narration and visual storyboard, check their pacing and factual
   coverage before generating visual assets.
3. **Select or create the project.** Call `make_video_list_projects` and select
   the intended video ID. When the request needs a new one, call
   `make_video_create_project` — it writes the composition, production, and
   timeline files and nothing creative. For an episode of a planned series pass
   `seriesId` and `episodeId`: the episode takes its title, runtime, and source
   documents from the verified series plan. Do not hand-create project
   directories.
4. **Inspect supplied assets** with `ffprobe`/`ffmpeg`/`sox` before generation.
   Know the real duration, codecs, and resolution of what was provided.
5. **Build the silent visual edit first.** Render representative frames or a
   preview and inspect timing before generating audio.
   Iterate on timing before generating any audio — audio generation is
   expensive/slow and should happen once the visuals are right.
6. **Generate audio as an explicit, separate stage** (voiceover, music, sfx)
   only when the brief calls for it, and verify generated narration against
   the script before treating it as final.
7. **Render and master.** Remotion renders picture; FFmpeg masters loudness,
   transcodes, and produces platform-specific delivery files.
8. **QA the actual rendered file**, not just source code. Use
   `make_video_qa` or the deterministic QA entrypoint for duration, dimensions,
   fps, audio, loudness, true peak, black/frozen intervals, and configured OCR
   checks. Image and clip QA need `tesseract` on `PATH`; a missing one is
   reported as a missing tool, never as a defective image — do not regenerate
   media in response to it.
9. **Deliver the requested variants last.** When the request needs more than one
   file — another aspect ratio, a clean version, a translation, a thumbnail, a
   trailer, a short extract — read
   [references/delivery-workflow.md](references/delivery-workflow.md), declare
   them in `DELIVERABLES.json`, and render them with `make_video_deliver`. Never
   hand-cut a variant out of the master. Delivery measures every file it writes
   and fails the variant when it does not match what was declared.
10. **Rebuild only what changed.** After editing the script, timeline, assets, or
   a translation, call `make_video_get_build_status` before re-rendering. It
   names the outputs that are missing or older than the files they were built
   from, so a caption fix does not cost a full re-render of every variant.

When the storyboard uses Gemini-generated stills, read
[references/image-generation.md](references/image-generation.md) before
configuring or running the image generator.

When most shots are still images, read
[references/still-image-motion.md](references/still-image-motion.md) before
writing the Remotion timeline. Plan focal points, holds, camera movement, and
each scene boundary explicitly; do not assign one default zoom or transition
to the whole video.

When the request is grounded in supplied documents, books, or web pages, read
[references/source-workflow.md](references/source-workflow.md) and ingest the
sources before writing the final narration.

When one long source should become multiple videos, read
[references/series-workflow.md](references/series-workflow.md) after ingestion
before developing any episode. Check the series plan with
`make_video_verify_series` before writing an episode script, and record what each
episode uses or omits with `make_video_build_series_coverage`.

When the storyboard justifies generated motion, read
[references/video-generation.md](references/video-generation.md). Generate only
the selected shots; do not replace the image-led visual plan wholesale.

When manual production adjustments are useful, use the local app. It previews
assets and videos, edits captions and timeline ranges, generates
non-destructive image revisions, and selects image, video, and voice models.

Configure the bundled MCP entrypoint with an absolute path. Set
`MAKE_VIDEO_PROJECT_ROOT` to the Make Video workspace when the MCP host does
not launch it from that directory:

```bash
MAKE_VIDEO_PROJECT_ROOT=/absolute/project/root node /absolute/skill/path/scripts/mcp.mjs
```

## Generation safety (read before running any script)

- Identify the target video id before any generation or render command —
  never iterate over every composition.
- Generated audio and rendered outputs are **not disposable caches**. Every
  generation/render command refuses to overwrite an existing output; pass
  `--force` only when regeneration was explicitly requested.
- Never run a generator just to inspect something else (e.g. don't
  regenerate audio to verify a file move).
- Estimate before you spend. When the project declares `GENERATION_PLAN.json`,
  run `make_video_estimate_generation` (CLI: `scripts/ai.mjs estimate`) and
  report the price and wait before starting a paid run. It contacts no provider.
- After an interrupted run, resume rather than repeat: set `TTS_START_AT` to the
  caption id where narration stopped, and treat a clip reported as "never
  completed" as possibly already billed — check the provider before forcing it.

## CLI fallback

Prefer MCP for agent interaction. Use the bundled CLI entrypoints for direct
terminal work or diagnostics. Replace `<skill-dir>` with this skill's absolute
directory, run from the project root, and target exactly one video ID.
`--env-file-if-exists=.env` loads local provider credentials when present:

```bash
node --env-file-if-exists=.env <skill-dir>/scripts/assets.mjs create <video-id>
node --env-file-if-exists=.env <skill-dir>/scripts/qa.mjs video <video-id>
node --env-file-if-exists=.env <skill-dir>/scripts/assets.mjs link <video-id>
node --env-file-if-exists=.env <skill-dir>/scripts/ai.mjs estimate <video-id>
node --env-file-if-exists=.env <skill-dir>/scripts/ai.mjs images <video-id>
node --env-file-if-exists=.env <skill-dir>/scripts/ai.mjs video <video-id>
node --env-file-if-exists=.env <skill-dir>/scripts/sources.mjs ingest <video-id>
node --env-file-if-exists=.env <skill-dir>/scripts/render.mjs still <video-id>
node --env-file-if-exists=.env <skill-dir>/scripts/render.mjs preview <video-id>
node --env-file-if-exists=.env <skill-dir>/scripts/ai.mjs voiceover <video-id>
node --env-file-if-exists=.env <skill-dir>/scripts/ai.mjs music <video-id>
node --env-file-if-exists=.env <skill-dir>/scripts/audio.mjs timing <video-id>
node --env-file-if-exists=.env <skill-dir>/scripts/render.mjs final <video-id>
node --env-file-if-exists=.env <skill-dir>/scripts/render.mjs deliver <video-id>
node --env-file-if-exists=.env <skill-dir>/scripts/series.mjs verify <series-id>
node --env-file-if-exists=.env <skill-dir>/scripts/series.mjs coverage <series-id>
```

Full detail on the project files and production workflow lives in
[references/production-workflow.md](references/production-workflow.md).
