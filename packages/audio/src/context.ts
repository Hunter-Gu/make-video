import {existsSync, readFileSync} from "node:fs";
import {isAbsolute, relative, resolve, sep} from "node:path";

export const projectRoot = process.env.MAKE_VIDEO_PROJECT_ROOT ?? process.cwd();
type JsonObject = Record<string, any>;

export type AudioContext = {
  videoId: string;
  config: JsonObject;
  composition: JsonObject;
  production: JsonObject;
  sourceDir: string;
  configPath: string;
  audioDirs: {music: string; sfx: string; voiceover: string};
  resolveConfiguredPath: (value: unknown, label: string) => string;
};

const resolveInsideProject = (value: unknown, label: string) => {
  if (typeof value !== "string" || value.length === 0) throw new Error(`${label} must be a non-empty project-relative path.`);
  if (isAbsolute(value)) throw new Error(`${label} must not be absolute: ${value}`);
  const file = resolve(projectRoot, value);
  const fromRoot = relative(projectRoot, file);
  if (fromRoot === ".." || fromRoot.startsWith(`..${sep}`)) throw new Error(`${label} escapes the project: ${value}`);
  return file;
};

const videoIdPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const loadAudioContext = (videoId: string): AudioContext => {
  if (!videoIdPattern.test(videoId)) throw new Error(`Invalid video id "${videoId}". Use lowercase kebab-case directory names.`);
  const sourceDir = resolve(projectRoot, "src", videoId);
  const configPath = resolve(sourceDir, "video.config.json");
  if (!existsSync(configPath)) throw new Error(`Video config not found: ${configPath}`);
  const config = JSON.parse(readFileSync(configPath, "utf8")) as JsonObject;
  const composition = config.composition as JsonObject;
  const production = config.production as JsonObject;
  const publicDir = resolve(projectRoot, "public", production.publicPath ?? videoId);
  return {videoId, config, composition, production, sourceDir, configPath, audioDirs: {music: resolve(publicDir, "audio/music"), sfx: resolve(publicDir, "audio/sfx"), voiceover: resolve(publicDir, "audio/voiceover")}, resolveConfiguredPath: resolveInsideProject};
};

export const parseTargetArgs = (args: string[]) => {
  const positionals = args.filter((arg) => !arg.startsWith("--"));
  const unknown = args.filter((arg) => arg.startsWith("--") && arg !== "--force");
  if (unknown.length > 0) throw new Error(`Unknown option: ${unknown.join(", ")}`);
  if (positionals.length !== 1) throw new Error("Exactly one video id is required.");
  return {videoId: positionals[0], force: args.includes("--force")};
};

export const assertOutputAvailable = (files: string[], force: boolean, action: string) => {
  if (force) return;
  const existing = files.filter((file) => existsSync(file));
  if (existing.length > 0) throw new Error(`${action} stopped because output already exists:\n${existing.map((file) => `- ${file}`).join("\n")}\nPass --force to regenerate.`);
};
