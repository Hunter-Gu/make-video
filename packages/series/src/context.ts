import {existsSync, readFileSync, readdirSync} from "node:fs";
import {resolve} from "node:path";

import {projectRoot, resolveInsideProject, videoIdPattern} from "@make-video/project";

export {projectRoot};

type JsonObject = Record<string, any>;

export type SeriesContext = {
  seriesId: string;
  seriesDir: string;
  plan: JsonObject;
  bible: JsonObject;
  resolveConfiguredPath: (value: unknown, label: string) => string;
};

export const readJson = (file: string): JsonObject => JSON.parse(readFileSync(file, "utf8"));

export const seriesRoot = () => resolve(projectRoot, "projects");

/** List series projects that declare an ordered episode plan. */
export const listSeriesProjects = () => {
  const root = seriesRoot();
  if (!existsSync(root)) return [];
  return readdirSync(root, {withFileTypes: true})
    .filter((entry) => entry.isDirectory() && videoIdPattern.test(entry.name) && existsSync(resolve(root, entry.name, "series-plan.json")))
    .map((entry) => entry.name)
    .sort();
};

export const loadSeriesContext = (seriesId: string): SeriesContext => {
  if (!videoIdPattern.test(seriesId)) throw new Error(`Invalid series id "${seriesId}". Use lowercase kebab-case directory names.`);
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
  const positionals = args.filter((argument) => !argument.startsWith("--"));
  const unknown = args.filter((argument) => argument.startsWith("--") && argument !== "--force");
  if (unknown.length > 0) throw new Error(`Unknown option: ${unknown.join(", ")}`);
  if (positionals.length !== 1) throw new Error("Exactly one series id is required.");
  return {seriesId: positionals[0], force: args.includes("--force")};
};

export const assertOutputAvailable = (file: string, force: boolean, action: string) => {
  if (!force && existsSync(file)) throw new Error(`${action} stopped because output already exists: ${file}\nPass --force to regenerate.`);
};
