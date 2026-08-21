import {existsSync, readFileSync, writeFileSync} from "node:fs";
import {dirname, resolve} from "node:path";

import {assertTargetsUnlocked} from "./approval-lock-lib.mjs";
import {assertOutputsAvailable, loadVideoContext, parseTargetArgs} from "./video-context.mjs";

const {videoId, force} = parseTargetArgs(process.argv.slice(2));
const context = loadVideoContext(videoId);
const planFile = resolve(context.sourceDir, "TIMING_PLAN.json");
if (!existsSync(planFile)) throw new Error(`Timing plan not found: ${planFile}`);
const plan = JSON.parse(readFileSync(planFile, "utf8"));
const manifestFile = context.resolveConfiguredPath(plan.voiceManifest, "TIMING_PLAN.voiceManifest");
if (!existsSync(manifestFile)) throw new Error(`Voice manifest not found: ${manifestFile}`);
const voice = JSON.parse(readFileSync(manifestFile, "utf8"));
const fps = context.composition.fps;
const scenes = [];
const captions = [];
let frame = 0;
for (const scene of plan.scenes ?? []) {
  const narrationIds = scene.narrationIds ?? [];
  const narrationFrames = narrationIds.reduce((/** @type {number} */ sum, /** @type {string} */ id) => {
    const duration = voice.segments?.[id]?.durationSeconds;
    if (!Number.isFinite(duration)) throw new Error(`Voice timing is missing narration ${id}.`);
    return sum + Math.ceil(duration * fps);
  }, 0);
  const durationInFrames = narrationIds.length > 0
    ? Math.max(scene.minFrames ?? 1, (scene.leadFrames ?? 0) + narrationFrames + (scene.tailFrames ?? 0))
    : scene.fixedFrames;
  if (!Number.isInteger(durationInFrames) || durationInFrames <= 0) throw new Error(`Scene ${scene.id} has no valid duration.`);
  let narrationFrame = frame + (scene.leadFrames ?? 0);
  for (const id of narrationIds) {
    const segmentFrames = Math.ceil(voice.segments[id].durationSeconds * fps);
    captions.push({id, sceneId: scene.id, startFrame: narrationFrame, endFrame: narrationFrame + segmentFrames});
    narrationFrame += segmentFrames;
  }
  scenes.push({...scene, startFrame: frame, endFrame: frame + durationInFrames, durationInFrames, timingSource: narrationIds.length > 0 ? "voice-manifest" : "fixed"});
  frame += durationInFrames;
}
const sceneIndex = {version: 1, fps, voiceManifest: plan.voiceManifest, assets: plan.assets ?? {}, captions, scenes};
const indexFile = resolve(context.sourceDir, "SCENE_INDEX.json");
const segmentFiles = captions.map((caption) => resolve(dirname(manifestFile), `${caption.id}.wav`));
const canAssembleVoiceover = segmentFiles.length > 0 && segmentFiles.every(existsSync);
const voiceoverFile = resolve(context.audioDirs.voiceover, "voiceover.wav");
assertTargetsUnlocked(context, [indexFile, context.configPath, ...(canAssembleVoiceover ? [voiceoverFile] : [])]);
assertOutputsAvailable([indexFile], {force, action: `Narration timing for ${videoId}`});
if (canAssembleVoiceover) assertOutputsAvailable([voiceoverFile], {force, action: `Aligned voiceover for ${videoId}`});
const config = JSON.parse(readFileSync(context.configPath, "utf8"));
config.composition.durationInFrames = frame;
writeFileSync(indexFile, `${JSON.stringify(sceneIndex, null, 2)}\n`);
writeFileSync(context.configPath, `${JSON.stringify(config, null, 2)}\n`);
if (canAssembleVoiceover) {
  const sampleRate = 24000;
  const pcm = Buffer.alloc(Math.ceil(frame / fps * sampleRate) * 2);
  for (let index = 0; index < captions.length; index += 1) {
    const wave = readFileSync(segmentFiles[index]);
    if (wave.toString("ascii", 0, 4) !== "RIFF" || wave.readUInt32LE(24) !== sampleRate || wave.readUInt16LE(34) !== 16) throw new Error(`Unsupported voice segment format: ${segmentFiles[index]}`);
    wave.subarray(44).copy(pcm, Math.round(captions[index].startFrame / fps * sampleRate) * 2);
  }
  const header = Buffer.alloc(44);
  header.write("RIFF", 0); header.writeUInt32LE(36 + pcm.length, 4); header.write("WAVE", 8); header.write("fmt ", 12);
  header.writeUInt32LE(16, 16); header.writeUInt16LE(1, 20); header.writeUInt16LE(1, 22); header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(sampleRate * 2, 28); header.writeUInt16LE(2, 32); header.writeUInt16LE(16, 34); header.write("data", 36); header.writeUInt32LE(pcm.length, 40);
  writeFileSync(voiceoverFile, Buffer.concat([header, pcm]));
}
console.log(`Narration timing: ${scenes.length} scenes, ${frame} frames, ${(frame / fps).toFixed(2)} seconds.`);
if (!canAssembleVoiceover) console.log("Voice segment WAV files were not present; timing was built without an aligned voiceover.");
