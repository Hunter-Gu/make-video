import assert from "node:assert/strict";
import {mkdirSync, mkdtempSync, readFileSync, rmSync, utimesSync, writeFileSync} from "node:fs";
import {tmpdir} from "node:os";
import {resolve} from "node:path";
import {after, test} from "node:test";

const root = mkdtempSync(resolve(tmpdir(), "make-video-service-"));
process.env.MAKE_VIDEO_PROJECT_ROOT = root;
const service = await import("../src/service");

after(() => rmSync(root, {recursive: true, force: true}));

const sourceIndex = (videoId: string) => ({
  videoId,
  sources: [{id: "brief", title: "Brief", type: "markdown", origin: "fixture", rights: "original", blocks: [
    {id: "brief-1", locator: "document:paragraph-1", text: "Alexandria held many scrolls."},
    {id: "brief-2", locator: "document:paragraph-2", text: "Its decline was gradual."},
  ]}],
});

const plan = (values: Record<string, unknown> = {}) => ({
  version: 1,
  title: "A fixture",
  adaptationMode: "documentary",
  audience: "general",
  language: "en",
  durationSeconds: 60,
  sourceBlockIds: ["brief-1"],
  chapters: [{id: "chapter-1", title: "Opening", objective: "Introduce", sourceBlockIds: ["brief-1"], sceneIds: ["scene-1"]}],
  scenes: [{id: "scene-1", chapterId: "chapter-1", title: "Opening", type: "image", objective: "Introduce", sourceBlockIds: ["brief-1"], visualDirection: "A quiet library."}],
  ...values,
});

let counter = 0;
const project = () => {
  const videoId = `service-${counter += 1}`;
  const created = service.createProject({videoId, title: "Fixture", durationSeconds: 10, width: 1280, height: 720});
  const sourceDir = resolve(root, "src", videoId);
  mkdirSync(resolve(sourceDir, "sources"), {recursive: true});
  writeFileSync(resolve(sourceDir, "sources", "index.json"), JSON.stringify(sourceIndex(videoId)));
  return {videoId, sourceDir, created};
};

const readConfig = (sourceDir: string) => JSON.parse(readFileSync(resolve(sourceDir, "video.config.json"), "utf8"));

test("a new project is scaffolded with the files the pipeline reads", () => {
  const {videoId, sourceDir, created} = project();
  assert.deepEqual(created.composition, {id: created.composition.id, fps: 30, width: 1280, height: 720, durationInFrames: 300});
  assert.deepEqual(created.created.map((file) => file.replace(`src/${videoId}/`, "")), ["video.config.json", "SCENE_INDEX.json", "REMOTION_TIMELINE.json"]);
  assert.ok(service.listProjects().includes(videoId));
  const config = readConfig(sourceDir);
  assert.equal(config.production.publicPath, videoId);
  assert.equal(config.production.outputs.final, `output/${videoId}/final.mp4`);
  // Choosing a model is a cost decision, so scaffolding leaves it unset.
  assert.equal(config.imageGeneration.model, null);
  assert.equal(config.voice.model, null);
  assert.throws(() => service.createProject({videoId}), /already exists/);
});

test("a project id must be a kebab-case directory inside src/", () => {
  assert.throws(() => service.createProject({videoId: "Not Kebab"}), /Invalid video id/);
  assert.throws(() => service.createProject({videoId: "../escape"}), /Invalid video id/);
  assert.throws(() => service.createProject({videoId: "sized", width: 0}), /width must be a positive number/);
  assert.throws(() => service.createProject({seriesId: "a-series"}), /needs both seriesId and episodeId/);
});

test("an episode takes its title, runtime, and sources from a verified series", () => {
  const {videoId, sourceDir} = project();
  const seriesDir = resolve(root, "projects", "fixture-series");
  mkdirSync(seriesDir, {recursive: true});
  writeFileSync(resolve(seriesDir, "series-plan.json"), JSON.stringify({
    seriesId: "fixture-series",
    title: "Fixture series",
    sourceIndex: `src/${videoId}/sources/index.json`,
    omittedSourceBlockIds: ["brief-2"],
    episodes: [{id: "one", title: "A city of learning", question: "Why?", estimatedMinutes: 6, previous: null, next: null, topics: ["libraries"], sourceBlockIds: ["brief-1"], introduces: [], requires: [], timelineEventIds: [], positions: {}}],
  }));
  writeFileSync(resolve(seriesDir, "SERIES_BIBLE.json"), JSON.stringify({
    version: 1,
    adaptation: {mode: "series", wordsPerMinute: 140},
    rights: {status: "public domain", intendedUse: "commentary"},
    sharedFiles: {},
    canonicalPositions: {},
    timeline: [],
    terms: [],
  }));
  writeFileSync(resolve(sourceDir, "video.config.json"), JSON.stringify({
    ...readConfig(sourceDir),
    sources: [{id: "brief", title: "Brief", input: `src/${videoId}/sources/brief.md`, rights: "original"}],
  }, null, 2));

  const episode = service.createProject({seriesId: "fixture-series", episodeId: "one"});
  assert.equal(episode.videoId, "fixture-series-one");
  assert.equal(episode.title, "A city of learning");
  assert.equal(episode.composition.durationInFrames, 6 * 60 * 30);
  assert.deepEqual(episode.series, {seriesId: "fixture-series", episodeId: "one"});
  const episodeDir = resolve(root, "src", "fixture-series-one");
  assert.deepEqual(readConfig(episodeDir).sources[0].id, "brief");
  assert.deepEqual(JSON.parse(readFileSync(resolve(episodeDir, "SERIES_EPISODE.json"), "utf8")), {
    version: 1, seriesId: "fixture-series", episodeId: "one", question: "Why?", topics: ["libraries"], sourceBlockIds: ["brief-1"],
  });

  assert.throws(() => service.createProject({seriesId: "fixture-series", episodeId: "missing"}), /has no episode "missing"/);
});

