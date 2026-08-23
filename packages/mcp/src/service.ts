import {randomUUID} from "node:crypto";
import {existsSync, readFileSync, readdirSync, renameSync, writeFileSync} from "node:fs";
import {dirname, extname, relative, resolve, sep} from "node:path";

import {linkAssets} from "@make-video/assets";
import {runImages, runMusic, runVoiceover} from "@make-video/ai";
import {runRender} from "@make-video/render";
import {runQa} from "@make-video/qa";
import type {GenerationJob} from "@make-video/contracts";
import type {RenderJob} from "@make-video/contracts";
import type {QaJob} from "@make-video/contracts";
import {loadVideoContext, projectRoot} from "./context";

const preparedAssetProjects = new Set<string>();
const generationJobs = new Map<string, GenerationJob>();
const renderJobs = new Map<string, RenderJob>();
const qaJobs = new Map<string, QaJob>();

/** Prepare ignored public/ links before reading project media. */
export const prepareProjectAssets = (videoId: string) => {
  if (preparedAssetProjects.has(videoId)) return true;
  try {
    linkAssets(videoId);
    preparedAssetProjects.add(videoId);
    return true;
  } catch {
    return false;
  }
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
const mediaKind = (file: string): "image" | "video" => /\.(mp4|mov|webm|m4v)$/i.test(file) ? "video" : "image";

const resolveAssetFile = (context: ReturnType<typeof loadVideoContext>, id: string, configuredPath: string) => {
  const configuredFile = context.resolveConfiguredPath(configuredPath, `scene asset ${id}`);
  if (existsSync(configuredFile) && extname(configuredFile).toLowerCase() !== ".json") return configuredFile;
  if (extname(configuredFile).toLowerCase() !== ".json") return null;
  const metadata = readJson(configuredFile, null);
  const candidate = metadata?.output ?? metadata?.groups?.find((group: any) => group?.id === id)?.output;
  if (typeof candidate !== "string" || candidate.length === 0) return null;
  const output = resolve(context.publicDir, candidate);
  return insideRoot(output) && existsSync(output) ? output : null;
};

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
  const projectState = readJson(resolve(context.sourceDir, "PROJECT_STATE.json"), {version: 1, revisionRequests: []});
  const remotionTimeline = readJson(resolve(context.sourceDir, "REMOTION_TIMELINE.json"), {version: 1, effects: []});
  const cover = readJson(resolve(context.sourceDir, "COVER.json"), null);
  const script = parseScript(resolve(context.sourceDir, "SCRIPT.md"));
  const captions = sceneIndex.captions.map((caption: any) => ({...caption, text: script.get(caption.id) ?? ""}));
  const assets: any[] = [];

  for (const [id, configuredPath] of Object.entries(sceneIndex.assets ?? {})) {
    const file = resolveAssetFile(context, id, String(configuredPath));
    if (file) assets.push({id, sceneId: sceneIndex.scenes.find((scene: any) => scene.assetIds?.includes(id))?.id ?? null, kind: mediaKind(file), selected: true, path: relative(projectRoot, file), url: mediaUrl(file)});
  }
  const outputLabels: Record<string, string> = {still: "Cover image", silent: "Preview video", unmastered: "Intermediate render", final: "Final video"};
  const audioTrack = (id: string, label: string, file: string) => ({id, label, path: relative(projectRoot, file), exists: existsSync(file), url: existsSync(file) ? mediaUrl(file) : null});
  const audioDir = resolve(context.publicDir, "audio");
  const sfxDir = resolve(audioDir, "sfx");
  const audio = {
    voiceover: audioTrack("voiceover", "Voiceover", resolve(audioDir, "voiceover", "voiceover.wav")),
    music: audioTrack("music", "Music", resolve(audioDir, "music", "underscore.mp3")),
    sfx: existsSync(sfxDir) ? readdirSync(sfxDir).filter((file) => /\.(wav|mp3|m4a)$/i.test(file)).sort().map((file) => audioTrack(file, file.replace(/\.[^.]+$/, ""), resolve(sfxDir, file))) : [],
  };
  const stages = [
    ...Object.entries(context.outputs).filter(([id]) => id !== "unmastered").map(([id, file]) => ({id, label: outputLabels[id] ?? id, path: relative(projectRoot, file), exists: existsSync(file), url: existsSync(file) ? mediaUrl(file) : null})),
  ].filter((stage, index, all) => all.findIndex((item) => item.path === stage.path) === index);
  const qaReports = ([
    ["video", "qa-report.json"],
    ["images", "image-qa-report.json"],
    ["generated-videos", "clip-qa-report.json"],
  ] as const).map(([kind, file]) => ({kind, report: readJson(resolve(projectRoot, "output", videoId, file), null)})).filter((item) => item.report);

  return {
    videoId,
    composition: context.composition,
    models: {image: context.config.imageGeneration?.model ?? null, voice: context.config.voice?.model ?? null},
    registry: {image: [], voice: []},
    scenes: sceneIndex.scenes.map((scene: any) => ({...scene, ...(scene.content ? {content: scene.content} : {})})),
    captions,
    effects: (remotionTimeline.effects ?? []).filter((effect: any) => Number.isInteger(effect.startFrame) && Number.isInteger(effect.endFrame) && effect.startFrame >= 0 && effect.endFrame > effect.startFrame && effect.endFrame <= context.composition.durationInFrames),
    audio,
    cover,
    assets,
    stages,
    revisions: projectState.revisionRequests ?? [],
    qa: qaReports.length > 0 ? {passed: qaReports.every((item) => item.report.passed === true), reports: qaReports.map((item) => ({kind: item.kind, passed: item.report.passed === true, checkedAt: item.report.checkedAt}))} : null,
  };
};

