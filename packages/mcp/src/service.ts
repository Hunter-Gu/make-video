import {randomUUID} from "node:crypto";
import {existsSync, readFileSync, readdirSync, renameSync, writeFileSync} from "node:fs";
import {spawnSync} from "node:child_process";
import {dirname, extname, relative, resolve, sep} from "node:path";

import {loadVideoContext, projectRoot, scriptsDir} from "./context";

const preparedAssetProjects = new Set<string>();

/** Prepare ignored public/ links before reading project media. */
export const prepareProjectAssets = (videoId: string) => {
  if (preparedAssetProjects.has(videoId)) return true;
  const result = spawnSync(process.execPath, [resolve(scriptsDir, "link-assets.mjs"), videoId], {
    cwd: projectRoot,
    stdio: "ignore",
  });
  if (result.status === 0) preparedAssetProjects.add(videoId);
  return result.status === 0;
};

const readJson = (file: string, fallback: any = null): any => existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : fallback;
const insideRoot = (file: string) => {
  const value = relative(projectRoot, file);
  return value !== ".." && !value.startsWith(`..${sep}`);
};
const writeJson = (file: string, value: any) => {
  const temporary = `${file}.tmp`;
  writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`);
  renameSync(temporary, file);
};
const mediaUrl = (file: string) => `/media?path=${encodeURIComponent(relative(projectRoot, file))}`;

export const listProjects = () => readdirSync(resolve(projectRoot, "src"), {withFileTypes: true})
  .filter((entry) => entry.isDirectory() && existsSync(resolve(projectRoot, "src", entry.name, "video.config.json")))
  .map((entry) => entry.name)
  .sort();

const parseScript = (file: string) => new Map(
  [...readFileSync(file, "utf8").matchAll(/^- `([^`]+)`: (.+)$/gm)].map((match) => [match[1], match[2]]),
);

export const getProjectState = (videoId: string) => {
  prepareProjectAssets(videoId);
  const context = loadVideoContext(videoId);
  const sceneIndex = readJson(resolve(context.sourceDir, "SCENE_INDEX.json"), {scenes: [], captions: []});
  const candidates = readJson(resolve(context.sourceDir, "CANDIDATES.json"), {groups: []});
  const deliveries = readJson(resolve(context.sourceDir, "DELIVERABLES.json"), {variants: []});
  const workbench = readJson(resolve(context.sourceDir, "WORKBENCH.json"), {version: 1, revisionRequests: []});
  const remotionTimeline = readJson(resolve(context.sourceDir, "REMOTION_TIMELINE.json"), {version: 1, effects: []});
  const cover = readJson(resolve(context.sourceDir, "COVER.json"), null);
  const script = parseScript(resolve(context.sourceDir, "SCRIPT.md"));
  const captions = sceneIndex.captions.map((caption: any) => ({...caption, text: script.get(caption.id) ?? ""}));
  const assets: any[] = [];

  for (const [id, configuredPath] of Object.entries(sceneIndex.assets ?? {})) {
    const file = context.resolveConfiguredPath(configuredPath, `scene asset ${id}`);
    if (existsSync(file) && extname(file).toLowerCase() !== ".json") {
      assets.push({id, sceneId: sceneIndex.scenes.find((scene: any) => scene.assetIds?.includes(id))?.id ?? null, kind: "image", selected: true, path: relative(projectRoot, file), url: mediaUrl(file)});
    }
  }
  for (const group of candidates.groups ?? []) {
    for (const candidate of group.candidates ?? []) {
      const file = context.resolveConfiguredPath(candidate.path, `candidate ${candidate.id}`);
      if (existsSync(file)) {
        assets.push({id: candidate.id, groupId: group.id, sceneId: group.sceneId, kind: group.kind === "motion" ? "video" : "image", selected: candidate.id === group.selectedId, provider: candidate.provider, path: relative(projectRoot, file), url: mediaUrl(file)});
      }
    }
  }

  const stages = [
    ...Object.entries(context.outputs).map(([id, file]) => ({id, label: id, path: relative(projectRoot, file), exists: existsSync(file), url: existsSync(file) ? mediaUrl(file) : null})),
    ...deliveries.variants.map((variant: any) => {
      const file = context.resolveConfiguredPath(variant.output, `deliverable ${variant.id}`);
      return {id: variant.id, label: variant.id, kind: variant.kind, path: relative(projectRoot, file), exists: existsSync(file), url: existsSync(file) ? mediaUrl(file) : null};
    }),
  ].filter((stage, index, all) => all.findIndex((item) => item.path === stage.path) === index);

  return {
    videoId,
    composition: context.composition,
    models: {image: context.config.imageGeneration?.model ?? null, voice: context.config.voice?.model ?? null},
    registry: readJson(resolve(projectRoot, "packages/app/model-registry.json"), {image: [], voice: []}),
    scenes: sceneIndex.scenes,
    captions,
    effects: (remotionTimeline.effects ?? []).filter((effect: any) => Number.isInteger(effect.startFrame) && Number.isInteger(effect.endFrame) && effect.startFrame >= 0 && effect.endFrame > effect.startFrame && effect.endFrame <= context.composition.durationInFrames),
    cover,
    assets,
    stages,
    revisions: workbench.revisionRequests ?? [],
    qa: readJson(resolve(projectRoot, "output", videoId, "qa-report.json"), null),
  };
};

