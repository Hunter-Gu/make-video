import {log} from "@make-video/project";
import {parseTargetArgs} from "./context";
import {buildSeriesCoverage} from "./coverage";
import {verifySeries} from "./verify";

const [mode, ...args] = process.argv.slice(2);
const {seriesId, force} = parseTargetArgs(args);
if (mode === "verify") {
  const verification = verifySeries(seriesId);
  for (const error of verification.errors) console.error(`✗ ${error}`);
  for (const warning of verification.warnings) console.warn(`! ${warning}`);
  log(`${verification.passed ? "✓" : "✗"} ${seriesId}: ${verification.coverage?.episodes ?? 0} episodes, ${verification.coverage?.assignedBlocks ?? 0}/${verification.coverage?.totalBlocks ?? 0} source blocks assigned, compression ${(verification.coverage?.compressionRatio ?? 0).toFixed(2)}:1.`);
  if (!verification.passed) process.exitCode = 1;
} else if (mode === "coverage") {
  buildSeriesCoverage(seriesId, force);
} else {
  throw new Error("Usage: series.mjs <verify|coverage> <series-id> [--force]");
}
