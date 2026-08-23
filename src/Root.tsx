import {Composition, staticFile} from "remotion";
import type {ProjectState} from "@make-video/contracts";
import {ProjectComposition} from "@make-video/remotion";
import config from "./library-of-alexandria/video.config.json";
import sceneIndex from "./library-of-alexandria/SCENE_INDEX.json";
import timeline from "./library-of-alexandria/REMOTION_TIMELINE.json";
import candidates from "./library-of-alexandria/CANDIDATES.json";

const assetLinks = config.production.assetLinks ?? [];
const sourceScenes = sceneIndex.scenes as ProjectState["scenes"];
const projectAssets: ProjectState["assets"] = Object.entries(sceneIndex.assets ?? {}).flatMap(([id, configuredPath]) => {
  const link = assetLinks.find((item) => item.source === configuredPath);
  if (!link || !/\.(svg|png|jpe?g|webp|mp4|mov|webm|m4v)$/i.test(link.output)) return [];
  const scene = sourceScenes.find((item) => item.assetIds?.includes(id));
  const kind = /\.(mp4|mov|webm|m4v)$/i.test(link.output) ? "video" as const : "image" as const;
  return [{id, sceneId: scene?.id ?? null, kind, selected: true, provider: "project", path: link.output, url: staticFile(`${config.production.publicPath}/${link.output}`)}];
});
const hybridCandidate = candidates.groups?.find((group) => group.id === "hybrid-motion");
if (hybridCandidate?.output) projectAssets.push({id: "hybrid-motion", sceneId: "hybrid-clip", kind: "video", selected: true, provider: "project", path: hybridCandidate.output, url: staticFile(`${config.production.publicPath}/${hybridCandidate.output}`)});

const projectState: ProjectState = {
  videoId: config.videoId,
  composition: config.composition,
  models: {image: config.imageGeneration?.model ?? null, voice: config.voice?.model ?? null},
  registry: {image: [], voice: []},
  scenes: sourceScenes,
  captions: sceneIndex.captions,
  effects: timeline.effects,
  audio: {voiceover: {id: "voiceover", label: "Voiceover", path: "", exists: false, url: null}, music: {id: "music", label: "Music", path: "", exists: false, url: null}, sfx: []},
  cover: null,
  assets: projectAssets,
  stages: [],
  revisions: [],
  sources: [],
  qa: null,
};

export const RemotionRoot = () => {
  return (
    <Composition<any, any>
      id={config.composition.id}
      component={ProjectComposition}
      durationInFrames={config.composition.durationInFrames}
      fps={config.composition.fps}
      width={config.composition.width}
      height={config.composition.height}
      defaultProps={{state: projectState}}
    />
  );
};