test("an episode of a broken series is not scaffolded", () => {
  const seriesDir = resolve(root, "projects", "broken-series");
  mkdirSync(seriesDir, {recursive: true});
  writeFileSync(resolve(seriesDir, "series-plan.json"), JSON.stringify({seriesId: "broken-series", title: "Broken", sourceIndex: "src/nowhere/index.json", episodes: [{id: "one", title: "One", question: "Why?", estimatedMinutes: 5, previous: null, next: null}]}));
  writeFileSync(resolve(seriesDir, "SERIES_BIBLE.json"), JSON.stringify({version: 1, adaptation: {mode: "series", wordsPerMinute: 140}, rights: {status: "original", intendedUse: "test"}}));
  assert.throws(() => service.createProject({seriesId: "broken-series", episodeId: "one"}), /does not verify/);
});

test("a plan is rejected unless every reference resolves", () => {
  const {videoId} = project();
  assert.throws(() => service.savePlan(videoId, plan({version: 2})), /needs version 1 and a title/);
  assert.throws(() => service.savePlan(videoId, plan({adaptationMode: "vlog"})), /metadata is invalid/);
  assert.throws(() => service.savePlan(videoId, plan({sourceBlockIds: ["brief-9"]})), /sourceBlockIds contains an unknown source block/);
  assert.throws(() => service.savePlan(videoId, plan({scenes: [{...plan().scenes[0], type: "explainer"}]})), /invalid scene/);
  assert.throws(() => service.savePlan(videoId, plan({scenes: [{...plan().scenes[0], chapterId: "chapter-9"}]})), /invalid scene/);
  assert.throws(() => service.savePlan(videoId, plan({chapters: [{...plan().chapters[0], sceneIds: ["scene-9"]}]})), /invalid scene reference/);
  assert.equal(service.savePlan(videoId, plan()).title, "A fixture");
  assert.equal(service.getPlan(videoId)?.scenes[0].id, "scene-1");
});

test("prepared image assets request the composition's aspect ratio once per scene", () => {
  const {videoId, sourceDir} = project();
  service.savePlan(videoId, plan());
  const prepared = service.prepareGeneration(videoId);
  assert.deepEqual(prepared.preparedSceneIds, ["scene-1"]);
  const [asset] = readConfig(sourceDir).imageGeneration.assets;
  assert.deepEqual(asset, {id: "scene-1", sceneIds: ["scene-1"], prompt: "A quiet library.", aspectRatio: "16:9", output: "images/generated/scene-1.png"});
  service.prepareGeneration(videoId);
  assert.equal(readConfig(sourceDir).imageGeneration.assets.length, 1);
});

test("readiness counts configured video shots as assigned media", () => {
  const {videoId, sourceDir} = project();
  service.savePlan(videoId, plan({scenes: [{id: "scene-1", chapterId: "chapter-1", title: "Motion", type: "video", objective: "Show motion", sourceBlockIds: ["brief-1"]}]}));
  writeFileSync(resolve(sourceDir, "SCRIPT.md"), "# Narration\n\n- `narration-1`: Alexandria held many scrolls.\n");

  const withoutMedia = service.checkGenerationReadiness(videoId);
  assert.ok(withoutMedia.warnings.some((warning) => warning.includes("scene-1 has no configured generated media")), withoutMedia.warnings.join(" "));
  assert.ok(withoutMedia.errors.includes("voice.model is missing."));

  writeFileSync(resolve(sourceDir, "video.config.json"), JSON.stringify({
    ...readConfig(sourceDir),
    videoGeneration: {model: "veo-3.1-generate-preview", assets: [{id: "scene-1", sceneIds: ["scene-1"], prompt: "A slow pan", output: "video/generated/scene-1.mp4"}]},
    voice: {model: "gemini-2.5-flash-preview-tts", voiceName: "Kore"},
  }, null, 2));
  const readiness = service.checkGenerationReadiness(videoId);
  assert.equal(readiness.warnings.some((warning) => warning.includes("no configured generated media")), false, readiness.warnings.join(" "));
  assert.deepEqual(readiness.generation.assignedScenes, ["scene-1"]);
  assert.equal(readiness.generation.videoAssets, 1);
  assert.equal(readiness.passed, true, readiness.errors.join(" "));
});

