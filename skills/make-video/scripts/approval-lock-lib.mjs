import {createHash} from "node:crypto";
import {existsSync, readFileSync} from "node:fs";
import {relative, resolve} from "node:path";

import {projectRoot} from "./video-context.mjs";

/** @param {string} file */
export const fileHash = (file) => createHash("sha256").update(readFileSync(file)).digest("hex");

/** @param {import("./video-context.mjs").VideoContext} context */
export const approvalLockFile = (context) => resolve(context.sourceDir, "APPROVAL_LOCK.json");

/** @param {import("./video-context.mjs").VideoContext} context */
export const readApprovalLock = (context) => {
  const file = approvalLockFile(context);
  return existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : null;
};

/** @param {import("./video-context.mjs").VideoContext} context @param {string[]} targets */
export const assertTargetsUnlocked = (context, targets) => {
  const lock = readApprovalLock(context);
  if (!lock?.active) return;
  const protectedPaths = new Set(lock.files.map((/** @type {{path: string}} */ item) => item.path));
  const blocked = targets
    .map((target) => relative(projectRoot, target))
    .filter((target) => protectedPaths.has(target));
  if (blocked.length > 0) {
    throw new Error(`Approved files are locked: ${blocked.join(", ")}. Record revision approval before unlocking.`);
  }
};
