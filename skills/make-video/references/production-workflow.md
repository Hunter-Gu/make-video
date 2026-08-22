# Production workflow reference

Full detail behind the `SKILL.md` workflow: responsibilities, source
organization, the per-step production workflow, targeted commands, and
generation safety rules.

## Responsibilities

The user is responsible for:

- Providing local source assets and confirming the right to use them.
- Defining the audience, channel, objective, and important creative constraints.
- Inspecting the final creative result.

The agent is responsible for:

- Inspecting source media and planning the edit.
- Writing or updating the composition, scenes, timing, and captions.
- Generating optional narration, music, and sound effects.
- Rendering previews and final deliverables.
- Running deterministic QA for visual, audio, encoding, and platform requirements.
- Recording material limitations and publication status.

## Source organization

Each video owns a direct child directory of `src/`. Do not put composition
files for different videos in the same directory.

```text
src/
├── index.ts
├── Root.tsx
├── <video-id>/
│   ├── <Composition>.tsx
│   ├── scenes.tsx
│   ├── AudioTracks.tsx
│   ├── Captions.tsx
│   ├── README.md
│   └── video.config.json
└── <next-video-id>/
    ├── <Composition>.tsx
    ├── scenes.tsx
    ├── README.md
    └── video.config.json
```

`src/index.ts` remains the Remotion entry point and `src/Root.tsx` registers
the available compositions. A composition directory should contain everything
specific to that video. Move code into a shared module only after two or more
compositions genuinely reuse it.

Canonical case assets remain outside `src/`. Link or copy only the assets that
Remotion must read into `public/`; do not edit a canonical source asset through
its runtime copy.

## General production workflow

### 1. Write the production plan

Follow [planning-workflow.md](planning-workflow.md) before editing. Record the
production plan in `src/<video-id>/PRODUCTION_PLAN.md`, including:

- Target platform and aspect ratio.
- Intended duration and frame rate.
- Audience, message, and call to action.
- Required source assets and their usage rights.
- Whether the video needs narration, music, captions, or sound effects.
- Expected output path and publication status.

Keep copy short enough for the intended duration. The video must remain
understandable without audio when it is intended for an autoplay social feed.

### 2. Write the narration and storyboard

For image-led knowledge videos, follow
[storyboard-workflow.md](storyboard-workflow.md). Save the agreed narration and
storyboard as `SCRIPT.md` and `STORYBOARD.md` in the composition directory.
Generate media after the narration and storyboard are complete.

### 3. Inspect the local assets

The agent inventories the supplied files before changing the composition. Use
`ffprobe` to inspect video and audio streams, frame rate, dimensions, duration,
and codecs. Use FFmpeg for disposable inspection transcodes or frame extraction.
Use SoX when waveform, silence, peak, gain, or other audio
analysis is useful.

Inspection commands are production actions performed directly by the agent; they
do not need repository wrappers unless the same operation becomes a stable,
repeatable package requirement.

### 4. Plan the composition

Create or update one composition directory and register it in `src/Root.tsx`.
Keep scene timing, caption timing, audio prompts, and composition metadata in
the composition's `video.config.json` when they share one timeline.

The config must declare a `videoId` matching its directory and a `production`
object that owns asset links, the public runtime path, output paths, render
props, optional audio steps, and optional mastering settings. New compositions
should normally use their video id as `production.publicPath`, which isolates
their runtime audio and assets under `public/<video-id>/`.

Use frame-based Remotion primitives for deterministic rendering:

- `Sequence` for scene boundaries.
- `useCurrentFrame()` and `interpolate()` for animation.
- `staticFile()` for local runtime assets.
- `Video`, `Audio`, and `Img` for media.

Do not use CSS transitions or CSS animations in a Remotion composition.

### 5. Build and inspect silent visuals first

Start with the visual edit before generating expensive or nondeterministic
audio. Typecheck the package, render representative still frames, and inspect
the opening hook, important transitions, result reveal, captions, safe areas,
and end card.

Use a silent preview render when timing cannot be judged from still frames.
Iterate on the composition until the visual story works without narration.

### 6. Generate optional audio

Audio generation is a separate, explicit stage:

