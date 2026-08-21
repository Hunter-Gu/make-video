import {existsSync, readFileSync} from "node:fs";
import {relative, resolve} from "node:path";

import {loadVideoContext, projectRoot} from "./video-context.mjs";

const [videoId, ...flags] = process.argv.slice(2);
if (!videoId) throw new Error("Usage: plan-revision.mjs <video-id> <--time=seconds|--scene=id|--asset=id|--source=id> [--region=x,y,w,h]");
const selectors = Object.fromEntries(flags.map((flag) => {
  const match = /^--([a-z]+)=(.+)$/.exec(flag);
  if (!match) throw new Error(`Invalid option: ${flag}`);
  return [match[1], match[2]];
}));
const selectorNames = ["time", "scene", "asset", "source"].filter((name) => selectors[name] !== undefined);
if (selectorNames.length !== 1) throw new Error("Provide exactly one time, scene, asset, or source selector.");
if (Object.keys(selectors).some((name) => ![...selectorNames, "region"].includes(name))) throw new Error("Unknown revision selector.");
const region = selectors.region?.split(",").map(Number);
if (region && (region.length !== 4 || region.some((value) => !Number.isFinite(value)) || region[2] <= 0 || region[3] <= 0)) {
  throw new Error("region must be x,y,width,height with positive width and height.");
}

const context = loadVideoContext(videoId);
const indexFile = resolve(context.sourceDir, "SCENE_INDEX.json");
if (!existsSync(indexFile)) throw new Error(`Scene index not found: ${indexFile}`);
const index = JSON.parse(readFileSync(indexFile, "utf8"));
if (index.fps !== context.composition.fps || !Array.isArray(index.scenes)) throw new Error("SCENE_INDEX.json has invalid fps or scenes.");

let previousEnd = 0;
for (const scene of index.scenes) {
  if (!scene.id || scene.startFrame !== previousEnd || !Number.isInteger(scene.endFrame) || scene.endFrame <= scene.startFrame) {
    throw new Error(`Scene timeline is invalid at ${scene.id ?? "unknown"}.`);
  }
  previousEnd = scene.endFrame;
}
if (previousEnd !== context.composition.durationInFrames) throw new Error("Scene index duration does not match the composition.");

let matched;
if (selectors.time !== undefined) {
  const frame = Math.floor(Number(selectors.time) * index.fps);
  if (!Number.isFinite(frame) || frame < 0) throw new Error("time must be a non-negative number.");
  matched = index.scenes.filter((/** @type {any} */ scene) => frame >= scene.startFrame && frame < scene.endFrame);
} else if (selectors.scene !== undefined) {
  matched = index.scenes.filter((/** @type {any} */ scene) => scene.id === selectors.scene);
} else if (selectors.asset !== undefined) {
  matched = index.scenes.filter((/** @type {any} */ scene) => scene.assetIds?.includes(selectors.asset));
} else {
  matched = index.scenes.filter((/** @type {any} */ scene) => scene.sourceBlockIds?.includes(selectors.source));
}
if (matched.length === 0) throw new Error("Revision selector matched no scenes.");

const unique = (/** @type {string[]} */ values) => [...new Set(values)].sort();
const sceneIds = matched.map((/** @type {any} */ scene) => scene.id);
const assetIds = unique(matched.flatMap((/** @type {any} */ scene) => scene.assetIds ?? []));
const report = {
  videoId,
  selector: {type: selectorNames[0], value: selectors[selectorNames[0]], ...(region ? {region} : {})},
  scenes: sceneIds,
  narrationIds: unique(matched.flatMap((/** @type {any} */ scene) => scene.narrationIds ?? [])),
  sourceBlockIds: unique(matched.flatMap((/** @type {any} */ scene) => scene.sourceBlockIds ?? [])),
  assetIds,
  assetFiles: unique(assetIds.map((id) => index.assets?.[id]).filter(Boolean)),
  codeFiles: unique(matched.flatMap((/** @type {any} */ scene) => scene.codeFiles ?? [])),
  affectedOutputs: [context.outputs.silent, context.outputs.unmastered, context.outputs.final].map((file) => relative(projectRoot, file)),
};
console.log(JSON.stringify(report, null, 2));
