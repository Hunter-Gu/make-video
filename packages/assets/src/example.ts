import {log, readJsonFile} from "@make-video/project";
import {copyFileSync, existsSync, mkdirSync, readdirSync} from "node:fs";
import {dirname, relative, resolve, sep} from "node:path";

import {projectRoot} from "./context";
import {linkAssets} from "./link";

const videoIdPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const copyTree = (from: string, to: string, force: boolean, copied: string[], skipped: string[]) => {
  for (const entry of readdirSync(from, {withFileTypes: true}).sort((left, right) => left.name.localeCompare(right.name))) {
    const source = resolve(from, entry.name);
    const target = resolve(to, entry.name);
    if (entry.isDirectory()) { copyTree(source, target, force, copied, skipped); continue; }
    if (!entry.isFile()) continue;
    if (existsSync(target) && !force) { skipped.push(relative(projectRoot, target)); continue; }
    mkdirSync(dirname(target), {recursive: true});
    copyFileSync(source, target);
    copied.push(relative(projectRoot, target));
  }
};

const inside = (root: string, file: string) => {
  const value = relative(root, file);
  return value !== ".." && !value.startsWith(`..${sep}`);
};

/**
 * Materialize a tracked example project into the local, user-owned project areas.
 * Example fixtures stay in packages/examples; src/ and projects/ remain local state.
 */
export const installExample = (videoId: string, force: boolean) => {
  if (!videoIdPattern.test(videoId)) throw new Error(`Invalid video id "${videoId}". Use lowercase kebab-case directory names.`);
  const exampleDir = resolve(projectRoot, "packages/examples", videoId);
  const projectSource = resolve(exampleDir, "project");
  if (!existsSync(projectSource)) throw new Error(`No example project found at ${relative(projectRoot, projectSource)}.`);
  const copied: string[] = [];
  const skipped: string[] = [];
  const projectTarget = resolve(projectRoot, "src", videoId);
  if (!inside(resolve(projectRoot, "src"), projectTarget)) throw new Error("Example project target must stay inside src/.");
  copyTree(projectSource, projectTarget, force, copied, skipped);

  const seriesSource = resolve(exampleDir, "series");
  if (existsSync(seriesSource)) {
    const planFile = resolve(seriesSource, "series-plan.json");
    if (!existsSync(planFile)) throw new Error(`Example series is missing ${relative(projectRoot, planFile)}.`);
    const seriesId = String(readJsonFile(planFile).seriesId ?? "");
    if (!videoIdPattern.test(seriesId)) throw new Error(`Example series-plan.json needs a kebab-case seriesId.`);
    copyTree(seriesSource, resolve(projectRoot, "projects", seriesId), force, copied, skipped);
  }

  linkAssets(videoId);
  log(`Installed example ${videoId}: ${copied.length} file(s) written, ${skipped.length} kept.`);
  if (skipped.length > 0) log(`Existing files were kept:\n${skipped.map((file) => `- ${file}`).join("\n")}\nPass --force to replace them.`);
  return {videoId, copied, skipped};
};
