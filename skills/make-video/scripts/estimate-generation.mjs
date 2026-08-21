import {readFileSync, writeFileSync} from "node:fs";
import {resolve} from "node:path";

import {assertOutputsAvailable, loadVideoContext, parseTargetArgs} from "./video-context.mjs";
import {stableHash} from "./generation-approval.mjs";

const {videoId, force} = parseTargetArgs(process.argv.slice(2));
const context = loadVideoContext(videoId);
const planFile = resolve(context.sourceDir, "GENERATION_PLAN.json");
const plan = JSON.parse(readFileSync(planFile, "utf8"));
if (plan.currency !== "USD" || !Array.isArray(plan.assets) || plan.assets.length === 0) throw new Error("GENERATION_PLAN.json needs USD currency and assets.");
const seen = new Set();
const rounded = (/** @type {number} */ value) => Math.round(value * 1_000_000) / 1_000_000;
const assets = plan.assets.map((/** @type {any} */ asset) => {
  if (!asset.id || seen.has(asset.id) || !["image", "video", "voice", "music"].includes(asset.kind) || !asset.model || !Number.isFinite(asset.units) || !Number.isFinite(asset.costPerUnit) || !Array.isArray(asset.latencySeconds)) throw new Error("Generation plan contains an invalid or duplicate asset.");
  seen.add(asset.id);
  return {...asset, estimatedCost: rounded(asset.units * asset.costPerUnit), estimatedLatencySeconds: {min: asset.latencySeconds[0], max: asset.latencySeconds[1]}};
});
const estimate = {
  videoId,
  currency: plan.currency,
  planHash: stableHash(plan),
  totalEstimatedCost: rounded(assets.reduce((/** @type {number} */ sum, /** @type {any} */ asset) => sum + asset.estimatedCost, 0)),
  sequentialLatencySeconds: {min: assets.reduce((/** @type {number} */ sum, /** @type {any} */ asset) => sum + asset.estimatedLatencySeconds.min, 0), max: assets.reduce((/** @type {number} */ sum, /** @type {any} */ asset) => sum + asset.estimatedLatencySeconds.max, 0)},
  assets,
};
const output = resolve(context.sourceDir, "GENERATION_ESTIMATE.json");
assertOutputsAvailable([output], {force, action: `Generation estimate for ${videoId}`});
writeFileSync(output, `${JSON.stringify(estimate, null, 2)}\n`);
console.log(`Estimated ${assets.length} assets: $${estimate.totalEstimatedCost.toFixed(2)} USD, ${estimate.sequentialLatencySeconds.min}–${estimate.sequentialLatencySeconds.max}s sequential latency.`);
