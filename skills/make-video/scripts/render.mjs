import {mkdirSync} from "node:fs";
import {dirname, resolve} from "node:path";
import {spawnSync} from "node:child_process";

import {
  assertOutputsAvailable,
  loadVideoContext,
  parseTargetArgs,
  projectRoot,
  scriptsDir,
} from "./video-context.mjs";

const action = process.argv[2];
const actions = new Set(["studio", "still", "preview", "final"]);
if (!action || !actions.has(action)) throw new Error(`Usage: render.mjs <studio|still|preview|final> <video-id> [--force]`);

const {videoId, force} = parseTargetArgs(process.argv.slice(3));
const context = loadVideoContext(videoId);
const {composition, outputs, production} = context;

/** @param {string} command @param {string[]} args */
const run = (command, args) => {
  const result = spawnSync(command, args, {cwd: projectRoot, env: process.env, stdio: "inherit"});
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
};

run(process.execPath, [resolve(scriptsDir, "link-assets.mjs"), videoId]);
const remotion = resolve(scriptsDir, "run-remotion.mjs");

if (action === "studio") {
  run(process.execPath, [remotion, "studio", "src/index.ts", "--no-open"]);
  process.exit(0);
}

if (action === "still") {
  assertOutputsAvailable([outputs.still], {force, action: `Cover image for ${videoId}`});
  mkdirSync(dirname(outputs.still), {recursive: true});
  run(process.execPath, [remotion, "still", "src/index.ts", composition.id, outputs.still, `--frame=${production.stillFrame ?? 0}`, `--props=${JSON.stringify(production.stillProps ?? production.silentProps ?? {})}`]);
  process.exit(0);
}

if (action === "preview") {
  assertOutputsAvailable([outputs.silent], {force, action: `Preview video for ${videoId}`});
  mkdirSync(dirname(outputs.silent), {recursive: true});
  run(process.execPath, [remotion, "render", "src/index.ts", composition.id, outputs.silent, "--concurrency=1", `--props=${JSON.stringify(production.silentProps ?? {})}`]);
  console.log(`Preview video: ${outputs.silent}`);
  process.exit(0);
}

const mastering = production.mastering ?? null;
const renderOutput = mastering ? outputs.unmastered : outputs.final;
const protectedOutputs = mastering ? [outputs.unmastered, outputs.final] : [outputs.final];
assertOutputsAvailable(protectedOutputs, {force, action: `Final video for ${videoId}`});
mkdirSync(dirname(renderOutput), {recursive: true});
mkdirSync(dirname(outputs.final), {recursive: true});
run(process.execPath, [remotion, "render", "src/index.ts", composition.id, renderOutput, "--concurrency=1", `--props=${JSON.stringify(production.finalProps ?? {})}`]);

if (mastering) {
  run("ffmpeg", [
    "-hide_banner", "-loglevel", "error", force ? "-y" : "-n", "-i", outputs.unmastered,
    "-map", "0:v:0", "-map", "0:a:0", "-c:v", "copy",
    "-af", `loudnorm=I=${mastering.integratedLoudness ?? -16}:TP=${mastering.truePeak ?? -1.5}:LRA=${mastering.loudnessRange ?? 7}`,
    "-c:a", "aac", "-b:a", mastering.audioBitrate ?? "192k", "-ar", String(mastering.audioSampleRate ?? 48000),
    "-movflags", "+faststart", outputs.final,
  ]);
}

console.log(`Final video: ${outputs.final}`);
