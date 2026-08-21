import {existsSync, readFileSync, writeFileSync} from "node:fs";
import {relative, resolve} from "node:path";

import {approvalLockFile, fileHash, readApprovalLock} from "./approval-lock-lib.mjs";
import {loadVideoContext, projectRoot} from "./video-context.mjs";

const [action, videoId, ...flags] = process.argv.slice(2);
if (!new Set(["lock", "verify", "unlock"]).has(action) || !videoId) {
  throw new Error("Usage: approval-lock.mjs <lock|verify|unlock> <video-id> [--force]");
}
const force = flags.includes("--force");
if (flags.some((flag) => flag !== "--force")) throw new Error(`Unknown option: ${flags.join(", ")}`);
const context = loadVideoContext(videoId);
const lockFile = approvalLockFile(context);
const existing = readApprovalLock(context);

if (action === "unlock") {
  if (!existing?.active) throw new Error(`${videoId} has no active approval lock.`);
  writeFileSync(lockFile, `${JSON.stringify({...existing, active: false, unlockedAt: new Date().toISOString()}, null, 2)}\n`);
  console.log(`Approval lock disabled for ${videoId}.`);
  process.exit(0);
}

if (action === "verify") {
  if (!existing?.active) throw new Error(`${videoId} has no active approval lock.`);
  const changed = existing.files.filter((/** @type {{path: string, sha256: string}} */ item) => {
    const file = resolve(projectRoot, item.path);
    return !existsSync(file) || fileHash(file) !== item.sha256;
  });
  if (changed.length > 0) throw new Error(`Approval lock mismatch: ${changed.map((/** @type {{path: string}} */ item) => item.path).join(", ")}`);
  console.log(`Approval lock verified: ${existing.files.length} files.`);
  process.exit(0);
}

if (existsSync(lockFile) && !force) throw new Error(`Approval lock exists: ${lockFile}. Pass --force after renewed approval.`);
const candidates = [
  "PRODUCTION_PLAN.md",
  "SCRIPT.md",
  "STORYBOARD.md",
  "CLAIMS.json",
  "SCENE_INDEX.json",
  "CANDIDATES.json",
  "DELIVERABLES.json",
  "VISUAL_BIBLE.json",
  "CHARACTER_BIBLE.json",
  "PROMPT_CONSTRAINTS.md",
  "SOURCE_ANNOTATIONS.json",
  "TIMING_PLAN.json",
  "GENERATION_PLAN.json",
  "GENERATION_ESTIMATE.json",
  "GENERATION_APPROVAL.json",
  "CLIP_QA.json",
  "IMAGE_QA.json",
  "sources/catalog.json",
  "content.ts",
  "video.config.json",
  "sources/index.json",
].map((file) => resolve(context.sourceDir, file));
for (const item of Array.isArray(context.production.assetLinks) ? context.production.assetLinks : []) {
  if (item && typeof item === "object" && "source" in item) {
    candidates.push(context.resolveConfiguredPath(item.source, "production.assetLinks.source"));
  }
}
for (const asset of context.config.imageGeneration?.assets ?? []) candidates.push(resolve(context.publicDir, asset.output));
for (const asset of context.config.videoGeneration?.assets ?? []) candidates.push(resolve(context.publicDir, asset.output));
for (const file of ["images/generated/manifest.json", "video/generated/manifest.json", "audio/voiceover/manifest.json"]) candidates.push(resolve(context.publicDir, file));
for (const segment of context.config.captions ?? []) candidates.push(resolve(context.audioDirs.voiceover, `${segment.id}.wav`));
for (const file of ["voiceover.wav", "manifest.json"]) candidates.push(resolve(context.audioDirs.voiceover, file));
candidates.push(resolve(context.audioDirs.music, "lyria-underscore.mp3"));
for (const file of ["click.wav", "ding.wav", "whoosh.wav"]) candidates.push(resolve(context.audioDirs.sfx, file));
for (const output of Object.values(context.outputs)) candidates.push(output);
const candidateFile = resolve(context.sourceDir, "CANDIDATES.json");
if (existsSync(candidateFile)) {
  const candidateManifest = JSON.parse(readFileSync(candidateFile, "utf8"));
  for (const group of candidateManifest.groups ?? []) {
    candidates.push(resolve(context.publicDir, group.output));
    for (const candidate of group.candidates ?? []) candidates.push(context.resolveConfiguredPath(candidate.path, `candidate ${candidate.id}`));
  }
}
const deliverableFile = resolve(context.sourceDir, "DELIVERABLES.json");
if (existsSync(deliverableFile)) {
  const deliverables = JSON.parse(readFileSync(deliverableFile, "utf8"));
  for (const variant of deliverables.variants ?? []) {
    candidates.push(context.resolveConfiguredPath(variant.output, `deliverable ${variant.id}`));
    if (variant.translation) candidates.push(context.resolveConfiguredPath(variant.translation, `deliverable ${variant.id} translation`));
  }
  candidates.push(resolve(projectRoot, "output", videoId, "delivery-report.json"));
}
const files = [...new Set(candidates)].filter(existsSync).map((file) => ({path: relative(projectRoot, file), sha256: fileHash(file)})).sort((a, b) => a.path.localeCompare(b.path));
const lock = {version: 1, videoId, active: true, approvedAt: new Date().toISOString(), files};
writeFileSync(lockFile, `${JSON.stringify(lock, null, 2)}\n`);
console.log(`Approval lock created: ${files.length} files.`);
