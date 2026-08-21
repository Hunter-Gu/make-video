# Generated video shots

Use video generation selectively after the storyboard is ready. Prefer stills,
maps, timelines, charts, documents, and Remotion animation when they explain the
material more accurately or cheaply.

Configure `videoGeneration` with an explicit model, shared direction, and MP4
outputs under the video's public directory. Each asset needs a stable ID,
scene-specific prompt, and may specify `aspectRatio`, `resolution`, or
`durationSeconds`. Set a project-relative `firstFrame` for image-to-video. Set
both `firstFrame` and `lastFrame` when the shot must interpolate between two
reference images.

Run `scripts/ai.mjs video <video-id>`. It starts the AI SDK's asynchronous
Veo operation, polls until completion, downloads the MP4, validates it with
ffprobe, and records operation, prompt, file hash, and duration in a manifest.
It also records each operation immediately in `operations.json`. A rerun resumes
an unfinished matching operation instead of starting another paid request, and
reuses completed partial outputs after an interrupted batch. Existing unrelated
outputs are protected. The script defaults to a 20-minute timeout; configure
`pollSeconds` or `timeoutMinutes` when necessary.

Pass `--asset=<id>` to process only one shot. The script preserves unrelated
manifest entries.

Use a `video` scene in `KnowledgeVideo.tsx` to mix a generated MP4 into the same
timeline as stills and programmatic scenes. Configure `video`, and optionally
`videoFit`, `videoStartInFrames`, `videoPlaybackRate`, `videoMuted`, or
`videoVolume`. Generated clips default to muted so narration remains the primary
audio track.

List generated or supplied clips in `CLIP_QA.json`, including expected duration,
minimum resolution, cut threshold, and text policy. Run
`scripts/qa-generated-videos.mjs <video-id>` for ffprobe, scene-cut, midpoint
OCR, duration, resolution, and text checks. The script does not call an AI model.
