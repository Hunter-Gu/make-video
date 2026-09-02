import {existsSync, readFileSync} from "node:fs";
import {resolve} from "node:path";

import {assertOutputsAvailable as assertAvailable, audioDirsFor, projectRoot, readProjectConfig, requireObject, resolveInsideProject, resolvePublicDir} from "@make-video/project";

import type {AnyRecord} from "./types";

export {projectRoot};

const kebabCase = (value: string) => /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value);

export type VideoContext = {
  videoId: string;
  config: AnyRecord;
  composition: AnyRecord;
  production: AnyRecord;
  sourceDir: string;
  configPath: string;
  publicDir: string;
  audioDirs: {music: string; sfx: string; voiceover: string};
  outputs: AnyRecord;
  resolveConfiguredPath: (configuredPath: unknown, label: string) => string;
};

export const parseTargetArgs = (args: string[]) => {
  const force = args.includes("--force");
  const unknownFlags = args.filter((argument) => argument.startsWith("--") && argument !== "--force");
  const positionals = args.filter((argument) => !argument.startsWith("--"));
  if (unknownFlags.length > 0) throw new Error(`Unknown option: ${unknownFlags.join(", ")}`);
  if (positionals.length !== 1) throw new Error("Exactly one video id is required, for example: dtc-skincare-workflow");
  return {videoId: positionals[0], force};
};

export const parseGenerationArgs = (args: string[]) => {
  const force = args.includes("--force");
  const assetFlags = args.filter((argument) => argument.startsWith("--asset="));
  const unknownFlags = args.filter((argument) => argument.startsWith("--") && argument !== "--force" && !argument.startsWith("--asset="));
  const positionals = args.filter((argument) => !argument.startsWith("--"));
  if (unknownFlags.length > 0) throw new Error(`Unknown option: ${unknownFlags.join(", ")}`);
  if (positionals.length !== 1) throw new Error("Exactly one video id is required.");
  const assetIds = [...new Set(assetFlags.flatMap((flag) => flag.slice(8).split(",")).filter(Boolean))];
  if (assetIds.some((id) => !kebabCase(id))) throw new Error("--asset IDs must use kebab-case.");
  return {videoId: positionals[0], force, assetIds};
};

export const loadVideoContext = (videoId: string): VideoContext => {
  const {config, sourceDir, configPath} = readProjectConfig(videoId);
  const composition = requireObject(config.composition, "composition");
  const production = requireObject(config.production, "production");
  if (typeof composition.id !== "string" || composition.id.length === 0) throw new Error("composition.id must be a non-empty string.");
  for (const field of ["fps", "width", "height", "durationInFrames"] as const) {
    if (!Number.isFinite(composition[field]) || composition[field] <= 0) throw new Error(`composition.${field} must be a positive number.`);
  }
  const publicDir = resolvePublicDir(production, videoId);
  const outputConfig = requireObject(production.outputs, "production.outputs");
  const outputs = Object.fromEntries(["still", "silent", "unmastered", "final"].map((name) => [name, resolveInsideProject(outputConfig[name], `production.outputs.${name}`)]));
  if (new Set(Object.values(outputs)).size !== 4) throw new Error("production output paths must be distinct.");
  return {videoId, config, composition, production, sourceDir, configPath, publicDir, audioDirs: audioDirsFor(publicDir), outputs, resolveConfiguredPath: resolveInsideProject};
};

export const assertOutputsAvailable = (paths: string[], options: {force: boolean; action: string}) => assertAvailable(paths, options.force, options.action);

export const buildVisualContext = (context: VideoContext, requestedCharacters?: Array<{id: string; stage?: string}>) => {
  const visualFile = resolve(context.sourceDir, "VISUAL_BIBLE.json");
  const characterFile = resolve(context.sourceDir, "CHARACTER_BIBLE.json");
  const constraintsFile = resolve(context.sourceDir, "PROMPT_CONSTRAINTS.md");
  const sections: string[] = [];
  if (existsSync(visualFile)) sections.push(`Visual bible: ${(JSON.parse(readFileSync(visualFile, "utf8")) as AnyRecord).promptDirection}`);
  if (requestedCharacters?.length) {
    if (!existsSync(characterFile)) throw new Error("Character references require CHARACTER_BIBLE.json.");
    const bible = JSON.parse(readFileSync(characterFile, "utf8")) as AnyRecord;
    for (const requested of requestedCharacters) {
      const character = bible.characters?.find((item: AnyRecord) => item.id === requested.id);
      const stage = character?.stages?.find((item: AnyRecord) => item.id === requested.stage);
      if (!character || !stage) throw new Error(`Unknown character stage: ${requested.id}/${requested.stage ?? ""}`);
      sections.push(`Character ${character.name}, ${stage.label}: ${stage.description}`);
    }
  }
  if (existsSync(constraintsFile)) sections.push(readFileSync(constraintsFile, "utf8"));
  return sections.join("\n\n");
};
