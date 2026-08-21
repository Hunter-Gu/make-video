import {createHash} from "node:crypto";
import {existsSync, mkdirSync, readFileSync, renameSync, writeFileSync} from "node:fs";
import {dirname, extname, relative, resolve, sep} from "node:path";
import {spawnSync} from "node:child_process";

import {createGoogleGenerativeAI} from "@ai-sdk/google";
import {experimental_generateVideo, generateImage, generateSpeech, generateText} from "ai";

import {assertTargetsUnlocked} from "../../../skills/make-video/scripts/approval-lock-lib.mjs";
import {assertGenerationApproved} from "../../../skills/make-video/scripts/generation-approval.mjs";
import {parseGenerationArgs} from "../../../skills/make-video/scripts/generation-args.mjs";
import {loadVideoContext, parseTargetArgs} from "../../../skills/make-video/scripts/video-context.mjs";
import {buildVisualContext} from "../../../skills/make-video/scripts/visual-context.mjs";

type AnyRecord = Record<string, any>;

const projectRoot = process.cwd();
const key = () => {
  const value = process.env.GEMINI_API_KEY;
  if (!value) throw new Error("GEMINI_API_KEY is required for model generation.");
  return value;
};
const google = () => createGoogleGenerativeAI({apiKey: key()});
const hash = (value: string | Uint8Array) => createHash("sha256").update(value).digest("hex");
const readJson = (file: string, fallback: any = null): any => existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : fallback;
const writeJson = (file: string, value: any) => {
  const temporary = `${file}.tmp`;
  writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`);
  renameSync(temporary, file);
};
const estimate = (approved: Map<string, AnyRecord>, id: string) => {
  const asset = approved.get(id);
  return asset ? asset.units * asset.costPerUnit : undefined;
};
const mediaTypeFor = (file: string) => ({
  ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp",
}[extname(file).toLowerCase()] ?? "application/octet-stream");

const runImages = async (args: string[]) => {
  const {videoId, force, assetIds} = parseGenerationArgs(args);
  const context = loadVideoContext(videoId);
  const config = context.config as AnyRecord;
  const imageGeneration = config.imageGeneration as AnyRecord | undefined;
  if (!imageGeneration || !Array.isArray(imageGeneration.assets) || imageGeneration.assets.length === 0) throw new Error(`${videoId} has no generated image assets.`);
  const model = process.env.GEMINI_IMAGE_MODEL ?? imageGeneration.model;
  if (typeof model !== "string" || model.length === 0) throw new Error("imageGeneration.model must be a non-empty string.");

  const seen = new Set<string>();
  const outputs = imageGeneration.assets.map((asset: AnyRecord, index: number) => {
    if (!asset || typeof asset !== "object" || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(asset.id) || seen.has(asset.id)) throw new Error(`Invalid or duplicate generated image id at index ${index}.`);
    if (typeof asset.prompt !== "string" || !asset.prompt.trim()) throw new Error(`Generated image "${asset.id}" needs a prompt.`);
    if (typeof asset.output !== "string" || !asset.output) throw new Error(`Generated image "${asset.id}" needs an output path.`);
    seen.add(asset.id);
    const output = resolve(context.publicDir, asset.output);
    const outputRelative = relative(context.publicDir, output);
    if (outputRelative === ".." || outputRelative.startsWith(`..${sep}`)) throw new Error(`Generated image "${asset.id}" must stay inside publicDir.`);
    if (![".png", ".jpg", ".jpeg", ".webp"].includes(extname(output).toLowerCase())) throw new Error(`Generated image "${asset.id}" needs a supported extension.`);
    return output;
  });
  const selected = assetIds.length > 0 ? imageGeneration.assets.map((asset: AnyRecord, index: number) => assetIds.includes(asset.id) ? index : -1).filter((index: number) => index >= 0) : imageGeneration.assets.map((_: AnyRecord, index: number) => index);
  const missing = assetIds.filter((id) => !seen.has(id));
  if (missing.length > 0) throw new Error(`Unknown generated image assets: ${missing.join(", ")}`);
  const manifestFile = resolve(context.publicDir, "images/generated/manifest.json");
  const approved = assertGenerationApproved(context, "image", selected.map((index: number) => imageGeneration.assets[index].id)) as Map<string, AnyRecord>;
  const selectedOutputs = selected.map((index: number) => outputs[index]);
  assertTargetsUnlocked(context, [...selectedOutputs, manifestFile]);
  if (assetIds.length === 0) (await import("../../../skills/make-video/scripts/video-context.mjs")).assertOutputsAvailable([...selectedOutputs, manifestFile], {force, action: `Image generation for ${videoId}`});

  const manifest = assetIds.length > 0 && existsSync(manifestFile) ? readJson(manifestFile) : {videoId, model, generatedAt: new Date().toISOString(), assets: []};
  manifest.model = model;
  manifest.generatedAt = new Date().toISOString();
  for (const index of selected) {
    const asset = imageGeneration.assets[index] as AnyRecord;
    const output = outputs[index];
    const prompt = [imageGeneration.direction, buildVisualContext(context, asset.characters), asset.prompt].filter(Boolean).join("\n\n");
    const result = await generateImage({model: google().image(model), prompt, aspectRatio: asset.aspectRatio as `${number}:${number}` | undefined});
    const bytes = Buffer.from(result.image.uint8Array);
    const mimeType = result.image.mediaType;
    if (mimeType !== mediaTypeFor(output)) throw new Error(`Generated image "${asset.id}" returned ${mimeType}, which does not match ${extname(output)}.`);
    mkdirSync(dirname(output), {recursive: true});
    writeFileSync(output, bytes);
    manifest.assets = manifest.assets.filter((item: AnyRecord) => item.id !== asset.id);
    manifest.assets.push({id: asset.id, output: relative(context.publicDir, output), mimeType, promptHash: hash(prompt), sha256: hash(bytes), estimatedCost: estimate(approved, asset.id)});
    console.log(`Generated ${asset.id}`);
  }
  const order = new Map(imageGeneration.assets.map((asset: AnyRecord, index: number) => [asset.id, index]));
  manifest.assets.sort((left: AnyRecord, right: AnyRecord) => (order.get(String(left.id)) ?? Infinity) - (order.get(String(right.id)) ?? Infinity));
  mkdirSync(dirname(manifestFile), {recursive: true});
  writeJson(manifestFile, manifest);
  console.log(`Generated images for ${videoId}.`);
};

const frameInput = (context: AnyRecord, configuredPath: unknown, label: string, frameType: "first_frame" | "last_frame") => {
  if (configuredPath === undefined) return undefined;
  const path = context.resolveConfiguredPath(configuredPath, label);
  if (!existsSync(path)) throw new Error(`${label} not found: ${path}`);
  return {image: {data: readFileSync(path), mediaType: mediaTypeFor(path)}, frameType};
};

const runVideos = async (args: string[]) => {
  const {videoId, force, assetIds} = parseGenerationArgs(args);
  const context = loadVideoContext(videoId);
  const generation = context.config.videoGeneration as AnyRecord | undefined;
  if (!generation || !Array.isArray(generation.assets) || generation.assets.length === 0) throw new Error(`${videoId} has no videoGeneration assets.`);
  const model = process.env.GEMINI_VIDEO_MODEL ?? generation.model;
  const outputs = generation.assets.map((asset: AnyRecord) => {
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(asset.id) || !asset.prompt) throw new Error("Each generated video needs a kebab-case id and prompt.");
    const output = resolve(context.publicDir, asset.output);
    const outputRelative = relative(context.publicDir, output);
    if (outputRelative === ".." || outputRelative.startsWith(`..${sep}`) || extname(output).toLowerCase() !== ".mp4") throw new Error(`Generated video "${asset.id}" needs an MP4 path inside publicDir.`);
    return output;
  });
  const selected = assetIds.length > 0 ? generation.assets.map((asset: AnyRecord, index: number) => assetIds.includes(asset.id) ? index : -1).filter((index: number) => index >= 0) : generation.assets.map((_: AnyRecord, index: number) => index);
  const missing = assetIds.filter((id) => !generation.assets.some((asset: AnyRecord) => asset.id === id));
  if (missing.length > 0) throw new Error(`Unknown generated video assets: ${missing.join(", ")}`);
  const manifestFile = resolve(context.publicDir, "video/generated/manifest.json");
  const operationsFile = resolve(context.publicDir, "video/generated/operations.json");
  const approved = assertGenerationApproved(context, "video", selected.map((index: number) => generation.assets[index].id)) as Map<string, AnyRecord>;
  const selectedOutputs = selected.map((index: number) => outputs[index]);
  assertTargetsUnlocked(context, [...selectedOutputs, manifestFile, operationsFile]);
  if (assetIds.length === 0) (await import("../../../skills/make-video/scripts/video-context.mjs")).assertOutputsAvailable([manifestFile], {force, action: `Video generation for ${videoId}`});
  const manifest = assetIds.length > 0 && existsSync(manifestFile) ? readJson(manifestFile) : {videoId, model, generatedAt: new Date().toISOString(), assets: []};
  const operations = existsSync(operationsFile) ? readJson(operationsFile) : {videoId, model, assets: {}};
  manifest.model = model;
  manifest.generatedAt = new Date().toISOString();
  for (const index of selected) {
    const asset = generation.assets[index] as AnyRecord;
    const output = outputs[index];
    const prompt = [generation.direction, buildVisualContext(context, asset.characters), asset.prompt].filter(Boolean).join("\n\n");
    const frames = [frameInput(context, asset.firstFrame, `videoGeneration.assets.${asset.id}.firstFrame`, "first_frame"), frameInput(context, asset.lastFrame, `videoGeneration.assets.${asset.id}.lastFrame`, "last_frame")].filter(Boolean);
    if (frames.some((frame: any) => frame.frameType === "last_frame") && !frames.some((frame: any) => frame.frameType === "first_frame")) throw new Error(`${asset.id} needs firstFrame when lastFrame is set.`);
    const fingerprint = hash(JSON.stringify({model, prompt, frames: frames.map((frame: any) => frame.frameType), asset}));
    const prior = operations.assets?.[asset.id];
    if (existsSync(output) && prior?.status === "completed" && prior.fingerprint === fingerprint && !force) {
      manifest.assets = manifest.assets.filter((item: AnyRecord) => item.id !== asset.id);
      manifest.assets.push(prior.manifestAsset);
      console.log(`Reused completed ${asset.id}`);
      continue;
    }
    if (existsSync(output) && !force) throw new Error(`Video generation for ${asset.id} would overwrite ${output}. Pass --force to replace it.`);
    const result = await experimental_generateVideo({model: google().video(model), prompt, frameImages: frames as any, aspectRatio: asset.aspectRatio, resolution: asset.resolution, duration: asset.durationSeconds, generateAudio: false, poll: {intervalMs: (generation.pollSeconds ?? 10) * 1000, timeoutMs: (generation.timeoutMinutes ?? 20) * 60_000}} as any);
    const bytes = Buffer.from(result.video.uint8Array);
    mkdirSync(dirname(output), {recursive: true});
    writeFileSync(output, bytes);
    const probe = spawnSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "json", output], {encoding: "utf8"});
    if (probe.status !== 0) throw new Error(`Generated video is invalid: ${output}`);
    const manifestAsset = {id: asset.id, output: relative(context.publicDir, output), duration: Number(JSON.parse(probe.stdout).format?.duration), promptHash: hash(prompt), sha256: hash(bytes), estimatedCost: estimate(approved, asset.id)};
    manifest.assets = manifest.assets.filter((item: AnyRecord) => item.id !== asset.id);
    manifest.assets.push(manifestAsset);
    operations.assets[asset.id] = {status: "completed", fingerprint, completedAt: new Date().toISOString(), manifestAsset};
    console.log(`Generated ${asset.id}`);
  }
  const order = new Map(generation.assets.map((asset: AnyRecord, index: number) => [asset.id, index]));
  manifest.assets.sort((left: AnyRecord, right: AnyRecord) => (order.get(left.id) ?? Infinity) - (order.get(right.id) ?? Infinity));
  mkdirSync(dirname(manifestFile), {recursive: true});
  writeJson(manifestFile, manifest);
  writeJson(operationsFile, operations);
  console.log(`Generated videos for ${videoId}.`);
};

const pcmFromAudio = (bytes: Uint8Array) => {
  const buffer = Buffer.from(bytes);
  return buffer.toString("ascii", 0, 4) === "RIFF" ? buffer.subarray(44) : buffer;
};
const writeWave = (file: string, pcm: Buffer, sampleRate = 24000, channels = 1) => {
  const header = Buffer.alloc(44);
  header.write("RIFF", 0); header.writeUInt32LE(36 + pcm.length, 4); header.write("WAVE", 8); header.write("fmt ", 12); header.writeUInt32LE(16, 16); header.writeUInt16LE(1, 20); header.writeUInt16LE(channels, 22); header.writeUInt32LE(sampleRate, 24); header.writeUInt32LE(sampleRate * channels * 2, 28); header.writeUInt16LE(channels * 2, 32); header.writeUInt16LE(16, 34); header.write("data", 36); header.writeUInt32LE(pcm.length, 40);
  writeFileSync(file, Buffer.concat([header, pcm]));
};

const runVoiceover = async (args: string[]) => {
  const {videoId, force} = parseTargetArgs(args);
  const context = loadVideoContext(videoId);
  const config = context.config as AnyRecord;
  const sceneIndex = resolve(context.sourceDir, "SCENE_INDEX.json");
  const indexedCaptions = existsSync(sceneIndex) ? readJson(sceneIndex).captions : null;
  const captions = Array.isArray(config.captions) ? config.captions : indexedCaptions;
  const voice = config.voice as AnyRecord | undefined;
  if (!Array.isArray(captions) || captions.length === 0 || !voice) throw new Error(`${videoId} has no voice configuration or caption segments.`);
  const outputDir = context.audioDirs.voiceover;
  const model = process.env.GEMINI_TTS_MODEL ?? voice.model;
  const voiceName = process.env.GEMINI_TTS_VOICE ?? voice.voiceName;
  const outputFiles = [...captions.map((segment: AnyRecord) => resolve(outputDir, `${segment.id}.wav`)), resolve(outputDir, "manifest.json")];
  assertTargetsUnlocked(context, outputFiles);
  (await import("../../../skills/make-video/scripts/video-context.mjs")).assertOutputsAvailable(outputFiles, {force, action: `Voice generation for ${videoId}`});
  const manifest: AnyRecord = {videoId, model, voiceName, segments: {}};
  mkdirSync(outputDir, {recursive: true});
  for (const segment of captions as AnyRecord[]) {
    const prompt = `${voice.direction ?? "Clear documentary narration."}\n\nTranscript:\n${segment.text}`;
    const result = await generateSpeech({model: google().speech(model), text: prompt, voice: voiceName, outputFormat: "wav"});
    const pcm = pcmFromAudio(result.audio.uint8Array);
    const output = resolve(outputDir, `${segment.id}.wav`);
    writeWave(output, pcm);
    manifest.segments[segment.id] = {hash: hash(prompt), durationSeconds: pcm.length / 2 / 24000};
    console.log(`Generated ${segment.id}: ${(pcm.length / 2 / 24000).toFixed(2)}s`);
  }
  writeJson(resolve(outputDir, "manifest.json"), manifest);
  console.log(`Generated the aligned voiceover timeline for ${videoId}.`);
};

const runMusic = async (args: string[]) => {
  const {videoId, force} = parseTargetArgs(args);
  const context = loadVideoContext(videoId);
  const music = (context.config as AnyRecord).music as AnyRecord | undefined;
  if (!music) throw new Error(`${videoId} has no music configuration.`);
  const output = resolve(context.audioDirs.music, "lyria-underscore.mp3");
  assertTargetsUnlocked(context, [output]);
  (await import("../../../skills/make-video/scripts/video-context.mjs")).assertOutputsAvailable([output], {force, action: `Music generation for ${videoId}`});
  const model = process.env.LYRIA_MODEL ?? music.model;
  // Lyria is exposed through Google's Interactions API in the AI SDK.
  const languageModel = model.startsWith("lyria-") ? google().interactions(model as any) : google().languageModel(model);
  const providerOptions = model.startsWith("lyria-")
    ? {google: {responseModalities: ["audio"], responseFormat: [{type: "audio", mimeType: "audio/mpeg"}]}}
    : {google: {responseModalities: ["AUDIO"]}};
  const result = await generateText({model: languageModel, prompt: music.prompt, providerOptions: providerOptions as any});
  const audio = result.files.find((file) => file.mediaType.startsWith("audio/"));
  if (!audio) throw new Error("AI SDK returned no audio for music generation.");
  mkdirSync(dirname(output), {recursive: true});
  writeFileSync(output, Buffer.from(audio.uint8Array));
  console.log(`Generated the music bed for ${videoId}.`);
};

const runVerifyVoiceover = async (args: string[]) => {
  const {videoId} = parseTargetArgs(args);
  const context = loadVideoContext(videoId);
  const audio = readFileSync(resolve(context.audioDirs.voiceover, "voiceover.wav"));
  const model = process.env.GEMINI_VERIFY_MODEL ?? "gemini-3.6-flash";
  const result = await generateText({model: google().languageModel(model), messages: [{role: "user", content: [{type: "file", data: audio, mediaType: "audio/wav"}, {type: "text", text: "Transcribe only the spoken English words in this audio, in order. Ignore silence. Do not summarize, explain, or add wording."}]}] as any});
  if (!result.text.trim()) throw new Error("AI SDK returned no transcription.");
  console.log(result.text.trim());
};

const [mode, ...args] = process.argv.slice(2);
if (mode === "images") await runImages(args);
else if (mode === "video") await runVideos(args);
else if (mode === "voiceover") await runVoiceover(args);
else if (mode === "music") await runMusic(args);
else if (mode === "verify-voiceover") await runVerifyVoiceover(args);
else throw new Error("Usage: ai.mjs <images|video|voiceover|music|verify-voiceover> <video-id> [options]");
