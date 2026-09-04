import assert from "node:assert/strict";
import {mkdirSync, mkdtempSync, writeFileSync} from "node:fs";
import {tmpdir} from "node:os";
import {resolve} from "node:path";
import {after, test} from "node:test";
import {rmSync} from "node:fs";

const root = mkdtempSync(resolve(tmpdir(), "make-video-series-"));
process.env.MAKE_VIDEO_PROJECT_ROOT = root;
const {verifySeries} = await import("../src/verify");
const {buildSeriesCoverage} = await import("../src/coverage");
const {listSeriesProjects} = await import("../src/context");

after(() => rmSync(root, {recursive: true, force: true}));

const sourceIndex = "src/book/sources/index.json";
mkdirSync(resolve(root, "src", "book", "sources"), {recursive: true});
writeFileSync(resolve(root, sourceIndex), JSON.stringify({
  videoId: "book",
  sources: [{id: "book", blocks: [
    {id: "book-1", locator: "p1", text: "one two three four five"},
    {id: "book-2", locator: "p2", text: "six seven eight"},
    {id: "book-3", locator: "p3", text: "nine ten"},
  ]}],
}));

const episode = (values: Record<string, unknown>) => ({
  question: "Why?",
  estimatedMinutes: 5,
  previous: null,
  next: null,
  topics: [],
  sourceBlockIds: [],
  introduces: [],
  requires: [],
  timelineEventIds: [],
  positions: {},
  ...values,
});

const bible = (values: Record<string, unknown> = {}) => ({
  version: 1,
  adaptation: {mode: "series", wordsPerMinute: 140},
  rights: {status: "public domain", intendedUse: "commentary"},
  sharedFiles: {},
  canonicalPositions: {"destruction-model": "gradual"},
  timeline: [{id: "first", order: 1}, {id: "second", order: 2}, {id: "third", order: 3}],
  terms: [],
  ...values,
});

let counter = 0;
const writeSeries = (plan: Record<string, unknown>, bibleValues: Record<string, unknown> = {}) => {
  const seriesId = `series-${counter += 1}`;
  const dir = resolve(root, "projects", seriesId);
  mkdirSync(dir, {recursive: true});
  writeFileSync(resolve(dir, "series-plan.json"), JSON.stringify({seriesId, title: "A series", sourceIndex, ...plan}));
  writeFileSync(resolve(dir, "SERIES_BIBLE.json"), JSON.stringify(bible(bibleValues)));
  return seriesId;
};

test("a coherent plan verifies and reports its coverage", () => {
  const seriesId = writeSeries({
    sharedSourceBlockIds: [],
    omittedSourceBlockIds: ["book-3"],
    episodes: [
      episode({id: "one", title: "One", next: "two", sourceBlockIds: ["book-1"], introduces: ["thesis"], timelineEventIds: ["first"]}),
      episode({id: "two", title: "Two", previous: "one", sourceBlockIds: ["book-2"], requires: ["thesis"], timelineEventIds: ["second", "third"]}),
    ],
  });
  const verification = verifySeries(seriesId);
  assert.equal(verification.passed, true, verification.errors.join(" "));
  assert.equal(verification.coverage?.episodes, 2);
  assert.equal(verification.coverage?.totalBlocks, 3);
  assert.equal(verification.coverage?.assignedBlocks, 2);
  assert.equal(verification.coverage?.omittedBlocks, 1);
  assert.deepEqual(verification.coverage?.unassignedBlockIds, []);
  assert.equal(verification.coverage?.rights.status, "public domain");
});

test("episode ordering must match the array order", () => {
  const seriesId = writeSeries({
    episodes: [
      episode({id: "one", title: "One", next: null, sourceBlockIds: ["book-1"]}),
      episode({id: "two", title: "Two", previous: null, sourceBlockIds: ["book-2"]}),
    ],
  });
  const verification = verifySeries(seriesId);
  assert.equal(verification.passed, false);
  assert.ok(verification.errors.some((error) => error.includes("Episode one next must be two")), verification.errors.join(" "));
  assert.ok(verification.errors.some((error) => error.includes("Episode two previous must be one")), verification.errors.join(" "));
});

test("a source block used twice must be declared shared", () => {
  const plan = {
    episodes: [
      episode({id: "one", title: "One", next: "two", sourceBlockIds: ["book-1"]}),
      episode({id: "two", title: "Two", previous: "one", sourceBlockIds: ["book-1"]}),
    ],
  };
  assert.ok(verifySeries(writeSeries(plan)).errors.some((error) => error.includes("repeated by episodes one, two")));
  assert.equal(verifySeries(writeSeries({...plan, sharedSourceBlockIds: ["book-1"]})).errors.some((error) => error.includes("repeated")), false);
});

test("an idea cannot be required before an earlier episode introduces it", () => {
  const seriesId = writeSeries({
    episodes: [
      episode({id: "one", title: "One", next: "two", sourceBlockIds: ["book-1"], requires: ["thesis"]}),
      episode({id: "two", title: "Two", previous: "one", sourceBlockIds: ["book-2"], introduces: ["thesis"]}),
    ],
  });
  assert.ok(verifySeries(seriesId).errors.some((error) => error.includes('requires "thesis"')));
});

test("chronology regressions fail unless the episode declares a flashback", () => {
  const episodes = [
    episode({id: "one", title: "One", next: "two", sourceBlockIds: ["book-1"], timelineEventIds: ["second", "third"]}),
    episode({id: "two", title: "Two", previous: "one", sourceBlockIds: ["book-2"], timelineEventIds: ["first"]}),
  ];
  const strict = verifySeries(writeSeries({episodes}));
  assert.equal(strict.passed, false);
  assert.ok(strict.errors.some((error) => error.includes("returns to timeline events")), strict.errors.join(" "));

  const flashback = verifySeries(writeSeries({episodes: [episodes[0], {...episodes[1], outOfOrderTimeline: true}]}));
  assert.equal(flashback.errors.some((error) => error.includes("returns to timeline events")), false, flashback.errors.join(" "));
  assert.ok(flashback.warnings.some((warning) => warning.includes("deliberate flashback")));
});

