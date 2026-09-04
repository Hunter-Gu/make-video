import {log, readJsonFile} from "@make-video/project";
import {spawnSync} from "node:child_process";
import {existsSync, mkdirSync, writeFileSync} from "node:fs";
import {dirname, resolve} from "node:path";

import {loadVideoContext, parseTargetArgs, projectRoot, readJson} from "./context";

const run = (command: string, args: string[]) => {
  const result = spawnSync(command, args, {cwd: projectRoot, env: process.env, encoding: "utf8"});
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} failed:\n${result.stderr || result.stdout}`);
  return {stdout: result.stdout, stderr: result.stderr, output: `${result.stdout}\n${result.stderr}`};
};

const measuredValue = (output: string, pattern: RegExp) => {
  const matches = [...output.matchAll(pattern)];
  const value = matches.at(-1)?.[1];
  return value && value !== "-inf" ? Number(value) : Number.NaN;
};

export const runVideoQa = (args: string[], inputOverride?: string) => {
  const {videoId} = parseTargetArgs(args);
  const context = loadVideoContext(videoId);
  const production = context.production;
  const qa = (production.qa ?? {}) as Record<string, any>;
  const input = inputOverride ? context.resolveConfiguredPath(inputOverride, "QA input override") : context.outputs[qa.output ?? "final"];
  if (!input) throw new Error("production.qa.output must name a configured output.");
  if (!existsSync(input)) throw new Error(`QA input not found: ${input}`);
  const probe = JSON.parse(run("ffprobe", ["-v", "error", "-show_entries", "format=duration:stream=codec_type,codec_name,width,height,r_frame_rate", "-of", "json", input]).stdout);
  const checks: Array<{id: string; pass: boolean; expected: unknown; actual: unknown}> = [];
  const add = (id: string, pass: boolean, expected: unknown, actual: unknown) => checks.push({id, pass, expected, actual});
  const video = probe.streams?.find((stream: any) => stream.codec_type === "video");
  const audio = probe.streams?.find((stream: any) => stream.codec_type === "audio");
  const duration = Number(probe.format?.duration);
  const expectedDuration = Number(context.composition.durationInFrames) / Number(context.composition.fps);
  const [numerator, denominator] = String(video?.r_frame_rate ?? "0/1").split("/").map(Number);
  add("video-stream", Boolean(video), "present", video ? "present" : "missing");
  add("width", video?.width === context.composition.width, context.composition.width, video?.width);
  add("height", video?.height === context.composition.height, context.composition.height, video?.height);
  add("fps", Math.abs(numerator / denominator - context.composition.fps) < 0.01, context.composition.fps, numerator / denominator);
  add("duration", Number.isFinite(duration) && Math.abs(duration - expectedDuration) <= (qa.durationToleranceSeconds ?? 0.25), `${expectedDuration}s`, duration);
  const audioRequired = qa.audioRequired ?? Boolean(production.mastering || Object.values(production.audio ?? {}).some(Boolean));
  add("audio-stream", !audioRequired || Boolean(audio), audioRequired ? "present" : "optional", audio ? "present" : "missing");
  // Remotion writes a silent audio track into MP4 output even for a silent edit.
  // Measure loudness only where the project declares that audio carries content.
  if (audio && audioRequired) {
    const analysis = run("ffmpeg", ["-hide_banner", "-nostats", "-i", input, "-map", "0:a:0", "-af", "ebur128=peak=true", "-f", "null", "-"]).output;
    const integratedLoudness = measuredValue(analysis, /\bI:\s*(-?inf|-?[\d.]+) LUFS/g);
    const truePeak = measuredValue(analysis, /\bPeak:\s*(-?inf|-?[\d.]+) dBFS/g);
    const target = Number(production.mastering?.integratedLoudness ?? qa.integratedLoudness ?? -16);
    const tolerance = Number(qa.loudnessTolerance ?? 4);
    const maxTruePeak = Number(production.mastering?.truePeak ?? qa.maxTruePeakDbfs ?? -1);
    add("audio-loudness", Number.isFinite(integratedLoudness) && Math.abs(integratedLoudness - target) <= tolerance, `${target} ± ${tolerance} LUFS`, integratedLoudness);
    add("audio-true-peak", Number.isFinite(truePeak) && truePeak <= maxTruePeak, `≤ ${maxTruePeak} dBFS`, truePeak);
  }
  const sceneIndex = readJson(resolve(context.sourceDir, "SCENE_INDEX.json"));
  const config = readJsonFile(resolve(context.sourceDir, "video.config.json"));
  const captions = Array.isArray(sceneIndex?.captions) ? sceneIndex.captions : Array.isArray(config.captions) ? config.captions : [];
  const scenes = new Map((Array.isArray(sceneIndex?.scenes) ? sceneIndex.scenes : []).map((scene: any) => [scene?.id, scene]));
  let previousEnd = 0;
  for (const caption of captions) {
    const valid = (caption.text === undefined || typeof caption.text === "string" && caption.text.trim().length > 0) && Number.isFinite(caption.startFrame) && Number.isFinite(caption.endFrame) && caption.startFrame >= previousEnd && caption.startFrame < caption.endFrame && caption.endFrame <= context.composition.durationInFrames;
    add(`caption:${caption.id}`, valid, "ordered and inside timeline", {startFrame: caption.startFrame, endFrame: caption.endFrame});
    previousEnd = Math.max(previousEnd, caption.endFrame ?? 0);
    // Narration that runs past the scene it belongs to is heard over the next
    // picture. Editing a scene boundary can do this silently, so check it here.
    if (caption.sceneId === undefined) continue;
    const scene = scenes.get(caption.sceneId);
    add(
      `caption-scene:${caption.id}`,
      Boolean(scene) && caption.startFrame >= scene.startFrame && caption.endFrame <= scene.endFrame,
      scene ? `inside scene ${caption.sceneId} (${scene.startFrame}-${scene.endFrame})` : `a known scene, not ${caption.sceneId}`,
      {startFrame: caption.startFrame, endFrame: caption.endFrame},
    );
  }
  const visual = run("ffmpeg", ["-hide_banner", "-nostats", "-i", input, "-vf", "blackdetect=d=0.5:pix_th=0.02,freezedetect=n=-60dB:d=2", "-an", "-f", "null", "-"]).output;
  const black = Math.max(0, ...[...visual.matchAll(/black_duration:([\d.]+)/g)].map((match) => Number(match[1])));
  const frozen = Math.max(0, ...[...visual.matchAll(/freeze_duration: ([\d.]+)/g)].map((match) => Number(match[1])));
  add("black-frames", black <= (qa.maxBlackSeconds ?? 0.5), `≤ ${qa.maxBlackSeconds ?? 0.5}s`, black);
  add("frozen-frames", frozen <= (qa.maxFreezeSeconds ?? 6), `≤ ${qa.maxFreezeSeconds ?? 6}s`, frozen);
  const passed = checks.every((check) => check.pass);
  const report = {videoId, input, checkedAt: new Date().toISOString(), passed, checks};
  const reportFile = resolve(projectRoot, "output", videoId, "qa-report.json");
  mkdirSync(dirname(reportFile), {recursive: true});
  writeFileSync(reportFile, `${JSON.stringify(report, null, 2)}\n`);
  for (const check of checks) log(`${check.pass ? "✓" : "✗"} ${check.id}: ${JSON.stringify(check.actual)}`);
  log(`QA report: ${reportFile}`);
  return report;
};
