import {log} from "@make-video/project";
import {existsSync, mkdirSync, readFileSync, writeFileSync} from "node:fs";
import {dirname, extname, relative, resolve, sep} from "node:path";
import {spawnSync} from "node:child_process";

import {hash, mediaTypeFor, readJson, writeJson} from "./provider";
import {googleMediaProvider, type MediaProvider, type VideoFrame} from "./media-provider";
import {assertOutputsAvailable, buildVisualContext, loadVideoContext, parseGenerationArgs} from "./project";
import type {AnyRecord} from "./types";

const frameInput = (context: AnyRecord, configuredPath: unknown, label: string, frameType: VideoFrame["frameType"]): VideoFrame | undefined => {
  if (configuredPath === undefined) return undefined;
  const path = context.resolveConfiguredPath(configuredPath, label);
  if (!existsSync(path)) throw new Error(`${label} not found: ${path}`);
  return {data: readFileSync(path), mediaType: mediaTypeFor(path), frameType};
};

/** Note a failed request on the operation record before letting the error through. */
const requestClip = async (provider: MediaProvider, request: Parameters<MediaProvider["video"]>[0], onFailure: () => void) => {
  try {
    return await provider.video(request);
  } catch (error) {
    onFailure();
    throw error;
  }
};

export const runVideos = async (args: string[], provider: MediaProvider = googleMediaProvider) => {
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
  if (!operations.assets || typeof operations.assets !== "object") operations.assets = {};
  mkdirSync(dirname(operationsFile), {recursive: true});
  manifest.model = model;
  manifest.generatedAt = new Date().toISOString();
  for (const index of selected) {
    const asset = generation.assets[index] as AnyRecord;
    const output = outputs[index];
    const prompt = [generation.direction, buildVisualContext(context, asset.characters), asset.prompt].filter(Boolean).join("\n\n");
    const frames = [
      frameInput(context, asset.firstFrame, `videoGeneration.assets.${asset.id}.firstFrame`, "first_frame"),
      frameInput(context, asset.lastFrame, `videoGeneration.assets.${asset.id}.lastFrame`, "last_frame"),
    ].filter((frame): frame is VideoFrame => frame !== undefined);
    if (frames.some((frame) => frame.frameType === "last_frame") && !frames.some((frame) => frame.frameType === "first_frame")) throw new Error(`${asset.id} needs firstFrame when lastFrame is set.`);
    const fingerprint = hash(JSON.stringify({model, prompt, frames: frames.map((frame) => frame.frameType), asset}));
    const prior = operations.assets?.[asset.id];
    if (existsSync(output) && prior?.status === "completed" && prior.fingerprint === fingerprint && !force) {
      manifest.assets = manifest.assets.filter((item: AnyRecord) => item.id !== asset.id);
      manifest.assets.push(prior.manifestAsset);
      log(`Reused completed ${asset.id}`);
      continue;
    }
    // A clip takes minutes and costs dollars. If a previous attempt for this exact
    // request never finished, the provider may already have billed it, so say so
    // rather than quietly spending again.
    if (prior && prior.status !== "completed" && prior.fingerprint === fingerprint && !force) {
      throw new Error(`Video generation for "${asset.id}" started at ${prior.startedAt} and never completed${prior.error ? `: ${prior.error}` : "."} The provider may already have been charged for it. Pass --force to request it again.`);
    }
    if (existsSync(output) && !force) throw new Error(`Video generation for ${asset.id} would overwrite ${output}. Pass --force to replace it.`);
    // Record the attempt before spending, so an interrupted run leaves a trace.
    operations.assets[asset.id] = {status: "running", fingerprint, model, startedAt: new Date().toISOString()};
    writeJson(operationsFile, operations);
    const {bytes} = await requestClip(provider, {
      model,
      prompt,
      frames,
      aspectRatio: asset.aspectRatio,
      resolution: asset.resolution,
      durationSeconds: asset.durationSeconds,
      pollIntervalMs: (generation.pollSeconds ?? 10) * 1000,
      pollTimeoutMs: (generation.timeoutMinutes ?? 20) * 60_000,
    }, () => {
      operations.assets[asset.id].error = "the request failed or timed out";
      writeJson(operationsFile, operations);
    });
    mkdirSync(dirname(output), {recursive: true});
    writeFileSync(output, bytes);
    const probe = spawnSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "json", output], {encoding: "utf8"});
    if (probe.status !== 0) throw new Error(`Generated video is invalid: ${output}`);
    const manifestAsset = {id: asset.id, output: relative(context.publicDir, output), duration: Number(JSON.parse(probe.stdout).format?.duration), promptHash: hash(prompt), sha256: hash(bytes)};
    manifest.assets = manifest.assets.filter((item: AnyRecord) => item.id !== asset.id);
    manifest.assets.push(manifestAsset);
    operations.assets[asset.id] = {status: "completed", fingerprint, completedAt: new Date().toISOString(), manifestAsset};
    log(`Generated ${asset.id}`);
  }
  const order = new Map(generation.assets.map((asset: AnyRecord, index: number) => [asset.id, index]));
  manifest.assets.sort((left: AnyRecord, right: AnyRecord) => (order.get(left.id) ?? Infinity) - (order.get(right.id) ?? Infinity));
  mkdirSync(dirname(manifestFile), {recursive: true});
  writeJson(manifestFile, manifest);
  writeJson(operationsFile, operations);
  log(`Generated videos for ${videoId}.`);
};
