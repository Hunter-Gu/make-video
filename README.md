# make-video

A local, agent-driven video production skill built on Remotion, FFmpeg,
ffprobe, and SoX — turns local assets and a brief into a rendered, loudness-checked
video.

Agent-facing docs live in [skills/make-video/SKILL.md](skills/make-video/SKILL.md);
the full workflow reference is in
[skills/make-video/references/production-workflow.md](skills/make-video/references/production-workflow.md).

The skill itself carries no dependencies of its own (Node built-ins only) and
runs against whichever Remotion project it's invoked from — see "Project
setup" in SKILL.md.

## Install

```bash
npx skills add Hunter-Gu/make-video
```

For Remotion-authoring guidance (composition markup, captions, maps, etc.)
that goes beyond this skill's render/audio/QA pipeline, also install the
official companion skill:

```bash
npx skills add remotion-dev/skills --skill remotion-best-practices
```

## Requirements

- Node.js 22.9+ (for `--env-file-if-exists`; older versions work if you
  export env vars in the shell instead).
- `ffmpeg`, `ffprobe`, and `sox` on `PATH`.
- A Remotion project (`remotion`, `@remotion/cli`, `react`, `react-dom`) in
  whatever project you run this skill against — it is not bundled.

## Environment variables

| Variable                      | Required                                             | Purpose                                                                                                 |
| ----------------------------- | ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `GEMINI_API_KEY`              | Generation                                             | Server-only Gemini key used by the AI package; never exposed to the browser.                            |
| `GEMINI_TTS_MODEL`            | No                                                   | Overrides `voice.model` from `video.config.json` for narration.                                         |
| `GEMINI_TTS_VOICE`            | No                                                   | Overrides `voice.voiceName` from `video.config.json` for narration.                                     |
| `GEMINI_IMAGE_MODEL`          | No                                                   | Overrides `imageGeneration.model` for generated still images.                                           |
| `GEMINI_VIDEO_MODEL`          | No                                                   | Overrides `videoGeneration.model` for generated video shots.                                            |
| `LYRIA_MODEL`                 | No                                                   | Overrides `music.model` from `video.config.json` for the music bed.                                     |
| `TTS_START_AT`                | No                                                   | Resumes narration generation from a given caption id, reusing earlier segment files.                    |
| `REMOTION_BROWSER_EXECUTABLE` | No                                                   | Overrides the headless browser Remotion uses to render (defaults to system Chrome on macOS if present). |

### Setting `GEMINI_API_KEY`

Get a key from [Google AI Studio](https://aistudio.google.com/apikey), then either:

- Export it in your shell before running any command:

  ```bash
  export GEMINI_API_KEY="your-key-here"
  ```

- Or create a `.env` file in your project root:

  ```
  GEMINI_API_KEY=your-key-here
  ```

  and run commands with `--env-file-if-exists=.env` (already included in the
  command examples in SKILL.md and the workflow reference) — it loads the
  file when present and is a no-op otherwise. Add `.env` to your project's
  `.gitignore`; never commit it.

Video plans are produced by the host agent. The AI package only handles media
generation.

## Roadmap

The implemented plan for turning topics, documents, and books into image-led
knowledge videos and documentary series is in [ROADMAP.md](ROADMAP.md).

## Start a project

A video project is a directory under `src/`. Create one before planning:

```bash
pnpm project:create my-video --title="My video" --duration=180
```

Over MCP the same operation is `make_video_create_project`. Pass `seriesId` and
`episodeId` instead to scaffold an episode of a verified series; the episode
inherits the title, runtime, and source documents from the series plan. Model
selection stays unset, because choosing one is a cost decision — configure it
with `make_video_update_models` or the app's model settings.

## Acceptance example

The repository ships a reproducible Library of Alexandria acceptance case as a
tracked example. `src/` and `projects/` hold user-owned state and stay out of
version control, so install the example into them first:

```bash
pnpm install
pnpm example:install library-of-alexandria
pnpm render:preview library-of-alexandria
pnpm video:qa library-of-alexandria
```

The same example carries a two-episode series plan and a set of delivery
variants:

```bash
pnpm series:verify alexandria-history
pnpm series:coverage alexandria-history --force
pnpm deliver library-of-alexandria --variant=thumbnail
```

Model-backed image, video, voice, and music generation stays separate from
this local acceptance path and requires the caller's API credentials.

## Rebuilding only what changed

`make_video_get_build_status` (REST: `GET /api/build-status`) reports which
rendered outputs and delivery variants are missing, and which are older than the
project files they were built from — naming the exact inputs that moved ahead of
them. Use it after a script, timeline, asset, or translation edit so a small
change does not cost a full re-render.

## Local app

The local production GUI is documented in
[docs/app-architecture.md](docs/app-architecture.md). Its screens
depend on a transport interface rather than calling MCP directly. The current
browser transport uses REST; agent hosts use MCP over stdio or Streamable HTTP.
Both adapters share one application service, so they do not duplicate project
validation or production rules.

Start the development frontend and MCP/REST server together with:

```bash
pnpm dev
```

Open `http://127.0.0.1:4318` for the Vite app with hot reload. The local
MCP/REST server runs on `http://127.0.0.1:4317`.

For a production-style local build, run:

```bash
cd packages/app
pnpm build
cd ../mcp
pnpm build
cd ../..
node skills/make-video/scripts/mcp.mjs http
```

Then visit `http://127.0.0.1:4317`.

Expose the same project operations to Codex, Claude Code, or another local
MCP host over stdio:

```bash
codex mcp add make-video -- node "$PWD/skills/make-video/scripts/mcp.mjs"
claude mcp add make-video --scope project -- node "$PWD/skills/make-video/scripts/mcp.mjs"
```

The MCP server provides project creation, project inspection, source and plan
operations, model updates, generation jobs, rendering, deterministic QA, build
status, delivery variants, and series verification. Paid generation uses credentials from the server
environment; credentials are never sent as MCP tool input.

## Delivery variants

`DELIVERABLES.json` declares the files one edit has to ship as: other aspect
ratios, clean versions without burned-in captions, translated versions,
thumbnails, trailers, and short extracts. Each variant is rendered from the same
project timeline rather than re-cut from the master, so a variant cannot drift
from the edit. See
[skills/make-video/references/delivery-workflow.md](skills/make-video/references/delivery-workflow.md).

## Series

`projects/<series-id>/series-plan.json` and `SERIES_BIBLE.json` describe a
multi-episode adaptation. Each episode becomes its own video project through
`make_video_create_project`, which refuses to scaffold an episode of a series
that does not verify. `pnpm series:verify <series-id>` rejects broken
episode ordering, repeated or unaccounted source material, ideas required before
they are introduced, chronology regressions, contradicted canonical positions,
missing shared bibles, and unknown pronunciation references, and reports the
source-to-narration compression the requested runtimes imply.
`pnpm series:coverage <series-id>` writes the coverage record. See
[skills/make-video/references/series-workflow.md](skills/make-video/references/series-workflow.md).

## Development

```bash
pnpm typecheck
pnpm test
```

`pnpm test` rebuilds the bundled skill entrypoints under
`skills/make-video/scripts/` and runs the deterministic suites for narration
timing, delivery variants, series verification, source ingestion, and the MCP
service — plus an end-to-end MCP run over stdio and Streamable HTTP. It needs
`ffmpeg` and `ffprobe` on `PATH`. CI additionally fails when the committed skill
entrypoints do not match their source.

## License

MIT — see [LICENSE](LICENSE).
