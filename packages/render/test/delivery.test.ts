import assert from "node:assert/strict";
import {mkdirSync, mkdtempSync, rmSync, writeFileSync} from "node:fs";
import {tmpdir} from "node:os";
import {resolve} from "node:path";
import {after, test} from "node:test";

const root = mkdtempSync(resolve(tmpdir(), "make-video-delivery-"));
process.env.MAKE_VIDEO_PROJECT_ROOT = root;
const {applyTranslation, loadDeliverables, verifyDeliveredVariant} = await import("../src/delivery");
const {buildProjectState} = await import("../src/state");

after(() => rmSync(root, {recursive: true, force: true}));

const videoId = "fixture";
const sourceDir = resolve(root, "src", videoId);
mkdirSync(resolve(sourceDir, "translations"), {recursive: true});
writeFileSync(resolve(sourceDir, "video.config.json"), JSON.stringify({
  videoId,
  composition: {id: "Fixture", fps: 30, width: 1920, height: 1080, durationInFrames: 300},
  production: {
    publicPath: videoId,
    outputs: {still: `output/${videoId}/still.png`, silent: `output/${videoId}/silent.mp4`, unmastered: `output/${videoId}/unmastered.mp4`, final: `output/${videoId}/final.mp4`},
    stillFrame: 60,
  },
}));
writeFileSync(resolve(sourceDir, "SCENE_INDEX.json"), JSON.stringify({
  version: 1,
  fps: 30,
  assets: {},
  scenes: [
    {id: "opening", startFrame: 0, endFrame: 150, durationInFrames: 150, timingSource: "voice-manifest", content: {type: "image", title: "Opening", subtitle: "A city"}},
    {id: "closing", startFrame: 150, endFrame: 300, durationInFrames: 150, timingSource: "voice-manifest", content: {type: "quote", quote: "Words", attribution: "Someone"}},
  ],
  captions: [
    {id: "opening", sceneId: "opening", startFrame: 0, endFrame: 150, text: "The opening line."},
    {id: "closing-a", sceneId: "closing", startFrame: 150, endFrame: 220, text: "First closing line."},
    {id: "closing-b", sceneId: "closing", startFrame: 220, endFrame: 300, text: "Second closing line."},
  ],
}));

const writeDeliverables = (variants: unknown[]) => writeFileSync(resolve(sourceDir, "DELIVERABLES.json"), JSON.stringify({version: 1, variants}));
const writeTranslation = (name: string, value: unknown) => {
  writeFileSync(resolve(sourceDir, "translations", name), JSON.stringify(value));
  return `src/${videoId}/translations/${name}`;
};

test("declared variants default to the composition and the configured still frame", () => {
  writeDeliverables([
    {id: "clean", kind: "video", captions: false, output: `output/${videoId}/clean.mp4`},
    {id: "thumbnail", kind: "still", width: 1280, height: 720, output: `output/${videoId}/thumbnail.png`},
  ]);
  const [clean, thumbnail] = loadDeliverables(videoId);
  assert.deepEqual({width: clean.width, height: clean.height, captions: clean.captions, frames: clean.frames}, {width: 1920, height: 1080, captions: false, frames: null});
  assert.equal(clean.master, false);
  assert.equal(thumbnail.frame, 60);
  assert.equal(thumbnail.captions, true);
});

