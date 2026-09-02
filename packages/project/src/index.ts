import {existsSync, readFileSync} from "node:fs";
import {isAbsolute, relative, resolve, sep} from "node:path";

export const projectRoot = resolve(process.env.MAKE_VIDEO_PROJECT_ROOT ?? process.cwd());

export type JsonObject = Record<string, any>;

export const videoIdPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/**
 * Resolve a configured path and keep it inside the project.
 *
 * Every package reads paths out of project files, so this is the boundary that
 * stops a configuration from reaching the rest of the disk. It lives in one place
 * so a fix to it cannot land in six of the seven callers.
 */
export const resolveInsideProject = (value: unknown, label: string) => {
  if (typeof value !== "string" || value.length === 0) throw new Error(`${label} must be a non-empty project-relative path.`);
  if (isAbsolute(value)) throw new Error(`${label} must not be absolute: ${value}`);
  const file = resolve(projectRoot, value);
  const fromRoot = relative(projectRoot, file);
  if (fromRoot === ".." || fromRoot.startsWith(`..${sep}`)) throw new Error(`${label} escapes the project: ${value}`);
  return file;
};

export const insideProject = (root: string, file: string) => {
  const value = relative(root, file);
  return value !== ".." && !value.startsWith(`..${sep}`);
};

export const requireObject = (value: unknown, label: string): JsonObject => {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} must be an object.`);
  return value as JsonObject;
};

/** Locate a video project and read its configuration, without judging its contents. */
export const readProjectConfig = (videoId: string) => {
  if (!videoIdPattern.test(videoId)) throw new Error(`Invalid video id "${videoId}". Use lowercase kebab-case directory names.`);
  const sourceDir = resolve(projectRoot, "src", videoId);
  const configPath = resolve(sourceDir, "video.config.json");
  if (!existsSync(configPath)) throw new Error(`Video config not found: ${configPath}`);
  const config = JSON.parse(readFileSync(configPath, "utf8")) as JsonObject;
  if (config.videoId !== videoId) throw new Error(`video.config.json declares videoId "${config.videoId}" but directory target is "${videoId}".`);
  return {videoId, config, sourceDir, configPath};
};

/** Runtime media lives under public/<publicPath>/ and may not escape it. */
export const resolvePublicDir = (production: JsonObject | undefined, videoId: string) => {
  const configured = production?.publicPath ?? videoId;
  if (typeof configured !== "string") throw new Error("production.publicPath must be a string when provided.");
  const publicRoot = resolve(projectRoot, "public");
  const publicDir = resolve(publicRoot, configured);
  if (!insideProject(publicRoot, publicDir)) throw new Error("production.publicPath must stay inside public/.");
  return publicDir;
};

export const audioDirsFor = (publicDir: string) => ({
  music: resolve(publicDir, "audio/music"),
  sfx: resolve(publicDir, "audio/sfx"),
  voiceover: resolve(publicDir, "audio/voiceover"),
});

export const parseTargetArgs = (args: string[]) => {
  const positionals = args.filter((argument) => !argument.startsWith("--"));
  const unknown = args.filter((argument) => argument.startsWith("--") && argument !== "--force");
  if (unknown.length > 0) throw new Error(`Unknown option: ${unknown.join(", ")}`);
  if (positionals.length !== 1) throw new Error("Exactly one video id is required.");
  return {videoId: positionals[0], force: args.includes("--force")};
};

/**
 * Generated media and rendered files are output, not a cache: a command refuses to
 * replace one unless the caller explicitly asked for regeneration.
 */
export const assertOutputsAvailable = (files: string[], force: boolean, action: string) => {
  if (force) return;
  const existing = files.filter((file) => existsSync(file));
  if (existing.length > 0) throw new Error(`${action} stopped because generated output already exists:\n${existing.map((file) => `- ${file}`).join("\n")}\nPass --force only when regeneration was explicitly requested.`);
};
