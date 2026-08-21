# Generated video shots

Use video generation selectively after storyboard approval. Prefer stills,
maps, timelines, charts, documents, and Remotion animation when they explain the
material more accurately or cheaply.

Configure `videoGeneration` with an explicit model, shared direction, and MP4
outputs under the video's public directory. Each asset needs a stable ID,
scene-specific prompt, and may specify `aspectRatio`, `resolution`, or
`durationSeconds`. Set a project-relative `firstFrame` for image-to-video. Set
both `firstFrame` and `lastFrame` when the shot must interpolate between two
approved images.

Run `scripts/generate-veo-videos.mjs <video-id>`. It starts Gemini's asynchronous
Veo operation, polls until completion, downloads the MP4, validates it with
ffprobe, and records operation, prompt, file hash, and duration in a manifest.
It also records each operation immediately in `operations.json`. A rerun resumes
an unfinished matching operation instead of starting another paid request, and
reuses completed partial outputs after an interrupted batch. Existing unrelated
outputs are protected. The script defaults to a 20-minute timeout; configure
`pollSeconds` or `timeoutMinutes` when necessary.

After an approved revision, pass `--asset=<id>` to process only that shot. The
script preserves unrelated manifest entries and still honors approval locks.

Generation may incur substantial cost. Confirm the shot count and provider
before running it. Inspect subject consistency, unwanted text, historical
accuracy, continuity, duration, and whether the clip supports its narration.

Before any model call, define units, pricing, and latency bounds in
`GENERATION_PLAN.json`, then run `scripts/estimate-generation.mjs <video-id>`.
Record user-approved asset IDs and the estimate's `planHash` in
`GENERATION_APPROVAL.json`. Image and video generators reject missing, stale,
or partial approvals. Manifests preserve the estimated per-asset cost.

Use a `video` scene in `KnowledgeVideo.tsx` to mix an approved MP4 into the same
timeline as stills and programmatic scenes. Configure `video`, and optionally
`videoFit`, `videoStartInFrames`, `videoPlaybackRate`, `videoMuted`, or
`videoVolume`. Generated clips default to muted so narration remains the primary
audio track.
