import {Composition, staticFile} from "remotion";
import type {ProjectState} from "@make-video/contracts";
import {ProjectComposition} from "@make-video/remotion";
import alexandriaConfig from "./library-of-alexandria/video.config.json";
import alexandriaScenes from "./library-of-alexandria/SCENE_INDEX.json";
import alexandriaTimeline from "./library-of-alexandria/REMOTION_TIMELINE.json";
import alexandriaCandidates from "./library-of-alexandria/CANDIDATES.json";
import princeConfig from "./little-prince/video.config.json";
import princeScenes from "./little-prince/SCENE_INDEX.json";
import princeTimeline from "./little-prince/REMOTION_TIMELINE.json";

type ProjectFiles = {config: any; scenes: any; timeline: any; candidates?: any};

const files: ProjectFiles = process.env.MAKE_VIDEO_VIDEO_ID === "little-prince"
  ? {config: princeConfig, scenes: princeScenes, timeline: princeTimeline}
  : {config: alexandriaConfig, scenes: alexandriaScenes, timeline: alexandriaTimeline, candidates: alexandriaCandidates};

const createProjectState = ({config, scenes, timeline, candidates}: ProjectFiles): ProjectState => {
  const sourceScenes = scenes.scenes as ProjectState["scenes"];
  const links = Array.isArray(config.production.assetLinks) ? config.production.assetLinks : [];
  const assets: ProjectState["assets"] = Object.entries(scenes.assets ?? {}).flatMap(([id, configuredPath]) => {
    const link = links.find((item: any) => item.source === configuredPath);
    const path = link?.output ?? String(configuredPath).replace(/^public\//, "");
    if (!/\.(svg|png|jpe?g|webp|mp4|mov|webm|m4v)$/i.test(path)) return [];
    const scene = sourceScenes.find((item) => item.assetIds?.includes(id));
    const kind = /\.(mp4|mov|webm|m4v)$/i.test(path) ? "video" as const : "image" as const;
    const publicPath = path.startsWith(`${config.production.publicPath}/`) ? path : `${config.production.publicPath}/${path}`;
    return [{id, sceneId: scene?.id ?? null, kind, selected: true, provider: "project", path, url: staticFile(publicPath)}];
  });
  for (const group of candidates?.groups ?? []) if (group.output && !assets.some((asset) => asset.id === group.id)) assets.push({id: group.id, sceneId: null, kind: "video", selected: true, provider: "project", path: group.output, url: staticFile(`${config.production.publicPath}/${group.output}`)});
  return {
    videoId: config.videoId,
    composition: config.composition,
    models: {image: config.imageGeneration?.model ?? null, video: config.videoGeneration?.model ?? null, voice: config.voice?.model ?? null},
    registry: {image: [], video: [], voice: []},
    scenes: sourceScenes,
    captions: scenes.captions,
    effects: timeline.effects ?? [],
    audio: {voiceover: {id: "voiceover", label: "Voiceover", path: "", exists: false, url: null}, music: {id: "music", label: "Music", path: "", exists: false, url: null}, sfx: []},
    cover: null,
    assets,
    stages: [],
    revisions: [],
    sources: [],
    plan: null,
    qa: null,
  };
};

const projectState = createProjectState(files);

export const RemotionRoot = () => <Composition<any, any> id={files.config.composition.id} component={ProjectComposition} durationInFrames={files.config.composition.durationInFrames} fps={files.config.composition.fps} width={files.config.composition.width} height={files.config.composition.height} defaultProps={{state: projectState}} />;
