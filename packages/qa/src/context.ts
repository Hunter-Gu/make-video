import {existsSync, readFileSync} from "node:fs";
import {isAbsolute, relative, resolve, sep} from "node:path";

export const projectRoot = process.env.MAKE_VIDEO_PROJECT_ROOT ?? process.cwd();
type AnyRecord = Record<string, any>;

export type VideoContext = {
  videoId: string;
  sourceDir: string;
  publicDir: string;
  composition: AnyRecord;
  production: AnyRecord;
  outputs: Record<string, string>;
  resolveConfiguredPath: (value: unknown, label: string) => string;
};

const videoIdPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const requireObject = (value: unknown, label: string): AnyRecord => {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} must be an object.`);
  return value as AnyRecord;
};

const resolveInsideProject = (value: unknown, label: string) => {
  if (typeof value !== "string" || value.length === 0) throw new Error(`${label} must be a project-relative path.`);
  if (isAbsolute(value)) throw new Error(`${label} must not be absolute: ${value}`);
  const file = resolve(projectRoot, value);
  const fromRoot = relative(projectRoot, file);
  if (fromRoot === ".." || fromRoot.startsWith(`..${sep}`)) throw new Error(`${label} escapes the project: ${value}`);
  return file;
};

export const parseTargetArgs = (args: string[]) => {
  const positionals = args.filter((arg) => !arg.startsWith("--"));
  const unknown = args.filter((arg) => arg.startsWith("--") && arg !== "--force");
  if (unknown.length > 0) throw new Error(`Unknown option: ${unknown.join(", ")}`);
  if (positionals.length !== 1) throw new Error("Exactly one video id is required.");
  return {videoId: positionals[0], force: args.includes("--force")};
};

export const loadVideoContext = (videoId: string): VideoContext => {
  if (!videoIdPattern.test(videoId)) throw new Error(`Invalid video id "${videoId}".`);
  const sourceDir = resolve(projectRoot, "src", videoId);
  const configPath = resolve(sourceDir, "video.config.json");
  if (!existsSync(configPath)) throw new Error(`Video config not found: ${configPath}`);
  const config = JSON.parse(readFileSync(configPath, "utf8")) as AnyRecord;
  const composition = requireObject(config.composition, "composition");
  const production = requireObject(config.production, "production");
  if (config.videoId !== videoId) throw new Error(`video.config.json declares videoId "${config.videoId}" but directory target is "${videoId}".`);
  const publicRoot = resolve(projectRoot, "public");
  const publicPath = production.publicPath ?? videoId;
  const publicDir = resolve(publicRoot, publicPath);
  const publicRelative = relative(publicRoot, publicDir);
  if (publicRelative === ".." || publicRelative.startsWith(`..${sep}`)) throw new Error("production.publicPath must stay inside public/.");
  const outputConfig = requireObject(production.outputs, "production.outputs");
  const outputs = Object.fromEntries(["still", "silent", "unmastered", "final"].map((name) => [name, resolveInsideProject(outputConfig[name], `production.outputs.${name}`)]));
  if (new Set(Object.values(outputs)).size !== 4) throw new Error("production output paths must be distinct.");
  return {videoId, sourceDir, publicDir, composition, production, outputs, resolveConfiguredPath: resolveInsideProject};
};

export const readJson = (file: string, fallback: AnyRecord | null = null): AnyRecord | null => existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : fallback;
