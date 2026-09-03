import assert from "node:assert/strict";
import {spawnSync} from "node:child_process";
import {existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync} from "node:fs";
import {tmpdir} from "node:os";
import {resolve} from "node:path";
import {after, test} from "node:test";

const root = mkdtempSync(resolve(tmpdir(), "make-video-ai-"));
process.env.MAKE_VIDEO_PROJECT_ROOT = root;
delete process.env.GEMINI_IMAGE_MODEL;
delete process.env.GEMINI_VIDEO_MODEL;
delete process.env.GEMINI_TTS_MODEL;
delete process.env.GEMINI_TTS_VOICE;
delete process.env.LYRIA_MODEL;
delete process.env.TTS_START_AT;
const {runImages} = await import("../src/images");
const {runVideos} = await import("../src/videos");
const {runMusic, runVoiceover} = await import("../src/audio");
const {estimateGeneration} = await import("../src/estimate");
type MediaProvider = import("../src/media-provider").MediaProvider;

after(() => rmSync(root, {recursive: true, force: true}));

/** Video generation probes what it wrote, so the fake has to return a real clip. */
const clip = () => {
  const file = resolve(root, "clip.mp4");
  const result = spawnSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", "-f", "lavfi", "-i", "color=c=black:s=64x64:d=1", "-c:v", "libx264", "-pix_fmt", "yuv420p", file], {encoding: "utf8"});
  assert.equal(result.status, 0, result.stderr);
  return readFileSync(file);
};
const mp4 = clip();

/** Music is probed before it is written, so the fake has to return real MP3 bytes. */
const song = () => {
  const file = resolve(root, "song.mp3");
  const result = spawnSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", "-f", "lavfi", "-i", "sine=frequency=440:duration=1", "-c:a", "libmp3lame", file], {encoding: "utf8"});
  assert.equal(result.status, 0, result.stderr);
  return readFileSync(file);
};
const mp3 = song();

/** A provider that spends nothing and records exactly what it was asked for. */
const recorder = (overrides: Partial<MediaProvider> = {}) => {
  const calls: Array<Record<string, any>> = [];
  const png = Buffer.from("89504e470d0a1a0a0000000d49484452", "hex");
  const wave = (seconds: number) => {
    const pcm = Buffer.alloc(Math.round(seconds * 24000) * 2);
    const header = Buffer.alloc(44);
    header.write("RIFF", 0); header.write("WAVE", 8); header.write("fmt ", 12);
    header.writeUInt32LE(16, 16); header.writeUInt16LE(1, 20); header.writeUInt16LE(1, 22);
    header.writeUInt32LE(24000, 24); header.write("data", 36); header.writeUInt32LE(pcm.length, 40);
    return Buffer.concat([header, pcm]);
  };
  const provider: MediaProvider = {
    async image(request) { calls.push({kind: "image", ...request}); return {bytes: png, mediaType: "image/png"}; },
    async video(request) { calls.push({kind: "video", ...request}); return {bytes: mp4, mediaType: "video/mp4"}; },
    async speech(request) { calls.push({kind: "speech", ...request}); return {bytes: wave(1.5), mediaType: "audio/wav"}; },
    async music(request) { calls.push({kind: "music", ...request}); return {bytes: mp3, mediaType: "audio/mpeg"}; },
    ...overrides,
  };
  return {provider, calls};
};

let counter = 0;
const project = (config: Record<string, unknown>) => {
  const videoId = `ai-${counter += 1}`;
  const sourceDir = resolve(root, "src", videoId);
  mkdirSync(sourceDir, {recursive: true});
  writeFileSync(resolve(sourceDir, "video.config.json"), JSON.stringify({
    videoId,
    composition: {id: "Ai", fps: 30, width: 1920, height: 1080, durationInFrames: 30},
    production: {publicPath: videoId, outputs: {still: `output/${videoId}/still.png`, silent: `output/${videoId}/silent.mp4`, unmastered: `output/${videoId}/unmastered.mp4`, final: `output/${videoId}/final.mp4`}},
    ...config,
  }, null, 2));
  return {videoId, sourceDir, publicDir: resolve(root, "public", videoId)};
};

