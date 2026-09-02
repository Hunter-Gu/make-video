import {audioDirsFor, projectRoot, readProjectConfig, requireObject, resolveInsideProject, resolvePublicDir, type JsonObject} from "@make-video/project";

export {projectRoot};

export type VideoContext = {
  videoId: string;
  config: JsonObject;
  composition: JsonObject;
  production: JsonObject;
  sourceDir: string;
  configPath: string;
  publicDir: string;
  outputs: Record<string, string>;
  resolveConfiguredPath: (configuredPath: unknown, label: string) => string;
};

/** The strictest read of a project: the service refuses to act on an invalid one. */
export const loadVideoContext = (videoId: string): VideoContext => {
  const {config, sourceDir, configPath} = readProjectConfig(videoId);
  const composition = requireObject(config.composition, "composition");
  const production = requireObject(config.production, "production");
  if (typeof composition.id !== "string" || composition.id.length === 0) throw new Error("composition.id must be a non-empty string.");
  for (const field of ["fps", "width", "height", "durationInFrames"] as const) {
    if (!Number.isFinite(composition[field]) || composition[field] <= 0) throw new Error(`composition.${field} must be a positive number.`);
  }
  const outputConfig = requireObject(production.outputs, "production.outputs");
  const outputs = Object.fromEntries(["still", "silent", "unmastered", "final"].map((name) => [name, resolveInsideProject(outputConfig[name], `production.outputs.${name}`)]));
  if (new Set(Object.values(outputs)).size !== 4) throw new Error("production output paths must be distinct.");
  return {videoId, config, composition, production, sourceDir, configPath, publicDir: resolvePublicDir(production, videoId), outputs, resolveConfiguredPath: resolveInsideProject};
};

export {audioDirsFor};
