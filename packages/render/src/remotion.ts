import {existsSync} from "node:fs";
import {resolve} from "node:path";
import {spawnSync} from "node:child_process";

import {projectRoot} from "./context";

export const runRemotion = (args: string[]) => {
  const bin = resolve(projectRoot, "node_modules/.bin/remotion");
  if (!existsSync(bin)) throw new Error(`Remotion CLI not found at ${bin}. Install Remotion in this project first.`);
  const chrome = process.env.REMOTION_BROWSER_EXECUTABLE ?? (process.platform === "darwin" && existsSync("/Applications/Google Chrome.app/Contents/MacOS/Google Chrome") ? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" : null);
  const finalArgs = chrome && !args.some((argument) => argument.startsWith("--browser-executable")) ? [...args, `--browser-executable=${chrome}`] : args;
  const result = spawnSync(bin, finalArgs, {cwd: projectRoot, env: process.env, stdio: "inherit"});
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
};