const imageAsset = (values: Record<string, unknown> = {}) => ({id: "opening", prompt: "A quiet library.", output: "images/generated/opening.png", ...values});
const readJson = (file: string) => JSON.parse(readFileSync(file, "utf8"));

test("a generated image is written once, with its provenance recorded", async () => {
  const {videoId, publicDir} = project({imageGeneration: {model: "gemini-image", assets: [imageAsset()]}});
  const {provider, calls} = recorder();
  await runImages([videoId], provider);

  assert.equal(calls.length, 1);
  assert.deepEqual({model: calls[0].model, prompt: calls[0].prompt, reference: calls[0].reference}, {model: "gemini-image", prompt: "A quiet library.", reference: undefined});
  const manifest = readJson(resolve(publicDir, "images/generated/manifest.json"));
  assert.equal(manifest.model, "gemini-image");
  assert.deepEqual(manifest.assets.map((asset: any) => [asset.id, asset.output, asset.mimeType, asset.model]), [["opening", "images/generated/opening.png", "image/png", "gemini-image"]]);
  assert.equal(manifest.assets[0].sha256.length, 64);
  assert.equal(manifest.assets[0].promptHash.length, 64);
});

test("an unchanged image is reused, and a changed one is never overwritten silently", async () => {
  const {videoId, sourceDir} = project({imageGeneration: {model: "gemini-image", assets: [imageAsset()]}});
  const first = recorder();
  await runImages([videoId], first.provider);

  const second = recorder();
  await runImages([videoId], second.provider);
  assert.equal(second.calls.length, 0, "an image already paid for must not be bought again");

  const config = readJson(resolve(sourceDir, "video.config.json"));
  config.imageGeneration.assets[0].prompt = "A busy library.";
  writeFileSync(resolve(sourceDir, "video.config.json"), JSON.stringify(config, null, 2));
  const changed = recorder();
  await assert.rejects(() => runImages([videoId], changed.provider), /would overwrite/);
  assert.equal(changed.calls.length, 0, "a refused run must not call the provider");

  const forced = recorder();
  await runImages([videoId, "--force"], forced.provider);
  assert.equal(forced.calls.length, 1);
});

test("an interrupted image batch keeps what it paid for and continues", async () => {
  const {videoId, publicDir} = project({imageGeneration: {model: "gemini-image", assets: [
    imageAsset(),
    imageAsset({id: "middle", output: "images/generated/middle.png", prompt: "A reading room."}),
    imageAsset({id: "closing", output: "images/generated/closing.png", prompt: "An empty hall."}),
  ]}});
  let drawn = 0;
  const interrupted = recorder({async image() { if (++drawn === 2) throw new Error("the connection dropped"); return {bytes: Buffer.from("89504e470d0a1a0a", "hex"), mediaType: "image/png"}; }});
  await assert.rejects(() => runImages([videoId], interrupted.provider), /the connection dropped/);
  assert.deepEqual(readJson(resolve(publicDir, "images/generated/manifest.json")).assets.map((asset: any) => asset.id), ["opening"], "the image it did buy keeps its provenance");

  const resumed = recorder();
  await runImages([videoId], resumed.provider);
  assert.deepEqual(resumed.calls.map((call) => call.prompt), ["A reading room.", "An empty hall."], "only the unwritten images are generated");
  assert.deepEqual(readJson(resolve(publicDir, "images/generated/manifest.json")).assets.map((asset: any) => asset.id), ["opening", "middle", "closing"]);
});

