import {existsSync, readFileSync, writeFileSync} from "node:fs";
import {resolve} from "node:path";

import {loadVideoContext, parseTargetArgs} from "./video-context.mjs";

const {videoId} = parseTargetArgs(process.argv.slice(2));
const {sourceDir} = loadVideoContext(videoId);
const scriptFile = resolve(sourceDir, "SCRIPT.md");
const claimsFile = resolve(sourceDir, "CLAIMS.json");
const indexFile = resolve(sourceDir, "sources/index.json");
for (const file of [scriptFile, claimsFile, indexFile]) {
  if (!existsSync(file)) throw new Error(`Claim verification input not found: ${file}`);
}

const scriptIds = [...readFileSync(scriptFile, "utf8").matchAll(/^- `([^`]+)`:/gm)].map((match) => match[1]);
const claims = JSON.parse(readFileSync(claimsFile, "utf8")).claims;
const sourceIndex = JSON.parse(readFileSync(indexFile, "utf8"));
if (!Array.isArray(claims)) throw new Error("CLAIMS.json must contain a claims array.");

const blocks = new Map();
for (const source of sourceIndex.sources ?? []) {
  for (const block of source.blocks ?? []) blocks.set(block.id, {...block, sourceTitle: source.title});
}

const errors = [];
const coveredNarration = new Set();
const rows = [];
for (const claim of claims) {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(claim.id)) errors.push(`Invalid claim id: ${claim.id}`);
  if (!["direct", "paraphrase", "inference"].includes(claim.type)) errors.push(`Invalid claim type: ${claim.id}`);
  for (const narrationId of claim.narrationIds ?? []) coveredNarration.add(narrationId);
  const sourceBlockIds = claim.sourceBlockIds ?? [];
  if (claim.type !== "inference" && sourceBlockIds.length === 0) errors.push(`Sourced claim has no source: ${claim.id}`);
  for (const blockId of sourceBlockIds) {
    if (!blocks.has(blockId)) errors.push(`Unknown source block ${blockId} in ${claim.id}`);
  }
  rows.push({claim, sources: sourceBlockIds.map((/** @type {string} */ id) => blocks.get(id)).filter(Boolean)});
}
for (const narrationId of scriptIds) {
  if (!coveredNarration.has(narrationId)) errors.push(`Narration block has no claim record: ${narrationId}`);
}

const markdown = ["# Sources", "", ...rows.flatMap(({claim, sources}) => [
  `## ${claim.id}`,
  "",
  `- Type: ${claim.type}`,
  `- Narration: ${(claim.narrationIds ?? []).join(", ") || "none"}`,
  `- Claim: ${claim.text}`,
  ...sources.map((/** @type {any} */ source) => `- Source: ${source.sourceTitle}, ${source.locator} (${source.id})`),
  ...(claim.type === "inference" ? [`- Disclosure: ${claim.disclosure ?? "Model interpretation"}`] : []),
  "",
])].join("\n");
writeFileSync(resolve(sourceDir, "SOURCES.md"), markdown);

if (errors.length > 0) {
  for (const error of errors) console.error(`✗ ${error}`);
  process.exit(1);
}
console.log(`✓ ${claims.length} claims cover ${scriptIds.length} narration blocks.`);
