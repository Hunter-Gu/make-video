import {readJsonFile} from "@make-video/project";
import {existsSync, readFileSync, readdirSync} from "node:fs";
import {extname, relative, resolve, sep} from "node:path";

import type {ProjectState} from "@make-video/contracts";

import {loadRenderContext, projectRoot} from "./context";

type StateTarget = "server" | "remotion";

const readJson = (file: string, fallback: any = null): any => existsSync(file)
  ? readJsonFile(file)
  : fallback;

const inside = (root: string, file: string) => {
  const value = relative(root, file);
  return value !== ".." && !value.startsWith(`..${sep}`);
};

const mediaKind = (file: string): "image" | "video" => /\.(mp4|mov|webm|m4v)$/i.test(file) ? "video" : "image";

/**
 * Remotion resolves public files through staticFile(), which prefixes the bundle's
 * static base. Emit the public-relative path and let the composition prefix it.
 */
const remotionUrl = (file: string) => {
  const publicRoot = resolve(projectRoot, "public");
  if (!inside(publicRoot, file)) return null;
  return relative(publicRoot, file).split(sep).join("/");
};

const fileUrl = (file: string, target: StateTarget) => target === "server"
  ? `/media?path=${encodeURIComponent(relative(projectRoot, file))}`
  : remotionUrl(file);

const parseScript = (file: string) => existsSync(file)
  ? new Map([...readFileSync(file, "utf8").matchAll(/^- `([^`]+)`: (.+)$/gm)].map((match) => [match[1], match[2]]))
  : new Map<string, string>();

export const resolveProjectAssetFile = (videoId: string, id: string, configuredPath: string) => {
  const context = loadRenderContext(videoId);
  const linked = Array.isArray(context.production.assetLinks)
    ? context.production.assetLinks.find((item: any) => item?.source === configuredPath)
    : null;
  if (linked && typeof linked.output === "string") {
    const output = resolve(context.publicDir, linked.output);
    if (inside(context.publicDir, output) && existsSync(output)) return output;
  }
  const configuredFile = context.resolveConfiguredPath(configuredPath, `scene asset ${id}`);
  if (existsSync(configuredFile) && extname(configuredFile).toLowerCase() !== ".json") return configuredFile;
  if (extname(configuredFile).toLowerCase() !== ".json") return null;
  const metadata = readJson(configuredFile, null);
  const candidate = metadata?.output ?? metadata?.groups?.find((group: any) => group?.id === id)?.output;
  if (typeof candidate !== "string" || candidate.length === 0) return null;
  const output = resolve(context.publicDir, candidate);
  return inside(context.publicDir, output) && existsSync(output) ? output : null;
};

export const buildProjectState = (videoId: string, target: StateTarget = "server"): ProjectState => {
  const context = loadRenderContext(videoId);
  const sceneIndex = readJson(resolve(context.sourceDir, "SCENE_INDEX.json"), {scenes: [], captions: [], assets: {}});
  const projectState = readJson(resolve(context.sourceDir, "PROJECT_STATE.json"), {version: 1, revisionRequests: []});
  const remotionTimeline = readJson(resolve(context.sourceDir, "REMOTION_TIMELINE.json"), {version: 1, effects: []});
  const script = parseScript(resolve(context.sourceDir, "SCRIPT.md"));
  const scenes = Array.isArray(sceneIndex.scenes) ? sceneIndex.scenes : [];
  const captions = (Array.isArray(sceneIndex.captions) ? sceneIndex.captions : []).map((caption: any) => ({
    ...caption,
    text: script.get(caption.id) ?? caption.text ?? "",
  }));
  const selectedAssetIds = new Set(Array.isArray(projectState.selectedAssetIds) ? projectState.selectedAssetIds : []);
  const assets: ProjectState["assets"] = [];
  for (const [id, configuredPath] of Object.entries(sceneIndex.assets ?? {})) {
    const file = resolveProjectAssetFile(videoId, id, String(configuredPath));
    const url = file ? fileUrl(file, target) : null;
    if (!file || !url) continue;
    const scene = scenes.find((item: any) => item.assetIds?.includes(id));
    assets.push({id, sceneId: scene?.id ?? null, kind: mediaKind(file), selected: selectedAssetIds.size === 0 || selectedAssetIds.has(id), provider: "project", path: relative(projectRoot, file), url});
  }

  const audioDir = resolve(context.publicDir, "audio");
  const audioTrack = (id: string, label: string, file: string) => {
    const exists = existsSync(file);
    return {id, label, path: relative(projectRoot, file), exists, url: exists ? fileUrl(file, target) : null};
  };
  const sfxDir = resolve(audioDir, "sfx");
  const audio = {
    voiceover: audioTrack("voiceover", "Voiceover", resolve(audioDir, "voiceover", "voiceover.wav")),
    music: audioTrack("music", "Music", resolve(audioDir, "music", "underscore.mp3")),
    sfx: existsSync(sfxDir) ? readdirSync(sfxDir).filter((file) => /\.(wav|mp3|m4a)$/i.test(file)).sort().map((file) => audioTrack(file, file.replace(/\.[^.]+$/, ""), resolve(sfxDir, file))) : [],
  };
  const outputLabels: Record<string, string> = {still: "Cover image", silent: "Preview video", final: "Final video"};
  const stages = Object.entries(context.outputs)
    .filter(([id]) => id !== "unmastered")
    .map(([id, file]) => ({id, label: outputLabels[id] ?? id, path: relative(projectRoot, file), exists: existsSync(file), url: existsSync(file) ? fileUrl(file, target) : null}))
    .filter((stage, index, all) => all.findIndex((item) => item.path === stage.path) === index);

  return {
    videoId,
    composition: context.composition as ProjectState["composition"],
    models: {image: context.config.imageGeneration?.model ?? null, video: context.config.videoGeneration?.model ?? null, voice: context.config.voice?.model ?? null},
    registry: {image: [], video: [], voice: []},
    scenes,
    captions,
    effects: (remotionTimeline.effects ?? []).filter((effect: any) => Number.isInteger(effect.startFrame) && Number.isInteger(effect.endFrame) && effect.startFrame >= 0 && effect.endFrame > effect.startFrame && effect.endFrame <= context.composition.durationInFrames),
    audio,
    cover: readJson(resolve(context.sourceDir, "COVER.json"), null),
    assets,
    stages,
    revisions: projectState.revisionRequests ?? [],
    sources: [],
    plan: null,
    qa: null,
    delivery: null,
  };
};
