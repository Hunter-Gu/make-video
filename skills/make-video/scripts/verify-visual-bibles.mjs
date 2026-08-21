import {existsSync, readFileSync} from "node:fs";
import {resolve} from "node:path";

import {loadVideoContext, parseTargetArgs} from "./video-context.mjs";

const {videoId} = parseTargetArgs(process.argv.slice(2));
const context = loadVideoContext(videoId);
const readJson = (/** @type {string} */ name) => {
  const file = resolve(context.sourceDir, name);
  if (!existsSync(file)) throw new Error(`${name} is required.`);
  return JSON.parse(readFileSync(file, "utf8"));
};
const visual = readJson("VISUAL_BIBLE.json");
if (!visual.palette || !visual.typography || !visual.imageTreatment || !visual.motion || !visual.promptDirection) throw new Error("VISUAL_BIBLE.json is incomplete.");
const characters = readJson("CHARACTER_BIBLE.json");
const ids = new Set();
for (const character of characters.characters ?? []) {
  if (!character.id || ids.has(character.id) || !character.name || !Array.isArray(character.stages) || character.stages.length === 0) throw new Error("Character bible contains an invalid or duplicate character.");
  ids.add(character.id);
  for (const stage of character.stages) {
    if (!stage.id || !stage.label || !stage.description) throw new Error(`Character ${character.id} has an incomplete stage.`);
    for (const reference of stage.references ?? []) {
      const file = context.resolveConfiguredPath(reference, `character ${character.id} reference`);
      if (!existsSync(file)) throw new Error(`Character reference not found: ${file}`);
    }
  }
}
const constraintsFile = resolve(context.sourceDir, "PROMPT_CONSTRAINTS.md");
const constraints = existsSync(constraintsFile) ? readFileSync(constraintsFile, "utf8") : "";
for (const heading of ["Period", "Geography", "Clothing", "Architecture", "Technology", "Prohibited anachronisms"]) {
  if (!constraints.includes(`## ${heading}`)) throw new Error(`PROMPT_CONSTRAINTS.md needs a ${heading} section.`);
}
console.log(`Visual bibles verified: ${ids.size} recurring character(s).`);
