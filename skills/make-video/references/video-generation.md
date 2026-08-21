# Generated video shots

Use video generation selectively after storyboard approval. Prefer stills,
maps, timelines, charts, documents, and Remotion animation when they explain the
material more accurately or cheaply.

Configure `videoGeneration` with an explicit model, shared direction, and MP4
outputs under the video's public directory. Each asset needs a stable ID,
scene-specific prompt, and may specify `aspectRatio` or `resolution`.

Run `scripts/generate-veo-videos.mjs <video-id>`. It starts Gemini's asynchronous
Veo operation, polls until completion, downloads the MP4, validates it with
ffprobe, and records operation, prompt, file hash, and duration in a manifest.
Existing outputs are protected. The script defaults to a 20-minute timeout;
configure `pollSeconds` or `timeoutMinutes` when necessary.

Generation may incur substantial cost. Confirm the shot count and provider
before running it. Inspect subject consistency, unwanted text, historical
accuracy, continuity, duration, and whether the clip supports its narration.
