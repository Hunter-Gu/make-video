import {parseTargetArgs, projectRoot, readProjectConfig, requireObject, resolveInsideProject, resolvePublicDir} from "@make-video/project";

export {parseTargetArgs, projectRoot};

export type AssetContext = {
  videoId: string;
  sourceDir: string;
  publicDir: string;
  production: Record<string, any>;
  resolveConfiguredPath: (value: unknown, label: string) => string;
};

export const loadAssetContext = (videoId: string): AssetContext => {
  const {config, sourceDir} = readProjectConfig(videoId);
  const production = requireObject(config.production, "production");
  return {videoId, sourceDir, publicDir: resolvePublicDir(production, videoId), production, resolveConfiguredPath: resolveInsideProject};
};
