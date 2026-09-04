import assert from "node:assert/strict";
import {spawnSync} from "node:child_process";
import {mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync} from "node:fs";
import {tmpdir} from "node:os";
import {resolve} from "node:path";
import {after, test} from "node:test";

const root = mkdtempSync(resolve(tmpdir(), "make-video-qa-"));
process.env.MAKE_VIDEO_PROJECT_ROOT = root;
const {runImageQa} = await import("../src/images");

after(() => rmSync(root, {recursive: true, force: true}));

const videoId = "qa-fixture";
const sourceDir = resolve(root, "src", videoId);
const assetDir = resolve(sourceDir, "assets");
mkdirSync(assetDir, {recursive: true});
writeFileSync(resolve(sourceDir, "video.config.json"), JSON.stringify({
  videoId,
  composition: {id: "QaFixture", fps: 30, width: 640, height: 360, durationInFrames: 30},
  production: {publicPath: videoId, outputs: {still: `output/${videoId}/still.png`, silent: `output/${videoId}/silent.mp4`, unmastered: `output/${videoId}/unmastered.mp4`, final: `output/${videoId}/final.mp4`}},
}));

/** Draw a deterministic test image with FFmpeg rather than committing binary fixtures. */
const image = (name: string, filter: string) => {
  const file = resolve(assetDir, `${name}.png`);
  const result = spawnSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", "-f", "lavfi", "-i", filter, "-frames:v", "1", file], {encoding: "utf8"});
  assert.equal(result.status, 0, result.stderr);
  return `src/${videoId}/assets/${name}.png`;
};

const flat = image("flat", "color=c=gray:s=320x180");
const gradient = image("gradient", "gradients=s=320x180:c0=black:c1=white:x0=0:y0=0:x1=320:y1=180:nb_colors=2");
const stripes = image("stripes", "testsrc=s=320x180");

const run = (images: unknown[], extra: Record<string, unknown> = {}) => {
  writeFileSync(resolve(sourceDir, "IMAGE_QA.json"), JSON.stringify({version: 1, ...extra, images}));
  return runImageQa([videoId]);
};

const checks = (report: any, id: string) => report.images.find((item: any) => item.id === id).checks;

test("a flat image carries no information and is rejected", () => {
  const report = run([
    {id: "flat", path: flat, visualIdea: "empty", allowText: true},
    {id: "stripes", path: stripes, visualIdea: "detail", allowText: true},
  ]);
  assert.equal(checks(report, "flat").information, false);
  assert.equal(checks(report, "stripes").information, true);
  assert.equal(report.passed, false);
});

test("two images of the same frame are caught as near duplicates", () => {
  const report = run([
    {id: "first", path: stripes, visualIdea: "one idea", allowText: true},
    {id: "second", path: stripes, visualIdea: "another idea", allowText: true},
  ]);
  assert.equal(checks(report, "first").nearDuplicate, false);
  assert.equal(checks(report, "second").nearDuplicate, false);

  const distinct = run([
    {id: "first", path: stripes, visualIdea: "one idea", allowText: true},
    {id: "second", path: gradient, visualIdea: "another idea", allowText: true},
  ]);
  assert.equal(checks(distinct, "first").nearDuplicate, true);
  assert.equal(checks(distinct, "second").nearDuplicate, true);
});

test("showing the same visual idea twice is rejected even for different images", () => {
  const report = run([
    {id: "first", path: stripes, visualIdea: "geographic movement", allowText: true},
    {id: "second", path: gradient, visualIdea: "geographic movement", allowText: true},
  ]);
  assert.equal(checks(report, "first").repeatedIdea, false);
  assert.equal(checks(report, "second").repeatedIdea, false);
});

test("an image allowed to carry text is not read back", () => {
  const report = run([{id: "titled", path: stripes, visualIdea: "detail", allowText: true}]);
  assert.equal(checks(report, "titled").unwantedText, true);
  assert.equal(report.images[0].detectedText, "");
});

test("an image that must stay wordless is read back", () => {
  const wordless = run([{id: "wordless", path: stripes, visualIdea: "detail"}]);
  assert.equal(checks(wordless, "wordless").unwantedText, true);

  const lettered = image("lettered", "color=c=white:s=320x180,drawtext=text='ALEXANDRIA':fontcolor=black:fontsize=48:x=20:y=60");
  const report = run([{id: "lettered", path: lettered, visualIdea: "detail"}]);
  assert.equal(checks(report, "lettered").unwantedText, false, JSON.stringify(report.images[0]));
  assert.match(report.images[0].detectedText, /ALEXANDRIA/);
});

test("the report records every checked image and its verdict", () => {
  const report = run([{id: "stripes", path: stripes, visualIdea: "detail", allowText: true}]);
  assert.equal(report.videoId, videoId);
  assert.ok(report.checkedAt);
  assert.equal(report.passed, true);
  assert.equal(report.images[0].hash, undefined, "the perceptual hash is an implementation detail");
  const written = JSON.parse(readFileSync(resolve(root, "output", videoId, "image-qa-report.json"), "utf8"));
  assert.equal(written.images[0].id, "stripes");
});

test("a missing image is reported before any analysis", () => {
  assert.throws(() => run([{id: "ghost", path: `src/${videoId}/assets/ghost.png`, allowText: true}]), /Image not found/);
});

test("checking nothing is never reported as a pass", () => {
  // An empty list used to produce passed: true, which reaches the app and MCP as
  // a clean image QA verdict without an image having been looked at.
  assert.throws(() => run([]), /needs a non-empty images array/);
  writeFileSync(resolve(sourceDir, "IMAGE_QA.json"), JSON.stringify({version: 1}));
  assert.throws(() => runImageQa([videoId]), /needs a non-empty images array/);
});
