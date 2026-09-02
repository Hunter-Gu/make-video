import {log} from "@make-video/project";
import {existsSync, mkdirSync, writeFileSync} from "node:fs";
import {relative, resolve} from "node:path";

import {projectRoot} from "./context";

const videoIdPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export type ProjectSourceDeclaration = {id: string; title?: string; type?: string; input?: string; url?: string; rights?: string};

export type SeriesEpisodeLink = {
  seriesId: string;
  episodeId: string;
  question?: string;
  topics?: string[];
  sourceBlockIds?: string[];
};

export type CreateProjectInput = {
  videoId: string;
  title?: string;
  width?: number;
  height?: number;
  fps?: number;
  durationSeconds?: number;
  sources?: ProjectSourceDeclaration[];
  series?: SeriesEpisodeLink;
  force?: boolean;
};

export type CreatedProject = {
  videoId: string;
  path: string;
  title: string;
  composition: {id: string; fps: number; width: number; height: number; durationInFrames: number};
  created: string[];
  skipped: string[];
};

const positive = (value: unknown, fallback: number, label: string) => {
  if (value === undefined) return fallback;
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) throw new Error(`${label} must be a positive number.`);
  return value;
};

const compositionId = (videoId: string) => videoId.split("-").map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join("");

const writeIfAbsent = (file: string, content: string, force: boolean, created: string[], skipped: string[]) => {
  if (existsSync(file) && !force) { skipped.push(relative(projectRoot, file)); return; }
  writeFileSync(file, content);
  created.push(relative(projectRoot, file));
};

/**
 * Scaffold the machine-read files a video project needs before anything can plan,
 * render, or check it. Creative files — the plan, script, storyboard, timing plan —
 * stay for the host agent to author; this only writes what the pipeline reads.
 */
export const createProject = (input: CreateProjectInput): CreatedProject => {
  const {videoId} = input;
  if (!videoIdPattern.test(videoId)) throw new Error(`Invalid video id "${videoId}". Use lowercase kebab-case directory names.`);
  // The kebab-case id is the boundary: it cannot contain a separator or a dot.
  const sourceDir = resolve(projectRoot, "src", videoId);
  const force = input.force ?? false;
  const configPath = resolve(sourceDir, "video.config.json");
  if (existsSync(configPath) && !force) throw new Error(`Video project ${videoId} already exists: ${relative(projectRoot, configPath)}. Pass force only when replacing its configuration was explicitly requested.`);

  const fps = positive(input.fps, 30, "fps");
  const width = positive(input.width, 1920, "width");
  const height = positive(input.height, 1080, "height");
  const durationSeconds = positive(input.durationSeconds, 60, "durationSeconds");
  const durationInFrames = Math.max(1, Math.round(durationSeconds * fps));
  const composition = {id: compositionId(videoId), fps, width, height, durationInFrames};
  const config = {
    videoId,
    title: input.title ?? videoId,
    sources: Array.isArray(input.sources) ? input.sources : [],
    composition,
    production: {
      publicPath: videoId,
      assetLinks: [],
      outputs: {
        still: `output/${videoId}/still.png`,
        silent: `output/${videoId}/silent.mp4`,
        unmastered: `output/${videoId}/unmastered.mp4`,
        final: `output/${videoId}/final.mp4`,
      },
      stillFrame: 0,
      qa: {output: "silent", audioRequired: false},
      mastering: null,
    },
    // Models stay unselected: choosing one is a cost decision for the user, and
    // every generator refuses to run until one is configured.
    imageGeneration: {model: null, assets: []},
    voice: {model: null, voiceName: "Kore", direction: "Clear documentary narration.", timingMode: "narration"},
  };

  const created: string[] = [];
  const skipped: string[] = [];
  mkdirSync(sourceDir, {recursive: true});
  const json = (value: unknown) => `${JSON.stringify(value, null, 2)}\n`;
  writeIfAbsent(configPath, json(config), force, created, skipped);
  writeIfAbsent(resolve(sourceDir, "SCENE_INDEX.json"), json({version: 1, fps, assets: {}, captions: [], scenes: []}), force, created, skipped);
  writeIfAbsent(resolve(sourceDir, "REMOTION_TIMELINE.json"), json({version: 1, effects: []}), force, created, skipped);
  if (input.series) {
    const {seriesId, episodeId} = input.series;
    if (!videoIdPattern.test(seriesId) || !videoIdPattern.test(episodeId)) throw new Error("A series link needs a kebab-case seriesId and episodeId.");
    writeIfAbsent(resolve(sourceDir, "SERIES_EPISODE.json"), json({
      version: 1,
      seriesId,
      episodeId,
      question: input.series.question ?? "",
      topics: input.series.topics ?? [],
      sourceBlockIds: input.series.sourceBlockIds ?? [],
    }), force, created, skipped);
  }

  log(`Created video project ${videoId}: ${created.length} file(s) written, ${skipped.length} kept.`);
  return {videoId, path: relative(projectRoot, sourceDir), title: config.title, composition, created, skipped};
};
