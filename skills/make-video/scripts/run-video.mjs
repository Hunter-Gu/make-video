import {mkdirSync} from "node:fs";
import {dirname, resolve} from "node:path";
import {spawnSync} from "node:child_process";

import {
  assertOutputsAvailable,
  loadVideoContext,
  parseTargetArgs,
  projectRoot,
  scriptsDir,
} from "./video-context.mjs";

const action = process.argv[2];
const supportedActions = new Set(["check", "studio", "still", "render:silent"]);

if (!action || !supportedActions.has(action)) {
  throw new Error(
    `A supported action is required: ${[...supportedActions].join(", ")}`,
  );
}

const {videoId, force} = parseTargetArgs(process.argv.slice(3));
const context = loadVideoContext(videoId);
const {composition, outputs, production} = context;

if (action === "check") {
  console.log(
    JSON.stringify(
      {
        videoId,
        compositionId: composition.id,
        configPath: context.configPath,
        publicDir: context.publicDir,
        outputs,
      },
      null,
      2,
    ),
  );
  process.exit(0);
}

/**
 * @param {string} command
 * @param {string[]} args
 * @returns {void}
 */
/**
 * @param {string} command
 * @param {string[]} args
 * @returns {void}
 */
const run = (command, args) => {
  const result = spawnSync(command, args, {
    cwd: projectRoot,
    env: process.env,
    stdio: "inherit",
  });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
};

const runRemotion = resolve(scriptsDir, "run-remotion.mjs");

run(process.execPath, [resolve(scriptsDir, "link-assets.mjs"), videoId]);

if (action === "studio") {
  run(process.execPath, [runRemotion, "studio", "src/index.ts", "--no-open"]);
  process.exit(0);
}

if (action === "still") {
  assertOutputsAvailable([outputs.still], {
    force,
    action: `Still render for ${videoId}`,
  });
  mkdirSync(dirname(outputs.still), {recursive: true});
  run(process.execPath, [
    runRemotion,
    "still",
    "src/index.ts",
    composition.id,
    outputs.still,
    `--frame=${production.stillFrame ?? 0}`,
    `--props=${JSON.stringify(production.stillProps ?? production.silentProps ?? {})}`,
  ]);
  process.exit(0);
}

assertOutputsAvailable([outputs.silent], {
  force,
  action: `Silent render for ${videoId}`,
});
mkdirSync(dirname(outputs.silent), {recursive: true});
run(process.execPath, [
  runRemotion,
  "render",
  "src/index.ts",
  composition.id,
  outputs.silent,
  "--concurrency=1",
  `--props=${JSON.stringify(production.silentProps ?? {})}`,
]);
