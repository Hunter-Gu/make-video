import {existsSync, readFileSync, writeFileSync} from "node:fs";
import {relative, resolve, sep} from "node:path";

import {projectRoot} from "./video-context.mjs";

const args = process.argv.slice(2);
if (args.length !== 1 || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(args[0])) {
  throw new Error("Exactly one kebab-case series id is required.");
}
const seriesId = args[0];
const projectDir = resolve(projectRoot, "projects", seriesId);
const planFile = resolve(projectDir, "series-plan.json");
if (!existsSync(planFile)) throw new Error(`Series plan not found: ${planFile}`);
const plan = JSON.parse(readFileSync(planFile, "utf8"));
if (plan.seriesId !== seriesId || !Array.isArray(plan.episodes) || plan.episodes.length === 0) {
  throw new Error("Series plan needs a matching seriesId and episodes.");
}

const sourceIndexFile = resolve(projectRoot, plan.sourceIndex);
const relativeSource = relative(projectRoot, sourceIndexFile);
if (relativeSource === ".." || relativeSource.startsWith(`..${sep}`) || !existsSync(sourceIndexFile)) {
  throw new Error("Series sourceIndex must be an existing project-relative path.");
}
const sourceIndex = JSON.parse(readFileSync(sourceIndexFile, "utf8"));
const availableBlocks = new Set((sourceIndex.sources ?? []).flatMap((/** @type {any} */ source) => (source.blocks ?? []).map((/** @type {any} */ block) => block.id)));
const sourceWordCount = (sourceIndex.sources ?? []).flatMap((/** @type {any} */ source) => source.blocks ?? []).reduce((/** @type {number} */ sum, /** @type {any} */ block) => sum + block.text.trim().split(/\s+/).length, 0);
const bibleFile = resolve(projectDir, "SERIES_BIBLE.json");
if (!existsSync(bibleFile)) throw new Error("Series bible not found: " + bibleFile);
const bible = JSON.parse(readFileSync(bibleFile, "utf8"));
const sharedBlocks = new Set(plan.sharedSourceBlockIds ?? []);
const errors = [];
const episodeIds = new Set();
const usedBlocks = new Map();
const usedTopics = new Map();
const introducedIdeas = new Set();
const allowedModes = new Set(["overview", "chapter-focus", "documentary", "series"]);
if (!allowedModes.has(bible.adaptation?.mode) || !bible.adaptation?.wordsPerMinute) errors.push("Series bible needs an adaptation mode and wordsPerMinute.");
if (!bible.rights?.status || bible.rights.status === "unspecified" || !bible.rights?.intendedUse) errors.push("Series rights status and intended use must be explicit.");
for (const file of Object.values(bible.sharedFiles ?? {})) {
  const sharedFile = resolve(projectRoot, /** @type {string} */ (file));
  const relativeFile = relative(projectRoot, sharedFile);
  if (relativeFile === ".." || relativeFile.startsWith(".." + sep) || !existsSync(sharedFile)) errors.push("Shared bible file is missing or outside the project: " + file);
}
const positions = new Map(Object.entries(bible.canonicalPositions ?? {}));
const timelineEvents = new Map((bible.timeline ?? []).map((/** @type {any} */ event) => [event.id, event]));
for (const event of timelineEvents.values()) {
  if (!event.sourceBlockIds?.length || event.sourceBlockIds.some((/** @type {string} */ id) => !availableBlocks.has(id))) errors.push("Series timeline has invalid source blocks: " + event.id);
}
const pronunciationPath = bible.sharedFiles?.pronunciation ? resolve(projectRoot, bible.sharedFiles.pronunciation) : null;
const pronunciationIds = pronunciationPath && existsSync(pronunciationPath)
  ? new Set((JSON.parse(readFileSync(pronunciationPath, "utf8")).entries ?? []).map((/** @type {any} */ entry) => entry.id))
  : new Set();
for (const term of bible.terms ?? []) if (!term.id || !term.canonical || !pronunciationIds.has(term.pronunciationId)) errors.push("Series term has no pronunciation entry: " + (term.id ?? "unknown"));

