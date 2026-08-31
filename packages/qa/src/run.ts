import {runGeneratedVideoQa} from "./generated-videos";
import {runImageQa} from "./images";
import {runVideoQa} from "./video";

export type QaKind = "video" | "images" | "generated-videos";

export const runQa = async (kind: QaKind, videoId: string, inputPath?: string) => {
  const report = kind === "video"
    ? runVideoQa([videoId], inputPath)
    : kind === "images"
      ? runImageQa([videoId])
      : runGeneratedVideoQa([videoId]);
  if (!report.passed) throw new Error(`${kind} QA failed for ${videoId}.`);
};
