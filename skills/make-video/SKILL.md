---
name: make-video
description: Plan and produce image-led knowledge videos with Remotion, including history, biography, science, education, document, and book-based explanations. Use when the user wants a video plan, storyboard, narration, generated or supplied visuals, captions, voiceover, rendering, mastering, or final-video QA. Also use for other local Remotion productions that need this end-to-end pipeline. Do not use for standalone animation snippets with no production workflow.
license: MIT
metadata:
  tags: video, remotion, ffmpeg, ffprobe, sox, tts, captions, rendering, production
---

## What this skill does

This is a full local production workflow. It begins by turning the user's
request into an understandable production plan, then creates a Remotion
composition, obtains or generates visuals, produces optional audio, renders,
and checks the actual deliverable.

This skill is the layer above raw Remotion code: the end-to-end build,
generate, render, and verify workflow, using FFmpeg, ffprobe, and SoX
alongside Remotion.

## Workflow

1. **Plan from the request.** Read
   [references/planning-workflow.md](references/planning-workflow.md). Resolve
   the intended subject, audience, scope, duration, format, narrative approach,
   visual direction, sources, audio, and output. Present the plan in plain
   language before research, scripting, asset generation, or composition work.
2. **Develop the plan.** For image-led knowledge videos, read
   [references/storyboard-workflow.md](references/storyboard-workflow.md).
   Write the narration and visual storyboard, check their pacing and factual
   coverage before generating visual assets.
3. **Inspect supplied assets** with `ffprobe`/`ffmpeg`/`sox` before touching
   the composition — know the real duration, codecs, resolution of what you
   were given.
4. **Create one composition directory per video** under `src/<video-id>/`,
   with its own `video.config.json` as the single source of truth for scene
   timing, caption timing, audio steps, and render/mastering props. Never mix
   two videos' files in one directory.
5. **Build the silent visual edit first.** Typecheck, render still frames,
   iterate on timing before generating any audio — audio generation is
   expensive/slow and should happen once the visuals are right.
6. **Generate audio as an explicit, separate stage** (voiceover, music, sfx)
   only when the brief calls for it, and verify generated narration against
   the script before treating it as final.
7. **Render and master.** Remotion renders picture; FFmpeg masters loudness,
   transcodes, and produces platform-specific delivery files.
8. **QA the actual rendered file**, not just the source — check with
   `ffprobe`/`sox`: duration, resolution, fps, codecs, loudness, true peak,
   audio presence/sync. Record results.

When the storyboard uses Gemini-generated stills, read
[references/image-generation.md](references/image-generation.md) before
configuring or running the image generator.

For image-led compositions, reuse or adapt
[assets/remotion/KnowledgeVideo.tsx](assets/remotion/KnowledgeVideo.tsx). It
provides chapter, image, portrait, quotation, timeline, comparison, statistic,
chart, map, document, relationship, montage, and caption scenes;
extend it when the storyboard calls for a visual form it does not cover.

When the request is grounded in supplied documents, books, or web pages, read
[references/source-workflow.md](references/source-workflow.md) and ingest the
sources before writing the final narration.

When one long source should become multiple videos, read
[references/series-workflow.md](references/series-workflow.md) after ingestion
before developing any episode.

When the storyboard justifies generated motion, read
[references/video-generation.md](references/video-generation.md). Generate only
the selected shots; do not replace the image-led visual plan wholesale.

When manual production adjustments are useful, use the local Workbench. It
previews assets and videos, edits captions, inspects the scene timeline, and
selects image and voice models without starting paid generation.

Expose the same operations to a local MCP host with:
`node skills/make-video/scripts/mcp.mjs` (stdio is the default mode).

## Generation safety (read before running any script)

- Identify the target video id before any generation or render command —
  never iterate over every composition.
- Generated audio and rendered outputs are **not disposable caches**. Every
  generation/render command refuses to overwrite an existing output; pass
  `--force` only when regeneration was explicitly requested.
- Never run a generator just to inspect something else (e.g. don't
  regenerate audio to verify a file move).

## Project setup (this skill carries no project of its own)

This skill is a set of dependency-free scripts (Node built-ins only, no
`npm install` needed for the skill itself). They operate on the caller's
current project — always run them from that project's root — and expect it
to already have, or be given, a Remotion setup:

- `remotion`, `@remotion/cli`, `react`, `react-dom` in the project's own
  `package.json` (add them with the project's package manager if missing).
- `src/index.ts` calling `registerRoot`, and `src/Root.tsx` registering
  compositions (create this minimal scaffold if the project has none yet).
- Node.js 22.9+ when using `--env-file-if-exists`, plus `ffmpeg`, `ffprobe`, and
  `sox` on `PATH`.

## Commands

Script paths below are relative to this skill's own directory. Run them with
Node from the project root; every command that touches composition-specific
files takes exactly one video id. Prefix with `--env-file-if-exists=.env` so
`GEMINI_API_KEY` loads from a `.env` file in the project root when present,
without erroring when it isn't:

```bash
node --env-file-if-exists=.env scripts/qa-video.mjs <video-id>
node --env-file-if-exists=.env scripts/link-assets.mjs <video-id>
node --env-file-if-exists=.env scripts/ai.mjs images <video-id>
node --env-file-if-exists=.env scripts/ai.mjs video <video-id>
node --env-file-if-exists=.env scripts/ingest-sources.mjs <video-id>
node --env-file-if-exists=.env scripts/render.mjs studio <video-id>
node --env-file-if-exists=.env scripts/render.mjs still <video-id>
node --env-file-if-exists=.env scripts/render.mjs preview <video-id>
node --env-file-if-exists=.env scripts/generate-ui-sfx.mjs <video-id>
node --env-file-if-exists=.env scripts/ai.mjs voiceover <video-id>
node --env-file-if-exists=.env scripts/ai.mjs music <video-id>
node --env-file-if-exists=.env scripts/prepare-audio.mjs <video-id>
node --env-file-if-exists=.env scripts/ai.mjs verify-voiceover <video-id>
node --env-file-if-exists=.env scripts/render.mjs final <video-id>
```

Full detail on the config schema, per-composition README convention, and
production workflow lives in
[references/production-workflow.md](references/production-workflow.md).

## Starting a new video

1. If the project has no Remotion scaffold yet, create it (see "Project
   setup" above).
2. Pick a kebab-case `<video-id>` and create `src/<video-id>/`.
3. Write `video.config.json` (see references/production-workflow.md "Plan the
   composition" for the required `composition`/`production` fields) and the
   composition component.
4. Register the composition in `src/Root.tsx`.
5. Follow the Workflow above: silent visuals first, audio second, then render
   and master.
