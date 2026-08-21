import {existsSync, readFileSync} from "node:fs";
import {resolve} from "node:path";

/** @param {import("./video-context.mjs").VideoContext} context @param {Array<{id: string, stage?: string}> | undefined} requestedCharacters */
export const buildVisualContext = (context, requestedCharacters) => {
  const visualFile = resolve(context.sourceDir, "VISUAL_BIBLE.json");
  const characterFile = resolve(context.sourceDir, "CHARACTER_BIBLE.json");
  const constraintsFile = resolve(context.sourceDir, "PROMPT_CONSTRAINTS.md");
  const sections = [];
  if (existsSync(visualFile)) {
    const visual = JSON.parse(readFileSync(visualFile, "utf8"));
    sections.push(`Visual bible: ${visual.promptDirection}`);
  }
  if (requestedCharacters?.length) {
    if (!existsSync(characterFile)) throw new Error("Character references require CHARACTER_BIBLE.json.");
    const bible = JSON.parse(readFileSync(characterFile, "utf8"));
    for (const requested of requestedCharacters) {
      const character = bible.characters?.find((/** @type {any} */ item) => item.id === requested.id);
      const stage = character?.stages?.find((/** @type {any} */ item) => item.id === requested.stage);
      if (!character || !stage) throw new Error(`Unknown character stage: ${requested.id}/${requested.stage ?? ""}`);
      sections.push(`Character ${character.name}, ${stage.label}: ${stage.description}`);
    }
  }
  if (existsSync(constraintsFile)) sections.push(readFileSync(constraintsFile, "utf8"));
  return sections.join("\n\n");
};
