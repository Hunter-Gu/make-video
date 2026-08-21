import {spawnSync} from "node:child_process";
import {createHash} from "node:crypto";
import {mkdirSync, writeFileSync} from "node:fs";
import {dirname, relative, resolve, sep} from "node:path";

import {assertOutputsAvailable, loadVideoContext, parseTargetArgs} from "./video-context.mjs";

const API_BASE = "https://generativelanguage.googleapis.com/v1beta";
const {videoId, force} = parseTargetArgs(process.argv.slice(2));
const context = loadVideoContext(videoId);
const generation = context.config.videoGeneration;
if (!generation || !Array.isArray(generation.assets) || generation.assets.length === 0) {
  throw new Error(`${videoId} has no videoGeneration assets.`);
}
const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) throw new Error("GEMINI_API_KEY is required for video generation.");
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
assertOutputsAvailable([...outputs, manifestFile], {force, action: `Video generation for ${videoId}`});

/** @type {{videoId: string, model: string, generatedAt: string, assets: Array<Record<string, unknown>>}} */
const manifest = {videoId, model, generatedAt: new Date().toISOString(), assets: []};
for (let index = 0; index < generation.assets.length; index += 1) {
  const asset = generation.assets[index];
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(asset.id) || !asset.prompt) {
    throw new Error("Each generated video needs a kebab-case id and prompt.");
  }
  const prompt = [generation.direction, asset.prompt].filter(Boolean).join("\n\n");
  const started = /** @type {any} */ (await request(`${API_BASE}/models/${model}:predictLongRunning`, {
    method: "POST",
    body: JSON.stringify({
      instances: [{prompt}],
      parameters: {
        ...(asset.aspectRatio ? {aspectRatio: asset.aspectRatio} : {}),
        ...(asset.resolution ? {resolution: asset.resolution} : {}),
        numberOfVideos: 1,
      },
    }),
  }).then((response) => response.json()));
  if (!started.name) throw new Error(`Video generation did not return an operation for ${asset.id}.`);

  /** @type {any} */
  let operation;
  const deadline = Date.now() + (generation.timeoutMinutes ?? 20) * 60_000;
  do {
    if (Date.now() >= deadline) throw new Error(`Video generation timed out for ${asset.id}: ${started.name}`);
    await sleep(generation.pollSeconds ? generation.pollSeconds * 1000 : 10_000);
    operation = await request(`${API_BASE}/${started.name}`).then((response) => response.json());
    if (operation.error) throw new Error(`Video generation failed for ${asset.id}: ${JSON.stringify(operation.error)}`);
  } while (!operation.done);

  const uri = operation.response?.generateVideoResponse?.generatedSamples?.[0]?.video?.uri;
  if (!uri) throw new Error(`Video generation returned no download URI for ${asset.id}.`);
  const downloaded = /** @type {ArrayBuffer} */ (
    await request(uri, {headers: {accept: "video/mp4"}}).then((response) => response.arrayBuffer())
  );
  const bytes = Buffer.from(new Uint8Array(downloaded));
  const output = outputs[index];
  mkdirSync(dirname(output), {recursive: true});
  writeFileSync(output, bytes);

  const probe = spawnSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "json", output], {encoding: "utf8"});
  if (probe.status !== 0) throw new Error(`Generated video is invalid: ${output}`);
  manifest.assets.push({
    id: asset.id,
    output: relative(context.publicDir, output),
    operation: started.name,
    duration: Number(JSON.parse(probe.stdout).format?.duration),
    promptHash: createHash("sha256").update(prompt).digest("hex"),
    sha256: createHash("sha256").update(bytes).digest("hex"),
  });
  console.log(`Generated ${asset.id}`);
}
mkdirSync(dirname(manifestFile), {recursive: true});
writeFileSync(manifestFile, `${JSON.stringify(manifest, null, 2)}\n`);
