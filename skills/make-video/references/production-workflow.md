# Production workflow reference

Full detail behind the `SKILL.md` workflow: responsibilities, project data,
production stages, targeted commands, and generation safety rules.

## Responsibilities

The user provides source assets, confirms their usage rights, defines the
audience and creative constraints, and judges the final creative result.

The host agent is responsible for:

- Inspecting source media and planning the edit.
- Writing or updating the plan, narration, scenes, timing, effects, and captions.
- Generating optional images, video, narration, music, and sound effects.
- Rendering previews and final deliverables.
- Running deterministic media and timeline QA.
- Recording material limitations and publication status.

## Project data

Each video owns a direct child directory of `src/`. The directory contains
inspectable data for the generic `MakeVideo` composition, not a private React
component tree.

```text
src/
├── index.ts
├── Root.tsx
├── <video-id>/
│   ├── video.config.json
│   ├── VIDEO_PLAN.json
│   ├── SCRIPT.md
│   ├── STORYBOARD.md
│   ├── SCENE_INDEX.json
│   ├── REMOTION_TIMELINE.json
│   └── PROJECT_STATE.json
└── <next-video-id>/
    └── ...
```

`src/index.ts` and `src/Root.tsx` expose one generic `MakeVideo` composition.
The render package loads the selected video's files and supplies a
`ProjectState` object to that composition. Add a reusable scene primitive to
`packages/remotion` only when the existing scene types cannot express the
storyboard.

Canonical assets remain outside `src/`. Link or copy only the files Remotion
must read into `public/`; never edit a canonical asset through its runtime copy.

## Production stages

### 0. Create the project

`make_video_create_project` writes `video.config.json`, an empty
`SCENE_INDEX.json`, and an empty `REMOTION_TIMELINE.json` under
`src/<video-id>/`. It sets the composition size, frame rate, and a placeholder
duration — narration timing replaces that duration later — and leaves the image,
video, and voice models unset, because selecting one is a cost decision. It never
replaces an existing project unless replacement was explicitly requested.

For an episode of a planned series, pass `seriesId` and `episodeId` instead of a
video id. The series must verify first; the episode then takes its id, title,
runtime, and source documents from the plan and records the link in
`SERIES_EPISODE.json`.

### 1. Write the production plan

Follow [planning-workflow.md](planning-workflow.md). The host agent saves a
source-referenced `VIDEO_PLAN.json` through MCP. Record platform, dimensions,
runtime, audience, narrative approach, visual direction, audio, sources, and
the expected output.

### 2. Write narration and storyboard

Follow [storyboard-workflow.md](storyboard-workflow.md). Save `SCRIPT.md` and
`STORYBOARD.md` under `src/<video-id>/`. Generate media only after the narration
and storyboard are coherent enough to estimate cost and workload.

### 3. Inspect supplied media

Inventory supplied files before changing the edit. Use `ffprobe` for streams,
dimensions, duration, frame rate, and codecs; FFmpeg for disposable inspection
frames or transcodes; and SoX when waveform, silence, peak, or gain analysis is
useful. These direct inspection actions do not need wrappers.

### 4. Plan the edit

Supplied media stays canonical under `src/` or a package, and
`production.assetLinks` hard-links it into `public/<video-id>/`. A public copy
that no longer matches its source is refused rather than replaced, since it may
have been edited in place; after replacing a canonical asset, re-link with
`--force` to point the public copy back at it.

Keep dimensions, duration, models, asset links, runtime paths, output paths,
optional audio generation, and mastering settings in `video.config.json`. Its
declared `videoId` must match the directory. Use the video id as
`production.publicPath` to isolate runtime media under `public/<video-id>/`.

Keep visual and caption timing in `SCENE_INDEX.json`. Keep absolute-frame
Remotion effects in `REMOTION_TIMELINE.json`. The app preview and final renderer
consume both files, so do not create a parallel timeline in code. An effect needs
whole start and end frames inside the composition, and inside the scene it names
— the renderer drops anything else without a word, so video QA checks the
declaration.

Use frame-based Remotion primitives for deterministic rendering. Do not use CSS
transitions or CSS animations in a Remotion composition.

### 5. Build silent visuals first

Render representative frames and a silent preview. Inspect the opening hook,
scene boundaries, motion, captions, protected areas, and ending. Fix visual
timing before running paid or slow audio generation.

### 6. Generate optional audio

Audio is an explicit stage. Generated speech must fit its assigned narration
blocks; music and effects must not mask it. Keep server generation keys in the
environment and never save them in project files.

Declare what a paid run should cost in `GENERATION_PLAN.json` — one entry per
paid asset with `kind`, `units`, `costPerUnit`, and `latencySeconds` — and run
`scripts/ai.mjs estimate <video-id>` before spending. It writes
`GENERATION_ESTIMATE.json` with the per-asset and total price, the sequential
wait, and an `uncosted` list naming configured generation that carries no
declared cost. It contacts no provider.