export const setCover = (videoId: string, input: any) => {
  const context = loadVideoContext(videoId);
  const project = getProjectState(videoId);
  const assetId = String(input.assetId ?? "");
  const asset = project.assets.find((item: any) => item.id === assetId && item.kind === "image");
  if (!asset) throw new Error("Cover must reference an existing image asset.");
  const cover = {version: 1, assetId: asset.id, sceneId: asset.sceneId, path: asset.path, selectedAt: new Date().toISOString()};
  writeJson(resolve(context.sourceDir, "COVER.json"), cover);
  return cover;
};

export const updateCaption = (videoId: string, id: string, input: any) => {
  const context = loadVideoContext(videoId);
  const indexFile = resolve(context.sourceDir, "SCENE_INDEX.json");
  const scriptFile = resolve(context.sourceDir, "SCRIPT.md");
  const index = readJson(indexFile);
  const caption = index.captions.find((item: any) => item.id === id);
  if (!caption) throw new Error(`Unknown caption: ${id}`);
  const text = String(input.text ?? "").trim();
  const startFrame = Number(input.startFrame);
  const endFrame = Number(input.endFrame);
  if (!text || !Number.isInteger(startFrame) || !Number.isInteger(endFrame) || startFrame < 0 || endFrame <= startFrame || endFrame > context.composition.durationInFrames) throw new Error("Caption text and frame range are invalid.");
  caption.startFrame = startFrame;
  caption.endFrame = endFrame;
  caption.text = text;
  const script = readFileSync(scriptFile, "utf8");
  const prefix = `- \`${id}\`: `;
  if (!script.split("\n").some((line) => line.startsWith(prefix))) throw new Error(`Script block not found: ${id}`);
  writeJson(indexFile, index);
  writeFileSync(scriptFile, script.split("\n").map((line) => line.startsWith(prefix) ? `${prefix}${text}` : line).join("\n"));
  return {id, text, startFrame, endFrame};
};

export const updateModels = (videoId: string, input: any) => {
  const context = loadVideoContext(videoId);
  const config = readJson(context.configPath);
  const registry = readJson(resolve(projectRoot, "packages/app/model-registry.json"), {image: [], voice: []});
  if (input.image && !registry.image.some((model: any) => model.id === input.image)) throw new Error("Unknown image model.");
  if (input.voice && !registry.voice.some((model: any) => model.id === input.voice)) throw new Error("Unknown voice model.");
  if (input.image) config.imageGeneration = {...(config.imageGeneration ?? {}), model: input.image, assets: config.imageGeneration?.assets ?? []};
  if (input.voice) config.voice = {...(config.voice ?? {}), model: input.voice, voiceName: config.voice?.voiceName ?? "Kore", direction: config.voice?.direction ?? "Clear documentary narration.", timingMode: config.voice?.timingMode ?? "narration"};
  writeJson(context.configPath, config);
  return {image: config.imageGeneration?.model ?? null, voice: config.voice?.model ?? null};
};

export const createAssetRevision = (videoId: string, input: any) => {
  const context = loadVideoContext(videoId);
  const project = getProjectState(videoId);
  const stateFile = resolve(context.sourceDir, "WORKBENCH.json");
  const state = readJson(stateFile, {version: 1, revisionRequests: []});
  const assetId = String(input.assetId ?? "");
  const asset = project.assets.find((item: any) => item.id === assetId && item.kind === "image");
  if (!asset) throw new Error("Unknown image asset.");
  if (input.modelId && !project.registry.image.some((model: any) => model.id === input.modelId)) throw new Error("Unknown image model.");
  const instruction = String(input.instruction ?? "").trim();
  if (!instruction) throw new Error("An edit instruction is required.");
  const request = {id: randomUUID(), assetId, sceneId: asset.sceneId, modelId: input.modelId ?? null, instruction, status: "pending", createdAt: new Date().toISOString()};
  state.revisionRequests.push(request);
  writeJson(stateFile, state);
  return request;
};

export const resolveMediaPath = (configuredPath: string) => {
  const file = resolve(projectRoot, configuredPath);
  const allowed = new Set([".jpg", ".jpeg", ".png", ".webp", ".svg", ".mp4", ".mov", ".webm", ".wav", ".mp3", ".m4a"]);
  if (!insideRoot(file) || !existsSync(file) || !allowed.has(extname(file).toLowerCase())) throw new Error("Media file not found.");
  return file;
};
