import {existsSync, readFileSync} from "node:fs";
import {isAbsolute, relative, resolve, sep} from "node:path";

import type {AnyRecord} from "./types";

export const projectRoot = process.cwd();

const videoIdPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
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

const requireObject = (value: unknown, label: string): AnyRecord => {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} must be an object.`);
  return value as AnyRecord;
};

const resolveInsideRepository = (configuredPath: unknown, label: string) => {
  if (typeof configuredPath !== "string" || configuredPath.length === 0) throw new Error(`${label} must be a non-empty project-relative path.`);
  if (isAbsolute(configuredPath)) throw new Error(`${label} must not be absolute: ${configuredPath}`);
  const resolvedPath = resolve(projectRoot, configuredPath);
  const relativePath = relative(projectRoot, resolvedPath);
  if (relativePath === ".." || relativePath.startsWith(`..${sep}`)) throw new Error(`${label} escapes the project: ${configuredPath}`);
  return resolvedPath;
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
  if (!videoIdPattern.test(videoId)) throw new Error(`Invalid video id "${videoId}". Use lowercase kebab-case directory names.`);
  const sourceDir = resolve(projectRoot, "src", videoId);
  const configPath = resolve(sourceDir, "video.config.json");
  if (!existsSync(configPath)) throw new Error(`Video config not found: ${configPath}`);
  const config = JSON.parse(readFileSync(configPath, "utf8")) as AnyRecord;
  const composition = requireObject(config.composition, "composition");
  const production = requireObject(config.production, "production");
  if (config.videoId !== videoId) throw new Error(`video.config.json declares videoId "${config.videoId}" but directory target is "${videoId}".`);
  if (typeof composition.id !== "string" || composition.id.length === 0) throw new Error("composition.id must be a non-empty string.");
  for (const field of ["fps", "width", "height", "durationInFrames"] as const) {
    if (!Number.isFinite(composition[field]) || composition[field] <= 0) throw new Error(`composition.${field} must be a positive number.`);
  }
  const configuredPublicPath = production.publicPath ?? videoId;
  if (typeof configuredPublicPath !== "string") throw new Error("production.publicPath must be a string when provided.");
  const publicDir = resolve(projectRoot, "public", configuredPublicPath);
  const relativePublicDir = relative(resolve(projectRoot, "public"), publicDir);
  if (relativePublicDir === ".." || relativePublicDir.startsWith(`..${sep}`)) throw new Error("production.publicPath must stay inside public/.");
  const outputs = requireObject(production.outputs, "production.outputs");
  const resolveOutput = (name: string) => resolveInsideRepository(outputs[name], `production.outputs.${name}`);
  const resolvedOutputs = {still: resolveOutput("still"), silent: resolveOutput("silent"), unmastered: resolveOutput("unmastered"), final: resolveOutput("final")};
  if (new Set(Object.values(resolvedOutputs)).size !== 4) throw new Error("production output paths must be distinct.");
  return {
    videoId,
    config,
    composition,
    production,
    sourceDir,
    configPath,
    publicDir,
    audioDirs: {music: resolve(publicDir, "audio/music"), sfx: resolve(publicDir, "audio/sfx"), voiceover: resolve(publicDir, "audio/voiceover")},
    outputs: resolvedOutputs,
    resolveConfiguredPath: resolveInsideRepository,
  };
};

export const assertOutputsAvailable = (paths: string[], options: {force: boolean; action: string}) => {
  if (options.force) return;
  const existingPaths = paths.filter((path) => existsSync(path));
  if (existingPaths.length > 0) throw new Error(`${options.action} stopped because generated output already exists:\n${existingPaths.map((path) => `- ${path}`).join("\n")}\nPass --force only when regeneration was explicitly requested.`);
};

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