for (let index = 0; index < plan.episodes.length; index += 1) {
  const episode = plan.episodes[index];
  if (!Number.isFinite(episode.estimatedMinutes) || episode.estimatedMinutes <= 0) errors.push(episode.id + " needs a positive estimated runtime.");
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(episode.id) || episodeIds.has(episode.id)) errors.push(`Invalid or duplicate episode id: ${episode.id}`);
  episodeIds.add(episode.id);
  const expectedPrevious = index > 0 ? plan.episodes[index - 1].id : null;
  const expectedNext = index < plan.episodes.length - 1 ? plan.episodes[index + 1].id : null;
  if ((episode.previous ?? null) !== expectedPrevious) errors.push(`${episode.id} has incorrect previous link.`);
  if ((episode.next ?? null) !== expectedNext) errors.push(`${episode.id} has incorrect next link.`);
  for (const blockId of episode.sourceBlockIds ?? []) {
    if (!availableBlocks.has(blockId)) errors.push(`${episode.id} uses unknown source block: ${blockId}`);
    if (usedBlocks.has(blockId) && !sharedBlocks.has(blockId)) errors.push(`${blockId} repeats in ${usedBlocks.get(blockId)} and ${episode.id}.`);
    usedBlocks.set(blockId, episode.id);
  }
  for (const topic of episode.topics ?? []) {
    if (usedTopics.has(topic)) errors.push(`Topic "${topic}" repeats in ${usedTopics.get(topic)} and ${episode.id}.`);
    usedTopics.set(topic, episode.id);
  }
  for (const idea of episode.requires ?? []) if (!introducedIdeas.has(idea)) errors.push(episode.id + " requires \"" + idea + "\" before it is introduced.");
  for (const idea of episode.introduces ?? []) introducedIdeas.add(idea);
  for (const [key, value] of Object.entries(episode.positions ?? {})) {
    if (!positions.has(key)) errors.push(episode.id + " uses unknown canonical position: " + key);
    else if (positions.get(key) !== value) errors.push(episode.id + " contradicts canonical position " + key + ".");
  }
  let lastOrder = -Infinity;
  for (const eventId of episode.timelineEventIds ?? []) {
    const event = timelineEvents.get(eventId);
    if (!event) errors.push(episode.id + " uses unknown timeline event: " + eventId);
    else if (event.order < lastOrder) errors.push(episode.id + " has out-of-order timeline events.");
    else lastOrder = event.order;
  }
}

const unusedBlocks = [...availableBlocks].filter((blockId) => !usedBlocks.has(blockId));
const plannedWords = plan.episodes.reduce((/** @type {number} */ sum, /** @type {any} */ episode) => sum + episode.estimatedMinutes * (bible.adaptation?.wordsPerMinute ?? 0), 0);
const compressionRatio = plannedWords > 0 ? sourceWordCount / plannedWords : 0;
if ((compressionRatio < .5 || compressionRatio > 8) && !bible.adaptation?.coverageNote) errors.push("Extreme source compression or expansion needs adaptation.coverageNote.");
const coverage = [
  `# ${plan.title} coverage`, "",
  `- Episodes: ${plan.episodes.length}`,
  `- Source blocks assigned: ${usedBlocks.size}/${availableBlocks.size}`,
  `- Intentionally omitted: ${(plan.omittedSourceBlockIds ?? []).length}`,
  "- Adaptation mode: " + (bible.adaptation?.mode ?? "missing"),
  "- Source words: " + sourceWordCount,
  "- Planned narration capacity: " + Math.round(plannedWords) + " words",
  "- Source-to-narration compression: " + compressionRatio.toFixed(2) + ":1",
  "- Rights: " + (bible.rights?.status ?? "missing") + " — " + (bible.rights?.intendedUse ?? "missing"),
  "",
  ...plan.episodes.flatMap((/** @type {any} */ episode) => [
    `## ${episode.title}`, "",
    `- ID: ${episode.id}`,
    `- Question: ${episode.question}`,
    `- Runtime: ${episode.estimatedMinutes} minutes`,
    `- Topics: ${(episode.topics ?? []).join(", ")}`,
    `- Sources: ${(episode.sourceBlockIds ?? []).join(", ")}`,
    "",
  ]),
  "## Unassigned source blocks", "", unusedBlocks.join(", ") || "None", "",
].join("\n");
writeFileSync(resolve(projectDir, "COVERAGE.md"), coverage);
if (errors.length) {
  errors.forEach((error) => console.error(`✗ ${error}`));
  process.exit(1);
}
console.log(`✓ ${plan.episodes.length} episodes verified; ${usedBlocks.size} source blocks assigned.`);
