import {spawn} from "node:child_process";
import {existsSync} from "node:fs";
import {resolve} from "node:path";

export type QaKind = "video" | "images" | "generated-videos";

export const runQa = (kind: QaKind, videoId: string) => new Promise<void>((resolvePromise, reject) => {
  const script = resolve(process.cwd(), "skills/make-video/scripts/qa.mjs");
  if (!existsSync(script)) return reject(new Error(`QA entrypoint not found at ${script}. Build @make-video/qa first.`));
  const child = spawn(process.execPath, [script, kind, videoId], {cwd: process.cwd(), env: process.env, stdio: "inherit"});
  child.once("error", reject);
  child.once("exit", (status) => status === 0 ? resolvePromise() : reject(new Error(`QA exited with status ${status ?? "unknown"}.`)));
});