test("an episode cannot contradict a canonical series position", () => {
  const seriesId = writeSeries({
    episodes: [episode({id: "one", title: "One", sourceBlockIds: ["book-1", "book-2", "book-3"], positions: {"destruction-model": "single-fire"}})],
  });
  assert.ok(verifySeries(seriesId).errors.some((error) => error.includes("contradicts the series position")));
});

test("missing shared bibles and unknown pronunciation entries fail", () => {
  const seriesId = writeSeries(
    {episodes: [episode({id: "one", title: "One", sourceBlockIds: ["book-1", "book-2", "book-3"]})]},
    {sharedFiles: {characters: "projects/missing/CHARACTERS.json"}, terms: [{id: "ptolemy", canonical: "Ptolemy", pronunciationId: "unknown"}]},
  );
  const verification = verifySeries(seriesId);
  assert.ok(verification.errors.some((error) => error.includes("Shared characters bible not found")), verification.errors.join(" "));
  assert.ok(verification.errors.some((error) => error.includes("unknown pronunciation entry")), verification.errors.join(" "));
});

test("rights must be recorded before a series verifies", () => {
  const seriesId = writeSeries({episodes: [episode({id: "one", title: "One", sourceBlockIds: ["book-1", "book-2", "book-3"]})]}, {rights: {}});
  assert.ok(verifySeries(seriesId).errors.some((error) => error.includes("rights.status is required")));
});

test("over-compressed runtimes warn instead of passing silently", () => {
  const seriesId = writeSeries(
    {episodes: [episode({id: "one", title: "One", estimatedMinutes: 1, sourceBlockIds: ["book-1", "book-2", "book-3"]})]},
    {adaptation: {mode: "series", wordsPerMinute: 1}},
  );
  const verification = verifySeries(seriesId);
  assert.equal(verification.passed, true, verification.errors.join(" "));
  assert.equal(verification.coverage?.sourceWords, 10);
  assert.equal(verification.coverage?.narrationCapacityWords, 1);
  assert.equal(verification.coverage?.compressionRatio, 10);
  assert.ok(verification.warnings.some((warning) => warning.includes("state what the series omits")));
});

test("a runtime that carries no narration at all is rejected", () => {
  const seriesId = writeSeries(
    {episodes: [episode({id: "one", title: "One", estimatedMinutes: 0.001, sourceBlockIds: ["book-1", "book-2", "book-3"]})]},
    {adaptation: {mode: "series", wordsPerMinute: 1}},
  );
  assert.ok(verifySeries(seriesId).errors.some((error) => error.includes("carry no narration words")));
});

test("coverage records what each episode uses and what stays out", () => {
  const seriesId = writeSeries({
    omittedSourceBlockIds: ["book-3"],
    episodes: [
      episode({id: "one", title: "One", next: "two", sourceBlockIds: ["book-1"], introduces: ["thesis"]}),
      episode({id: "two", title: "Two", previous: "one", sourceBlockIds: ["book-2"], requires: ["thesis"]}),
    ],
  });
  const coverage = buildSeriesCoverage(seriesId, true);
  assert.match(coverage.content, /Source blocks assigned: 2\/3/);
  assert.match(coverage.content, /Intentionally omitted source blocks/);
  assert.match(coverage.content, /Introduces: thesis/);
  assert.throws(() => buildSeriesCoverage(seriesId, false), /already exists/);
  assert.ok(listSeriesProjects().includes(seriesId));
});

test("coverage refuses to describe a series that does not verify", () => {
  const seriesId = writeSeries({episodes: [episode({id: "one", title: "One", next: "ghost", sourceBlockIds: ["book-1", "book-2", "book-3"]})]});
  assert.throws(() => buildSeriesCoverage(seriesId, true), /does not verify/);
});

test("an unusable timeline event is rejected, not quietly skipped", () => {
  // A NaN order makes every chronology comparison false, so one malformed event
  // used to switch the check off for the whole series and verify clean.
  const seriesId = writeSeries({
    episodes: [
      episode({id: "one", title: "One", next: "two", sourceBlockIds: ["book-1"], timelineEventIds: ["third"]}),
      episode({id: "two", title: "Two", previous: "one", next: "three", sourceBlockIds: ["book-2"], timelineEventIds: ["broken"]}),
      episode({id: "three", title: "Three", previous: "two", sourceBlockIds: ["book-3"], timelineEventIds: ["first"]}),
    ],
  }, {timeline: [{id: "first", order: 1}, {id: "broken", label: "no order at all"}, {id: "third", order: 3}]});
  const report = verifySeries(seriesId);

  assert.equal(report.passed, false);
  assert.ok(report.errors.some((error) => /timeline\[1\] needs an id and a numeric order/.test(error)), report.errors.join(" "));
  assert.ok(report.errors.some((error) => /Episode three returns to timeline events already covered by one/.test(error)), "the regression the broken event was hiding");

  const duplicated = writeSeries({episodes: [episode({id: "one", title: "One", sourceBlockIds: ["book-1", "book-2", "book-3"]})]},
    {timeline: [{id: "first", order: 1}, {id: "first", order: 2}]});
  assert.ok(verifySeries(duplicated).errors.some((error) => /Duplicate series timeline event: first/.test(error)));
});
