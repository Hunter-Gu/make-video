import {createHash} from "node:crypto";
import {existsSync, readFileSync, renameSync, writeFileSync} from "node:fs";
import {extname} from "node:path";

import {createGoogleGenerativeAI} from "@ai-sdk/google";


/** Create the configured Google provider only when a model call is needed. */
export const google = () => {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY is required for model generation.");
  return createGoogleGenerativeAI({apiKey});
};

export const hash = (value: string | Uint8Array) => createHash("sha256").update(value).digest("hex");

export const readJson = (file: string, fallback: any = null): any =>
  existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : fallback;

export const writeJson = (file: string, value: any) => {
  const temporary = `${file}.tmp`;
  writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`);
  renameSync(temporary, file);
};

export const mediaTypeFor = (file: string) => ({
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
}[extname(file).toLowerCase()] ?? "application/octet-stream");
