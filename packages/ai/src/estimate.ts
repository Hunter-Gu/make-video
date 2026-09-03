import {createHash} from "node:crypto";
import {existsSync, readFileSync} from "node:fs";
import {relative, resolve} from "node:path";

import {log, projectRoot} from "@make-video/project";

import {loadVideoContext} from "./project";
import {writeJson} from "./provider";
import type {AnyRecord} from "./types";

const kinds = new Set(["image", "video", "voice", "music"]);
const kebabCase = (value: unknown) => typeof value === "string" && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value);

/**
 * Costs are quoted per second of speech at four decimal places, so a run of a few
 * seconds still has to survive rounding. Six places keeps those apart while
 * dropping the floating-point tail that makes 8 × 0.35 read as 2.8000000000000003.
 */
const money = (value: number) => Number(value.toFixed(6));

export type EstimatedAsset = {
  id: string;
  kind: string;
  provider?: string;
  model?: string;
  unit?: string;
  units: number;
  costPerUnit: number;
  latencySeconds: [number, number];
  sceneIds: string[];
  estimatedCost: number;
  estimatedLatencySeconds: {min: number; max: number};
};

export type GenerationEstimate = {
  videoId: string;
  currency: string;
  planHash: string;
  totalEstimatedCost: number;
  sequentialLatencySeconds: {min: number; max: number};
  assets: EstimatedAsset[];
  /** Names — an asset id, or a kind for whole-project voice and music — configured to spend but carrying no declared cost. */
  uncosted: string[];
  estimatedAt: string;
};

const configuredAssetIds = (config: AnyRecord, key: "imageGeneration" | "videoGeneration") => {
  const section = config[key] as AnyRecord | undefined;
  const assets = Array.isArray(section?.assets) ? section.assets : [];
  return assets.map((asset: AnyRecord) => String(asset?.id ?? "")).filter(Boolean);
};

/**
 * Price a paid generation run before it happens.
 *
 * The project declares what each asset costs in GENERATION_PLAN.json; this only
 * does arithmetic on it and writes the result. Nothing here contacts a provider,
 * so an agent can ask what a plan would cost as often as it likes — which is the
 * point of keeping planning separate from generation.
 */
export const estimateGeneration = (videoId: string): GenerationEstimate => {
  const context = loadVideoContext(videoId);
  const planFile = resolve(context.sourceDir, "GENERATION_PLAN.json");
  if (!existsSync(planFile)) {
    throw new Error(`GENERATION_PLAN.json not found for ${videoId}: ${relative(projectRoot, planFile)}. Declare the unit cost and latency of each paid asset before estimating.`);
  }
  const plan = JSON.parse(readFileSync(planFile, "utf8")) as AnyRecord;
  if (!plan || typeof plan !== "object" || plan.version !== 1 || !Array.isArray(plan.assets)) {
    throw new Error("GENERATION_PLAN.json must be an object with version 1 and an assets array.");
  }

  const seen = new Set<string>();
  const assets: EstimatedAsset[] = plan.assets.map((asset: AnyRecord, index: number) => {
    const label = `GENERATION_PLAN.json assets[${index}]`;
    if (!asset || typeof asset !== "object" || Array.isArray(asset)) throw new Error(`${label} must be an object.`);
    if (!kebabCase(asset.id)) throw new Error(`${label} needs a kebab-case id.`);
    if (seen.has(asset.id)) throw new Error(`Duplicate cost plan asset: ${asset.id}`);
    seen.add(asset.id);
    if (!kinds.has(asset.kind)) throw new Error(`Cost plan asset ${asset.id} kind must be one of ${[...kinds].join(", ")}.`);
    if (!Number.isFinite(asset.units) || asset.units <= 0) throw new Error(`Cost plan asset ${asset.id} needs positive units.`);
    if (!Number.isFinite(asset.costPerUnit) || asset.costPerUnit < 0) throw new Error(`Cost plan asset ${asset.id} needs a costPerUnit of zero or more.`);
    const latency = asset.latencySeconds;
    if (!Array.isArray(latency) || latency.length !== 2 || !latency.every((value) => Number.isFinite(value) && value >= 0) || latency[0] > latency[1]) {
      throw new Error(`Cost plan asset ${asset.id} needs latencySeconds as [min, max].`);
    }
    return {
      id: asset.id,
      kind: asset.kind,
      ...(asset.provider ? {provider: String(asset.provider)} : {}),
      ...(asset.model ? {model: String(asset.model)} : {}),
      ...(asset.unit ? {unit: String(asset.unit)} : {}),
      units: asset.units,
      costPerUnit: asset.costPerUnit,
      latencySeconds: [latency[0], latency[1]],
      sceneIds: Array.isArray(asset.sceneIds) ? asset.sceneIds.map(String) : [],
      estimatedCost: money(asset.units * asset.costPerUnit),
      estimatedLatencySeconds: {min: latency[0], max: latency[1]},
    };
  });

  // Generation runs one asset at a time, so the wait is the sum, not the maximum.
  const sequentialLatencySeconds = assets.reduce(
    (total, asset) => ({min: total.min + asset.estimatedLatencySeconds.min, max: total.max + asset.estimatedLatencySeconds.max}),
    {min: 0, max: 0},
  );

  // A total is only trustworthy if it covers everything the project is configured
  // to spend on. The reverse — a costed asset nobody has configured yet — is normal
  // while planning, so it is not reported.
  const costedIds = new Set(assets.map((asset) => asset.id));
  const costedKinds = new Set(assets.map((asset) => asset.kind));
  const configuredModel = (key: "voice" | "music") => typeof (context.config[key] as AnyRecord | undefined)?.model === "string";
  const uncosted = [
    ...configuredAssetIds(context.config, "imageGeneration"),
    ...configuredAssetIds(context.config, "videoGeneration"),
  ].filter((id) => !costedIds.has(id));
  for (const kind of ["voice", "music"] as const) if (configuredModel(kind) && !costedKinds.has(kind)) uncosted.push(kind);

  const estimate: GenerationEstimate = {
    videoId,
    currency: typeof plan.currency === "string" ? plan.currency : "USD",
    // The estimate is a pure function of the cost plan: a changed hash means a stale estimate.
    planHash: createHash("sha256").update(JSON.stringify(plan.assets)).digest("hex"),
    totalEstimatedCost: money(assets.reduce((total, asset) => total + asset.estimatedCost, 0)),
    sequentialLatencySeconds,
    assets,
    uncosted: [...new Set(uncosted)].sort(),
    estimatedAt: new Date().toISOString(),
  };

  // An estimate costs nothing to recompute, so it is always rewritten; the
  // no-overwrite rule protects generated media, and this is a report.
  const output = resolve(context.sourceDir, "GENERATION_ESTIMATE.json");
  writeJson(output, estimate);
  log(`Estimated generation for ${videoId}: ${estimate.totalEstimatedCost} ${estimate.currency}, ${sequentialLatencySeconds.min}-${sequentialLatencySeconds.max}s across ${assets.length} asset(s).`);
  for (const id of estimate.uncosted) log(`! ${id} is configured for generation but carries no cost in the plan; the total is lower than the run.`);
  return estimate;
};
