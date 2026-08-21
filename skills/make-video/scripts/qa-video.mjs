import {spawnSync} from "node:child_process";
import {existsSync, mkdirSync, readFileSync, writeFileSync} from "node:fs";
import {dirname, resolve} from "node:path";

import {
  loadVideoContext,
  parseTargetArgs,
  projectRoot,
} from "./video-context.mjs";

const {videoId} = parseTargetArgs(process.argv.slice(2));
const context = loadVideoContext(videoId);
const {composition, config, outputs, production} = context;
const qa = production.qa ?? {};
const outputName = /** @type {keyof typeof outputs} */ (qa.output ?? "final");

if (!Object.hasOwn(outputs, outputName)) {
  throw new Error(`production.qa.output must name a configured output.`);
}

const input = outputs[outputName];
if (!existsSync(input)) {
  throw new Error(`QA input not found: ${input}`);
}

/** @param {string} command @param {string[]} args */
const run = (command, args) => {
  const result = spawnSync(command, args, {
    cwd: projectRoot,
    env: process.env,
    encoding: "utf8",
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`${command} failed:\n${result.stderr || result.stdout}`);
  }
  return result;
};

const probe = JSON.parse(
  run("ffprobe", [
    "-v",
    "error",
    "-show_entries",
    "format=duration:stream=codec_type,codec_name,width,height,r_frame_rate",
    "-of",
    "json",
    input,
  ]).stdout,
);

/** @type {Array<{id: string, pass: boolean, expected: unknown, actual: unknown}>} */
const checks = [];
/** @param {string} id @param {boolean} pass @param {unknown} expected @param {unknown} actual */
const add = (id, pass, expected, actual) =>
  checks.push({id, pass, expected, actual});
const video = probe.streams?.find((/** @type {any} */ stream) => stream.codec_type === "video");
const audio = probe.streams?.find((/** @type {any} */ stream) => stream.codec_type === "audio");
const duration = Number(probe.format?.duration);
const expectedDuration = composition.durationInFrames / composition.fps;
const [fpsNumerator, fpsDenominator] = String(video?.r_frame_rate ?? "0/1")
  .split("/")
  .map(Number);
const actualFps = fpsNumerator / fpsDenominator;
const durationTolerance = qa.durationToleranceSeconds ?? 0.25;

add("video-stream", Boolean(video), "present", video ? "present" : "missing");
add("width", video?.width === composition.width, composition.width, video?.width);
add("height", video?.height === composition.height, composition.height, video?.height);
add("fps", Math.abs(actualFps - composition.fps) < 0.01, composition.fps, actualFps);
add(
  "duration",
  Number.isFinite(duration) && Math.abs(duration - expectedDuration) <= durationTolerance,
  `${expectedDuration}s ± ${durationTolerance}s`,
  duration,
);

const audioRequired =
  qa.audioRequired ??
  Boolean(production.mastering || Object.values(production.audio ?? {}).some(Boolean));
add(
  "audio-stream",
  !audioRequired || Boolean(audio),
  audioRequired ? "present" : "optional",
  audio ? "present" : "missing",
);

const sceneIndexFile = resolve(context.sourceDir, "SCENE_INDEX.json");
const indexedCaptions = existsSync(sceneIndexFile) ? JSON.parse(readFileSync(sceneIndexFile, "utf8")).captions : null;
const captions = Array.isArray(indexedCaptions) ? indexedCaptions : Array.isArray(config.captions) ? config.captions : [];
let previousEnd = 0;
for (const caption of captions) {
  const valid =
    (caption.text === undefined || typeof caption.text === "string" && caption.text.trim().length > 0) &&
    Number.isFinite(caption.startFrame) &&
    Number.isFinite(caption.endFrame) &&
    caption.startFrame >= previousEnd &&
    caption.startFrame < caption.endFrame &&
    caption.endFrame <= composition.durationInFrames;
  add(`caption:${caption.id}`, valid, "ordered and inside timeline", {
    startFrame: caption.startFrame,
    endFrame: caption.endFrame,
  });
  previousEnd = Math.max(previousEnd, caption.endFrame ?? 0);
}

const visualAnalysis = run("ffmpeg", [
  "-hide_banner", "-nostats", "-i", input,
  "-vf", "blackdetect=d=0.5:pix_th=0.02,freezedetect=n=-60dB:d=2",
  "-an", "-f", "null", "-",
]).stderr;
const blackDurations = [...visualAnalysis.matchAll(/black_duration:([\d.]+)/g)].map((match) => Number(match[1]));
const freezeDurations = [...visualAnalysis.matchAll(/freeze_duration: ([\d.]+)/g)].map((match) => Number(match[1]));
const longestBlack = Math.max(0, ...blackDurations);
const longestFreeze = Math.max(0, ...freezeDurations);
add("black-frames", longestBlack <= (qa.maxBlackSeconds ?? 0.5), `≤ ${qa.maxBlackSeconds ?? 0.5}s`, longestBlack);
add("frozen-frames", longestFreeze <= (qa.maxFreezeSeconds ?? 6), `≤ ${qa.maxFreezeSeconds ?? 6}s`, longestFreeze);

const imageManifest = resolve(context.publicDir, "images/generated/manifest.json");
if (existsSync(imageManifest)) {
  const assets = JSON.parse(readFileSync(imageManifest, "utf8")).assets ?? [];
  const hashes = assets.map((/** @type {any} */ asset) => asset.sha256).filter(Boolean);
  add("duplicate-images", new Set(hashes).size === hashes.length, "unique generated images", hashes.length - new Set(hashes).size);
}

if (production.mastering && audio) {
  const targetI = production.mastering.integratedLoudness ?? -16;
  const targetTp = production.mastering.truePeak ?? -1.5;
  const analysis = run("ffmpeg", [
    "-hide_banner",
    "-nostats",
    "-i",
    input,
    "-af",
    `loudnorm=I=${targetI}:TP=${targetTp}:LRA=${production.mastering.loudnessRange ?? 7}:print_format=json`,
    "-f",
    "null",
    "-",
  ]).stderr;
  const match = analysis.match(/\{[\s\S]*?"input_i"[\s\S]*?\}/g)?.at(-1);
  if (!match) throw new Error("Could not parse FFmpeg loudness analysis.");
  const loudness = JSON.parse(match);
  const actualI = Number(loudness.input_i);
  const actualTp = Number(loudness.input_tp);
  add("integrated-loudness", Math.abs(actualI - targetI) <= 1, `${targetI} ± 1 LUFS`, actualI);
  add("true-peak", actualTp <= targetTp + 0.2, `≤ ${targetTp + 0.2} dBTP`, actualTp);
}

const passed = checks.every((check) => check.pass);
const report = {
  videoId,
  input,
  checkedAt: new Date().toISOString(),
  passed,
  checks,
};
const reportFile = resolve(projectRoot, "output", videoId, "qa-report.json");
mkdirSync(dirname(reportFile), {recursive: true});
writeFileSync(reportFile, `${JSON.stringify(report, null, 2)}\n`);

for (const check of checks) {
  console.log(`${check.pass ? "✓" : "✗"} ${check.id}: ${JSON.stringify(check.actual)}`);
}
console.log(`QA report: ${reportFile}`);
if (!passed) process.exit(1);