Interrupted paid runs resume rather than repeat. Image generation skips anything
whose file, prompt, and model are unchanged. Narration is generated one segment
at a time: set `TTS_START_AT` to the caption id where it stopped to reuse the
earlier segments and generate only the rest.

The renderer loads generated tracks from the video's runtime directory:

- `audio/voiceover/voiceover.wav`
- `audio/music/underscore.mp3`
- supported audio files under `audio/sfx/`

Narration timing may assemble the voiceover from generated segment WAV files.
Do not copy audio paths into a second render-props manifest.

### 7. Render and master

Remotion produces the frame-accurate picture and audio mix. FFmpeg masters
loudness, transcodes when configured, and writes the delivery file. Confirm the
duration, dimensions, frame rate, codecs, and intended audio stream with
`ffprobe` after rendering.

### 8. Rebuild only what a change invalidated

`make_video_get_build_status` compares each rendered output and delivery variant
against the project files it was built from — configuration, scene index,
Remotion timeline, script, referenced assets, generated audio, and a variant's
translation — and reports which outputs are missing, which are stale, and which
inputs moved ahead of them. Re-render those, not everything.

It compares modification times of project files only. Changing the composition
code under `packages/remotion` or `src/` is not tracked; re-render deliberately
after a code change.

### 9. Perform final QA

Check the actual rendered file, not just source code. Inspect the first frame,
text readability, safe areas, scene boundaries, generated-text integrity,
source claims, audio synchronization, loudness, ending, black/frozen ranges,
and encoding. Record known limitations and publication status.

Caption checks cover more than the composition bounds: a caption that names a
scene must also sit inside it. Editing a scene boundary can push narration past
the picture it belongs to without breaking anything else, so QA is where that is
caught.

Declare the thresholds a project expects in `production.qa` rather than relying
on the defaults. An image-led edit holds each still deliberately, so its freeze
budget follows its longest hold; a project that inherits a default which happens
to fit is not being checked, it is being flattered.

Loudness and true-peak checks run when the project declares that audio carries
content — `production.qa.audioRequired`, or, when that is unset, configured
mastering or audio generation. A silent edit is not measured for loudness:
Remotion writes a silent audio track into MP4 output regardless.

## Targeted commands

Replace `<skill-dir>` with this skill's absolute directory and run from the
project root. Every command requires exactly one video id.

```bash
node --env-file-if-exists=.env <skill-dir>/scripts/assets.mjs create <video-id> [--title=…] [--width=…] [--height=…] [--fps=…] [--duration=…]
node --env-file-if-exists=.env <skill-dir>/scripts/qa.mjs video <video-id>
node --env-file-if-exists=.env <skill-dir>/scripts/assets.mjs link <video-id>
node --env-file-if-exists=.env <skill-dir>/scripts/ai.mjs estimate <video-id>
node --env-file-if-exists=.env <skill-dir>/scripts/ai.mjs images <video-id>
node --env-file-if-exists=.env <skill-dir>/scripts/ai.mjs video <video-id>
node --env-file-if-exists=.env <skill-dir>/scripts/sources.mjs ingest <video-id>
node --env-file-if-exists=.env <skill-dir>/scripts/render.mjs studio <video-id>
node --env-file-if-exists=.env <skill-dir>/scripts/render.mjs still <video-id>
node --env-file-if-exists=.env <skill-dir>/scripts/render.mjs preview <video-id>
node --env-file-if-exists=.env <skill-dir>/scripts/audio.mjs sfx <video-id>
node --env-file-if-exists=.env <skill-dir>/scripts/ai.mjs voiceover <video-id>
node --env-file-if-exists=.env <skill-dir>/scripts/ai.mjs music <video-id>
node --env-file-if-exists=.env <skill-dir>/scripts/audio.mjs prepare <video-id>
node --env-file-if-exists=.env <skill-dir>/scripts/render.mjs final <video-id>
node --env-file-if-exists=.env <skill-dir>/scripts/render.mjs deliver <video-id>
```

Generation and render commands preserve existing outputs. Use `--force` only
after replacement was explicitly requested.

## Command output

Every command reports its progress on stderr. Reports and rendered media are
files; nothing is printed on stdout for a caller to parse. The same functions run
inside the MCP server, where stdout carries the protocol.

## Generation safety

- Target one video before every generation or render step.
- Never generate every video implicitly.
- Keep audio generation separate from rendering.
- Do not run a generator to verify a move or inspect another file.
- Preserve canonical source assets and published deliverables.
- Prefer video-specific runtime and output directories.