test("a variant cannot overwrite a production output or another variant", () => {
  writeDeliverables([{id: "clash", kind: "video", output: `output/${videoId}/final.mp4`}]);
  assert.throws(() => loadDeliverables(videoId), /must not overwrite a production output/);
  writeDeliverables([
    {id: "one", kind: "video", output: `output/${videoId}/same.mp4`},
    {id: "two", kind: "video", output: `output/${videoId}/same.mp4`},
  ]);
  assert.throws(() => loadDeliverables(videoId), /reuses another variant's output path/);
});

test("variant ids, kinds, extensions, and frame ranges are validated", () => {
  writeDeliverables([{id: "Not Kebab", kind: "video", output: `output/${videoId}/a.mp4`}]);
  assert.throws(() => loadDeliverables(videoId), /needs a kebab-case id/);
  writeDeliverables([{id: "wrong-extension", kind: "still", output: `output/${videoId}/a.mp4`}]);
  assert.throws(() => loadDeliverables(videoId), /needs a \.png output path/);
  writeDeliverables([{id: "past-the-end", kind: "video", frames: [0, 301], output: `output/${videoId}/a.mp4`}]);
  assert.throws(() => loadDeliverables(videoId), /must stay inside the composition/);
  writeDeliverables([{id: "escaping", kind: "video", output: "../outside.mp4"}]);
  assert.throws(() => loadDeliverables(videoId), /escapes the project/);
});

test("a translation replaces scene copy and captions of the same timeline", () => {
  const file = writeTranslation("zh.json", {
    language: "zh",
    scenes: {opening: {title: "开场", subtitle: "一座城市", narration: "开场旁白。"}},
    captions: {"closing-b": "第二句结语。"},
  });
  const translated = applyTranslation(buildProjectState(videoId, "remotion"), resolve(root, file));
  assert.equal(translated.scenes[0].content?.title, "开场");
  assert.equal(translated.captions.find((caption) => caption.id === "opening")?.text, "开场旁白。");
  assert.equal(translated.captions.find((caption) => caption.id === "closing-b")?.text, "第二句结语。");
  assert.equal(translated.captions.find((caption) => caption.id === "closing-a")?.text, "First closing line.");
  assert.equal(translated.scenes.length, 2);
});

test("a stale translation is rejected instead of shipping half-applied", () => {
  const state = buildProjectState(videoId, "remotion");
  assert.throws(() => applyTranslation(state, resolve(root, writeTranslation("gone.json", {scenes: {removed: {title: "x"}}}))), /unknown scene: removed/);
  assert.throws(() => applyTranslation(state, resolve(root, writeTranslation("caption.json", {captions: {removed: "x"}}))), /unknown caption: removed/);
  assert.throws(() => applyTranslation(state, resolve(root, writeTranslation("empty.json", {language: "zh"}))), /no scene or caption entries/);
  assert.throws(() => applyTranslation(state, resolve(root, writeTranslation("ambiguous.json", {scenes: {closing: {narration: "x"}}}))), /has 2 captions; translate them under "captions" by id/);
});

test("a delivered file is checked against the size and length that were declared", () => {
  writeDeliverables([
    {id: "thumbnail", kind: "still", width: 1280, height: 720, output: `output/${videoId}/thumbnail.png`},
    {id: "trailer", kind: "video", width: 1080, height: 1920, frames: [0, 150], output: `output/${videoId}/trailer.mp4`},
    {id: "full", kind: "video", output: `output/${videoId}/full.mp4`},
  ]);
  const [thumbnail, trailer, full] = loadDeliverables(videoId);
  const timing = {fps: 30, durationInFrames: 300};

  assert.deepEqual(verifyDeliveredVariant(thumbnail, {width: 1280, height: 720, duration: null}, timing), []);
  assert.deepEqual(verifyDeliveredVariant(trailer, {width: 1080, height: 1920, duration: 5}, timing), []);
  assert.deepEqual(verifyDeliveredVariant(full, {width: 1920, height: 1080, duration: 10}, timing), []);

  assert.match(verifyDeliveredVariant(thumbnail, {width: 1, height: 1, duration: null}, timing).join(" "), /width is 1, declared 1280/);
  assert.match(verifyDeliveredVariant(trailer, {width: 1080, height: 1920, duration: 10}, timing).join(" "), /duration is 10s, expected 5\.000s/);
  assert.match(verifyDeliveredVariant(full, {width: null, height: null, duration: null}, timing).join(" "), /unreadable/);
  assert.deepEqual(verifyDeliveredVariant(full, {width: 1920, height: 1080, duration: 10.2}, {...timing, durationToleranceSeconds: 0.5}), []);
});