- Gemini TTS may generate narration from the configured transcript.
- Lyria may generate a music bed from the configured music direction.
- Deterministic UI sound effects may be generated locally or supplied as assets.

Generated speech must fit inside its assigned timeline slots. Music and sound
effects should support the edit without masking narration or interface cues.
Keep API keys in the environment and never save them in this package.

Pass generated tracks through render props so the composition mixes them:

```json
{
  "audioTracks": [
    {"id": "voice", "src": "my-video/audio/voiceover/voiceover.wav"},
    {"id": "music", "src": "my-video/audio/music/underscore.mp3", "volume": 0.14, "loop": true},
    {"id": "chapter-hit", "src": "my-video/audio/sfx/ding.wav", "from": 120}
  ]
}
```

`KnowledgeVideo` accepts these tracks directly. Use `from`,
`durationInFrames`, and `trimBefore` when a track belongs to only part of the
timeline.

### 7. Render and master

Remotion produces the frame-accurate video and audio mix. FFmpeg may then be
used directly or through a stable package script to normalize loudness,
transcode audio, preserve or transcode video, add `faststart`, and create
platform-specific delivery files.

Use ffprobe on the finished deliverable to confirm at least:

- Duration.
- Width and height.
- Frame rate.
- Video and audio codecs.
- Presence or absence of the intended audio stream.

Use SoX or FFmpeg analysis when final loudness, peak level, clipping, or silence
needs verification.

### 8. Perform final QA

Visual QA must inspect the actual rendered video, not only the Remotion source.
Check:

- The first frame and opening hook.
- Text readability and platform safe areas.
- Crop, scale, and motion at scene boundaries.
- Product, logo, and generated-text integrity.
- Claims, disclosure, and source-asset usage boundaries.
- Audio synchronization, intelligibility, loudness, and ending.
- Unexpected black or frozen intervals and duplicate generated images.
- Final encoding and playback.

Record the asset inventory, known limitations, technical result, and publication
status in the relevant case or marketing documentation.

## Targeted commands

Script paths are relative to this skill's own directory; run them with Node
from the project root. `--env-file-if-exists=.env` loads `GEMINI_API_KEY`
from a `.env` file in the project root when present, and is a no-op
otherwise. Every command that reads or produces composition-specific files
requires exactly one video id:

```bash
node --env-file-if-exists=.env scripts/qa.mjs video <video-id>
node --env-file-if-exists=.env scripts/assets.mjs link <video-id>
node --env-file-if-exists=.env scripts/ai.mjs images <video-id>
node --env-file-if-exists=.env scripts/ai.mjs video <video-id>
node --env-file-if-exists=.env scripts/sources.mjs ingest <video-id>
node --env-file-if-exists=.env scripts/render.mjs studio <video-id>
node --env-file-if-exists=.env scripts/render.mjs still <video-id>
node --env-file-if-exists=.env scripts/render.mjs preview <video-id>
node --env-file-if-exists=.env scripts/audio.mjs sfx <video-id>
node --env-file-if-exists=.env scripts/ai.mjs voiceover <video-id>
node --env-file-if-exists=.env scripts/ai.mjs music <video-id>
node --env-file-if-exists=.env scripts/audio.mjs prepare <video-id>
node --env-file-if-exists=.env scripts/render.mjs final <video-id>
```

Generation and render commands refuse to overwrite existing outputs. Use
`--force` only after regeneration has been explicitly requested:

```bash
node --env-file-if-exists=.env scripts/render.mjs final <video-id> --force
```

## Generation safety

Generated assets are not disposable caches. Narration, music, sound effects,
preview renders, and final renders must not be regenerated or overwritten as a
side effect of typechecking, opening Remotion Studio, moving source files, or
working on another composition.

Follow these rules:

- Always identify the intended composition before a generation or render step.
- Never iterate over every composition and generate all of them implicitly.
- Treat an existing generated file as preserved output; stop rather than
  overwriting it unless regeneration was explicitly requested.
- Keep audio generation separate from rendering.
- Do not run a generator merely to verify a source-directory migration.
- Prefer composition-specific output directories and file names.
- Preserve canonical source assets and previously published deliverables.

Each composition directory should maintain its own README for its source
assets, commands, model choices, output paths, and QA records.
