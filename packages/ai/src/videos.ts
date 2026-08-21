import {existsSync, mkdirSync, readFileSync, writeFileSync} from "node:fs";
import {dirname, extname, relative, resolve, sep} from "node:path";
import {spawnSync} from "node:child_process";

import {experimental_generateVideo} from "ai";

import {google, hash, mediaTypeFor, readJson, writeJson} from "./provider";
import {assertOutputsAvailable, buildVisualContext, loadVideoContext, parseGenerationArgs} from "./project";
import type {AnyRecord} from "./types";

const frameInput = (context: AnyRecord, configuredPath: unknown, label: string, frameType: "first_frame" | "last_frame") => {
  if (configuredPath === undefined) return undefined;
  const path = context.resolveConfiguredPath(configuredPath, label);
  if (!existsSync(path)) throw new Error(`${label} not found: ${path}`);
  return {image: {data: readFileSync(path), mediaType: mediaTypeFor(path)}, frameType};
};

export const runVideos = async (args: string[]) => {
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
  const selected = assetIds.length > 0
    ? generation.assets.map((asset: AnyRecord, index: number) => assetIds.includes(asset.id) ? index : -1).filter((index: number) => index >= 0)
    : generation.assets.map((_: AnyRecord, index: number) => index);
  const missing = assetIds.filter((id) => !generation.assets.some((asset: AnyRecord) => asset.id === id));
  if (missing.length > 0) throw new Error(`Unknown generated video assets: ${missing.join(", ")}`);
  const manifestFile = resolve(context.publicDir, "video/generated/manifest.json");
  const operationsFile = resolve(context.publicDir, "video/generated/operations.json");
  const selectedOutputs = selected.map((index: number) => outputs[index]);
  if (assetIds.length === 0) assertOutputsAvailable([manifestFile], {force, action: `Video generation for ${videoId}`});
  const manifest = assetIds.length > 0 && existsSync(manifestFile)
    ? readJson(manifestFile)
    : {videoId, model, generatedAt: new Date().toISOString(), assets: []};
  const operations = existsSync(operationsFile) ? readJson(operationsFile) : {videoId, model, assets: {}};
  manifest.model = model;
  manifest.generatedAt = new Date().toISOString();
  for (const index of selected) {
    const asset = generation.assets[index] as AnyRecord;
    const output = outputs[index];
    const prompt = [generation.direction, buildVisualContext(context, asset.characters), asset.prompt].filter(Boolean).join("\n\n");
    const frames = [
      frameInput(context, asset.firstFrame, `videoGeneration.assets.${asset.id}.firstFrame`, "first_frame"),
      frameInput(context, asset.lastFrame, `videoGeneration.assets.${asset.id}.lastFrame`, "last_frame"),
    ].filter(Boolean);
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
    const result = await experimental_generateVideo({
      model: google().video(model),
      prompt,
      frameImages: frames as any,
      aspectRatio: asset.aspectRatio,
      resolution: asset.resolution,
      duration: asset.durationSeconds,
      generateAudio: false,
      poll: {intervalMs: (generation.pollSeconds ?? 10) * 1000, timeoutMs: (generation.timeoutMinutes ?? 20) * 60_000},
    } as any);
    const bytes = Buffer.from(result.video.uint8Array);
    mkdirSync(dirname(output), {recursive: true});
    writeFileSync(output, bytes);
    const probe = spawnSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "json", output], {encoding: "utf8"});
    if (probe.status !== 0) throw new Error(`Generated video is invalid: ${output}`);
    const manifestAsset = {id: asset.id, output: relative(context.publicDir, output), duration: Number(JSON.parse(probe.stdout).format?.duration), promptHash: hash(prompt), sha256: hash(bytes)};
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
