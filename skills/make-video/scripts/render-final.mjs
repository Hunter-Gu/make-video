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

const {videoId, force} = parseTargetArgs(process.argv.slice(2));
const context = loadVideoContext(videoId);
const {composition, outputs, production} = context;
const mastering = production.mastering ?? null;
const renderOutput = mastering ? outputs.unmastered : outputs.final;
const protectedOutputs = mastering
  ? [outputs.unmastered, outputs.final]
  : [outputs.final];

assertOutputsAvailable(protectedOutputs, {
  force,
  action: `Final render for ${videoId}`,
});

mkdirSync(dirname(renderOutput), {recursive: true});
mkdirSync(dirname(outputs.final), {recursive: true});

/**
 * @param {string} command
 * @param {string[]} args
 * @returns {void}
 */
const run = (command, args) => {
  const result = spawnSync(command, args, {
    cwd: projectRoot,
    env: process.env,
    stdio: "inherit",
  });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
};

run(process.execPath, [resolve(scriptsDir, "link-assets.mjs"), videoId]);
run(process.execPath, [
  resolve(scriptsDir, "run-remotion.mjs"),
  "render",
  "src/index.ts",
  composition.id,
  renderOutput,
  "--concurrency=1",
  `--props=${JSON.stringify(production.finalProps ?? {})}`,
]);

if (mastering) {
  const integratedLoudness = mastering.integratedLoudness ?? -16;
  const truePeak = mastering.truePeak ?? -1.5;
  const loudnessRange = mastering.loudnessRange ?? 7;
  const audioBitrate = mastering.audioBitrate ?? "192k";
  const audioSampleRate = mastering.audioSampleRate ?? 48000;

  run("ffmpeg", [
    "-hide_banner",
    "-loglevel",
    "error",
    force ? "-y" : "-n",
    "-i",
    outputs.unmastered,
    "-map",
    "0:v:0",
    "-map",
    "0:a:0",
    "-c:v",
    "copy",
    "-af",
    `loudnorm=I=${integratedLoudness}:TP=${truePeak}:LRA=${loudnessRange}`,
    "-c:a",
    "aac",
    "-b:a",
    audioBitrate,
    "-ar",
    String(audioSampleRate),
    "-movflags",
    "+faststart",
    outputs.final,
  ]);
}

console.log(`Rendered ${videoId} to ${outputs.final}`);