test("a narration script must have unique, non-empty, source-backed segments", () => {
  const {videoId, sourceDir} = project();
  writeFileSync(resolve(sourceDir, "SCRIPT.md"), "# Narration\n\n- `one`: First.\n- `one`: Repeated.\n");
  assert.ok(service.validateScript(videoId).errors.some((error) => error.includes("Duplicate narration id: one")));

  writeFileSync(resolve(sourceDir, "SCRIPT.md"), "# Narration\n");
  assert.ok(service.validateScript(videoId).errors.includes("SCRIPT.md has no narration segments."));

  writeFileSync(resolve(sourceDir, "SCRIPT.md"), "# Narration\n\n- `one`: First.\n");
  writeFileSync(resolve(sourceDir, "CLAIMS.json"), JSON.stringify({claims: [
    {id: "ghost", type: "paraphrase", narrationIds: ["two"], sourceBlockIds: ["brief-1"]},
    {id: "unsourced", type: "paraphrase", narrationIds: ["one"], sourceBlockIds: ["brief-9"]},
    {id: "guess", type: "inference", narrationIds: ["one"], sourceBlockIds: ["brief-1"]},
  ]}));
  const validation = service.validateScript(videoId);
  assert.ok(validation.errors.some((error) => error.includes("missing narration: two")));
  assert.ok(validation.errors.some((error) => error.includes("missing source block: brief-9")));
  assert.ok(validation.errors.some((error) => error.includes("Inference claim guess needs a disclosure")));
});

test("an unknown job id says why it is unknown", () => {
  assert.throws(() => service.getQaJob("missing"), /QA job not found: missing\. Job state is kept in memory/);
  assert.throws(() => service.getRenderJob("missing"), /Render job not found/);
  assert.throws(() => service.getDeliveryJob("missing"), /Delivery job not found/);
});

test("build status names the inputs an output is behind", () => {
  const {videoId, sourceDir} = project();
  const finalFile = resolve(root, "output", videoId, "final.mp4");
  mkdirSync(resolve(root, "output", videoId), {recursive: true});
  writeFileSync(finalFile, "rendered");

  const fresh = service.getBuildStatus(videoId);
  assert.equal(fresh.upToDate, true);
  assert.deepEqual(fresh.stale, []);
  assert.ok(fresh.missing.includes("still") && fresh.missing.includes("silent"));
  assert.ok(fresh.inputs.some((input) => input.path === `src/${videoId}/video.config.json`));

  const later = Date.now() / 1000 + 60;
  utimesSync(resolve(sourceDir, "SCENE_INDEX.json"), later, later);
  const stale = service.getBuildStatus(videoId);
  assert.equal(stale.upToDate, false);
  assert.deepEqual(stale.stale, ["final"]);
  assert.deepEqual(stale.outputs.find((output) => output.id === "final")?.staleInputs, [`src/${videoId}/SCENE_INDEX.json`]);
});

test("build status covers declared delivery variants and their translations", () => {
  const {videoId, sourceDir} = project();
  mkdirSync(resolve(sourceDir, "translations"), {recursive: true});
  writeFileSync(resolve(sourceDir, "translations", "zh.json"), JSON.stringify({captions: {}}));
  writeFileSync(resolve(sourceDir, "DELIVERABLES.json"), JSON.stringify({version: 1, variants: [
    {id: "zh-captioned", kind: "video", translation: `src/${videoId}/translations/zh.json`, output: `output/${videoId}/zh.mp4`},
  ]}));
  mkdirSync(resolve(root, "output", videoId), {recursive: true});
  const delivered = resolve(root, "output", videoId, "zh.mp4");
  writeFileSync(delivered, "delivered");

  assert.deepEqual(service.getBuildStatus(videoId).stale, []);
  const later = Date.now() / 1000 + 60;
  utimesSync(resolve(sourceDir, "translations", "zh.json"), later, later);
  const status = service.getBuildStatus(videoId);
  assert.deepEqual(status.stale, ["zh-captioned"]);
  assert.deepEqual(status.outputs.find((output) => output.id === "zh-captioned")?.staleInputs, [`src/${videoId}/translations/zh.json`]);
});
