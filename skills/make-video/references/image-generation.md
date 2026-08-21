# Image generation

Use generated images only after the storyboard and its approximate asset count
are approved. Supplied, licensed, public-domain, map, chart, and document assets
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
node --env-file-if-exists=.env scripts/generate-gemini-images.mjs <video-id>
```

The script uses `GEMINI_IMAGE_MODEL` when set, otherwise the configured model.
It refuses to overwrite outputs without `--force` and records prompt and file
hashes in `images/generated/manifest.json`.

Inspect every generated image before composition. Check identity, anatomy,
period details, accidental text, modern objects, geography, source certainty,
and consistency with adjacent scenes. Label speculative reconstructions when
the finished video could otherwise imply documentary evidence.