export const updateTimelineRange = (videoId: string, input: any) => {
  const context = loadVideoContext(videoId);
  const type = String(input.type ?? "");
  const id = String(input.id ?? "");
  const startFrame = Number(input.startFrame);
  const endFrame = Number(input.endFrame);
  if (!["scene", "caption", "voice", "effect"].includes(type) || !id) throw new Error("Timeline item type and id are required.");
  if (!Number.isInteger(startFrame) || !Number.isInteger(endFrame) || startFrame < 0 || endFrame <= startFrame || endFrame > context.composition.durationInFrames) throw new Error("Timeline frame range is invalid.");

  if (type === "caption" || type === "voice") {
    const project = getProjectState(videoId);
    const caption = project.captions.find((item: any) => item.id === id);
    if (!caption) throw new Error(`Unknown caption: ${id}`);
    updateCaption(videoId, id, {text: caption.text, startFrame, endFrame});
    return {type, id, startFrame, endFrame};
  }

  if (type === "scene") {
    const indexFile = resolve(context.sourceDir, "SCENE_INDEX.json");
    const index = readJson(indexFile);
    const scene = index.scenes.find((item: any) => item.id === id);
    if (!scene) throw new Error(`Unknown scene: ${id}`);
    scene.startFrame = startFrame;
    scene.endFrame = endFrame;
    scene.durationInFrames = endFrame - startFrame;
    writeJson(indexFile, index);
    return {type, id, startFrame, endFrame};
  }

  const timelineFile = resolve(context.sourceDir, "REMOTION_TIMELINE.json");
  const timeline = readJson(timelineFile, {version: 1, effects: []});
  const effect = timeline.effects.find((item: any) => item.id === id);
  if (!effect) throw new Error(`Unknown effect: ${id}`);
  effect.startFrame = startFrame;
  effect.endFrame = endFrame;
  writeJson(timelineFile, timeline);
  return {type, id, startFrame, endFrame};
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
  const image = normalizeGoogleModel(input.image);
  const voice = normalizeGoogleModel(input.voice);
  if (image) config.imageGeneration = {...(config.imageGeneration ?? {}), model: image, assets: config.imageGeneration?.assets ?? []};
  if (voice) config.voice = {...(config.voice ?? {}), model: voice, voiceName: config.voice?.voiceName ?? "Kore", direction: config.voice?.direction ?? "Clear documentary narration.", timingMode: config.voice?.timingMode ?? "narration"};
  writeJson(context.configPath, config);
  return {image: config.imageGeneration?.model ?? null, voice: config.voice?.model ?? null};
};

