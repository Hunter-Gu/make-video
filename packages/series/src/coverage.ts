import {writeFileSync} from "node:fs";
import {relative, resolve} from "node:path";

import type {SeriesCoverageArtifact} from "@make-video/contracts";

import {assertOutputAvailable, loadSeriesContext, projectRoot} from "./context";
import {verifySeries} from "./verify";

/** Write the human-readable record of what each episode uses, omits, or reserves. */
export const buildSeriesCoverage = (seriesId: string, force: boolean): SeriesCoverageArtifact => {
  const context = loadSeriesContext(seriesId);
  const verification = verifySeries(seriesId);
  if (!verification.passed || !verification.plan || !verification.coverage) {
    throw new Error(`Series ${seriesId} does not verify:\n${verification.errors.map((error) => `- ${error}`).join("\n")}`);
  }
  const {plan, coverage} = verification;
  const lines = [
    `# ${plan.title} coverage`,
    "",
    `- Episodes: ${coverage.episodes}`,
    `- Source blocks assigned: ${coverage.assignedBlocks}/${coverage.totalBlocks}`,
    `- Intentionally omitted: ${coverage.omittedBlocks}`,
    `- Adaptation mode: ${coverage.adaptationMode}`,
    `- Source words: ${coverage.sourceWords}`,
    `- Planned narration capacity: ${coverage.narrationCapacityWords} words`,
    `- Source-to-narration compression: ${coverage.compressionRatio.toFixed(2)}:1`,
    `- Rights: ${coverage.rights.status} — ${coverage.rights.intendedUse}`,
    "",
  ];
  for (const episode of plan.episodes) {
    lines.push(
      `## ${episode.title}`,
      "",
      `- ID: ${episode.id}`,
      `- Question: ${episode.question}`,
      `- Runtime: ${episode.estimatedMinutes} minutes`,
      `- Topics: ${episode.topics.join(", ") || "none"}`,
      `- Sources: ${episode.sourceBlockIds.join(", ") || "none"}`,
      ...(episode.introduces.length ? [`- Introduces: ${episode.introduces.join(", ")}`] : []),
      ...(episode.requires.length ? [`- Requires: ${episode.requires.join(", ")}`] : []),
      "",
    );
  }
  if (coverage.unassignedBlockIds.length > 0) lines.push("## Unassigned source blocks", "", ...coverage.unassignedBlockIds, "");
  if (plan.omittedSourceBlockIds.length > 0) lines.push("## Intentionally omitted source blocks", "", ...plan.omittedSourceBlockIds, "");
  const file = resolve(context.seriesDir, "COVERAGE.md");
  assertOutputAvailable(file, force, `Series coverage for ${seriesId}`);
  const content = `${lines.join("\n").trim()}\n`;
  writeFileSync(file, content);
  console.log(`Series coverage: ${file}`);
  return {seriesId, path: relative(projectRoot, file), content};
};
