import {mkdirSync} from "node:fs";
import {dirname} from "node:path";
import {spawn} from "node:child_process";

import {linkAssets} from "@make-video/assets";
import {assertOutputsAvailable, loadRenderContext, projectRoot} from "./context";
import {runRemotion} from "./remotion";
import {buildProjectState} from "./state";

export {buildProjectState, resolveProjectAssetFile} from "./state";
export {applyTranslation, getDeliveryReport, loadDeliverables, runDelivery, verifyDeliveredVariant} from "./delivery";

const compositionId = "MakeVideo";

const runCommand = (command: string, args: string[]) => new Promise<void>((resolvePromise, reject) => {
  const child = spawn(command, args, {cwd: projectRoot, env: process.env, stdio: "inherit"});
  child.once("error", reject);
  child.once("exit", (status) => status === 0 ? resolvePromise() : reject(new Error(`${command} exited with status ${status ?? "unknown"}.`)));
});

export const runRender = async (action: "studio" | "still" | "preview" | "final", videoId: string, force = false) => {
  const context = loadRenderContext(videoId);
  const {outputs, production} = context;
  const renderEnv = {...process.env, MAKE_VIDEO_VIDEO_ID: videoId};
  linkAssets(videoId);
  const state = buildProjectState(videoId, "remotion");
  const props = (configured: unknown) => JSON.stringify({...((configured && typeof configured === "object") ? configured : {}), state});
  if (action === "studio") return runRemotion(["studio", "src/index.ts", "--no-open", `--props=${props(production.silentProps)}`], renderEnv);
  if (action === "still") {
    assertOutputsAvailable([outputs.still], force, `Cover image for ${videoId}`);
    mkdirSync(dirname(outputs.still), {recursive: true});
    return runRemotion(["still", "src/index.ts", compositionId, outputs.still, `--frame=${production.stillFrame ?? 0}`, `--props=${props(production.stillProps ?? production.silentProps)}`], renderEnv);
  }
  if (action === "preview") {
    assertOutputsAvailable([outputs.silent], force, `Preview video for ${videoId}`);
    mkdirSync(dirname(outputs.silent), {recursive: true});
    await runRemotion(["render", "src/index.ts", compositionId, outputs.silent, "--concurrency=1", `--props=${props(production.silentProps)}`], renderEnv);
    return;
  }
  const mastering = production.mastering ?? null;
  const renderOutput = mastering ? outputs.unmastered : outputs.final;
  assertOutputsAvailable(mastering ? [outputs.unmastered, outputs.final] : [outputs.final], force, `Final video for ${videoId}`);
  mkdirSync(dirname(renderOutput), {recursive: true});
  mkdirSync(dirname(outputs.final), {recursive: true});
  await runRemotion(["render", "src/index.ts", compositionId, renderOutput, "--concurrency=1", `--props=${props(production.finalProps)}`], renderEnv);
  if (mastering) await runCommand("ffmpeg", ["-hide_banner", "-loglevel", "error", force ? "-y" : "-n", "-i", outputs.unmastered, "-map", "0:v:0", "-map", "0:a:0", "-c:v", "copy", "-af", `loudnorm=I=${mastering.integratedLoudness ?? -16}:TP=${mastering.truePeak ?? -1.5}:LRA=${mastering.loudnessRange ?? 7}`, "-c:a", "aac", "-b:a", mastering.audioBitrate ?? "192k", "-ar", String(mastering.audioSampleRate ?? 48000), "-movflags", "+faststart", outputs.final]);
};
