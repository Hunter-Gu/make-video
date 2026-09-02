import {assertOutputsAvailable as assertAvailable, parseTargetArgs, projectRoot, readProjectConfig, resolveInsideProject, resolvePublicDir} from "@make-video/project";

export {parseTargetArgs, projectRoot};

type JsonObject = Record<string, any>;

export type RenderContext = {
  videoId: string;
  config: JsonObject;
  composition: JsonObject;
  production: JsonObject;
  sourceDir: string;
  publicDir: string;
  outputs: Record<string, string>;
  resolveConfiguredPath: (value: unknown, label: string) => string;
};

export const loadRenderContext = (videoId: string): RenderContext => {
  const {config, sourceDir} = readProjectConfig(videoId);
  const production = config.production as JsonObject;
  const outputConfig = production.outputs as JsonObject;
  return {
    videoId,
    config,
    composition: config.composition as JsonObject,
    production,
    sourceDir,
    publicDir: resolvePublicDir(production, videoId),
    outputs: Object.fromEntries(["still", "silent", "unmastered", "final"].map((name) => [name, resolveInsideProject(outputConfig[name], `production.outputs.${name}`)])),
    resolveConfiguredPath: resolveInsideProject,
  };
};

export const assertOutputsAvailable = (files: string[], force: boolean, action: string) => assertAvailable(files, force, action);
