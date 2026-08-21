import {spawnSync} from "node:child_process";
import {createHash} from "node:crypto";
import {existsSync, mkdirSync, readFileSync, renameSync, writeFileSync} from "node:fs";
import {dirname, extname, relative, resolve, sep} from "node:path";

import {assertOutputsAvailable, loadVideoContext} from "./video-context.mjs";
import {assertTargetsUnlocked} from "./approval-lock-lib.mjs";
import {parseGenerationArgs} from "./generation-args.mjs";
import {buildVisualContext} from "./visual-context.mjs";
import {assertGenerationApproved} from "./generation-approval.mjs";

const API_BASE = "https://generativelanguage.googleapis.com/v1beta";
const {videoId, force, assetIds} = parseGenerationArgs(process.argv.slice(2));
const context = loadVideoContext(videoId);
const generation = context.config.videoGeneration;
if (!generation || !Array.isArray(generation.assets) || generation.assets.length === 0) {
  throw new Error(`${videoId} has no videoGeneration assets.`);
}
const model = process.env.GEMINI_VIDEO_MODEL ?? generation.model;
if (!model) throw new Error("videoGeneration.model is required.");

/** @param {string} url @param {RequestInit} [options] */
const request = async (url, options = {}) => {
  const response = await fetch(url, {
    ...options,
    headers: {"content-type": "application/json", "x-goog-api-key": apiKey, ...options.headers},
  });
  if (!response.ok) throw new Error(`Gemini video request failed (${response.status}): ${await response.text()}`);
  return response;
};

const hash = (/** @type {string | Buffer} */ value) =>
  createHash("sha256").update(value).digest("hex");

/** @param {string} path */
const imageMimeType = (path) => {
  const mimeTypes = {".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp"};
  const mimeType = mimeTypes[/** @type {keyof typeof mimeTypes} */ (extname(path).toLowerCase())];
  if (!mimeType) throw new Error(`Unsupported reference image type: ${path}`);
  return mimeType;
};

/** @param {unknown} path @param {string} label */
const loadFrame = (path, label) => {
  if (path === undefined) return undefined;
  const resolvedPath = context.resolveConfiguredPath(path, label);
  if (!existsSync(resolvedPath)) throw new Error(`${label} not found: ${resolvedPath}`);
  const bytes = readFileSync(resolvedPath);
  return {
    request: {inlineData: {mimeType: imageMimeType(resolvedPath), data: bytes.toString("base64")}},
    path: relative(process.cwd(), resolvedPath),
    sha256: hash(bytes),
  };
};

/** @param {number} milliseconds */
const sleep = (milliseconds) => new Promise((resolveSleep) => setTimeout(resolveSleep, milliseconds));
const outputs = generation.assets.map((asset) => {
  const output = resolve(context.publicDir, asset.output);
  const relativeOutput = relative(context.publicDir, output);
  if (relativeOutput === ".." || relativeOutput.startsWith(`..${sep}`) || !output.endsWith(".mp4")) {
    throw new Error(`Generated video "${asset.id}" needs an MP4 path inside publicDir.`);
  }
  return output;
});
const manifestFile = resolve(context.publicDir, "video/generated/manifest.json");
const operationsFile = resolve(context.publicDir, "video/generated/operations.json");
const configuredIds = generation.assets.map((asset) => asset.id);
if (new Set(configuredIds).size !== configuredIds.length) throw new Error("Generated video asset IDs must be unique.");
if (generation.assets.some((asset) => !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(asset.id) || !asset.prompt)) {
  throw new Error("Each generated video needs a kebab-case id and prompt.");
}
const missingIds = assetIds.filter((id) => !configuredIds.includes(id));
if (missingIds.length > 0) throw new Error(`Unknown generated video assets: ${missingIds.join(", ")}`);
const selectedIndexes = assetIds.length > 0
  ? generation.assets.map((asset, index) => assetIds.includes(asset.id) ? index : -1).filter((index) => index >= 0)
  : generation.assets.map((_, index) => index);
const selectedOutputs = selectedIndexes.map((index) => outputs[index]);
const approvedAssets = assertGenerationApproved(context, "video", selectedIndexes.map((index) => generation.assets[index].id));
assertTargetsUnlocked(context, [...selectedOutputs, manifestFile]);
if (assetIds.length === 0) assertOutputsAvailable([manifestFile], {force, action: `Video generation for ${videoId}`});

/** @type {{videoId: string, model: string, assets: Record<string, any>}} */
const operations = existsSync(operationsFile)
  ? JSON.parse(readFileSync(operationsFile, "utf8"))
  : {videoId, model, assets: {}};
if (operations.videoId !== videoId) throw new Error(`Operation state belongs to ${operations.videoId}.`);
if (!operations.assets || typeof operations.assets !== "object") operations.assets = {};

const saveOperations = () => {
  mkdirSync(dirname(operationsFile), {recursive: true});
  const temporary = `${operationsFile}.tmp`;
  writeFileSync(temporary, `${JSON.stringify(operations, null, 2)}\n`);
  renameSync(temporary, operationsFile);
};

/** @type {{videoId: string, model: string, generatedAt: string, assets: Array<Record<string, unknown>>}} */
const manifest = assetIds.length > 0 && existsSync(manifestFile)
  ? JSON.parse(readFileSync(manifestFile, "utf8"))
  : {videoId, model, generatedAt: new Date().toISOString(), assets: []};
