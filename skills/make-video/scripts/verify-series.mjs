import {existsSync, readFileSync, writeFileSync} from "node:fs";
import {relative, resolve, sep} from "node:path";

import {projectRoot} from "./video-context.mjs";

const args = process.argv.slice(2);
if (args.length !== 1 || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(args[0])) {
  throw new Error("Exactly one kebab-case series id is required.");
}
const seriesId = args[0];
const seriesDir = resolve(projectRoot, "series", seriesId);
const planFile = resolve(seriesDir, "series-plan.json");
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
const sharedBlocks = new Set(plan.sharedSourceBlockIds ?? []);
const errors = [];
const episodeIds = new Set();
const usedBlocks = new Map();
const usedTopics = new Map();

for (let index = 0; index < plan.episodes.length; index += 1) {
  const episode = plan.episodes[index];
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
}

const unusedBlocks = [...availableBlocks].filter((blockId) => !usedBlocks.has(blockId));
const coverage = [
  `# ${plan.title} coverage`, "",
  `- Episodes: ${plan.episodes.length}`,
  `- Source blocks assigned: ${usedBlocks.size}/${availableBlocks.size}`,
  `- Intentionally omitted: ${(plan.omittedSourceBlockIds ?? []).length}`,
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
writeFileSync(resolve(seriesDir, "COVERAGE.md"), coverage);
if (errors.length) {
  errors.forEach((error) => console.error(`✗ ${error}`));
  process.exit(1);
}
console.log(`✓ ${plan.episodes.length} episodes verified; ${usedBlocks.size} source blocks assigned.`);
