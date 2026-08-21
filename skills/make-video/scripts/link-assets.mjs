import {createHash} from "node:crypto";
import {
  createReadStream,
  existsSync,
  linkSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  statSync,
  unlinkSync,
} from "node:fs";
import {dirname, relative, resolve, sep} from "node:path";

import {
  loadVideoContext,
  parseTargetArgs,
} from "./video-context.mjs";

const {videoId} = parseTargetArgs(process.argv.slice(2));
const context = loadVideoContext(videoId);
const assetLinks = context.production.assetLinks ?? [];

/**
 * @param {string} fileName
 * @returns {Promise<string>}
 */
const hashFile = (fileName) =>
  new Promise((resolveHash, reject) => {
    const hash = createHash("sha256");
    const stream = createReadStream(fileName);
    stream.on("error", reject);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("end", () => resolveHash(hash.digest("hex")));
  });

if (!Array.isArray(assetLinks)) {
  throw new Error("production.assetLinks must be an array.");
}

const candidateFile = resolve(context.sourceDir, "CANDIDATES.json");
if (existsSync(candidateFile)) {
  const candidates = JSON.parse(readFileSync(candidateFile, "utf8"));
  for (const group of candidates.groups ?? []) {
    const selected = group.candidates?.find((/** @type {any} */ item) => item.id === group.selectedId);
    if (!selected) throw new Error(`Candidate group ${group.id} has no valid selection.`);
    assetLinks.push({source: selected.path, output: group.output});
  }
}

for (const [index, item] of assetLinks.entries()) {
  if (!item || typeof item !== "object") {
    throw new Error(`production.assetLinks[${index}] must be an object.`);
  }

  if (typeof item.output !== "string" || item.output.length === 0) {
    throw new Error(
      `production.assetLinks[${index}].output must be a non-empty string.`,
    );
  }

  const source = context.resolveConfiguredPath(
    item.source,
    `production.assetLinks[${index}].source`,
  );
  const output = resolve(context.publicDir, item.output);
  const relativeOutput = relative(context.publicDir, output);

  if (
    relativeOutput === ".." ||
    relativeOutput.startsWith(`..${sep}`)
  ) {
    throw new Error(
      `production.assetLinks[${index}].output must stay inside the video's public directory.`,
    );
  }

  if (!existsSync(source)) {
    throw new Error(`Canonical source asset not found: ${source}`);
  }

  mkdirSync(dirname(output), {recursive: true});

  if (existsSync(output)) {
    const outputStat = lstatSync(output);
    if (outputStat.isSymbolicLink()) {
      unlinkSync(output);
    } else {
      const sourceStat = statSync(source);
      const sameInode =
        outputStat.dev === sourceStat.dev && outputStat.ino === sourceStat.ino;
      const sameContent =
        sameInode ||
        (outputStat.size === sourceStat.size &&
          (await hashFile(output)) === (await hashFile(source)));

      if (sameInode || sameContent) {
        continue;
      }

      throw new Error(
        `${output} exists but does not match the configured canonical source.`,
      );
    }
  }

  linkSync(source, output);
}

console.log(`Asset links are ready for ${videoId}.`);
