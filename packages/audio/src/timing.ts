import {log, readJsonFile} from "@make-video/project";
import {existsSync, readFileSync, writeFileSync} from "node:fs";
import {dirname, resolve} from "node:path";

import {assertOutputAvailable, loadAudioContext} from "./context";

/** Voice segments are generated as 16-bit mono WAV at this rate; anything else cannot be aligned. */
const sampleRate = 24000;

export const buildTiming = (videoId: string, force: boolean) => {
  const context = loadAudioContext(videoId);
  const planFile = resolve(context.sourceDir, "TIMING_PLAN.json");
  if (!existsSync(planFile)) throw new Error(`Timing plan not found: ${planFile}`);
  const plan = readJsonFile(planFile);
  const generatedManifest = resolve(context.audioDirs.voiceover, "manifest.json");
  const manifestFile = existsSync(generatedManifest)
    ? generatedManifest
    : context.resolveConfiguredPath(plan.voiceManifest, "TIMING_PLAN.voiceManifest");
  if (!existsSync(manifestFile)) throw new Error(`Voice manifest not found: ${manifestFile}`);
  const voice = readJsonFile(manifestFile);
  const scriptFile = resolve(context.sourceDir, "SCRIPT.md");
  const script = existsSync(scriptFile) ? new Map([...readFileSync(scriptFile, "utf8").matchAll(/^- `([^`]+)`: (.+)$/gm)].map((match) => [match[1], match[2]])) : new Map();
  const fps = context.composition.fps;
  const indexFile = resolve(context.sourceDir, "SCENE_INDEX.json");
  const previousIndex = existsSync(indexFile) ? readJsonFile(indexFile) : null;
  const previousScenes = new Map((previousIndex?.scenes ?? []).map((scene: any) => [scene.id, scene]));
  const scenes: any[] = []; const captions: any[] = []; let frame = 0;
  for (const scene of plan.scenes ?? []) {
    const narrationIds = scene.narrationIds ?? [];
    const narrationFrames = narrationIds.reduce((sum: number, id: string) => { const duration = voice.segments?.[id]?.durationSeconds; if (!Number.isFinite(duration)) throw new Error(`Voice timing is missing narration ${id}.`); return sum + Math.ceil(duration * fps); }, 0);
    const durationInFrames = narrationIds.length > 0 ? Math.max(scene.minFrames ?? 1, (scene.leadFrames ?? 0) + narrationFrames + (scene.tailFrames ?? 0)) : scene.fixedFrames;
    if (!Number.isInteger(durationInFrames) || durationInFrames <= 0) throw new Error(`Scene ${scene.id} has no valid duration.`);
    let narrationFrame = frame + (scene.leadFrames ?? 0);
    for (const id of narrationIds) { const segmentFrames = Math.ceil(voice.segments[id].durationSeconds * fps); captions.push({id, sceneId: scene.id, text: script.get(id) ?? "", startFrame: narrationFrame, endFrame: narrationFrame + segmentFrames}); narrationFrame += segmentFrames; }
    const previousScene = previousScenes.get(scene.id) as any;
    scenes.push({...previousScene, ...scene, startFrame: frame, endFrame: frame + durationInFrames, durationInFrames, timingSource: narrationIds.length > 0 ? "voice-manifest" : "fixed"});
    frame += durationInFrames;
  }
  const sceneIndex = {version: 1, fps, voiceManifest: plan.voiceManifest, assets: plan.assets ?? {}, captions, scenes};
  assertOutputAvailable([indexFile], force, `Narration timing for ${videoId}`);
  const segmentFiles = captions.map((caption) => resolve(dirname(manifestFile), `${caption.id}.wav`));
  const canAssembleVoiceover = segmentFiles.length > 0 && segmentFiles.every(existsSync);
  const voiceoverFile = resolve(context.audioDirs.voiceover, "voiceover.wav");
  if (canAssembleVoiceover) assertOutputAvailable([voiceoverFile], force, `Aligned voiceover for ${videoId}`);
  // Read and check every segment before writing anything: an unusable one must not
  // leave the scene index and composition rewritten with no voiceover to match them.
  const waves = canAssembleVoiceover ? segmentFiles.map((file) => {
    const wave = readFileSync(file);
    if (wave.length < 44 || wave.toString("ascii", 0, 4) !== "RIFF" || wave.readUInt32LE(24) !== sampleRate || wave.readUInt16LE(34) !== 16) throw new Error(`Unsupported voice segment format: ${file}`);
    return wave;
  }) : [];
  const config = readJsonFile(context.configPath);
  config.composition.durationInFrames = frame;
  writeFileSync(indexFile, `${JSON.stringify(sceneIndex, null, 2)}\n`);
  writeFileSync(context.configPath, `${JSON.stringify(config, null, 2)}\n`);
  if (canAssembleVoiceover) {
    const pcm = Buffer.alloc(Math.ceil(frame / fps * sampleRate) * 2);
    for (let index = 0; index < captions.length; index += 1) {
      waves[index].subarray(44).copy(pcm, Math.round(captions[index].startFrame / fps * sampleRate) * 2);
    }
    const header = Buffer.alloc(44);
    header.write("RIFF", 0); header.writeUInt32LE(36 + pcm.length, 4); header.write("WAVE", 8); header.write("fmt ", 12); header.writeUInt32LE(16, 16); header.writeUInt16LE(1, 20); header.writeUInt16LE(1, 22); header.writeUInt32LE(sampleRate, 24); header.writeUInt32LE(sampleRate * 2, 28); header.writeUInt16LE(2, 32); header.writeUInt16LE(16, 34); header.write("data", 36); header.writeUInt32LE(pcm.length, 40);
    writeFileSync(voiceoverFile, Buffer.concat([header, pcm]));
  }
  log(`Narration timing: ${scenes.length} scenes, ${frame} frames, ${(frame / fps).toFixed(2)} seconds.`);
  if (!canAssembleVoiceover) log("Voice segment WAV files were not present; timing was built without an aligned voiceover.");
};
