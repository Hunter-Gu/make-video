import {resolve} from "node:path";
import {spawnSync} from "node:child_process";

import {
  loadVideoContext,
  parseTargetArgs,
  projectRoot,
  scriptsDir,
} from "./video-context.mjs";

const {videoId, force} = parseTargetArgs(process.argv.slice(2));
const {production} = loadVideoContext(videoId);
const audio = production.audio ?? {};
const targetArgs = [videoId, ...(force ? ["--force"] : [])];

/** @type {Array<[string, boolean | undefined]>} */
const allSteps = [
  ["generate-ui-sfx.mjs", audio.sfx],
  ["generate-gemini-voiceover.mjs", audio.voiceover],
  ["generate-lyria-music.mjs", audio.music],
];
const steps = allSteps.filter(([, enabled]) => enabled === true);

if (steps.length === 0) {
  throw new Error(`${videoId} has no enabled audio generation steps.`);
}

for (const [script] of steps) {
  const result = spawnSync(
    process.execPath,
    [resolve(scriptsDir, script), ...targetArgs],
    {
      cwd: projectRoot,
      env: process.env,
      stdio: "inherit",
    },
  );

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}
