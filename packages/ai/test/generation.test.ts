import assert from "node:assert/strict";
import {spawnSync} from "node:child_process";
import {mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync} from "node:fs";
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
const {runImages} = await import("../src/images");
const {runVideos} = await import("../src/videos");
const {runMusic, runVoiceover} = await import("../src/audio");
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
    async music(request) { calls.push({kind: "music", ...request}); return {bytes: Buffer.from("mp3"), mediaType: "audio/mpeg"}; },
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

test("generated media is never overwritten without an explicit request", async () => {
  const {videoId} = project({imageGeneration: {model: "gemini-image", assets: [imageAsset()]}});
  const first = recorder();
  await runImages([videoId], first.provider);

  const second = recorder();
  await assert.rejects(() => runImages([videoId], second.provider), /already exists/);
  assert.equal(second.calls.length, 0, "a refused run must not call the provider");

  const forced = recorder();
  await runImages([videoId, "--force"], forced.provider);
  assert.equal(forced.calls.length, 1);
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
  assert.equal(readFileSync(resolve(root, "public", videoId, "audio/music/underscore.mp3")).toString(), "mp3");
  await assert.rejects(() => runMusic([videoId], recorder().provider), /already exists/);
});
