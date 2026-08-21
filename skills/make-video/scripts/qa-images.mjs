import {spawnSync} from "node:child_process";
import {existsSync, mkdirSync, readFileSync, writeFileSync} from "node:fs";
import {dirname, resolve} from "node:path";

import {loadVideoContext, parseTargetArgs, projectRoot} from "./video-context.mjs";

const {videoId} = parseTargetArgs(process.argv.slice(2));
const context = loadVideoContext(videoId);
const config = JSON.parse(readFileSync(resolve(context.sourceDir, "IMAGE_QA.json"), "utf8"));
/** @type {any[]} */
const results = [];
for (const image of config.images ?? []) {
  const file = context.resolveConfiguredPath(image.path, `image ${image.id}`);
  if (!existsSync(file)) throw new Error(`Image not found: ${file}`);
  const pixels = spawnSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-i", file, "-vf", "scale=16:16,format=gray", "-frames:v", "1", "-f", "rawvideo", "-"], {encoding: null});
  if (pixels.status !== 0 || pixels.stdout.length !== 256) throw new Error(`Could not analyze ${image.id}.`);
  const values = [...pixels.stdout];
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  const deviation = Math.sqrt(values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length);
  const hash = values.map((value) => value >= mean ? "1" : "0").join("");
  const sample = spawnSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-i", file, "-frames:v", "1", "-f", "image2pipe", "-vcodec", "png", "-"], {encoding: null});
  const ocr = spawnSync("tesseract", ["stdin", "stdout", "--psm", "11", "tsv"], {input: sample.stdout, encoding: "utf8"});
  const text = (ocr.stdout ?? "").split("\n").slice(1).map((line) => line.split("\t")).filter((fields) => Number(fields[10]) >= (image.minOcrConfidence ?? 70)).map((fields) => fields[11]).filter(Boolean).join(" ");
  results.push({id: image.id, path: image.path, visualIdea: image.visualIdea, deviation, hash, detectedText: text, checks: {information: deviation >= (image.minDeviation ?? 8), unwantedText: image.allowText === true || text.length === 0}});
}
for (let left = 0; left < results.length; left += 1) for (let right = left + 1; right < results.length; right += 1) {
  const distance = [...results[left].hash].filter((bit, index) => bit !== results[right].hash[index]).length;
  if (distance <= (config.maxNearDuplicateDistance ?? 8)) results[left].checks.nearDuplicate = results[right].checks.nearDuplicate = false;
  if (results[left].visualIdea === results[right].visualIdea) results[left].checks.repeatedIdea = results[right].checks.repeatedIdea = false;
}
for (const result of results) {
  if (result.checks.nearDuplicate === undefined) result.checks.nearDuplicate = true;
  if (result.checks.repeatedIdea === undefined) result.checks.repeatedIdea = true;
  result.passed = Object.values(result.checks).every(Boolean);
  delete result.hash;
}
const report = {videoId, checkedAt: new Date().toISOString(), passed: results.every((result) => result.passed), images: results};
const output = resolve(projectRoot, "output", videoId, "image-qa-report.json");
mkdirSync(dirname(output), {recursive: true});
writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`);
for (const result of results) console.log(`${result.passed ? "✓" : "✗"} ${result.id}: deviation=${result.deviation.toFixed(1)}, OCR=${JSON.stringify(result.detectedText)}`);
if (!report.passed) process.exit(1);
