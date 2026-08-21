import {createHash} from "node:crypto";
import {existsSync, readFileSync} from "node:fs";
import {resolve} from "node:path";

/** @param {unknown} value */
export const stableHash = (value) => createHash("sha256").update(JSON.stringify(value)).digest("hex");

/** @param {import("./video-context.mjs").VideoContext} context @param {string} kind @param {string[]} assetIds */
export const assertGenerationApproved = (context, kind, assetIds) => {
  const planFile = resolve(context.sourceDir, "GENERATION_PLAN.json");
  const estimateFile = resolve(context.sourceDir, "GENERATION_ESTIMATE.json");
  const approvalFile = resolve(context.sourceDir, "GENERATION_APPROVAL.json");
  if (!existsSync(planFile) || !existsSync(estimateFile) || !existsSync(approvalFile)) throw new Error("Generation plan, estimate, and approval are required before model calls.");
  const plan = JSON.parse(readFileSync(planFile, "utf8"));
  const estimate = JSON.parse(readFileSync(estimateFile, "utf8"));
  const approval = JSON.parse(readFileSync(approvalFile, "utf8"));
  const planned = new Set((plan.assets ?? []).filter((/** @type {any} */ asset) => asset.kind === kind).map((/** @type {any} */ asset) => asset.id));
  const missing = assetIds.filter((id) => !planned.has(id));
  if (missing.length > 0) throw new Error(`Generation estimate is missing ${kind} assets: ${missing.join(", ")}`);
  if (estimate.planHash !== stableHash(plan) || approval.estimateHash !== estimate.planHash) throw new Error("Generation approval does not match the current estimate.");
  const approved = new Set(approval.approvedAssetIds ?? []);
  if (assetIds.some((id) => !approved.has(id))) throw new Error(`Generation assets are not approved: ${assetIds.filter((id) => !approved.has(id)).join(", ")}`);
  return new Map((plan.assets ?? []).map((/** @type {any} */ asset) => [asset.id, asset]));
};
