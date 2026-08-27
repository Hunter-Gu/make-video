import {existsSync, readFileSync} from "node:fs";
import {isAbsolute, relative, resolve, sep} from "node:path";

export const projectRoot = process.env.MAKE_VIDEO_PROJECT_ROOT ?? process.cwd();
type JsonObject = Record<string, any>;

export type SourceContext = {videoId: string; config: JsonObject; sourceDir: string; resolveConfiguredPath: (value: unknown, label: string) => string};

const resolveInsideProject = (value: unknown, label: string) => {
  if (typeof value !== "string" || value.length === 0) throw new Error(`${label} must be a project-relative path.`);
  if (isAbsolute(value)) throw new Error(`${label} must not be absolute: ${value}`);
  const file = resolve(projectRoot, value);
  const fromRoot = relative(projectRoot, file);
  if (fromRoot === ".." || fromRoot.startsWith(`..${sep}`)) throw new Error(`${label} escapes the project: ${value}`);
  return file;
};

export const loadSourceContext = (videoId: string): SourceContext => {
  const sourceDir = resolve(projectRoot, "src", videoId);
  const configPath = resolve(sourceDir, "video.config.json");
  if (!existsSync(configPath)) throw new Error(`Video config not found: ${configPath}`);
  const config = JSON.parse(readFileSync(configPath, "utf8")) as JsonObject;
  if (config.videoId !== videoId) throw new Error(`video.config.json declares videoId "${config.videoId}" but directory target is "${videoId}".`);
  return {videoId, config, sourceDir, resolveConfiguredPath: resolveInsideProject};
};

export const parseTargetArgs = (args: string[]) => {
  const positionals = args.filter((arg) => !arg.startsWith("--"));
  const unknown = args.filter((arg) => arg.startsWith("--") && arg !== "--force");
  if (unknown.length > 0) throw new Error(`Unknown option: ${unknown.join(", ")}`);
  if (positionals.length !== 1) throw new Error("Exactly one video id is required.");
  return {videoId: positionals[0], force: args.includes("--force")};
};

export const assertOutputAvailable = (file: string, force: boolean, action: string) => {
  if (!force && existsSync(file)) throw new Error(`${action} stopped because output already exists: ${file}\nPass --force to regenerate.`);
};
