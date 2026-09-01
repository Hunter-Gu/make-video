import {existsSync} from "node:fs";

import type {SeriesCoverage, SeriesEpisode, SeriesPlan, SeriesVerification} from "@make-video/contracts";

import {loadSeriesContext, readJson} from "./context";

const kebabCase = (value: unknown) => typeof value === "string" && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value);
const stringArray = (value: unknown) => Array.isArray(value) && value.every((item) => typeof item === "string");
const adaptationModes = new Set(["overview", "chapter-focus", "documentary", "series"]);
const words = (value: string) => value.trim().split(/\s+/).filter(Boolean).length;

const readEpisode = (value: any): SeriesEpisode => ({
  id: value.id,
  title: value.title,
  question: value.question ?? "",
  estimatedMinutes: Number(value.estimatedMinutes),
  previous: value.previous ?? null,
  next: value.next ?? null,
  topics: stringArray(value.topics) ? value.topics : [],
  sourceBlockIds: stringArray(value.sourceBlockIds) ? value.sourceBlockIds : [],
  introduces: stringArray(value.introduces) ? value.introduces : [],
  requires: stringArray(value.requires) ? value.requires : [],
  timelineEventIds: stringArray(value.timelineEventIds) ? value.timelineEventIds : [],
  positions: value.positions && typeof value.positions === "object" && !Array.isArray(value.positions) ? value.positions : {},
});

/**
 * Check a series plan against its shared bible: episode ordering, source coverage,
 * dependency order, chronology, canonical positions, pronunciation, and the
 * source-to-narration compression the requested runtimes imply.
 */
