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
| `GEMINI_API_KEY`              | Only for narration/music generation and verification | Gemini REST API key, called directly with `fetch` (no SDK).                                             |
| `GEMINI_TTS_MODEL`            | No                                                   | Overrides `voice.model` from `video.config.json` for narration.                                         |
| `GEMINI_TTS_VOICE`            | No                                                   | Overrides `voice.voiceName` from `video.config.json` for narration.                                     |
| `GEMINI_IMAGE_MODEL`          | No                                                   | Overrides `imageGeneration.model` for generated still images.                                           |
| `LYRIA_MODEL`                 | No                                                   | Overrides `music.model` from `video.config.json` for the music bed.                                     |
| `GEMINI_VERIFY_MODEL`         | No                                                   | Model used to transcribe generated narration for verification (defaults to `gemini-3.6-flash`).         |
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

## Roadmap

The long-term plan for turning topics, documents, and books into image-led
knowledge videos and documentary series is in [ROADMAP.md](ROADMAP.md).

## License

MIT — see [LICENSE](LICENSE).