test("only the requested asset is regenerated", async () => {
  const {videoId} = project({imageGeneration: {model: "gemini-image", assets: [
    imageAsset(),
    imageAsset({id: "closing", output: "images/generated/closing.png", prompt: "An empty hall."}),
  ]}});
  const all = recorder();
  await runImages([videoId], all.provider);
  assert.deepEqual(all.calls.map((call) => call.prompt), ["A quiet library.", "An empty hall."]);

  const one = recorder();
  await runImages([videoId, "--asset=closing", "--force"], one.provider);
  assert.deepEqual(one.calls.map((call) => call.prompt), ["An empty hall."]);

  const unknown = recorder();
  await assert.rejects(() => runImages([videoId, "--asset=ghost"], unknown.provider), /Unknown generated image assets: ghost/);
  assert.equal(unknown.calls.length, 0);
});

test("an unusable image declaration is rejected before any model call", async () => {
  const reject = async (assets: unknown[], pattern: RegExp) => {
    const {videoId} = project({imageGeneration: {model: "gemini-image", assets}});
    const {provider, calls} = recorder();
    await assert.rejects(() => runImages([videoId], provider), pattern);
    assert.equal(calls.length, 0);
  };
  await reject([imageAsset({id: "Not Kebab"})], /Invalid or duplicate generated image id/);
  await reject([imageAsset(), imageAsset()], /Invalid or duplicate generated image id/);
  await reject([imageAsset({prompt: "  "})], /needs a prompt/);
  await reject([imageAsset({output: "../escape.png"})], /must stay inside publicDir/);
  await reject([imageAsset({output: "images/generated/opening.gif"})], /needs a supported extension/);

  const {videoId} = project({imageGeneration: {assets: [imageAsset()]}});
  const {provider} = recorder();
  await assert.rejects(() => runImages([videoId], provider), /imageGeneration.model must be a non-empty string/);
});

test("the visual bible, character stage, and constraints reach the prompt", async () => {
  const {videoId, sourceDir} = project({imageGeneration: {
    model: "gemini-image",
    direction: "Muted archival palette.",
    assets: [imageAsset({characters: [{id: "hypatia", stage: "adult"}]})],
  }});
  writeFileSync(resolve(sourceDir, "VISUAL_BIBLE.json"), JSON.stringify({promptDirection: "Warm parchment tones."}));
  writeFileSync(resolve(sourceDir, "CHARACTER_BIBLE.json"), JSON.stringify({characters: [{id: "hypatia", name: "Hypatia", stages: [{id: "adult", label: "in her forties", description: "A scholar in plain robes."}]}]}));
  writeFileSync(resolve(sourceDir, "PROMPT_CONSTRAINTS.md"), "No anachronistic technology.\n");
  const {provider, calls} = recorder();
  await runImages([videoId], provider);

  const prompt = calls[0].prompt as string;
  assert.match(prompt, /Muted archival palette\./);
  assert.match(prompt, /Visual bible: Warm parchment tones\./);
  assert.match(prompt, /Character Hypatia, in her forties: A scholar in plain robes\./);
  assert.match(prompt, /No anachronistic technology\./);
  assert.match(prompt, /A quiet library\.$/);
});

test("an unknown character stage stops the run rather than guessing", async () => {
  const {videoId, sourceDir} = project({imageGeneration: {model: "gemini-image", assets: [imageAsset({characters: [{id: "hypatia", stage: "child"}]})]}});
  writeFileSync(resolve(sourceDir, "CHARACTER_BIBLE.json"), JSON.stringify({characters: [{id: "hypatia", name: "Hypatia", stages: [{id: "adult", label: "adult", description: "…"}]}]}));
  const {provider, calls} = recorder();
  await assert.rejects(() => runImages([videoId], provider), /Unknown character stage: hypatia\/child/);
  assert.equal(calls.length, 0);
});

test("a returned image that does not match its output extension is rejected", async () => {
  const {videoId} = project({imageGeneration: {model: "gemini-image", assets: [imageAsset()]}});
  const {provider} = recorder({async image() { return {bytes: Buffer.from("x"), mediaType: "image/webp"}; }});
  await assert.rejects(() => runImages([videoId], provider), /returned image\/webp, which does not match \.png/);
});

