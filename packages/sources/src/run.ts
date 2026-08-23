import {spawn} from "node:child_process";
import {resolve} from "node:path";

export const runSourceIngest = (videoId: string, force = false) => new Promise<void>((resolveDone, reject) => {
  const script = resolve(process.cwd(), "skills/make-video/scripts/sources.mjs");
  const child = spawn(process.execPath, [script, "ingest", videoId, ...(force ? ["--force"] : [])], {cwd: process.cwd(), env: process.env, stdio: "inherit"});
  child.once("error", reject);
  child.once("exit", (code) => code === 0 ? resolveDone() : reject(new Error(`Source ingestion exited with code ${code ?? "unknown"}.`)));
});

export const runSourceCatalog = (videoId: string, force = false) => new Promise<void>((resolveDone, reject) => {
  const script = resolve(process.cwd(), "skills/make-video/scripts/sources.mjs");
  const child = spawn(process.execPath, [script, "catalog", videoId, ...(force ? ["--force"] : [])], {cwd: process.cwd(), env: process.env, stdio: "inherit"});
  child.once("error", reject);
  child.once("exit", (code) => code === 0 ? resolveDone() : reject(new Error(`Source catalog exited with code ${code ?? "unknown"}.`)));
});
