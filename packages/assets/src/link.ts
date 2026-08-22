import {createHash} from "node:crypto";
import {existsSync, linkSync, lstatSync, mkdirSync, readFileSync, statSync, unlinkSync} from "node:fs";
import {dirname, relative, resolve, sep} from "node:path";

import {loadAssetContext} from "./context";

const hashFile = (fileName: string) => createHash("sha256").update(readFileSync(fileName)).digest("hex");

export const linkAssets = (videoId: string) => {
  const context = loadAssetContext(videoId);
  const assetLinks = context.production.assetLinks ?? [];
  if (!Array.isArray(assetLinks)) throw new Error("production.assetLinks must be an array.");

  for (const [index, item] of assetLinks.entries()) {
    if (!item || typeof item !== "object") throw new Error(`production.assetLinks[${index}] must be an object.`);
    if (typeof item.output !== "string" || item.output.length === 0) throw new Error(`production.assetLinks[${index}].output must be a non-empty string.`);
    const source = context.resolveConfiguredPath(item.source, `production.assetLinks[${index}].source`);
    const output = resolve(context.publicDir, item.output);
    const outputRelative = relative(context.publicDir, output);
    if (outputRelative === ".." || outputRelative.startsWith(`..${sep}`)) throw new Error(`production.assetLinks[${index}].output must stay inside the video's public directory.`);
    if (!existsSync(source)) throw new Error(`Canonical source asset not found: ${source}`);
    mkdirSync(dirname(output), {recursive: true});
    if (!existsSync(output)) {
      linkSync(source, output);
      continue;
    }
    const outputStat = lstatSync(output);
    if (outputStat.isSymbolicLink()) {
      unlinkSync(output);
      linkSync(source, output);
      continue;
    }
    const sourceStat = statSync(source);
    const sameInode = outputStat.dev === sourceStat.dev && outputStat.ino === sourceStat.ino;
    const sameContent = sameInode || (outputStat.size === sourceStat.size && hashFile(output) === hashFile(source));
    if (!sameContent) throw new Error(`${output} exists but does not match the configured canonical source.`);
  }
  console.log(`Asset links are ready for ${videoId}.`);
};
