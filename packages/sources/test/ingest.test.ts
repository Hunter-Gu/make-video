import assert from "node:assert/strict";
import {mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync} from "node:fs";
import {tmpdir} from "node:os";
import {resolve} from "node:path";
import {after, test} from "node:test";

const root = mkdtempSync(resolve(tmpdir(), "make-video-sources-"));
process.env.MAKE_VIDEO_PROJECT_ROOT = root;
const {ingestSources} = await import("../src/ingest");
const {buildCatalog} = await import("../src/catalog");
const {buildSourceList} = await import("../src/list");

after(() => rmSync(root, {recursive: true, force: true}));

let counter = 0;
const project = (sources: unknown[], files: Record<string, string> = {}) => {
  const videoId = `sources-${counter += 1}`;
  const sourceDir = resolve(root, "src", videoId);
  mkdirSync(resolve(sourceDir, "documents"), {recursive: true});
  for (const [name, content] of Object.entries(files)) writeFileSync(resolve(sourceDir, "documents", name), content);
  writeFileSync(resolve(sourceDir, "video.config.json"), JSON.stringify({videoId, sources}));
  return {videoId, sourceDir, document: (name: string) => `src/${videoId}/documents/${name}`};
};

const readIndex = (sourceDir: string) => JSON.parse(readFileSync(resolve(sourceDir, "sources", "index.json"), "utf8"));

test("markdown is indexed paragraph by paragraph with stable locators", async () => {
  const fixture = project([{id: "brief", title: "The brief", input: "", rights: "original"}], {"brief.md": "# Title\n\nFirst paragraph.\n\nSecond\nparagraph continues.\n"});
  writeFileSync(resolve(fixture.sourceDir, "video.config.json"), JSON.stringify({videoId: fixture.videoId, sources: [{id: "brief", title: "The brief", input: fixture.document("brief.md"), rights: "original"}]}));
  await ingestSources(fixture.videoId, false);
  const index = readIndex(fixture.sourceDir);
  assert.equal(index.sources[0].type, "markdown");
  assert.equal(index.sources[0].rights, "original");
  assert.equal(index.sources[0].sha256.length, 64);
  assert.deepEqual(index.sources[0].blocks.map((block: any) => [block.id, block.locator, block.text]), [
    ["brief-1", "document:paragraph-1", "# Title"],
    ["brief-2", "document:paragraph-2", "First paragraph."],
    ["brief-3", "document:paragraph-3", "Second paragraph continues."],
  ]);
});

test("ingestion refuses unusable source declarations", async () => {
  const bad = project([{id: "Not Kebab", input: "missing.md"}]);
  await assert.rejects(() => ingestSources(bad.videoId, false), /unique kebab-case id/);
  const duplicated = project([], {"a.md": "A", "b.md": "B"});
  writeFileSync(resolve(duplicated.sourceDir, "video.config.json"), JSON.stringify({videoId: duplicated.videoId, sources: [{id: "one", input: duplicated.document("a.md")}, {id: "one", input: duplicated.document("b.md")}]}));
  await assert.rejects(() => ingestSources(duplicated.videoId, false), /Duplicate source id: one/);
  const missing = project([{id: "one", input: "src/nowhere/a.md"}]);
  await assert.rejects(() => ingestSources(missing.videoId, false), /Source not found/);
  const escaping = project([{id: "one", input: "../outside.md"}]);
  await assert.rejects(() => ingestSources(escaping.videoId, false), /escapes the project/);
  const unsupported = project([{id: "one", input: "a.mp3", type: "audio"}], {"a.mp3": "x"});
  writeFileSync(resolve(unsupported.sourceDir, "video.config.json"), JSON.stringify({videoId: unsupported.videoId, sources: [{id: "one", type: "audio", input: unsupported.document("a.mp3")}]}));
  await assert.rejects(() => ingestSources(unsupported.videoId, false), /Unsupported source type/);
  const none = project([]);
  await assert.rejects(() => ingestSources(none.videoId, false), /has no sources to ingest/);
});

test("an existing index is preserved unless regeneration was requested", async () => {
  const fixture = project([], {"brief.md": "Only paragraph."});
  writeFileSync(resolve(fixture.sourceDir, "video.config.json"), JSON.stringify({videoId: fixture.videoId, sources: [{id: "brief", input: fixture.document("brief.md")}]}));
  await ingestSources(fixture.videoId, false);
  await assert.rejects(() => ingestSources(fixture.videoId, false), /already exists/);
  await ingestSources(fixture.videoId, true);
  assert.equal(readIndex(fixture.sourceDir).sources[0].blocks.length, 1);
});

const catalogProject = async () => {
  const fixture = project([], {"brief.md": "Alexandria held many scrolls.\n\nIts decline was gradual."});
  writeFileSync(resolve(fixture.sourceDir, "video.config.json"), JSON.stringify({videoId: fixture.videoId, sources: [{id: "brief", input: fixture.document("brief.md"), rights: "original"}]}));
  await ingestSources(fixture.videoId, false);
  return fixture;
};

test("the catalog only accepts annotations the source actually supports", async () => {
  const fixture = await catalogProject();
  const annotations = resolve(fixture.sourceDir, "SOURCE_ANNOTATIONS.json");

  writeFileSync(annotations, JSON.stringify({entities: [{id: "alexandria", type: "settlement", name: "Alexandria", sourceBlockIds: ["brief-1"]}]}));
  assert.throws(() => buildCatalog(fixture.videoId, true), /invalid entity/);

  writeFileSync(annotations, JSON.stringify({entities: [{id: "alexandria", type: "place", name: "Alexandria", sourceBlockIds: ["brief-9"]}]}));
  assert.throws(() => buildCatalog(fixture.videoId, true), /invalid source blocks/);

  writeFileSync(annotations, JSON.stringify({quotations: [{id: "scrolls", text: "held countless scrolls", sourceBlockId: "brief-1"}]}));
  assert.throws(() => buildCatalog(fixture.videoId, true), /not verbatim in its source block/);

  writeFileSync(annotations, JSON.stringify({
    entities: [{id: "alexandria", type: "place", name: "Alexandria", sourceBlockIds: ["brief-1"]}],
    quotations: [{id: "scrolls", text: "held many scrolls", sourceBlockId: "brief-1"}],
  }));
  buildCatalog(fixture.videoId, true);
  const catalog = JSON.parse(readFileSync(resolve(fixture.sourceDir, "sources", "catalog.json"), "utf8"));
  assert.equal(catalog.entities.length, 1);
  assert.equal(catalog.quotations[0].id, "scrolls");
});

test("the source list names every indexed location and claim", async () => {
  const fixture = await catalogProject();
  writeFileSync(resolve(fixture.sourceDir, "SOURCE_ANNOTATIONS.json"), JSON.stringify({entities: [{id: "alexandria", type: "place", name: "Alexandria", sourceBlockIds: ["brief-1"]}]}));
  writeFileSync(resolve(fixture.sourceDir, "CLAIMS.json"), JSON.stringify({claims: [{id: "decline", type: "paraphrase", text: "The decline was gradual.", narrationIds: ["closing"], sourceBlockIds: ["brief-2"]}]}));
  buildCatalog(fixture.videoId, true);
  const content = buildSourceList(fixture.videoId, true);
  assert.match(content, /- `brief-1` — document:paragraph-1/);
  assert.match(content, /\*\*decline\*\* \(paraphrase\): The decline was gradual\./);
  assert.match(content, /\*\*Alexandria\*\* \(place\)/);
});
