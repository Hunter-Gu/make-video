import {existsSync} from "node:fs";
import {resolve} from "node:path";
import {spawn} from "node:child_process";

import {projectRoot} from "./context";

export const runRemotion = (args: string[], env = process.env) => {
  const bin = resolve(projectRoot, "node_modules/.bin/remotion");
  if (!existsSync(bin)) throw new Error(`Remotion CLI not found at ${bin}. Install Remotion in this project first.`);
  const chrome = process.env.REMOTION_BROWSER_EXECUTABLE ?? (process.platform === "darwin" && existsSync("/Applications/Google Chrome.app/Contents/MacOS/Google Chrome") ? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" : null);
  const finalArgs = chrome && !args.some((argument) => argument.startsWith("--browser-executable")) ? [...args, `--browser-executable=${chrome}`] : args;
  return new Promise<void>((resolvePromise, reject) => {
    const child = spawn(bin, finalArgs, {cwd: projectRoot, env, stdio: "inherit"});
    child.once("error", reject);
    child.once("exit", (status) => status === 0 ? resolvePromise() : reject(new Error(`Remotion exited with status ${status ?? "unknown"}.`)));
  });
};
