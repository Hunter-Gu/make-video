import {spawnSync} from "node:child_process";
import {existsSync, mkdirSync, readFileSync, writeFileSync} from "node:fs";
import {dirname, resolve} from "node:path";

import {loadVideoContext, parseTargetArgs, projectRoot} from "./video-context.mjs";

const {videoId} = parseTargetArgs(process.argv.slice(2));
const context = loadVideoContext(videoId);
const configFile = resolve(context.sourceDir, "CLIP_QA.json");
if (!existsSync(configFile)) throw new Error(`Clip QA config not found: ${configFile}`);
const config = JSON.parse(readFileSync(configFile, "utf8"));
const results = [];
for (const clip of config.clips ?? []) {
  const file = context.resolveConfiguredPath(clip.path, `clip ${clip.id}`);
  if (!existsSync(file)) throw new Error(`Clip not found: ${file}`);
  const probe = spawnSync("ffprobe", ["-v", "error", "-show_entries", "stream=codec_type,width,height", "-show_entries", "format=duration", "-of", "json", file], {encoding: "utf8"});
  if (probe.status !== 0) throw new Error(`Could not probe ${clip.id}.`);
  const metadata = JSON.parse(probe.stdout);
  const video = metadata.streams?.find((/** @type {any} */ stream) => stream.codec_type === "video");
  const duration = Number(metadata.format?.duration);
  const cuts = spawnSync("ffmpeg", ["-hide_banner", "-i", file, "-vf", `select='gt(scene,${clip.sceneThreshold ?? .4})',showinfo`, "-an", "-f", "null", "-"], {encoding: "utf8"});
  const sceneCuts = [...(cuts.stderr ?? "").matchAll(/showinfo.*? n:\s*\d+/g)].length;
  const sample = spawnSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-ss", String(duration / 2), "-i", file, "-frames:v", "1", "-f", "image2pipe", "-vcodec", "png", "-"], {encoding: null});
  const ocr = sample.status === 0 ? spawnSync("tesseract", ["stdin", "stdout", "--psm", "11", "tsv"], {input: sample.stdout, encoding: "utf8"}) : null;
  const detectedText = (ocr?.stdout ?? "").split("\n").slice(1).map((line) => line.split("\t")).filter((fields) => Number(fields[10]) >= (clip.minOcrConfidence ?? 70)).map((fields) => fields[11]).filter(Boolean).join(" ");
  const checks = {
    duration: Math.abs(duration - clip.expectedDurationSeconds) <= (clip.durationToleranceSeconds ?? .25),
    resolution: video?.width >= clip.minWidth && video?.height >= clip.minHeight,
    sceneCuts: sceneCuts <= (clip.maxSceneCuts ?? 0),
    unwantedText: clip.allowText === true || detectedText.length === 0,
  };
  results.push({id: clip.id, path: clip.path, duration, width: video?.width, height: video?.height, sceneCuts, detectedText, checks, passed: Object.values(checks).every(Boolean)});
}
const report = {videoId, checkedAt: new Date().toISOString(), passed: results.every((result) => result.passed), clips: results};
const output = resolve(projectRoot, "output", videoId, "clip-qa-report.json");
mkdirSync(dirname(output), {recursive: true});
writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`);
for (const result of results) console.log(`${result.passed ? "✓" : "✗"} ${result.id}: ${result.width}x${result.height}, ${result.duration}s, ${result.sceneCuts} cuts, OCR=${JSON.stringify(result.detectedText)}`);
console.log(`Clip QA report: ${output}`);
if (!report.passed) process.exit(1);
