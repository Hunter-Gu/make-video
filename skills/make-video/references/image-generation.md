# Image generation

Use generated images after the storyboard and its approximate asset count are
ready. Supplied, licensed, public-domain, map, chart, and document assets
may be more accurate than generated reconstructions.

Add an `imageGeneration` object to the video's `video.config.json`:

```json
{
  "imageGeneration": {
    "model": "configured-image-model",
    "direction": "Shared visual style and historical constraints.",
    "assets": [
      {
        "id": "opening-portrait",
        "prompt": "Scene-specific content and composition.",
        "output": "images/generated/opening-portrait.png",
        "aspectRatio": "16:9"
      }
    ]
  }
}
```

`direction` keeps shared style, period, character, and negative constraints in
one place. Each asset prompt describes only its scene-specific subject,
composition, and purpose. Use stable kebab-case IDs and keep outputs inside the
video's configured public directory.

Run one target video from the caller's project root:

```bash
node --env-file-if-exists=.env <skill-dir>/scripts/ai.mjs images <video-id>
```

Append `--asset=<id>` to target only that image.
Repeat the option or use comma-separated IDs for a small affected set. Unrelated
manifest entries remain unchanged. Existing output is preserved unless the
user explicitly requested replacement and `--force` is supplied.

The manifest is written after every image, so an interrupted batch keeps the
provenance of what it bought. Re-running skips any image whose file, prompt, and
model are unchanged and generates only the rest; an image whose request has
changed is refused rather than overwritten, and needs `--force`.

Keep reusable style rules in `VISUAL_BIBLE.json`, recurring people and life
stages in `CHARACTER_BIBLE.json`, and historical boundaries in
`PROMPT_CONSTRAINTS.md`. Generation automatically prepends them. An asset may
request exact character stages with `characters: [{"id":"...","stage":"..."}]`.

List selected visual assets in `IMAGE_QA.json` with a semantic `visualIdea`,
text policy, and minimum information threshold. Run
`<skill-dir>/scripts/qa.mjs images <video-id>` to reject near-duplicate perceptual hashes,
repeated visual ideas,
low-variance images, and high-confidence OCR text that was not allowed. It
refuses to run against an empty list rather than reporting a pass for images it
never looked at, so run it once the project has stills to check.

The script uses `GEMINI_IMAGE_MODEL` when set, otherwise the configured model.
It never overwrites an output without `--force` and records prompt and file
hashes in `images/generated/manifest.json`.

Inspect every generated image before composition. Check identity, anatomy,
period details, accidental text, modern objects, geography, source certainty,
and consistency with adjacent scenes. Label speculative reconstructions when
the finished video could otherwise imply documentary evidence.