export const verifySeries = (seriesId: string): SeriesVerification => {
  const context = loadSeriesContext(seriesId);
  const errors: string[] = [];
  const warnings: string[] = [];
  const record = (list: string[], message: string) => { if (!list.includes(message)) list.push(message); };
  const fail = (message: string) => record(errors, message);
  const warn = (message: string) => record(warnings, message);

  const raw = context.plan;
  const bible = context.bible;
  if (typeof raw.title !== "string" || !raw.title.trim()) fail("series-plan.json needs a title.");
  if (!Array.isArray(raw.episodes) || raw.episodes.length === 0) {
    fail("series-plan.json needs a non-empty episodes array.");
    return {seriesId, passed: false, errors, warnings, plan: null, coverage: null};
  }

  const episodeIds = new Set<string>();
  for (const [index, episode] of raw.episodes.entries()) {
    if (!episode || typeof episode !== "object" || Array.isArray(episode)) { fail(`Episode ${index + 1} must be an object.`); continue; }
    if (!kebabCase(episode.id)) fail(`Episode ${index + 1} needs a kebab-case id.`);
    else if (episodeIds.has(episode.id)) fail(`Duplicate episode id: ${episode.id}`);
    else episodeIds.add(episode.id);
    if (typeof episode.title !== "string" || !episode.title.trim()) fail(`Episode ${episode.id ?? index + 1} needs a title.`);
    if (typeof episode.question !== "string" || !episode.question.trim()) fail(`Episode ${episode.id ?? index + 1} needs a central question.`);
    if (!Number.isFinite(Number(episode.estimatedMinutes)) || Number(episode.estimatedMinutes) <= 0) fail(`Episode ${episode.id ?? index + 1} needs a positive estimatedMinutes.`);
    for (const field of ["topics", "sourceBlockIds", "introduces", "requires", "timelineEventIds"]) {
      if (episode[field] !== undefined && !stringArray(episode[field])) fail(`Episode ${episode.id ?? index + 1} ${field} must be an array of strings.`);
    }
  }
  const episodes = raw.episodes.filter((episode: any) => kebabCase(episode?.id)).map(readEpisode) as SeriesEpisode[];

  for (const [index, episode] of episodes.entries()) {
    const previous = index > 0 ? episodes[index - 1].id : null;
    const next = index < episodes.length - 1 ? episodes[index + 1].id : null;
    if ((episode.previous ?? null) !== previous) fail(`Episode ${episode.id} previous must be ${previous ?? "null"}.`);
    if ((episode.next ?? null) !== next) fail(`Episode ${episode.id} next must be ${next ?? "null"}.`);
  }

  const sourceIndexFile = context.resolveConfiguredPath(raw.sourceIndex, "series-plan.json sourceIndex");
  let blocks = new Map<string, string>();
  if (!existsSync(sourceIndexFile)) fail(`Source index not found: ${raw.sourceIndex}`);
  else {
    const index = readJson(sourceIndexFile);
    blocks = new Map((index.sources ?? []).flatMap((source: any) => (source.blocks ?? []).map((block: any) => [String(block.id), String(block.text ?? "")])) as Array<[string, string]>);
    if (blocks.size === 0) fail(`Source index ${raw.sourceIndex} has no indexed blocks.`);
  }

  const shared = new Set(stringArray(raw.sharedSourceBlockIds) ? raw.sharedSourceBlockIds : []);
  const omitted = new Set(stringArray(raw.omittedSourceBlockIds) ? raw.omittedSourceBlockIds : []);
  for (const id of [...shared, ...omitted]) if (blocks.size > 0 && !blocks.has(id)) fail(`Source block ${id} is declared in the plan but missing from the source index.`);
  const assignedBy = new Map<string, string[]>();
  for (const episode of episodes) {
    if (episode.sourceBlockIds.length === 0) warn(`Episode ${episode.id} has no assigned source blocks.`);
    for (const id of episode.sourceBlockIds) {
      if (blocks.size > 0 && !blocks.has(id)) fail(`Episode ${episode.id} references an unknown source block: ${id}`);
      if (omitted.has(id)) fail(`Source block ${id} is marked omitted but used by episode ${episode.id}.`);
      assignedBy.set(id, [...(assignedBy.get(id) ?? []), episode.id]);
    }
  }
  for (const [id, users] of assignedBy) {
    if (users.length > 1 && !shared.has(id)) fail(`Source block ${id} is repeated by episodes ${users.join(", ")}; add it to sharedSourceBlockIds if that is intended.`);
  }
  const unassignedBlockIds = [...blocks.keys()].filter((id) => !assignedBy.has(id) && !omitted.has(id));
  for (const id of unassignedBlockIds) warn(`Source block ${id} is neither assigned to an episode nor listed in omittedSourceBlockIds.`);

  const adaptation = bible.adaptation ?? {};
  if (!adaptationModes.has(adaptation.mode)) fail(`SERIES_BIBLE.json adaptation.mode must be one of ${[...adaptationModes].join(", ")}.`);
  const wordsPerMinute = Number(adaptation.wordsPerMinute);
  if (!Number.isFinite(wordsPerMinute) || wordsPerMinute <= 0) fail("SERIES_BIBLE.json adaptation.wordsPerMinute must be a positive number.");
  const rights = bible.rights ?? {};
  if (typeof rights.status !== "string" || !rights.status.trim()) fail("SERIES_BIBLE.json rights.status is required; possession of a file is not adaptation permission.");
  if (typeof rights.intendedUse !== "string" || !rights.intendedUse.trim()) fail("SERIES_BIBLE.json rights.intendedUse is required.");
  for (const [name, path] of Object.entries((bible.sharedFiles ?? {}) as Record<string, unknown>)) {
    const file = context.resolveConfiguredPath(path, `SERIES_BIBLE.json sharedFiles.${name}`);
    if (!existsSync(file)) fail(`Shared ${name} bible not found: ${path}`);
  }

  const introducedBy = new Map<string, string>();
  for (const episode of episodes) {
    for (const idea of episode.requires) {
      if (!introducedBy.has(idea)) fail(`Episode ${episode.id} requires "${idea}" before any earlier episode introduces it.`);
    }
    for (const idea of episode.introduces) {
      if (introducedBy.has(idea)) fail(`Idea "${idea}" is introduced by both ${introducedBy.get(idea)} and ${episode.id}.`);
      else introducedBy.set(idea, episode.id);
    }
  }

  const timeline = new Map((Array.isArray(bible.timeline) ? bible.timeline : []).map((event: any) => [String(event?.id), Number(event?.order)]));
  const flashbacks = new Set(raw.episodes.filter((episode: any) => episode?.outOfOrderTimeline === true).map((episode: any) => String(episode.id)));
  let previousOrder = -Infinity;
  let previousEpisodeId = "";
  for (const episode of episodes) {
    const orders: number[] = [];
    for (const id of episode.timelineEventIds) {
      if (!timeline.has(id)) { fail(`Episode ${episode.id} references an unknown timeline event: ${id}`); continue; }
      orders.push(timeline.get(id) as number);
    }
    const message = orders.some((order, index) => index > 0 && order < orders[index - 1])
      ? `Episode ${episode.id} lists timeline events out of chronological order.`
      : orders.length > 0 && orders[0] < previousOrder ? `Episode ${episode.id} returns to timeline events already covered by ${previousEpisodeId}.` : null;
    if (message && flashbacks.has(episode.id)) warn(`${message} It is declared as a deliberate flashback.`);
    else if (message) fail(message);
    if (orders.length > 0) { previousOrder = Math.max(previousOrder, ...orders); previousEpisodeId = episode.id; }
  }

  const canonical = (bible.canonicalPositions ?? {}) as Record<string, string>;
  for (const episode of episodes) {
    for (const [key, value] of Object.entries(episode.positions)) {
      if (!(key in canonical)) { warn(`Episode ${episode.id} declares position "${key}", which the series bible does not record.`); continue; }
      if (canonical[key] !== value) fail(`Episode ${episode.id} contradicts the series position on "${key}": ${value} instead of ${canonical[key]}.`);
    }
  }

  const pronunciationPath = (bible.sharedFiles ?? {}).pronunciation;
  const pronunciationIds = new Set<string>();
  if (typeof pronunciationPath === "string") {
    const file = context.resolveConfiguredPath(pronunciationPath, "SERIES_BIBLE.json sharedFiles.pronunciation");
    if (existsSync(file)) for (const entry of readJson(file).entries ?? []) pronunciationIds.add(String(entry?.id));
  }
  for (const term of Array.isArray(bible.terms) ? bible.terms : []) {
    if (typeof term?.canonical !== "string" || !term.canonical.trim()) fail(`Series term ${term?.id ?? "unknown"} needs a canonical spelling.`);
    if (term?.pronunciationId && !pronunciationIds.has(String(term.pronunciationId))) fail(`Series term ${term.id} references an unknown pronunciation entry: ${term.pronunciationId}`);
  }

  const sourceWords = [...blocks.values()].reduce((total, text) => total + words(text), 0);
  const narrationCapacityWords = Math.round(episodes.reduce((total, episode) => total + (Number.isFinite(episode.estimatedMinutes) ? episode.estimatedMinutes : 0), 0) * (Number.isFinite(wordsPerMinute) ? wordsPerMinute : 0));
  const compressionRatio = narrationCapacityWords > 0 ? sourceWords / narrationCapacityWords : Infinity;
  if (Number.isFinite(compressionRatio) && compressionRatio > 1) warn(`Planned runtime covers ${narrationCapacityWords} narration words for ${sourceWords} source words; state what the series omits or add episodes.`);

  const plan: SeriesPlan = {
    seriesId,
    title: String(raw.title ?? seriesId),
    sourceIndex: String(raw.sourceIndex ?? ""),
    sharedSourceBlockIds: [...shared],
    omittedSourceBlockIds: [...omitted],
    episodes,
  };
  const coverage: SeriesCoverage = {
    episodes: episodes.length,
    totalBlocks: blocks.size,
    assignedBlocks: assignedBy.size,
    omittedBlocks: omitted.size,
    unassignedBlockIds,
    adaptationMode: String(adaptation.mode ?? "unspecified"),
    sourceWords,
    narrationCapacityWords,
    compressionRatio: Number.isFinite(compressionRatio) ? Number(compressionRatio.toFixed(4)) : 0,
    rights: {status: String(rights.status ?? "unspecified"), intendedUse: String(rights.intendedUse ?? "unspecified")},
  };
  return {seriesId, passed: errors.length === 0, errors, warnings, plan, coverage};
};
