import assert from "node:assert/strict";
import {existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync} from "node:fs";
import {tmpdir} from "node:os";
import {resolve} from "node:path";
import {after, test} from "node:test";

const root = mkdtempSync(resolve(tmpdir(), "make-video-timing-"));
process.env.MAKE_VIDEO_PROJECT_ROOT = root;
const {buildTiming} = await import("../src/timing");

after(() => rmSync(root, {recursive: true, force: true}));

const fps = 30;
let counter = 0;

const writeWave = (file: string, seconds: number, sampleRate = 24000) => {
  const pcm = Buffer.alloc(Math.round(seconds * sampleRate) * 2);
  const header = Buffer.alloc(44);
  header.write("RIFF", 0); header.writeUInt32LE(36 + pcm.length, 4); header.write("WAVE", 8); header.write("fmt ", 12);
  header.writeUInt32LE(16, 16); header.writeUInt16LE(1, 20); header.writeUInt16LE(1, 22); header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(sampleRate * 2, 28); header.writeUInt16LE(2, 32); header.writeUInt16LE(16, 34); header.write("data", 36);
  header.writeUInt32LE(pcm.length, 40);
  writeFileSync(file, Buffer.concat([header, pcm]));
};

const project = (options: {scenes: unknown[]; segments: Record<string, number>; script?: Record<string, string>; segmentFiles?: boolean}) => {
  const videoId = `timing-${counter += 1}`;
  const sourceDir = resolve(root, "src", videoId);
  const voiceDir = resolve(root, "public", videoId, "audio", "voiceover");
  mkdirSync(sourceDir, {recursive: true});
  mkdirSync(voiceDir, {recursive: true});
  writeFileSync(resolve(sourceDir, "video.config.json"), JSON.stringify({
    videoId,
    composition: {id: "Timing", fps, width: 1920, height: 1080, durationInFrames: 1},
    production: {publicPath: videoId, outputs: {still: `output/${videoId}/still.png`, silent: `output/${videoId}/silent.mp4`, unmastered: `output/${videoId}/unmastered.mp4`, final: `output/${videoId}/final.mp4`}},
  }, null, 2));
  writeFileSync(resolve(sourceDir, "TIMING_PLAN.json"), JSON.stringify({
    version: 1,
    voiceManifest: `public/${videoId}/audio/voiceover/manifest.json`,
    assets: {},
    scenes: options.scenes,
  }));
  writeFileSync(resolve(voiceDir, "manifest.json"), JSON.stringify({
    videoId,
    segments: Object.fromEntries(Object.entries(options.segments).map(([id, durationSeconds]) => [id, {durationSeconds}])),
  }));
  const script = options.script ?? Object.fromEntries(Object.keys(options.segments).map((id) => [id, `Line for ${id}.`]));
  writeFileSync(resolve(sourceDir, "SCRIPT.md"), `# Narration\n\n${Object.entries(script).map(([id, text]) => `- \`${id}\`: ${text}`).join("\n")}\n`);
  if (options.segmentFiles) for (const [id, seconds] of Object.entries(options.segments)) writeWave(resolve(voiceDir, `${id}.wav`), seconds);
  return {videoId, sourceDir, voiceDir};
};

const readIndex = (sourceDir: string) => JSON.parse(readFileSync(resolve(sourceDir, "SCENE_INDEX.json"), "utf8"));

test("narration length drives scene duration, not a fixed slot", () => {
  const {videoId, sourceDir} = project({
    segments: {"narration-1": 2, "narration-2": 1},
    scenes: [
      {id: "opening", narrationIds: ["narration-1"], leadFrames: 15, tailFrames: 30},
      {id: "closing", narrationIds: ["narration-2"], leadFrames: 0, tailFrames: 0},
    ],
  });
  buildTiming(videoId, false);
  const index = readIndex(sourceDir);
  assert.deepEqual(index.scenes.map((scene: any) => [scene.id, scene.startFrame, scene.endFrame, scene.timingSource]), [
    ["opening", 0, 105, "voice-manifest"],
    ["closing", 105, 135, "voice-manifest"],
  ]);
  assert.deepEqual(index.captions.map((caption: any) => [caption.id, caption.startFrame, caption.endFrame, caption.text]), [
    ["narration-1", 15, 75, "Line for narration-1."],
    ["narration-2", 105, 135, "Line for narration-2."],
  ]);
  const config = JSON.parse(readFileSync(resolve(sourceDir, "video.config.json"), "utf8"));
  assert.equal(config.composition.durationInFrames, 135);
});

test("a scene shorter than its declared minimum is padded", () => {
  const {videoId, sourceDir} = project({
    segments: {"narration-1": 1},
    scenes: [{id: "opening", narrationIds: ["narration-1"], minFrames: 120}],
  });
  buildTiming(videoId, false);
  assert.equal(readIndex(sourceDir).scenes[0].durationInFrames, 120);
});

test("a scene without narration uses its fixed length", () => {
  const {videoId, sourceDir} = project({
    segments: {"narration-1": 1},
    scenes: [{id: "opening", narrationIds: ["narration-1"]}, {id: "card", narrationIds: [], fixedFrames: 60}],
  });
  buildTiming(videoId, false);
  const index = readIndex(sourceDir);
  assert.deepEqual(index.scenes.map((scene: any) => [scene.id, scene.durationInFrames, scene.timingSource]), [["opening", 30, "voice-manifest"], ["card", 60, "fixed"]]);
});

test("timing refuses to guess a missing narration segment or duration", () => {
  const missing = project({segments: {"narration-1": 1}, scenes: [{id: "opening", narrationIds: ["narration-2"]}]});
  assert.throws(() => buildTiming(missing.videoId, false), /Voice timing is missing narration narration-2/);
  const unbounded = project({segments: {"narration-1": 1}, scenes: [{id: "card", narrationIds: []}]});
  assert.throws(() => buildTiming(unbounded.videoId, false), /Scene card has no valid duration/);
});

test("existing scene timing is not replaced without force", () => {
  const {videoId, sourceDir} = project({segments: {"narration-1": 1}, scenes: [{id: "opening", narrationIds: ["narration-1"]}]});
  buildTiming(videoId, false);
  assert.throws(() => buildTiming(videoId, false), /already exists/);
  buildTiming(videoId, true);
  assert.equal(readIndex(sourceDir).scenes.length, 1);
});

test("scene content survives a rebuild of the same scene", () => {
  const {videoId, sourceDir} = project({segments: {"narration-1": 1}, scenes: [{id: "opening", narrationIds: ["narration-1"]}]});
  buildTiming(videoId, false);
  const index = readIndex(sourceDir);
  index.scenes[0].content = {type: "image", title: "Kept"};
  writeFileSync(resolve(sourceDir, "SCENE_INDEX.json"), JSON.stringify(index));
  buildTiming(videoId, true);
  assert.deepEqual(readIndex(sourceDir).scenes[0].content, {type: "image", title: "Kept"});
});

test("generated segment files are assembled into one aligned voiceover", () => {
  const {videoId, voiceDir} = project({
    segments: {"narration-1": 1, "narration-2": 1},
    scenes: [{id: "opening", narrationIds: ["narration-1"], leadFrames: 15}, {id: "closing", narrationIds: ["narration-2"]}],
    segmentFiles: true,
  });
  buildTiming(videoId, false);
  const voiceover = readFileSync(resolve(voiceDir, "voiceover.wav"));
  assert.equal(voiceover.toString("ascii", 0, 4), "RIFF");
  assert.equal(voiceover.readUInt32LE(24), 24000);
  // 15 lead frames + two one-second segments, at 24 kHz mono 16-bit.
  assert.equal((voiceover.length - 44) / 2, Math.ceil(75 / 30 * 24000));
});

test("an unusable voice segment leaves the project untouched", () => {
  const {videoId, sourceDir, voiceDir} = project({
    segments: {"narration-1": 1, "narration-2": 1},
    scenes: [{id: "opening", narrationIds: ["narration-1"]}, {id: "closing", narrationIds: ["narration-2"]}],
    segmentFiles: true,
  });
  writeFileSync(resolve(voiceDir, "narration-2.wav"), "not a wave");
  assert.throws(() => buildTiming(videoId, false), /Unsupported voice segment format/);
  // Writing the index first would leave the composition retimed with no voiceover
  // to match it, and the next run would then need --force to try again.
  assert.equal(existsSync(resolve(sourceDir, "SCENE_INDEX.json")), false);
  assert.equal(JSON.parse(readFileSync(resolve(sourceDir, "video.config.json"), "utf8")).composition.durationInFrames, 1);
});