const videoAsset = (values: Record<string, unknown> = {}) => ({id: "shot", prompt: "A slow pan.", output: "video/generated/shot.mp4", ...values});

test("a completed clip is reused instead of paid for twice", async () => {
  const {videoId, publicDir} = project({videoGeneration: {model: "veo", assets: [videoAsset()]}});
  const first = recorder();
  await runVideos([videoId], first.provider);
  assert.equal(first.calls.length, 1);
  assert.equal(readJson(resolve(publicDir, "video/generated/operations.json")).assets.shot.status, "completed");

  const second = recorder();
  await runVideos([videoId, "--asset=shot"], second.provider);
  assert.equal(second.calls.length, 0, "an unchanged, completed clip must not be regenerated");
  assert.equal(readJson(resolve(publicDir, "video/generated/manifest.json")).assets.length, 1);
});

test("a changed prompt invalidates the completed clip", async () => {
  const {videoId, sourceDir} = project({videoGeneration: {model: "veo", assets: [videoAsset()]}});
  const first = recorder();
  await runVideos([videoId], first.provider);

  const config = readJson(resolve(sourceDir, "video.config.json"));
  config.videoGeneration.assets[0].prompt = "A faster pan.";
  writeFileSync(resolve(sourceDir, "video.config.json"), JSON.stringify(config, null, 2));
  const second = recorder();
  await assert.rejects(() => runVideos([videoId, "--asset=shot"], second.provider), /would overwrite/);
  assert.equal(second.calls.length, 0);
});

test("a clip declaration must name an MP4 inside publicDir and order its frames", async () => {
  const bad = project({videoGeneration: {model: "veo", assets: [videoAsset({output: "video/generated/shot.mov"})]}});
  await assert.rejects(() => runVideos([bad.videoId], recorder().provider), /needs an MP4 path inside publicDir/);

  const frames = project({videoGeneration: {model: "veo", assets: [videoAsset({lastFrame: "src/nowhere/last.png"})]}});
  await assert.rejects(() => runVideos([frames.videoId], recorder().provider), /not found/);
});

test("narration is generated per segment and timed from the returned audio", async () => {
  const {videoId, sourceDir} = project({voice: {model: "gemini-tts", voiceName: "Kore", direction: "Calm narration."}});
  writeFileSync(resolve(sourceDir, "SCENE_INDEX.json"), JSON.stringify({captions: [
    {id: "opening", text: "Alexandria held many scrolls."},
    {id: "closing", text: "Its decline was gradual."},
  ]}));
  const {provider, calls} = recorder();
  await runVoiceover([videoId], provider);

  assert.deepEqual(calls.map((call) => [call.model, call.voice]), [["gemini-tts", "Kore"], ["gemini-tts", "Kore"]]);
  assert.match(calls[0].text, /Calm narration\.\n\nTranscript:\nAlexandria held many scrolls\./);
  const manifest = readJson(resolve(root, "public", videoId, "audio/voiceover/manifest.json"));
  assert.deepEqual(Object.keys(manifest.segments), ["opening", "closing"]);
  assert.equal(manifest.segments.opening.durationSeconds, 1.5);
  assert.equal(readFileSync(resolve(root, "public", videoId, "audio/voiceover/opening.wav")).toString("ascii", 0, 4), "RIFF");

  await assert.rejects(() => runVoiceover([videoId], recorder().provider), /already exists/);
});

test("music is written from the configured prompt and never silently replaced", async () => {
  const {videoId} = project({music: {model: "lyria-002", prompt: "A slow string bed."}});
  const {provider, calls} = recorder();
  await runMusic([videoId], provider);
  assert.deepEqual(calls, [{kind: "music", model: "lyria-002", prompt: "A slow string bed."}]);
  assert.deepEqual(readFileSync(resolve(root, "public", videoId, "audio/music/underscore.mp3")), mp3);
  await assert.rejects(() => runMusic([videoId], recorder().provider), /already exists/);
});

