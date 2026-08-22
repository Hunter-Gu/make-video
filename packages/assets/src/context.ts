import {existsSync, readFileSync} from "node:fs";
import {isAbsolute, relative, resolve, sep} from "node:path";

export const projectRoot = process.cwd();

type JsonObject = Record<string, any>;

export type AssetContext = {
  videoId: string;
  sourceDir: string;
  publicDir: string;
  production: JsonObject;
  resolveConfiguredPath: (value: unknown, label: string) => string;
};

const videoIdPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const resolveInsideProject = (value: unknown, label: string) => {
  if (typeof value !== "string" || value.length === 0) throw new Error(`${label} must be a non-empty project-relative path.`);
  if (isAbsolute(value)) throw new Error(`${label} must not be absolute: ${value}`);
  const file = resolve(projectRoot, value);
  const fromRoot = relative(projectRoot, file);
  if (fromRoot === ".." || fromRoot.startsWith(`..${sep}`)) throw new Error(`${label} escapes the project: ${value}`);
  return file;
};

export const loadAssetContext = (videoId: string): AssetContext => {
  if (!videoIdPattern.test(videoId)) throw new Error(`Invalid video id "${videoId}".`);
  const sourceDir = resolve(projectRoot, "src", videoId);
  const configPath = resolve(sourceDir, "video.config.json");
  if (!existsSync(configPath)) throw new Error(`Video config not found: ${configPath}`);
  const config = JSON.parse(readFileSync(configPath, "utf8")) as JsonObject;
  if (config.videoId !== videoId) throw new Error(`video.config.json declares videoId "${config.videoId}" but directory target is "${videoId}".`);
  const production = config.production as JsonObject | undefined;
  if (!production || typeof production !== "object") throw new Error("production must be an object.");
  const publicRoot = resolve(projectRoot, "public");
  const publicDir = resolve(publicRoot, production.publicPath ?? videoId);
  const publicRelative = relative(publicRoot, publicDir);
  if (publicRelative === ".." || publicRelative.startsWith(`..${sep}`)) throw new Error("production.publicPath must stay inside public/.");
  return {videoId, sourceDir, publicDir, production, resolveConfiguredPath: resolveInsideProject};
};

export const parseTargetArgs = (args: string[]) => {
  const positionals = args.filter((arg) => !arg.startsWith("--"));
  const unknown = args.filter((arg) => arg.startsWith("--") && arg !== "--force");
  if (unknown.length > 0) throw new Error(`Unknown option: ${unknown.join(", ")}`);
  if (positionals.length !== 1) throw new Error("Exactly one video id is required.");
  return {videoId: positionals[0], force: args.includes("--force")};
};