manifest.model = model;
manifest.generatedAt = new Date().toISOString();
const recordManifest = (/** @type {Record<string, any>} */ record) => {
  manifest.assets = manifest.assets.filter((/** @type {Record<string, any>} */ item) => item.id !== record.id);
  manifest.assets.push(record);
};
const seenAssetIds = new Set();
const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) throw new Error("GEMINI_API_KEY is required for video generation.");
for (const index of selectedIndexes) {
  const asset = generation.assets[index];
  if (seenAssetIds.has(asset.id)) throw new Error(`Duplicate generated video id: ${asset.id}`);
  seenAssetIds.add(asset.id);
  const prompt = [generation.direction, buildVisualContext(context, asset.characters), asset.prompt].filter(Boolean).join("\n\n");
  const firstFrame = loadFrame(asset.firstFrame, `videoGeneration.assets.${asset.id}.firstFrame`);
  const lastFrame = loadFrame(asset.lastFrame, `videoGeneration.assets.${asset.id}.lastFrame`);
  if (lastFrame && !firstFrame) throw new Error(`${asset.id} needs firstFrame when lastFrame is set.`);
  const instances = [{
    prompt,
    ...(firstFrame ? {image: firstFrame.request} : {}),
    ...(lastFrame ? {lastFrame: lastFrame.request} : {}),
  }];
  const parameters = {
    ...(asset.aspectRatio ? {aspectRatio: asset.aspectRatio} : {}),
    ...(asset.resolution ? {resolution: asset.resolution} : {}),
    ...(asset.durationSeconds ? {durationSeconds: String(asset.durationSeconds)} : {}),
    numberOfVideos: 1,
  };
  const fingerprint = hash(JSON.stringify({model, instances, parameters}));
  const prior = operations.assets[asset.id];
  const output = outputs[index];

  if (existsSync(output) && prior?.status === "completed" && prior.fingerprint === fingerprint && !force) {
    recordManifest(prior.manifestAsset);
    console.log(`Reused completed ${asset.id}`);
    continue;
  }
  if (existsSync(output) && !force) {
    throw new Error(`Video generation for ${asset.id} would overwrite ${output}. Pass --force to replace it.`);
  }
  if (prior?.operation && prior.fingerprint !== fingerprint && prior.status === "running") {
    throw new Error(`${asset.id} has an unfinished operation for different inputs: ${prior.operation}`);
  }
  if (prior?.fingerprint === fingerprint && prior.status === "failed" && !force) {
    throw new Error(`${asset.id} previously failed. Inspect operations.json, then pass --force to retry.`);
  }

  let operationName = prior?.fingerprint === fingerprint && prior.status !== "failed" ? prior.operation : undefined;
  if (!operationName) {
    const started = /** @type {any} */ (await request(`${API_BASE}/models/${model}:predictLongRunning`, {
      method: "POST",
      body: JSON.stringify({instances, parameters}),
    }).then((response) => response.json()));
    if (!started.name) throw new Error(`Video generation did not return an operation for ${asset.id}.`);
    operationName = started.name;
    operations.model = model;
    operations.assets[asset.id] = {
      operation: operationName,
      fingerprint,
      status: "running",
      startedAt: new Date().toISOString(),
    };
    saveOperations();
  } else {
    console.log(`Resuming ${asset.id}: ${operationName}`);
  }

  /** @type {any} */
  let operation;
  const deadline = Date.now() + (generation.timeoutMinutes ?? 20) * 60_000;
  do {
    if (Date.now() >= deadline) throw new Error(`Video generation timed out for ${asset.id}: ${operationName}`);
    await sleep(generation.pollSeconds ? generation.pollSeconds * 1000 : 10_000);
    operation = await request(`${API_BASE}/${operationName}`).then((response) => response.json());
    if (operation.error) {
      operations.assets[asset.id].status = "failed";
      operations.assets[asset.id].error = operation.error;
      saveOperations();
      throw new Error(`Video generation failed for ${asset.id}: ${JSON.stringify(operation.error)}`);
    }
  } while (!operation.done);

  const uri = operation.response?.generateVideoResponse?.generatedSamples?.[0]?.video?.uri;
  if (!uri) throw new Error(`Video generation returned no download URI for ${asset.id}.`);
  const downloaded = /** @type {ArrayBuffer} */ (
    await request(uri, {headers: {accept: "video/mp4"}}).then((response) => response.arrayBuffer())
  );
  const bytes = Buffer.from(new Uint8Array(downloaded));
  mkdirSync(dirname(output), {recursive: true});
  writeFileSync(output, bytes);

  const probe = spawnSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "json", output], {encoding: "utf8"});
  if (probe.status !== 0) throw new Error(`Generated video is invalid: ${output}`);
  const manifestAsset = {
    id: asset.id,
    output: relative(context.publicDir, output),
    operation: operationName,
    duration: Number(JSON.parse(probe.stdout).format?.duration),
    promptHash: hash(prompt),
    parameters,
    estimatedCost: approvedAssets.get(asset.id)?.units * approvedAssets.get(asset.id)?.costPerUnit,
    sha256: hash(bytes),
    ...(firstFrame ? {firstFrame: {path: firstFrame.path, sha256: firstFrame.sha256}} : {}),
    ...(lastFrame ? {lastFrame: {path: lastFrame.path, sha256: lastFrame.sha256}} : {}),
  };
  recordManifest(manifestAsset);
  operations.assets[asset.id] = {
    ...operations.assets[asset.id],
    status: "completed",
    completedAt: new Date().toISOString(),
    manifestAsset,
  };
  saveOperations();
  console.log(`Generated ${asset.id}`);
}
const order = new Map(generation.assets.map((asset, index) => [asset.id, index]));
manifest.assets.sort((/** @type {Record<string, any>} */ left, /** @type {Record<string, any>} */ right) => (order.get(left.id) ?? Infinity) - (order.get(right.id) ?? Infinity));
mkdirSync(dirname(manifestFile), {recursive: true});
writeFileSync(manifestFile, `${JSON.stringify(manifest, null, 2)}\n`);
