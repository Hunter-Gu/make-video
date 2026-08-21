import {existsSync, readFileSync} from "node:fs";
import {resolve} from "node:path";
import {spawnSync} from "node:child_process";

import {projectRoot} from "./video-context.mjs";

const videoId = process.argv[2] ?? "library-of-alexandria";
const requiredFiles = [
  "PRODUCTION_PLAN.md", "SCRIPT.md", "STORYBOARD.md", "TIMING_PLAN.json",
  "SCENE_INDEX.json", "CLAIMS.json", "SOURCE_ANNOTATIONS.json",
  "VISUAL_BIBLE.json", "CHARACTER_BIBLE.json", "PROMPT_CONSTRAINTS.md",
  "GENERATION_PLAN.json", "GENERATION_ESTIMATE.json", "CANDIDATES.json",
  "DELIVERABLES.json", "sources/index.json", "sources/catalog.json",
];
const sourceDir = resolve(projectRoot, "src", videoId);
const missing = requiredFiles.filter((file) => !existsSync(resolve(sourceDir, file)));
if (missing.length > 0) throw new Error(`Roadmap artifacts missing: ${missing.join(", ")}`);

const config = JSON.parse(readFileSync(resolve(sourceDir, "video.config.json"), "utf8"));
const index = JSON.parse(readFileSync(resolve(sourceDir, "SCENE_INDEX.json"), "utf8"));
const frames = index.scenes.reduce((/** @type {number} */ sum, /** @type {{durationInFrames: number}} */ scene) => sum + scene.durationInFrames, 0);
if (frames !== config.composition.durationInFrames) throw new Error("Scene timing does not match the composition.");

const content = readFileSync(resolve(sourceDir, "content.ts"), "utf8");
const sceneTypes = ["portrait", "timeline", "map", "document", "quote", "relationship", "comparison", "statistic", "chart", "montage", "chapter", "depth", "video"];
const absentTypes = sceneTypes.filter((type) => !content.includes(`type: "${type}"`));
if (absentTypes.length > 0) throw new Error(`Scene examples missing: ${absentTypes.join(", ")}`);

const delivery = JSON.parse(readFileSync(resolve(sourceDir, "DELIVERABLES.json"), "utf8"));
const requiredVariants = ["horizontal-captioned", "horizontal-clean", "vertical-captioned", "zh-captioned", "thumbnail", "trailer", "vertical-short"];
const absentVariants = requiredVariants.filter((id) => !delivery.variants.some((/** @type {{id: string}} */ variant) => variant.id === id));
if (absentVariants.length > 0) throw new Error(`Delivery variants missing: ${absentVariants.join(", ")}`);

/** @type {Array<[string, string[]]>} */
const commands = [
  ["pnpm", ["typecheck"]],
  [process.execPath, ["skills/make-video/scripts/verify-claims.mjs", videoId]],
  [process.execPath, ["skills/make-video/scripts/verify-visual-bibles.mjs", videoId]],
  [process.execPath, ["skills/make-video/scripts/verify-series.mjs", "alexandria-history"]],
  [process.execPath, ["skills/make-video/scripts/qa-generated-videos.mjs", videoId]],
  [process.execPath, ["skills/make-video/scripts/qa-images.mjs", videoId]],
  [process.execPath, ["skills/make-video/scripts/qa-video.mjs", videoId]],
];
for (const [command, args] of commands) {
  const result = spawnSync(command, args, {cwd: projectRoot, env: process.env, stdio: "inherit"});
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

console.log(`✓ Roadmap acceptance passed for ${videoId}: ${frames} frames, ${index.scenes.length} scenes, ${delivery.variants.length} deliverables.`);
