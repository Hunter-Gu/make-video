import {existsSync, readFileSync} from "node:fs";
import {dirname, isAbsolute, relative, resolve, sep} from "node:path";
import {fileURLToPath} from "node:url";

export const scriptsDir = dirname(fileURLToPath(import.meta.url));
export const projectRoot = resolve(process.env.MAKE_VIDEO_PROJECT_ROOT ?? resolve(scriptsDir, "../../.."));

type JsonObject = Record<string, any>;

export type VideoContext = {
  videoId: string;
  config: JsonObject;
  composition: JsonObject;
  production: JsonObject;
  sourceDir: string;
  configPath: string;
  publicDir: string;
  outputs: Record<string, string>;
  resolveConfiguredPath: (configuredPath: unknown, label: string) => string;
};

const videoIdPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const requireObject = (value: unknown, label: string): JsonObject => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object.`);
  }
  return value as JsonObject;
};

const resolveInsideRepository = (configuredPath: unknown, label: string): string => {
  if (typeof configuredPath !== "string" || configuredPath.length === 0) {
    throw new Error(`${label} must be a non-empty project-relative path.`);
  }
  if (isAbsolute(configuredPath)) {
    throw new Error(`${label} must not be absolute: ${configuredPath}`);
  }
  const resolvedPath = resolve(projectRoot, configuredPath);
  const relativePath = relative(projectRoot, resolvedPath);
  if (relativePath === ".." || relativePath.startsWith(`..${sep}`)) {
    throw new Error(`${label} escapes the project: ${configuredPath}`);
  }
  return resolvedPath;
};

export const loadVideoContext = (videoId: string): VideoContext => {
  if (!videoIdPattern.test(videoId)) {
    throw new Error(`Invalid video id "${videoId}". Use lowercase kebab-case directory names.`);
  }

  const sourceDir = resolve(projectRoot, "src", videoId);
  const configPath = resolve(sourceDir, "video.config.json");
  if (!existsSync(configPath)) throw new Error(`Video config not found: ${configPath}`);

  const config = JSON.parse(readFileSync(configPath, "utf8")) as JsonObject;
  const composition = requireObject(config.composition, "composition");
  const production = requireObject(config.production, "production");
  if (config.videoId !== videoId) {
    throw new Error(`video.config.json declares videoId "${config.videoId}" but directory target is "${videoId}".`);
  }
  if (typeof composition.id !== "string" || composition.id.length === 0) {
    throw new Error("composition.id must be a non-empty string.");
  }
  for (const field of ["fps", "width", "height", "durationInFrames"] as const) {
    if (!Number.isFinite(composition[field]) || composition[field] <= 0) {
      throw new Error(`composition.${field} must be a positive number.`);
    }
  }

  const configuredPublicPath = production.publicPath ?? videoId;
  if (typeof configuredPublicPath !== "string") throw new Error("production.publicPath must be a string when provided.");
  const publicDir = resolve(projectRoot, "public", configuredPublicPath);
  const relativePublicDir = relative(resolve(projectRoot, "public"), publicDir);
  if (relativePublicDir === ".." || relativePublicDir.startsWith(`..${sep}`)) {
    throw new Error("production.publicPath must stay inside public/.");
  }

  const outputs = requireObject(production.outputs, "production.outputs");
  const resolveOutput = (name: string) => resolveInsideRepository(outputs[name], `production.outputs.${name}`);
  const resolvedOutputs = {
    still: resolveOutput("still"),
    silent: resolveOutput("silent"),
    unmastered: resolveOutput("unmastered"),
    final: resolveOutput("final"),
  };
  if (new Set(Object.values(resolvedOutputs)).size !== 4) throw new Error("production output paths must be distinct.");

  return {
    videoId,
    config,
    composition,
    production,
    sourceDir,
    configPath,
    publicDir,
    outputs: resolvedOutputs,
    resolveConfiguredPath: resolveInsideRepository,
  };
};
