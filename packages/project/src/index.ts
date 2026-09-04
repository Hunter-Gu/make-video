import {existsSync, readFileSync} from "node:fs";
import {isAbsolute, relative, resolve, sep} from "node:path";

export const projectRoot = resolve(process.env.MAKE_VIDEO_PROJECT_ROOT ?? process.cwd());

export type JsonObject = Record<string, any>;

/**
 * Report progress on stderr.
 *
 * These functions run inside the MCP server as well as behind the CLIs, and a
 * stdio MCP session owns stdout for its JSON-RPC frames. A progress line written
 * there corrupts the stream: some hosts skip the unparseable line, others drop
 * the session. Nothing here emits machine-readable output on stdout, so all of it
 * belongs on stderr, where a terminal still shows it.
 */
export const log = (message: string) => { process.stderr.write(`${message}\n`); };

/**
 * Run a CLI entrypoint and report a failure as one readable line.
 *
 * The CLIs ship as minified single-line bundles, so an uncaught error makes Node
 * print the entire bundle as the offending "source line" before the message that
 * actually matters. Set MAKE_VIDEO_DEBUG to get the stack as well.
 */
export const runCli = async (work: () => unknown) => {
  try {
    await work();
  } catch (error) {
    log(error instanceof Error ? error.message : String(error));
    if (process.env.MAKE_VIDEO_DEBUG && error instanceof Error && error.stack) log(error.stack);
    process.exitCode = 1;
  }
};

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

/**
 * Read a JSON project file, naming the file when it cannot be parsed.
 *
 * Project files are authored by hand and by the host agent, so a stray comma is
 * an ordinary failure. Node's own message — "Unexpected token } in JSON at
 * position 412" — says nothing about which of a project's dozen JSON files it
 * came from, which is the only thing the reader needs to know.
 */
export const readJsonFile = <T = JsonObject>(file: string): T => {
  const text = readFileSync(file, "utf8");
  try {
    return JSON.parse(text) as T;
  } catch (error) {
    throw new Error(`${relative(projectRoot, file)} is not valid JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
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
  const config = readJsonFile(configPath);
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
