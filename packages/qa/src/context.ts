import {existsSync} from "node:fs";

import {parseTargetArgs, projectRoot, readJsonFile, readProjectConfig, requireObject, resolveInsideProject, resolvePublicDir} from "@make-video/project";

export {parseTargetArgs, projectRoot};

type AnyRecord = Record<string, any>;

export type VideoContext = {
  videoId: string;
  sourceDir: string;
  publicDir: string;
  composition: AnyRecord;
  production: AnyRecord;
  outputs: Record<string, string>;
  resolveConfiguredPath: (value: unknown, label: string) => string;
};

export const loadVideoContext = (videoId: string): VideoContext => {
  const {config, sourceDir} = readProjectConfig(videoId);
  const composition = requireObject(config.composition, "composition");
  const production = requireObject(config.production, "production");
  const outputConfig = requireObject(production.outputs, "production.outputs");
  const outputs = Object.fromEntries(["still", "silent", "unmastered", "final"].map((name) => [name, resolveInsideProject(outputConfig[name], `production.outputs.${name}`)]));
  if (new Set(Object.values(outputs)).size !== 4) throw new Error("production output paths must be distinct.");
  return {videoId, sourceDir, publicDir: resolvePublicDir(production, videoId), composition, production, outputs, resolveConfiguredPath: resolveInsideProject};
};

export const readJson = (file: string, fallback: AnyRecord | null = null): AnyRecord | null => existsSync(file) ? readJsonFile(file) : fallback;