test("music that is not readable MP3 never reaches the project", async () => {
  const wrongType = project({music: {model: "lyria-002", prompt: "A slow string bed."}});
  await assert.rejects(() => runMusic([wrongType.videoId], recorder({async music() { return {bytes: mp3, mediaType: "audio/wav"}; }}).provider), /returned audio\/wav/);

  const corrupt = project({music: {model: "lyria-002", prompt: "A slow string bed."}});
  await assert.rejects(() => runMusic([corrupt.videoId], recorder({async music() { return {bytes: Buffer.from("not audio"), mediaType: "audio/mpeg"}; }}).provider), /ffprobe cannot read/);
  // A bad file must not land on disk, or the no-overwrite rule would block the retry.
  assert.equal(existsSync(resolve(root, "public", corrupt.videoId, "audio/music/underscore.mp3")), false);
});

test("an interrupted clip is not silently paid for again", async () => {
  const {videoId, publicDir} = project({videoGeneration: {model: "veo", assets: [videoAsset()]}});
  const failing = recorder({async video() { throw new Error("the connection dropped"); }});
  await assert.rejects(() => runVideos([videoId], failing.provider), /the connection dropped/);

  const operations = readJson(resolve(publicDir, "video/generated/operations.json"));
  assert.equal(operations.assets.shot.status, "running", "the attempt is recorded before the provider is called");
  assert.ok(operations.assets.shot.startedAt);

  const second = recorder();
  await assert.rejects(() => runVideos([videoId], second.provider), /never completed.*may already have been charged/s);
  assert.equal(second.calls.length, 0, "a possibly-billed request must not be repeated without being asked");

  const forced = recorder();
  await runVideos([videoId, "--force"], forced.provider);
  assert.equal(forced.calls.length, 1);
  assert.equal(readJson(resolve(publicDir, "video/generated/operations.json")).assets.shot.status, "completed");
});

const narration = (captions: Array<{id: string; text: string}>) => {
  const created = project({voice: {model: "gemini-tts", voiceName: "Kore", direction: "Calm narration."}});
  writeFileSync(resolve(created.sourceDir, "SCENE_INDEX.json"), JSON.stringify({captions}));
  return created;
};

test("narration resumes at a named caption instead of buying the whole track again", async () => {
  const {videoId, publicDir} = narration([
    {id: "opening", text: "Alexandria held many scrolls."},
    {id: "middle", text: "Its readers came from everywhere."},
    {id: "closing", text: "Its decline was gradual."},
  ]);
  let spoken = 0;
  const interrupted = recorder({async speech(request) { if (++spoken === 2) throw new Error("the request timed out"); return {bytes: Buffer.alloc(24000 * 3 * 2), mediaType: "audio/wav"}; }});
  await assert.rejects(() => runVoiceover([videoId], interrupted.provider), /the request timed out/);

  process.env.TTS_START_AT = "middle";
  try {
    const resumed = recorder();
    await runVoiceover([videoId], resumed.provider);
    assert.deepEqual(resumed.calls.map((call) => call.text.split("\n").pop()), ["Its readers came from everywhere.", "Its decline was gradual."], "only the unwritten segments are generated");
    const manifest = readJson(resolve(publicDir, "audio/voiceover/manifest.json"));
    assert.deepEqual(Object.keys(manifest.segments), ["opening", "middle", "closing"], "the manifest still covers the whole track");
    assert.equal(manifest.segments.opening.durationSeconds, 3, "a reused segment is timed from the file on disk");
    assert.equal(manifest.segments.middle.durationSeconds, 1.5);
  } finally {
    delete process.env.TTS_START_AT;
  }
});

test("resuming narration refuses to guess at a missing segment", async () => {
  const {videoId} = narration([{id: "opening", text: "One."}, {id: "closing", text: "Two."}]);
  process.env.TTS_START_AT = "closing";
  try {
    const unknown = recorder();
    process.env.TTS_START_AT = "ghost";
    await assert.rejects(() => runVoiceover([videoId], unknown.provider), /TTS_START_AT=ghost is not a caption/);

    process.env.TTS_START_AT = "closing";
    await assert.rejects(() => runVoiceover([videoId], unknown.provider), /expects the earlier segments to exist, but opening/);
    assert.equal(unknown.calls.length, 0);
  } finally {
    delete process.env.TTS_START_AT;
  }
});

