import {assertOutputsAvailable, audioDirsFor, parseTargetArgs, projectRoot, readProjectConfig, resolveInsideProject, resolvePublicDir} from "@make-video/project";

export {parseTargetArgs, projectRoot};

type JsonObject = Record<string, any>;

export type AudioContext = {
  videoId: string;
  config: JsonObject;
  composition: JsonObject;
  production: JsonObject;
  sourceDir: string;
  configPath: string;
  audioDirs: {music: string; sfx: string; voiceover: string};
  resolveConfiguredPath: (value: unknown, label: string) => string;
};

export const loadAudioContext = (videoId: string): AudioContext => {
  const {config, sourceDir, configPath} = readProjectConfig(videoId);
  const production = config.production as JsonObject;
  return {
    videoId,
    config,
    composition: config.composition as JsonObject,
    production,
    sourceDir,
    configPath,
    audioDirs: audioDirsFor(resolvePublicDir(production, videoId)),
    resolveConfiguredPath: resolveInsideProject,
  };
};

export const assertOutputAvailable = (files: string[], force: boolean, action: string) => assertOutputsAvailable(files, force, action);
