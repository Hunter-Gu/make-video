import {existsSync, readFileSync} from "node:fs";
import {isAbsolute, relative, resolve, sep} from "node:path";

export const projectRoot = process.env.MAKE_VIDEO_PROJECT_ROOT ?? process.cwd();
type JsonObject = Record<string, any>;
export type RenderContext = {
  videoId: string;
  config: JsonObject;
  composition: JsonObject;
  production: JsonObject;
  sourceDir: string;
  publicDir: string;
  outputs: Record<string, string>;
  resolveConfiguredPath: (value: unknown, label: string) => string;
};

const resolveInsideProject = (value: unknown, label: string) => {
  if (typeof value !== "string" || value.length === 0) throw new Error(`${label} must be a project-relative path.`);
  if (isAbsolute(value)) throw new Error(`${label} must not be absolute: ${value}`);
  const file = resolve(projectRoot, value); const fromRoot = relative(projectRoot, file);
  if (fromRoot === ".." || fromRoot.startsWith(`..${sep}`)) throw new Error(`${label} escapes the project: ${value}`);
  return file;
};
export const loadRenderContext = (videoId: string): RenderContext => {
  const sourceDir = resolve(projectRoot, "src", videoId); const configPath = resolve(sourceDir, "video.config.json");
  if (!existsSync(configPath)) throw new Error(`Video config not found: ${configPath}`);
  const config = JSON.parse(readFileSync(configPath, "utf8")) as JsonObject; const composition = config.composition as JsonObject; const production = config.production as JsonObject;
  if (config.videoId !== videoId) throw new Error(`video.config.json declares videoId "${config.videoId}" but directory target is "${videoId}".`);
  const publicRoot = resolve(projectRoot, "public");
  const publicDir = resolve(publicRoot, production.publicPath ?? videoId);
  const publicRelative = relative(publicRoot, publicDir);
  if (publicRelative === ".." || publicRelative.startsWith(`..${sep}`)) throw new Error("production.publicPath must stay inside public/.");
  const outputConfig = production.outputs as JsonObject; const outputs = Object.fromEntries(["still", "silent", "unmastered", "final"].map((name) => [name, resolveInsideProject(outputConfig[name], `production.outputs.${name}`)]));
  return {videoId, config, composition, production, sourceDir, publicDir, outputs, resolveConfiguredPath: resolveInsideProject};
};
export const parseTargetArgs = (args: string[]) => { const positionals = args.filter((arg) => !arg.startsWith("--")); const unknown = args.filter((arg) => arg.startsWith("--") && arg !== "--force"); if (unknown.length) throw new Error(`Unknown option: ${unknown.join(", ")}`); if (positionals.length !== 1) throw new Error("Exactly one video id is required."); return {videoId: positionals[0], force: args.includes("--force")}; };
export const assertOutputsAvailable = (files: string[], force: boolean, action: string) => { if (force) return; const existing = files.filter((file) => existsSync(file)); if (existing.length) throw new Error(`${action} stopped because generated output already exists:\n${existing.map((file) => `- ${file}`).join("\n")}\nPass --force only when regeneration was explicitly requested.`); };