export const runGeneration = async (videoId: string, kind: "images" | "voiceover" | "music", force = false) => {
  if (!["images", "voiceover", "music"].includes(kind)) throw new Error(`Unknown generation kind: ${kind}`);
  const args = [videoId, ...(force ? ["--force"] : [])];
  if (kind === "images") await runImages(args);
  else if (kind === "voiceover") await runVoiceover(args);
  else await runMusic(args);
  return getProjectState(videoId);
};

export const startGeneration = (videoId: string, kind: "images" | "voiceover" | "music", force = false): GenerationJob => {
  if (!["images", "voiceover", "music"].includes(kind)) throw new Error(`Unknown generation kind: ${kind}`);
  const job: GenerationJob = {id: randomUUID(), videoId, kind, status: "queued", createdAt: new Date().toISOString()};
  generationJobs.set(job.id, job);
  void (async () => {
    job.status = "running";
    job.startedAt = new Date().toISOString();
    try {
      await runGeneration(videoId, kind, force);
      job.status = "succeeded";
    } catch (error) {
      job.status = "failed";
      job.error = error instanceof Error ? error.message : String(error);
    } finally {
      job.completedAt = new Date().toISOString();
    }
  })();
  return job;
};

export const getGenerationJob = (jobId: string) => {
  const job = generationJobs.get(jobId);
  if (!job) throw new Error(`Generation job not found: ${jobId}`);
  return job;
};

export const startRender = (videoId: string, kind: "still" | "preview" | "final", force = false): RenderJob => {
  if (!["still", "preview", "final"].includes(kind)) throw new Error(`Unknown render kind: ${kind}`);
  const job: RenderJob = {id: randomUUID(), videoId, kind, status: "queued", createdAt: new Date().toISOString()};
  renderJobs.set(job.id, job);
  void (async () => {
    job.status = "running";
    job.startedAt = new Date().toISOString();
    try {
      await runRender(kind, videoId, force);
      job.status = "succeeded";
    } catch (error) {
      job.status = "failed";
      job.error = error instanceof Error ? error.message : String(error);
    } finally {
      job.completedAt = new Date().toISOString();
    }
  })();
  return job;
};

export const getRenderJob = (jobId: string) => {
  const job = renderJobs.get(jobId);
  if (!job) throw new Error(`Render job not found: ${jobId}`);
  return job;
};

export const startQa = (videoId: string, kind: "video" | "images" | "generated-videos"): QaJob => {
  if (!["video", "images", "generated-videos"].includes(kind)) throw new Error(`Unknown QA kind: ${kind}`);
  const job: QaJob = {id: randomUUID(), videoId, kind, status: "queued", createdAt: new Date().toISOString()};
  qaJobs.set(job.id, job);
  void (async () => {
    job.status = "running";
    job.startedAt = new Date().toISOString();
    try {
      await runQa(kind, videoId);
      job.status = "succeeded";
    } catch (error) {
      job.status = "failed";
      job.error = error instanceof Error ? error.message : String(error);
    } finally {
      job.completedAt = new Date().toISOString();
    }
  })();
  return job;
};

export const getQaJob = (jobId: string) => {
  const job = qaJobs.get(jobId);
  if (!job) throw new Error(`QA job not found: ${jobId}`);
  return job;
};

const normalizeGoogleModel = (value: unknown) => typeof value === "string" && value.startsWith("google/") ? value.slice("google/".length) : value;

export const createAssetRevision = (videoId: string, input: any) => {
  const context = loadVideoContext(videoId);
  const project = getProjectState(videoId);
  const stateFile = resolve(context.sourceDir, "PROJECT_STATE.json");
  const state = readJson(stateFile, {version: 1, revisionRequests: []});
  const assetId = String(input.assetId ?? "");
  const asset = project.assets.find((item: any) => item.id === assetId && item.kind === "image");
  if (!asset) throw new Error("Unknown image asset.");
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
