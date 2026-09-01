# Delivery workflow

Use this workflow when one finished edit has to ship as more than one file:
another aspect ratio, a clean version without burned-in captions, a translated
version, a thumbnail, a trailer, or a short-form extract.

## Principle

A delivery variant is a **render of the same project timeline**, not a re-cut of
the finished file. Scenes, narration timing, effects, and audio come from
`SCENE_INDEX.json`, `SCRIPT.md`, and `REMOTION_TIMELINE.json` exactly as the
main render does. Nothing about a variant can drift from the edit, and no
variant is produced by hand-cropping the master.

## Declare the variants

Add `DELIVERABLES.json` to the project directory:

```json
{
  "version": 1,
  "variants": [
    {"id": "horizontal-clean", "kind": "video", "captions": false, "output": "output/<video-id>/horizontal-clean.mp4"},
    {"id": "vertical-captioned", "kind": "video", "width": 1080, "height": 1920, "output": "output/<video-id>/vertical-captioned.mp4"},
    {"id": "zh-captioned", "kind": "video", "translation": "src/<video-id>/translations/zh-CN.json", "output": "output/<video-id>/zh-captioned.mp4"},
    {"id": "thumbnail", "kind": "still", "width": 1280, "height": 720, "captions": false, "frame": 240, "output": "output/<video-id>/thumbnail.png"},
    {"id": "trailer", "kind": "video", "frames": [0, 366], "output": "output/<video-id>/trailer.mp4"}
  ]
}
```

Fields:

- `id` — kebab-case, unique. Names the variant in the delivery report.
- `kind` — `video` (`.mp4`) or `still` (`.png`).
- `width` / `height` — default to the composition. Scene layouts use relative
  units, so a different aspect ratio re-lays out rather than crops.
- `captions` — defaults to `true`. `false` renders a clean version for
  broadcasters and platforms that add their own subtitles.
- `translation` — project-relative translation file (see below).
- `frame` — still only; defaults to `production.stillFrame`.
- `frames` — video only, `[startFrame, endFrame)`, end-exclusive like every
  other frame range in a project. Use it for trailers and short extracts.
- `output` — project-relative path. It must not be a production output and must
  not collide with another variant.
- `master` — force FFmpeg loudness mastering on or off. Defaults to on when
  `production.mastering` is configured.

## Translation files

```json
{
  "language": "zh-CN",
  "scenes": {"opening": {"title": "…", "subtitle": "…", "narration": "…"}},
  "captions": {"narration-2": "…"}
}
```

`scenes` replaces on-screen copy (`title`, `subtitle`, `quote`, `attribution`,
`documentText`, `label`). `narration` inside a scene entry translates that
scene's caption when the scene has exactly one; scenes with several captions
must translate them by caption id under `captions`. Unknown scene or caption
ids are rejected instead of silently ignored, so a stale translation cannot
ship half-applied.

Translated captions do not translate the voiceover. Generating narration audio
in another language is a separate, paid step.

## Run it

```bash
node <skill-dir>/scripts/render.mjs deliver <video-id>
node <skill-dir>/scripts/render.mjs deliver <video-id> --variant=trailer,thumbnail
```

Or over MCP: `make_video_get_deliverables`, `make_video_deliver`, and
`make_video_get_delivery_job`.

Each variant refuses to overwrite an existing file. Pass `--force` (or
`force: true`) only when regeneration was explicitly requested — delivery files
are generated media, not a cache.

Every run writes `output/<video-id>/delivery-report.json` with the measured
width, height, and duration of each rendered variant, so the delivered files can
be checked against what was declared.

## Order of work

1. Finish and QA the main render first. A variant of an unfinished edit is waste.
2. Declare only the variants the request actually needs.
3. Render the cheap ones (stills, short extracts) first when validating a new
   `DELIVERABLES.json`; a full-length re-render costs the same as the master.
4. Check `delivery-report.json` before handing the files over.
