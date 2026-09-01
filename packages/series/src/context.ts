import {existsSync, readFileSync, readdirSync} from "node:fs";
import {isAbsolute, relative, resolve, sep} from "node:path";

export const projectRoot = process.env.MAKE_VIDEO_PROJECT_ROOT ?? process.cwd();

type JsonObject = Record<string, any>;

export type SeriesContext = {
  seriesId: string;
  seriesDir: string;
  plan: JsonObject;
  bible: JsonObject;
  resolveConfiguredPath: (value: unknown, label: string) => string;
};

const seriesIdPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const resolveInsideProject = (value: unknown, label: string) => {
  if (typeof value !== "string" || value.length === 0) throw new Error(`${label} must be a non-empty project-relative path.`);
  if (isAbsolute(value)) throw new Error(`${label} must not be absolute: ${value}`);
  const file = resolve(projectRoot, value);
  const fromRoot = relative(projectRoot, file);
  if (fromRoot === ".." || fromRoot.startsWith(`..${sep}`)) throw new Error(`${label} escapes the project: ${value}`);
  return file;
};

export const readJson = (file: string): JsonObject => JSON.parse(readFileSync(file, "utf8"));

export const seriesRoot = () => resolve(projectRoot, "projects");

/** List series projects that declare an ordered episode plan. */
export const listSeriesProjects = () => {
  const root = seriesRoot();
  if (!existsSync(root)) return [];
  return readdirSync(root, {withFileTypes: true})
    .filter((entry) => entry.isDirectory() && seriesIdPattern.test(entry.name) && existsSync(resolve(root, entry.name, "series-plan.json")))
    .map((entry) => entry.name)
    .sort();
};

export const loadSeriesContext = (seriesId: string): SeriesContext => {
  if (!seriesIdPattern.test(seriesId)) throw new Error(`Invalid series id "${seriesId}". Use lowercase kebab-case directory names.`);
  const seriesDir = resolve(seriesRoot(), seriesId);
  const planFile = resolve(seriesDir, "series-plan.json");
  if (!existsSync(planFile)) throw new Error(`Series plan not found: ${planFile}`);
  const bibleFile = resolve(seriesDir, "SERIES_BIBLE.json");
  if (!existsSync(bibleFile)) throw new Error(`Series bible not found: ${bibleFile}`);
  const plan = readJson(planFile);
  if (plan.seriesId !== undefined && plan.seriesId !== seriesId) throw new Error(`series-plan.json declares seriesId "${plan.seriesId}" but directory target is "${seriesId}".`);
  return {seriesId, seriesDir, plan, bible: readJson(bibleFile), resolveConfiguredPath: resolveInsideProject};
};

export const parseTargetArgs = (args: string[]) => {
  const positionals = args.filter((arg) => !arg.startsWith("--"));
  const unknown = args.filter((arg) => arg.startsWith("--") && arg !== "--force");
  if (unknown.length > 0) throw new Error(`Unknown option: ${unknown.join(", ")}`);
  if (positionals.length !== 1) throw new Error("Exactly one series id is required.");
  return {seriesId: positionals[0], force: args.includes("--force")};
};

export const assertOutputAvailable = (file: string, force: boolean, action: string) => {
  if (!force && existsSync(file)) throw new Error(`${action} stopped because output already exists: ${file}\nPass --force to regenerate.`);
};
