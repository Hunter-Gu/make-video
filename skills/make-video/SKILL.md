---
name: make-video
version: 0.1.0
description: Turn local assets (screen recordings, images, video clips, a text brief) into a finished, mastered video — Remotion composition, optional AI narration/music/sound effects, captions, and a loudness-checked final render. Use this whenever the user wants an actual video file produced, edited, or rendered — a product demo, a marketing/ad clip, an explainer, a walkthrough, a screen-recording turned into a narrated video — even if they just say "make this into a video" or "I recorded my screen, can you add a voiceover" without naming any tool. Also use it when the user wants to check or fix a finished video's loudness, captions, or encoding. Don't use this for writing standalone Remotion animation code with no rendering/audio/QA involved — load `remotion-best-practices` for that instead.
license: MIT
compatibility: Requires Node.js 22.9+ (for `--env-file-if-exists`; older versions work if GEMINI_API_KEY is exported in the shell instead) and the ffmpeg/ffprobe/sox CLI tools on PATH. Runs against a Remotion project (remotion, @remotion/cli, react, react-dom) in the current project — this skill does not bundle them. GEMINI_API_KEY is required only for AI narration/music generation steps; those call the Gemini REST API directly with no SDK dependency.
metadata:
  tags: video, remotion, ffmpeg, ffprobe, sox, tts, captions, rendering, production
---

## What this skill does

This is a full local video production pipeline, not a single "generate a video"
prompt. It composes a project (`video.config.json` + Remotion scenes) from the
assets the user supplies, optionally generates narration/music/sound effects,
renders, and masters the result to a checked loudness/encoding spec before
calling it done. It works for any video — demos, product marketing, explainer
content, tutorials — driven entirely by the assets and brief the user gives it.

This skill is the layer above raw Remotion code: the end-to-end build,
generate, render, and verify workflow, using FFmpeg, ffprobe, and SoX
alongside Remotion.

## Workflow

1. **Get the brief.** Target platform/aspect ratio, duration, fps, message,
   required assets, whether narration/music/captions/sfx are needed, and the
   expected output path.
2. **Inspect supplied assets** with `ffprobe`/`ffmpeg`/`sox` before touching
   the composition — know the real duration, codecs, resolution of what you
   were given.
3. **Create one composition directory per video** under `src/<video-id>/`,
   with its own `video.config.json` as the single source of truth for scene
   timing, caption timing, audio steps, and render/mastering props. Never mix
   two videos' files in one directory.
4. **Build the silent visual edit first.** Typecheck, render still frames,
   iterate on timing before generating any audio — audio generation is
   expensive/slow and should happen once the visuals are right.
5. **Generate audio as an explicit, separate stage** (voiceover, music, sfx)
   only when the brief calls for it, and verify generated narration against
   the script before treating it as final.
6. **Render and master.** Remotion renders picture; FFmpeg masters loudness,
   transcodes, and produces platform-specific delivery files.
7. **QA the actual rendered file**, not just the source — check with
   `ffprobe`/`sox`: duration, resolution, fps, codecs, loudness, true peak,
   audio presence/sync. Record results.

## Generation safety (read before running any script)

- Identify the target video id before any generation or render command —
  never iterate over every composition.
- Generated audio and rendered outputs are **not disposable caches**. Every
  generation/render command refuses to overwrite an existing output; pass
  `--force` only when regeneration was explicitly requested.
- Never run a generator just to check something else works (e.g. don't
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

## Commands

Script paths below are relative to this skill's own directory. Run them with
Node from the project root; every command that touches composition-specific
files takes exactly one video id. Prefix with `--env-file-if-exists=.env` so
`GEMINI_API_KEY` loads from a `.env` file in the project root when present,
without erroring when it isn't:

```bash
node --env-file-if-exists=.env scripts/run-video.mjs check <video-id>
node --env-file-if-exists=.env scripts/link-assets.mjs <video-id>
node --env-file-if-exists=.env scripts/run-video.mjs studio <video-id>
node --env-file-if-exists=.env scripts/run-video.mjs still <video-id>
node --env-file-if-exists=.env scripts/run-video.mjs render:silent <video-id>
node --env-file-if-exists=.env scripts/generate-ui-sfx.mjs <video-id>
node --env-file-if-exists=.env scripts/generate-gemini-voiceover.mjs <video-id>
node --env-file-if-exists=.env scripts/generate-lyria-music.mjs <video-id>
node --env-file-if-exists=.env scripts/prepare-audio.mjs <video-id>
node --env-file-if-exists=.env scripts/verify-voiceover.mjs <video-id>
node --env-file-if-exists=.env scripts/render-final.mjs <video-id>
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
