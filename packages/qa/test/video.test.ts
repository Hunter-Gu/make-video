import assert from "node:assert/strict";
import {spawnSync} from "node:child_process";
import {mkdirSync, mkdtempSync, rmSync, writeFileSync} from "node:fs";
import {tmpdir} from "node:os";
import {resolve} from "node:path";
import {after, test} from "node:test";

const root = mkdtempSync(resolve(tmpdir(), "make-video-video-qa-"));
process.env.MAKE_VIDEO_PROJECT_ROOT = root;
const {runVideoQa} = await import("../src/video");

after(() => rmSync(root, {recursive: true, force: true}));

const fps = 30;
const width = 320;
const height = 180;
const durationInFrames = 60;

/** A moving, non-black clip: a static or black one would trip the visual checks. */
const render = (file: string, options: {seconds?: number; width?: number; height?: number} = {}) => {
  mkdirSync(resolve(file, ".."), {recursive: true});
  const result = spawnSync("ffmpeg", [
    "-hide_banner", "-loglevel", "error", "-y",
    "-f", "lavfi", "-i", `testsrc=s=${options.width ?? width}x${options.height ?? height}:r=${fps}:d=${options.seconds ?? durationInFrames / fps}`,
    "-c:v", "libx264", "-pix_fmt", "yuv420p", file,
  ], {encoding: "utf8"});
  assert.equal(result.status, 0, result.stderr);
};

let counter = 0;
const project = (sceneIndex: Record<string, unknown>, qa: Record<string, unknown> = {}, clip: {seconds?: number; width?: number; height?: number} = {}) => {
  const videoId = `video-qa-${counter += 1}`;
  const sourceDir = resolve(root, "src", videoId);
  mkdirSync(sourceDir, {recursive: true});
  writeFileSync(resolve(sourceDir, "video.config.json"), JSON.stringify({
    videoId,
    composition: {id: "VideoQa", fps, width, height, durationInFrames},
    production: {
      publicPath: videoId,
      outputs: {still: `output/${videoId}/still.png`, silent: `output/${videoId}/silent.mp4`, unmastered: `output/${videoId}/unmastered.mp4`, final: `output/${videoId}/final.mp4`},
      qa: {output: "silent", audioRequired: false, ...qa},
    },
  }));
  writeFileSync(resolve(sourceDir, "SCENE_INDEX.json"), JSON.stringify(sceneIndex));
  render(resolve(root, "output", videoId, "silent.mp4"), clip);
  return videoId;
};

const check = (report: any, id: string) => report.checks.find((item: any) => item.id === id);

const timeline = {
  version: 1,
  scenes: [
    {id: "opening", startFrame: 0, endFrame: 30, durationInFrames: 30},
    {id: "closing", startFrame: 30, endFrame: 60, durationInFrames: 30},
  ],
  captions: [
    {id: "one", sceneId: "opening", startFrame: 2, endFrame: 28, text: "First line."},
    {id: "two", sceneId: "closing", startFrame: 32, endFrame: 58, text: "Second line."},
  ],
};

test("a matching render passes every check", () => {
  const report = runVideoQa([project(timeline)]);
  assert.equal(report.passed, true, JSON.stringify(report.checks.filter((item: any) => !item.pass)));
  assert.deepEqual([check(report, "width").actual, check(report, "height").actual], [width, height]);
  assert.equal(check(report, "fps").pass, true);
  assert.equal(check(report, "duration").pass, true);
  assert.equal(check(report, "caption-scene:one").pass, true);
});

test("narration that runs past its scene is caught", () => {
  const spilling = structuredClone(timeline);
  spilling.captions[0].endFrame = 45;
  const report = runVideoQa([project(spilling)]);
  assert.equal(report.passed, false);
  assert.equal(check(report, "caption-scene:one").pass, false);
  assert.match(String(check(report, "caption-scene:one").expected), /inside scene opening \(0-30\)/);
  assert.equal(check(report, "caption:one").pass, true, "it is still ordered and inside the composition");
});

test("a caption pointing at a scene that no longer exists is caught", () => {
  const orphaned = structuredClone(timeline);
  orphaned.captions[1].sceneId = "removed";
  const report = runVideoQa([project(orphaned)]);
  assert.equal(check(report, "caption-scene:two").pass, false);
  assert.match(String(check(report, "caption-scene:two").expected), /a known scene, not removed/);
});

test("captions must stay ordered and inside the composition", () => {
  const overlapping = structuredClone(timeline);
  overlapping.captions[1].startFrame = 10;
  overlapping.captions[1].sceneId = "opening";
  assert.equal(check(runVideoQa([project(overlapping)]), "caption:two").pass, false);

  const overrunning = structuredClone(timeline);
  overrunning.captions[1].endFrame = 90;
  assert.equal(check(runVideoQa([project(overrunning)]), "caption:two").pass, false);

  const empty = structuredClone(timeline);
  empty.captions[0].text = "   ";
  assert.equal(check(runVideoQa([project(empty)]), "caption:one").pass, false);
});

test("a render that does not match the composition is caught", () => {
  const wrongSize = runVideoQa([project(timeline, {}, {width: 160, height: 90})]);
  assert.equal(check(wrongSize, "width").pass, false);
  assert.equal(check(wrongSize, "height").pass, false);

  const wrongLength = runVideoQa([project(timeline, {}, {seconds: 4})]);
  assert.equal(check(wrongLength, "duration").pass, false);
  assert.equal(runVideoQa([project(timeline, {durationToleranceSeconds: 5}, {seconds: 4})]).passed, true, "a project may widen its own tolerance");
});

test("a silent edit is not measured for loudness", () => {
  const report = runVideoQa([project(timeline)]);
  assert.equal(check(report, "audio-stream").pass, true);
  assert.equal(check(report, "audio-loudness"), undefined, "Remotion writes a silent track; measuring it would fail every silent edit");
});

test("a missing render is reported before anything is measured", () => {
  const videoId = project(timeline);
  rmSync(resolve(root, "output", videoId, "silent.mp4"));
  assert.throws(() => runVideoQa([videoId]), /QA input not found/);
});
