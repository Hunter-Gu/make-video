import assert from "node:assert/strict";
import {mkdirSync, mkdtempSync, rmSync, writeFileSync} from "node:fs";
import {tmpdir} from "node:os";
import {resolve} from "node:path";
import {after, test} from "node:test";

const root = mkdtempSync(resolve(tmpdir(), "make-video-project-"));
process.env.MAKE_VIDEO_PROJECT_ROOT = root;
const {
  assertOutputsAvailable,
  insideProject,
  parseTargetArgs,
  projectRoot,
  readJsonFile,
  readProjectConfig,
  requireObject,
  resolveInsideProject,
  resolvePublicDir,
} = await import("../src/index");

after(() => rmSync(root, {recursive: true, force: true}));

// A sibling directory whose name starts with the project's own: the case a naive
// "does the resolved path start with the root string" check lets through.
const sibling = `${root}-secrets`;
mkdirSync(sibling, {recursive: true});
after(() => rmSync(sibling, {recursive: true, force: true}));

test("a configured path stays inside the project", () => {
  assert.equal(resolveInsideProject("src/a/video.config.json", "Config"), resolve(root, "src/a/video.config.json"));
  assert.equal(resolveInsideProject("src/a/../b/x.png", "Asset"), resolve(root, "src/b/x.png"), "a path that ends up inside is allowed however it is written");
});

test("a configured path cannot reach the rest of the disk", () => {
  const reject = (value: unknown, pattern: RegExp) => assert.throws(() => resolveInsideProject(value, "Asset"), pattern);
  reject("/etc/passwd", /must not be absolute/);
  reject("../outside.png", /escapes the project/);
  reject("src/../../outside.png", /escapes the project/);
  reject(`../${resolve(sibling).split("/").pop()}/key.txt`, /escapes the project/);
  reject("", /must be a non-empty project-relative path/);
  reject(undefined, /must be a non-empty project-relative path/);
  reject(42, /must be a non-empty project-relative path/);
  reject({}, /must be a non-empty project-relative path/);
});

test("containment is decided by path, not by string prefix", () => {
  assert.equal(insideProject(root, resolve(root, "public/a.png")), true);
  assert.equal(insideProject(root, root), true);
  assert.equal(insideProject(root, resolve(sibling, "a.png")), false, "a sibling whose name starts with the root is outside it");
  assert.equal(insideProject(root, resolve(root, "..")), false);
});

test("runtime media may not escape public/", () => {
  assert.equal(resolvePublicDir(undefined, "alexandria"), resolve(root, "public/alexandria"));
  assert.equal(resolvePublicDir({publicPath: "nested/here"}, "alexandria"), resolve(root, "public/nested/here"));
  assert.throws(() => resolvePublicDir({publicPath: "../src"}, "alexandria"), /must stay inside public\//);
  assert.throws(() => resolvePublicDir({publicPath: "/tmp"}, "alexandria"), /must stay inside public\//);
  assert.throws(() => resolvePublicDir({publicPath: 7}, "alexandria"), /must be a string/);
});

test("a video id names a directory and nothing else", () => {
  for (const id of ["../escape", "Upper", "with space", "with/slash", "trailing-", "dot.dot", ""]) {
    assert.throws(() => readProjectConfig(id), /Invalid video id/, id);
  }
  assert.throws(() => readProjectConfig("missing"), /Video config not found/);
});

const project = (videoId: string, config: unknown) => {
  const sourceDir = resolve(root, "src", videoId);
  mkdirSync(sourceDir, {recursive: true});
  writeFileSync(resolve(sourceDir, "video.config.json"), typeof config === "string" ? config : JSON.stringify(config));
  return sourceDir;
};

test("a config that names a different project is not loaded for this one", () => {
  project("mismatched", {videoId: "something-else"});
  assert.throws(() => readProjectConfig("mismatched"), /declares videoId "something-else" but directory target is "mismatched"/);

  const sourceDir = project("matching", {videoId: "matching", title: "Fine"});
  const loaded = readProjectConfig("matching");
  assert.equal(loaded.config.title, "Fine");
  assert.equal(loaded.sourceDir, sourceDir);
});

test("unreadable JSON names the file it came from", () => {
  project("broken", '{"videoId": "broken",}');
  // Node's own message says only "position 21", which is useless in a project
  // holding a dozen JSON files.
  assert.throws(() => readProjectConfig("broken"), /src\/broken\/video\.config\.json is not valid JSON/);

  const file = resolve(root, "src", "broken", "IMAGE_QA.json");
  writeFileSync(file, "not json at all");
  assert.throws(() => readJsonFile(file), /src\/broken\/IMAGE_QA\.json is not valid JSON/);
  writeFileSync(file, '{"images": []}');
  assert.deepEqual(readJsonFile(file), {images: []});
});

test("an object is required where a document is expected", () => {
  assert.deepEqual(requireObject({a: 1}, "Plan"), {a: 1});
  for (const value of [null, undefined, [], "text", 3]) assert.throws(() => requireObject(value, "Plan"), /Plan must be an object/);
});

test("a command targets exactly one video", () => {
  assert.deepEqual(parseTargetArgs(["alexandria"]), {videoId: "alexandria", force: false});
  assert.deepEqual(parseTargetArgs(["alexandria", "--force"]), {videoId: "alexandria", force: true});
  assert.throws(() => parseTargetArgs([]), /Exactly one video id is required/);
  assert.throws(() => parseTargetArgs(["one", "two"]), /Exactly one video id is required/);
  assert.throws(() => parseTargetArgs(["alexandria", "--all"]), /Unknown option: --all/);
});

test("existing output is never replaced unless it was asked for", () => {
  const present = resolve(root, "output.mp4");
  writeFileSync(present, "rendered");
  const absent = resolve(root, "absent.mp4");
  assert.doesNotThrow(() => assertOutputsAvailable([absent], false, "Render"));
  assert.doesNotThrow(() => assertOutputsAvailable([present], true, "Render"), "force is the explicit request");
  assert.throws(() => assertOutputsAvailable([absent, present], false, "Render"), /Render stopped because generated output already exists/);
});

test("the project root comes from the environment", () => {
  assert.equal(projectRoot, resolve(root));
});
