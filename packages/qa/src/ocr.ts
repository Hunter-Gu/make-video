import {spawnSync} from "node:child_process";

/**
 * Read the text an image carries, so QA can reject unwanted or generated lettering.
 *
 * A missing or broken tesseract is a broken environment, not a defective image.
 * Reporting it as a failed check sends the caller off to regenerate media — which
 * costs money — when the real fix is installing a binary, so it is raised instead.
 */
export const readImageText = (png: Buffer, minConfidence: number) => {
  const result = spawnSync("tesseract", ["stdin", "stdout", "--psm", "11", "tsv"], {input: png, encoding: "utf8"});
  if ((result.error as NodeJS.ErrnoException | undefined)?.code === "ENOENT") {
    throw new Error('tesseract is required to check media for unwanted text. Install it, or set "allowText": true on entries that legitimately contain text.');
  }
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`tesseract could not read the sampled frame: ${result.stderr}`);
  return (result.stdout ?? "")
    .split("\n")
    .slice(1)
    .map((line) => line.split("\t"))
    .filter((fields) => Number(fields[10]) >= minConfidence)
    .map((fields) => fields[11])
    .filter(Boolean)
    .join(" ");
};
