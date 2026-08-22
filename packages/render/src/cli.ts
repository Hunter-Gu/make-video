import {mkdirSync} from "node:fs";
import {dirname, resolve} from "node:path";
import {spawnSync} from "node:child_process";

import {linkAssets} from "@make-video/assets";
import {assertOutputsAvailable, loadRenderContext, parseTargetArgs, projectRoot} from "./context";
import {runRemotion} from "./remotion";

const [action, ...args] = process.argv.slice(2);
if (!["studio", "still", "preview", "final"].includes(action)) throw new Error("Usage: render.mjs <studio|still|preview|final> <video-id> [--force]");
const {videoId, force} = parseTargetArgs(args); const context = loadRenderContext(videoId); const {composition, outputs, production} = context;
linkAssets(videoId);
if (action === "studio") { runRemotion(["studio", "src/index.ts", "--no-open"]); process.exit(0); }
if (action === "still") { assertOutputsAvailable([outputs.still], force, `Cover image for ${videoId}`); mkdirSync(dirname(outputs.still), {recursive: true}); runRemotion(["still", "src/index.ts", composition.id, outputs.still, `--frame=${production.stillFrame ?? 0}`, `--props=${JSON.stringify(production.stillProps ?? production.silentProps ?? {})}`]); process.exit(0); }
if (action === "preview") { assertOutputsAvailable([outputs.silent], force, `Preview video for ${videoId}`); mkdirSync(dirname(outputs.silent), {recursive: true}); runRemotion(["render", "src/index.ts", composition.id, outputs.silent, "--concurrency=1", `--props=${JSON.stringify(production.silentProps ?? {})}`]); console.log(`Preview video: ${outputs.silent}`); process.exit(0); }
const mastering = production.mastering ?? null; const renderOutput = mastering ? outputs.unmastered : outputs.final; assertOutputsAvailable(mastering ? [outputs.unmastered, outputs.final] : [outputs.final], force, `Final video for ${videoId}`); mkdirSync(dirname(renderOutput), {recursive: true}); mkdirSync(dirname(outputs.final), {recursive: true}); runRemotion(["render", "src/index.ts", composition.id, renderOutput, "--concurrency=1", `--props=${JSON.stringify(production.finalProps ?? {})}`]);
if (mastering) { const result = spawnSync("ffmpeg", ["-hide_banner", "-loglevel", "error", force ? "-y" : "-n", "-i", outputs.unmastered, "-map", "0:v:0", "-map", "0:a:0", "-c:v", "copy", "-af", `loudnorm=I=${mastering.integratedLoudness ?? -16}:TP=${mastering.truePeak ?? -1.5}:LRA=${mastering.loudnessRange ?? 7}`, "-c:a", "aac", "-b:a", mastering.audioBitrate ?? "192k", "-ar", String(mastering.audioSampleRate ?? 48000), "-movflags", "+faststart", outputs.final], {cwd: projectRoot, env: process.env, stdio: "inherit"}); if (result.status !== 0) process.exit(result.status ?? 1); }
console.log(`Final video: ${outputs.final}`);
