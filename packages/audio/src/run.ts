import {spawn} from "node:child_process";
import {resolve} from "node:path";

export const runTiming = (videoId: string, force = false) => new Promise<void>((resolveDone, reject) => {
  const script = resolve(process.cwd(), "skills/make-video/scripts/audio.mjs");
  const child = spawn(process.execPath, [script, "timing", videoId, ...(force ? ["--force"] : [])], {cwd: process.cwd(), env: process.env, stdio: "inherit"});
  child.once("error", reject);
  child.once("exit", (code) => code === 0 ? resolveDone() : reject(new Error(`Timing exited with code ${code ?? "unknown"}.`)));
});
