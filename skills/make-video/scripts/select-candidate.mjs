import {existsSync, readFileSync, unlinkSync, writeFileSync} from "node:fs";
import {relative, resolve, sep} from "node:path";
import {spawnSync} from "node:child_process";

import {assertTargetsUnlocked} from "./approval-lock-lib.mjs";
import {loadVideoContext, projectRoot, scriptsDir} from "./video-context.mjs";

const [videoId, groupId, candidateId, ...flags] = process.argv.slice(2);
if (!videoId || !groupId || !candidateId || flags.some((flag) => flag !== "--force")) {
  throw new Error("Usage: select-candidate.mjs <video-id> <group-id> <candidate-id> [--force]");
}
const force = flags.includes("--force");
const context = loadVideoContext(videoId);
const manifestFile = resolve(context.sourceDir, "CANDIDATES.json");
if (!existsSync(manifestFile)) throw new Error(`Candidate manifest not found: ${manifestFile}`);
const manifest = JSON.parse(readFileSync(manifestFile, "utf8"));
const group = manifest.groups?.find((/** @type {any} */ item) => item.id === groupId);
if (!group) throw new Error(`Candidate group not found: ${groupId}`);
const candidate = group.candidates?.find((/** @type {any} */ item) => item.id === candidateId);
if (!candidate) throw new Error(`Candidate not found: ${candidateId}`);
const source = context.resolveConfiguredPath(candidate.path, `candidate ${candidateId}`);
if (!existsSync(source)) throw new Error(`Candidate file not found: ${source}`);
const output = resolve(context.publicDir, group.output);
const relativeOutput = relative(context.publicDir, output);
if (relativeOutput === ".." || relativeOutput.startsWith(`..${sep}`)) throw new Error("Candidate output must stay inside publicDir.");
if (group.selectedId === candidateId) {
  const linked = spawnSync(process.execPath, [resolve(scriptsDir, "link-assets.mjs"), videoId], {cwd: projectRoot, stdio: "inherit"});
  if (linked.status !== 0) process.exit(linked.status ?? 1);
  console.log(`${candidateId} is already selected for ${groupId}.`);
  process.exit(0);
}
assertTargetsUnlocked(context, [manifestFile, output]);
if (group.selectedId !== candidateId && existsSync(output) && !force) {
  throw new Error(`Selected output exists: ${output}. Pass --force to switch candidates.`);
}
group.selectedId = candidateId;
group.selectedAt = new Date().toISOString();
writeFileSync(manifestFile, `${JSON.stringify(manifest, null, 2)}\n`);
if (existsSync(output)) unlinkSync(output);
const linked = spawnSync(process.execPath, [resolve(scriptsDir, "link-assets.mjs"), videoId], {cwd: projectRoot, stdio: "inherit"});
if (linked.status !== 0) process.exit(linked.status ?? 1);
console.log(`Selected ${candidateId} for ${groupId}.`);
