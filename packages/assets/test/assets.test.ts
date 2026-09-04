import assert from "node:assert/strict";
import {mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, statSync, symlinkSync, writeFileSync} from "node:fs";
import {tmpdir} from "node:os";
import {resolve} from "node:path";
import {after, test} from "node:test";

const root = mkdtempSync(resolve(tmpdir(), "make-video-assets-"));
process.env.MAKE_VIDEO_PROJECT_ROOT = root;
const {createProject} = await import("../src/create");
const {linkAssets} = await import("../src/link");

after(() => rmSync(root, {recursive: true, force: true}));

let counter = 0;
/** A project whose one asset link points at a canonical source under src/. */
const linked = (contents = "canonical") => {
  const videoId = `assets-${counter += 1}`;
  const created = createProject({videoId, title: "Linked"});
  const sourceDir = resolve(root, "src", videoId);
  mkdirSync(resolve(sourceDir, "media"), {recursive: true});
  const source = resolve(sourceDir, "media", "map.svg");
  writeFileSync(source, contents);
  const config = JSON.parse(readFileSync(resolve(sourceDir, "video.config.json"), "utf8"));
  config.production.assetLinks = [{source: `src/${videoId}/media/map.svg`, output: "images/map.svg"}];
  writeFileSync(resolve(sourceDir, "video.config.json"), JSON.stringify(config, null, 2));
  return {videoId, source, output: resolve(root, "public", videoId, "images", "map.svg"), created};
};

test("a scaffolded project writes only the files the pipeline reads", () => {
  const videoId = "scaffolded";
  const created = createProject({videoId, title: "Scaffolded", durationSeconds: 90, fps: 25});
  assert.deepEqual(created.created.map((file) => file.replace(`src/${videoId}/`, "")), ["video.config.json", "SCENE_INDEX.json", "REMOTION_TIMELINE.json"]);
  assert.deepEqual(created.composition, {id: "Scaffolded", fps: 25, width: 1920, height: 1080, durationInFrames: 2250});

  const config = JSON.parse(readFileSync(resolve(root, "src", videoId, "video.config.json"), "utf8"));
  assert.equal(config.imageGeneration.model, null, "choosing a model is a cost decision, not a default");
  assert.equal(config.voice.model, null);
  assert.throws(() => createProject({videoId, title: "Again"}), /already exists/);
  assert.throws(() => createProject({videoId: "Not Kebab"}), /Invalid video id/);
  assert.throws(() => createProject({videoId: "bad-duration", durationSeconds: 0}), /durationSeconds must be a positive number/);
});

test("a public asset is a hard link to its canonical source", () => {
  const {videoId, source, output} = linked();
  linkAssets(videoId);
  assert.equal(statSync(output).ino, statSync(source).ino, "the same file, not a copy");

  // Editing the canonical source in place is visible through the link, so a
  // second run has nothing to do.
  writeFileSync(source, "canonical, revised");
  linkAssets(videoId);
  assert.equal(readFileSync(output, "utf8"), "canonical, revised");
});

test("replacing a source asset is recoverable, and only when asked for", () => {
  const {videoId, source, output} = linked();
  linkAssets(videoId);

  // Tools replace files by writing a temp and renaming over it, which gives the
  // source a new inode and leaves the public copy holding the old bytes.
  const temporary = `${source}.tmp`;
  writeFileSync(temporary, "replaced wholesale");
  renameSync(temporary, source);
  assert.notEqual(statSync(output).ino, statSync(source).ino);

  assert.throws(() => linkAssets(videoId), /does not match the configured canonical source.*Pass --force/s);
  assert.equal(readFileSync(output, "utf8"), "canonical", "a public file is never replaced silently");

  linkAssets(videoId, true);
  assert.equal(readFileSync(output, "utf8"), "replaced wholesale");
  assert.equal(statSync(output).ino, statSync(source).ino);
});

test("a symlink at a managed output is replaced by the real link", () => {
  const {videoId, source, output} = linked();
  mkdirSync(resolve(output, ".."), {recursive: true});
  symlinkSync(source, output);
  linkAssets(videoId);
  assert.equal(statSync(output).ino, statSync(source).ino);
});

test("an asset link may not reach outside the project or the public directory", () => {
  const reject = (link: Record<string, unknown>, pattern: RegExp) => {
    const {videoId} = linked();
    const configPath = resolve(root, "src", videoId, "video.config.json");
    const config = JSON.parse(readFileSync(configPath, "utf8"));
    config.production.assetLinks = [link];
    writeFileSync(configPath, JSON.stringify(config, null, 2));
    assert.throws(() => linkAssets(videoId), pattern);
  };
  reject({source: "../outside.svg", output: "images/map.svg"}, /escapes the project/);
  reject({source: "/etc/hosts", output: "images/map.svg"}, /must not be absolute/);
  reject({source: "src/missing.svg", output: "images/map.svg"}, /Canonical source asset not found/);
  reject({source: "package.json", output: "../../escape.json"}, /must stay inside the video's public directory/);
  reject({source: "package.json", output: ""}, /output must be a non-empty string/);
  reject({source: "package.json"}, /output must be a non-empty string/);
});