const costPlan = (assets: unknown[], extra: Record<string, unknown> = {}) => ({version: 1, currency: "USD", assets, ...extra});

test("a paid run is priced from the project's declared cost plan", async () => {
  const {videoId, sourceDir} = project({
    imageGeneration: {model: "gemini-image", assets: [imageAsset()]},
    voice: {model: "gemini-tts", voiceName: "Kore"},
  });
  writeFileSync(resolve(sourceDir, "GENERATION_PLAN.json"), JSON.stringify(costPlan([
    {id: "opening", kind: "image", units: 2, costPerUnit: 0.04, latencySeconds: [8, 30], sceneIds: ["opening"]},
    {id: "narration", kind: "voice", unit: "seconds", units: 26.2, costPerUnit: 0.0004, latencySeconds: [10, 60]},
  ])));
  const estimate = estimateGeneration(videoId);

  assert.equal(estimate.totalEstimatedCost, 0.09048, "0.08 of image plus 0.01048 of speech, without a floating-point tail");
  assert.deepEqual(estimate.assets.map((asset) => asset.estimatedCost), [0.08, 0.01048]);
  assert.deepEqual(estimate.sequentialLatencySeconds, {min: 18, max: 90}, "generation runs one asset at a time, so the waits add up");
  assert.deepEqual(estimate.uncosted, []);
  assert.deepEqual(readJson(resolve(sourceDir, "GENERATION_ESTIMATE.json")).totalEstimatedCost, 0.09048);

  // The report is a pure function of the plan, so it can be recomputed at will.
  assert.equal(estimateGeneration(videoId).planHash, estimate.planHash);
});

test("configured spending that carries no declared cost is reported", () => {
  const {videoId, sourceDir} = project({
    imageGeneration: {model: "gemini-image", assets: [imageAsset(), imageAsset({id: "closing", output: "images/generated/closing.png"})]},
    voice: {model: "gemini-tts", voiceName: "Kore"},
    music: {model: "lyria-002", prompt: "A slow string bed."},
  });
  writeFileSync(resolve(sourceDir, "GENERATION_PLAN.json"), JSON.stringify(costPlan([
    {id: "opening", kind: "image", units: 1, costPerUnit: 0.04, latencySeconds: [8, 30]},
    {id: "narration", kind: "voice", units: 10, costPerUnit: 0.0004, latencySeconds: [10, 60]},
  ])));
  assert.deepEqual(estimateGeneration(videoId).uncosted, ["closing", "music"], "an unbudgeted image and an unbudgeted music bed");
});

test("an unusable cost plan is rejected rather than under-reported", () => {
  const reject = (assets: unknown[], pattern: RegExp) => {
    const {videoId, sourceDir} = project({});
    writeFileSync(resolve(sourceDir, "GENERATION_PLAN.json"), JSON.stringify(costPlan(assets)));
    assert.throws(() => estimateGeneration(videoId), pattern);
  };
  const asset = (values: Record<string, unknown> = {}) => ({id: "opening", kind: "image", units: 1, costPerUnit: 0.04, latencySeconds: [8, 30], ...values});
  reject([asset({id: "Not Kebab"})], /needs a kebab-case id/);
  reject([asset(), asset()], /Duplicate cost plan asset: opening/);
  reject([asset({kind: "hologram"})], /kind must be one of/);
  reject([asset({units: 0})], /needs positive units/);
  reject([asset({costPerUnit: -1})], /costPerUnit of zero or more/);
  reject([asset({latencySeconds: [30, 8]})], /needs latencySeconds as \[min, max\]/);

  const missing = project({});
  assert.throws(() => estimateGeneration(missing.videoId), /GENERATION_PLAN\.json not found/);
});
