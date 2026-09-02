import {parseTargetArgs, projectRoot, readProjectConfig, resolveInsideProject} from "@make-video/project";
import {existsSync} from "node:fs";

export {parseTargetArgs, projectRoot};

export type SourceContext = {videoId: string; config: Record<string, any>; sourceDir: string; resolveConfiguredPath: (value: unknown, label: string) => string};

export const loadSourceContext = (videoId: string): SourceContext => ({
  ...readProjectConfig(videoId),
  resolveConfiguredPath: resolveInsideProject,
});

export const assertOutputAvailable = (file: string, force: boolean, action: string) => {
  if (!force && existsSync(file)) throw new Error(`${action} stopped because output already exists: ${file}\nPass --force to regenerate.`);
};
