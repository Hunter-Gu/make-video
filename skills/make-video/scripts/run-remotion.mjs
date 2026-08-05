import {existsSync} from "node:fs";
import {resolve} from "node:path";
import {spawnSync} from "node:child_process";

import {projectRoot} from "./video-context.mjs";

const remotionBin = resolve(projectRoot, "node_modules/.bin/remotion");
const args = process.argv.slice(2);
const explicitBrowser = process.env.REMOTION_BROWSER_EXECUTABLE;
const macChrome =
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const browserExecutable =
  explicitBrowser ??
  (process.platform === "darwin" && existsSync(macChrome)
    ? macChrome
    : null);

if (
  browserExecutable &&
  !args.some((argument) => argument.startsWith("--browser-executable"))
) {
  args.push(`--browser-executable=${browserExecutable}`);
}

if (!existsSync(remotionBin)) {
  throw new Error(
    `Remotion CLI not found at ${remotionBin}. Install "remotion" and "@remotion/cli" in this project (${projectRoot}) first.`,
  );
}

const result = spawnSync(remotionBin, args, {
  cwd: projectRoot,
  env: process.env,
  stdio: "inherit",
});

if (result.error) {
  throw result.error;
}

process.exit(result.status ?? 1);
