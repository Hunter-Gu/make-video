import {log, readJsonFile} from "@make-video/project";
import {randomUUID} from "node:crypto";
import {existsSync, mkdirSync, readFileSync, readdirSync, renameSync, statSync, writeFileSync} from "node:fs";
import {basename, dirname, extname, relative, resolve, sep} from "node:path";

import {createProject as createProjectFiles, linkAssets} from "@make-video/assets";
import type {CreatedProject} from "@make-video/assets";
import {estimateGeneration as estimateGenerationRun, runImages, runMusic, runVideos, runVoiceover} from "@make-video/ai";
import {runTiming as runTimingPackage} from "@make-video/audio";
import {buildProjectState, getDeliveryReport, loadDeliverables, resolveProjectAssetFile, runDelivery, runRender} from "@make-video/render";
import {runQa} from "@make-video/qa";
import {buildSeriesCoverage as buildSeriesCoverageFile, listSeriesProjects, loadSeriesContext, verifySeries as verifySeriesPlan} from "@make-video/series";
import {runSourceCatalog, runSourceIngest, runSourceList} from "@make-video/sources";
import type {GenerationJob} from "@make-video/contracts";
import type {RenderJob} from "@make-video/contracts";
import type {BuildOutput, BuildStatus, DeliveryJob, GenerationEstimate, GenerationPreparation, GenerationReadiness, ProjectDelivery, QaJob, SeriesCoverageArtifact, SeriesVerification, SourceCatalog, SourceIndex, SourceJob, SourceUpload, TimingJob, VideoPlan} from "@make-video/contracts";
import {loadVideoContext, projectRoot} from "./context";

const preparedAssetProjects = new Set<string>();

type Job = {id: string; videoId: string; status: "queued" | "running" | "succeeded" | "failed"; createdAt: string; startedAt?: string; completedAt?: string; error?: string};

const jobs = new Map<string, Job>();
const finishedJobLimit = 200;

/**
 * Run one background job and keep its state readable by id. Finished jobs are
 * dropped once there are too many of them, so a long-lived local server does not
 * grow without bound; a job that is still running is never evicted.
 */
const startJob = <T extends Job>(job: T, work: () => Promise<unknown>, describeError: (message: string) => string = (message) => message): T => {
  jobs.set(job.id, job);
  for (const [id, tracked] of jobs) {
    if (jobs.size <= finishedJobLimit) break;
    if (tracked.status === "succeeded" || tracked.status === "failed") jobs.delete(id);
  }
  void (async () => {
    job.status = "running";
    job.startedAt = new Date().toISOString();
    try {
      await work();
      job.status = "succeeded";
    } catch (error) {
      job.status = "failed";
      job.error = describeError(error instanceof Error ? error.message : String(error));
    } finally {
      job.completedAt = new Date().toISOString();
    }
  })();
  return job;
};

const getJob = <T extends Job>(jobId: string, label: string): T => {
  const job = jobs.get(jobId);
  if (!job) throw new Error(`${label} job not found: ${jobId}. Job state is kept in memory, so it does not survive a server restart.`);
  return job as T;
};

const newJob = <T extends Record<string, unknown>>(videoId: string, values: T) => ({id: randomUUID(), videoId, status: "queued" as const, createdAt: new Date().toISOString(), ...values});

/** Prepare ignored public/ links before reading project media. */
export const prepareProjectAssets = (videoId: string) => {
  if (preparedAssetProjects.has(videoId)) return true;
  linkAssets(videoId);
  preparedAssetProjects.add(videoId);
  return true;
};

const readJson = (file: string, fallback: any = null): any => existsSync(file) ? readJsonFile(file) : fallback;
const insideRoot = (file: string) => {
  const value = relative(projectRoot, file);
  return value !== ".." && !value.startsWith(`..${sep}`);
};
const writeJson = (file: string, value: any) => {
  const temporary = `${file}.tmp`;
  writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`);
  renameSync(temporary, file);
};
const sourceType = (file: string) => ({".md": "markdown", ".txt": "text", ".pdf": "pdf", ".docx": "docx", ".epub": "epub"} as Record<string, string>)[extname(file).toLowerCase()];
const sourceId = (name: string, used: Set<string>) => {
  const base = basename(name, extname(name)).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "source";
  let id = base; let index = 2;
  while (used.has(id)) id = `${base}-${index++}`;
  return id;
};

export const listProjects = () => existsSync(resolve(projectRoot, "src"))
  ? readdirSync(resolve(projectRoot, "src"), {withFileTypes: true})
    .filter((entry) => entry.isDirectory() && existsSync(resolve(projectRoot, "src", entry.name, "video.config.json")))
    .map((entry) => entry.name)
    .sort()
  : [];

/**
 * Create the project directory a video needs before anything else can run. When it
 * is an episode of a verified series, the runtime, title, and source documents come
 * from the series plan so the episode reads the same material as its siblings.
 */
export const createProject = (input: any): CreatedProject & {series: {seriesId: string; episodeId: string} | null} => {
  const seriesId = typeof input?.seriesId === "string" && input.seriesId ? input.seriesId : null;
  const episodeId = typeof input?.episodeId === "string" && input.episodeId ? input.episodeId : null;
  if (Boolean(seriesId) !== Boolean(episodeId)) throw new Error("A series episode needs both seriesId and episodeId.");
  if (!seriesId || !episodeId) {
    if (typeof input?.videoId !== "string") throw new Error("videoId is required when the project is not a series episode.");
    return {...createProjectFiles(input), series: null};
  }

  const verification = verifySeriesPlan(seriesId);
  if (!verification.passed || !verification.plan) throw new Error(`Series ${seriesId} does not verify, so its episodes cannot be scaffolded:\n${verification.errors.map((error) => `- ${error}`).join("\n")}`);
  const episode = verification.plan.episodes.find((item) => item.id === episodeId);
  if (!episode) throw new Error(`Series ${seriesId} has no episode "${episodeId}".`);

  return {
    ...createProjectFiles({
      ...input,
      videoId: typeof input.videoId === "string" && input.videoId ? input.videoId : `${seriesId}-${episodeId}`,
      title: input.title ?? episode.title,
      durationSeconds: input.durationSeconds ?? episode.estimatedMinutes * 60,
      sources: input.sources ?? seriesSourceDeclarations(verification.plan.sourceIndex),
      series: {seriesId, episodeId, question: episode.question, topics: episode.topics, sourceBlockIds: episode.sourceBlockIds},
    }),
    series: {seriesId, episodeId},
  };
};

/** Reuse the source documents of the project that owns the series source index. */
const seriesSourceDeclarations = (sourceIndex: string) => {
  const indexFile = resolve(projectRoot, sourceIndex);
  const configFile = resolve(dirname(dirname(indexFile)), "video.config.json");
  if (!insideRoot(configFile) || !existsSync(configFile)) return [];
  const sources = readJson(configFile, {}).sources;
  return Array.isArray(sources) ? sources : [];
};

export const getProjectState = (videoId: string) => {
  prepareProjectAssets(videoId);
  const state = buildProjectState(videoId, "server");
  const qaReports = ([
    ["video", "qa-report.json"],
    ["images", "image-qa-report.json"],
    ["generated-videos", "clip-qa-report.json"],
  ] as const).map(([kind, file]) => ({kind, report: readJson(resolve(projectRoot, "output", videoId, file), null)})).filter((item) => item.report);
  const sourceIndex = getSources(videoId);

  return {
    ...state,
    sources: sourceIndex.sources,
    plan: getPlan(videoId),
    delivery: getProjectDelivery(videoId),
    qa: qaReports.length > 0 ? {passed: qaReports.every((item) => item.report.passed === true), reports: qaReports.map((item) => ({kind: item.kind, passed: item.report.passed === true, checkedAt: item.report.checkedAt}))} : null,
  };
};

export const getSources = (videoId: string): SourceIndex => {
  const context = loadVideoContext(videoId);
  return readJson(resolve(context.sourceDir, "sources", "index.json"), {videoId, sources: []});
};

export const getSourceCatalog = (videoId: string): SourceCatalog | null => {
  const context = loadVideoContext(videoId);
  return readJson(resolve(context.sourceDir, "sources", "catalog.json"), null);
};

export const buildSourceList = async (videoId: string, force = true) => {
  const context = loadVideoContext(videoId);
  await runSourceList(videoId, force);
  const file = resolve(context.sourceDir, "SOURCES.md");
  return {videoId, path: relative(projectRoot, file), content: readFileSync(file, "utf8")};
};

export const buildSourceCatalog = async (videoId: string, force = true): Promise<SourceCatalog> => {
  await runSourceCatalog(videoId, force);
  const catalog = getSourceCatalog(videoId);
  if (!catalog) throw new Error(`Source catalog was not created for ${videoId}.`);
  return catalog;
};

const planSceneTypes = new Set(["chapter", "image", "portrait", "depth", "video", "quote", "timeline", "comparison", "statistic", "chart", "map", "document", "relationship", "montage"]);
const planModes = new Set(["overview", "chapter-explanation", "documentary", "series-episode"]);
const validatePlan = (videoId: string, value: unknown): VideoPlan => {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Video plan must be an object.");
  const plan = value as Record<string, any>;
  if (plan.version !== 1 || typeof plan.title !== "string" || !plan.title.trim()) throw new Error("Video plan needs version 1 and a title.");
  if (!planModes.has(plan.adaptationMode) || typeof plan.audience !== "string" || typeof plan.language !== "string" || !Number.isFinite(plan.durationSeconds) || plan.durationSeconds <= 0) throw new Error("Video plan metadata is invalid.");
  if (!Array.isArray(plan.sourceBlockIds) || !Array.isArray(plan.chapters) || !Array.isArray(plan.scenes)) throw new Error("Video plan needs sourceBlockIds, chapters, and scenes arrays.");
  const sourceBlockIds = new Set(getSources(videoId).sources.flatMap((source) => source.blocks.map((block) => block.id)));
  const checkRefs = (refs: unknown, label: string) => {
    if (!Array.isArray(refs) || refs.some((id) => typeof id !== "string" || !sourceBlockIds.has(id))) throw new Error(`${label} contains an unknown source block.`);
  };
  checkRefs(plan.sourceBlockIds, "Video plan sourceBlockIds");
  const chapterIds = new Set<string>();
  for (const chapter of plan.chapters) {
    if (!chapter || typeof chapter.id !== "string" || !chapter.id || chapterIds.has(chapter.id) || typeof chapter.title !== "string" || typeof chapter.objective !== "string" || !Array.isArray(chapter.sceneIds)) throw new Error("Video plan contains an invalid chapter.");
    chapterIds.add(chapter.id); checkRefs(chapter.sourceBlockIds, `Chapter ${chapter.id} sourceBlockIds`);
  }
  const sceneIds = new Set<string>();
  for (const scene of plan.scenes) {
    if (!scene || typeof scene.id !== "string" || !scene.id || sceneIds.has(scene.id) || !chapterIds.has(scene.chapterId) || typeof scene.title !== "string" || !planSceneTypes.has(scene.type) || typeof scene.objective !== "string") throw new Error("Video plan contains an invalid scene.");
    sceneIds.add(scene.id); checkRefs(scene.sourceBlockIds, `Scene ${scene.id} sourceBlockIds`);
  }
  for (const chapter of plan.chapters) if (chapter.sceneIds.some((id: unknown) => typeof id !== "string" || !sceneIds.has(id) || plan.scenes.find((scene: any) => scene.id === id)?.chapterId !== chapter.id)) throw new Error(`Chapter ${chapter.id} has an invalid scene reference.`);
  return plan as VideoPlan;
};

export const getPlan = (videoId: string): VideoPlan | null => {
  const context = loadVideoContext(videoId);
  return readJson(resolve(context.sourceDir, "VIDEO_PLAN.json"), null);
};

export const savePlan = (videoId: string, value: unknown): VideoPlan => {
  const context = loadVideoContext(videoId);
  const plan = validatePlan(videoId, value);
  writeJson(resolve(context.sourceDir, "VIDEO_PLAN.json"), plan);
  return plan;
};

const normalizeGoogleModel = (value: unknown) => typeof value === "string" && value.startsWith("google/") ? value.slice("google/".length) : value;
const aspectRatio = (width: number, height: number) => {
  const left = Math.max(1, Math.round(width));
  const right = Math.max(1, Math.round(height));
  let a = left; let b = right;
  while (b !== 0) [a, b] = [b, a % b];
  return `${left / a}:${right / a}`;
};
const generatedImageSceneTypes = new Set(["image", "portrait", "depth"]);
const kebabId = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "scene";

export const prepareGeneration = (videoId: string): GenerationPreparation => {
  const context = loadVideoContext(videoId);
  const saved = getPlan(videoId);
  if (!saved) throw new Error(`Video plan not found for ${videoId}.`);
  const plan = validatePlan(videoId, saved);
  const configuredImageGeneration = context.config.imageGeneration as Record<string, any> | undefined;
  const current: Record<string, any> = configuredImageGeneration && !Array.isArray(configuredImageGeneration)
    ? configuredImageGeneration
    : {};
  const assets = Array.isArray(current.assets) ? current.assets.map((asset: any) => ({...asset})) : [];
  const usedIds = new Set(assets.map((asset: any) => typeof asset?.id === "string" ? asset.id : ""));
  // Generated stills are composed full-frame, so they are requested at the composition's ratio.
  const sceneAspectRatio = aspectRatio(context.composition.width, context.composition.height);
  const preparedSceneIds: string[] = [];
  for (const scene of plan.scenes) {
    if (!generatedImageSceneTypes.has(scene.type)) continue;
    const existing = assets.find((asset: any) => asset?.id === scene.id || (Array.isArray(asset?.sceneIds) && asset.sceneIds.includes(scene.id)));
    if (existing) {
      existing.sceneIds = [...new Set([...(Array.isArray(existing.sceneIds) ? existing.sceneIds : []), scene.id])];
      preparedSceneIds.push(scene.id);
      continue;
    }
    let id = kebabId(scene.id);
    let suffix = 2;
    while (usedIds.has(id)) id = `${kebabId(scene.id)}-${suffix++}`;
    usedIds.add(id);
    assets.push({id, sceneIds: [scene.id], prompt: scene.visualDirection?.trim() || scene.objective.trim(), aspectRatio: sceneAspectRatio, output: `images/generated/${id}.png`});
    preparedSceneIds.push(scene.id);
  }
  const nextConfig: Record<string, any> = {...context.config, imageGeneration: {...current, assets}};
  writeJson(context.configPath, nextConfig);
  return {videoId, path: relative(projectRoot, context.configPath), imageModel: typeof nextConfig.imageGeneration.model === "string" ? nextConfig.imageGeneration.model : null, assetCount: assets.length, preparedSceneIds};
};

export const buildStoryboard = (videoId: string, force = false) => {
  const context = loadVideoContext(videoId);
  const saved = getPlan(videoId);
  if (!saved) throw new Error(`Video plan not found for ${videoId}.`);
  const plan = validatePlan(videoId, saved);
  const lines = [`# Storyboard`, "", `Plan: ${plan.title}`, `Mode: ${plan.adaptationMode}`, `Audience: ${plan.audience}`, `Language: ${plan.language}`, `Target duration: ${plan.durationSeconds}s`, ""];
  for (const chapter of plan.chapters) {
    lines.push(`## ${chapter.title}`, "", `- ID: \`${chapter.id}\``, `- Objective: ${chapter.objective}`, `- Source blocks: ${chapter.sourceBlockIds.length ? chapter.sourceBlockIds.map((id) => `\`${id}\``).join(", ") : "none"}`, "");
    for (const sceneId of chapter.sceneIds) {
      const scene = plan.scenes.find((item) => item.id === sceneId);
      if (!scene) continue;
      lines.push(`### ${scene.title}`, "", `- ID: \`${scene.id}\``, `- Type: ${scene.type}`, `- Objective: ${scene.objective}`, `- Visual direction: ${scene.visualDirection || "To be specified by the host agent."}`, `- Source blocks: ${scene.sourceBlockIds.length ? scene.sourceBlockIds.map((id) => `\`${id}\``).join(", ") : "none"}`, "");
    }
  }
  const file = resolve(context.sourceDir, "STORYBOARD.md");
  if (!force && existsSync(file)) throw new Error(`Storyboard for ${videoId} already exists. Pass force to regenerate.`);
  const content = `${lines.join("\n").trim()}\n`;
  writeFileSync(file, content);
  return {videoId, path: relative(projectRoot, file), content};
};

export const validateScript = (videoId: string) => {
  const context = loadVideoContext(videoId);
  const file = resolve(context.sourceDir, "SCRIPT.md");
  if (!existsSync(file)) return {videoId, path: relative(projectRoot, file), passed: false, segments: [], errors: ["SCRIPT.md is missing."]};
  const lines = readFileSync(file, "utf8").split("\n");
  const segments: Array<{id: string; text: string}> = [];
  const errors: string[] = [];
  const seen = new Set<string>();
  for (const [index, line] of lines.entries()) {
    const match = line.match(/^- `([^`]+)`: (.+)$/);
    if (!match) continue;
    const [, id, value] = match;
    if (seen.has(id)) errors.push(`Duplicate narration id: ${id} (line ${index + 1}).`);
    if (!value.trim()) errors.push(`Narration ${id} is empty (line ${index + 1}).`);
    seen.add(id); segments.push({id, text: value.trim()});
  }
  if (segments.length === 0) errors.push("SCRIPT.md has no narration segments.");
  const sourceBlockIds = new Set(getSources(videoId).sources.flatMap((source) => source.blocks.map((block) => block.id)));
  const claimsFile = resolve(context.sourceDir, "CLAIMS.json");
  if (existsSync(claimsFile)) {
    const claims = readJson(claimsFile, {claims: []}).claims ?? [];
    for (const claim of claims) {
      for (const narrationId of claim.narrationIds ?? []) if (!seen.has(narrationId)) errors.push(`Claim ${claim.id} references missing narration: ${narrationId}.`);
      for (const sourceBlockId of claim.sourceBlockIds ?? []) if (!sourceBlockIds.has(sourceBlockId)) errors.push(`Claim ${claim.id} references missing source block: ${sourceBlockId}.`);
      if (claim.type === "inference" && (typeof claim.disclosure !== "string" || !claim.disclosure.trim())) errors.push(`Inference claim ${claim.id} needs a disclosure.`);
    }
  }
  return {videoId, path: relative(projectRoot, file), passed: errors.length === 0, segments, errors};
};

/** Price a paid run from the project's declared cost plan. Contacts no provider. */
export const estimateGeneration = (videoId: string): GenerationEstimate => estimateGenerationRun(videoId);

export const checkGenerationReadiness = (videoId: string): GenerationReadiness => {
  const context = loadVideoContext(videoId);
  const errors: string[] = [];
  const warnings: string[] = [];
  const savedPlan = getPlan(videoId);
  let planValid = false;
  if (!savedPlan) errors.push("VIDEO_PLAN.json is missing.");
  else { try { validatePlan(videoId, savedPlan); planValid = true; } catch (error) { errors.push(error instanceof Error ? error.message : String(error)); } }
  const scriptFile = resolve(context.sourceDir, "SCRIPT.md");
  const script = validateScript(videoId);
  if (!script.passed) errors.push(...script.errors);
  const config = context.config as Record<string, any>;
  const imageGeneration = config.imageGeneration as Record<string, any> | undefined;
  const imageAssets = Array.isArray(imageGeneration?.assets) ? imageGeneration.assets : [];
  const assignedScenes = new Set<string>();
  const imageIds = new Set<string>();
  for (const asset of imageAssets) {
    if (!asset || typeof asset.id !== "string" || imageIds.has(asset.id)) errors.push("imageGeneration.assets contains a missing or duplicate id.");
    else imageIds.add(asset.id);
    if (typeof asset?.prompt !== "string" || !asset.prompt.trim()) errors.push(`Generated image ${asset?.id ?? "unknown"} needs a prompt.`);
    if (typeof asset?.output !== "string" || !asset.output.trim()) errors.push(`Generated image ${asset?.id ?? "unknown"} needs an output path.`);
    for (const sceneId of Array.isArray(asset?.sceneIds) ? asset.sceneIds : []) if (typeof sceneId === "string") assignedScenes.add(sceneId);
  }
  if (imageAssets.length > 0 && typeof imageGeneration?.model !== "string") errors.push("imageGeneration.model is missing.");
  const videoGeneration = config.videoGeneration as Record<string, any> | undefined;
  const videoAssets = Array.isArray(videoGeneration?.assets) ? videoGeneration.assets : [];
  for (const asset of videoAssets) {
    for (const sceneId of Array.isArray(asset?.sceneIds) ? asset.sceneIds : asset?.sceneId ? [asset.sceneId] : []) if (typeof sceneId === "string") assignedScenes.add(sceneId);
  }
  if (videoAssets.length > 0 && typeof videoGeneration?.model !== "string") errors.push("videoGeneration.model is missing.");
  const voiceModel = typeof config.voice?.model === "string" && config.voice.model.length > 0 ? config.voice.model : null;
  if (!voiceModel) errors.push("voice.model is missing.");
  const planScenes = Array.isArray(savedPlan?.scenes) ? savedPlan.scenes : [];
  for (const scene of planScenes) if (["image", "portrait", "depth", "video", "montage"].includes(scene.type) && !assignedScenes.has(scene.id)) warnings.push(`Scene ${scene.id} has no configured generated media assignment; it must use supplied or Remotion visuals.`);
  // The other direction: paying for media that is attached to no scene at all.
  const planSceneIds = new Set(planScenes.map((scene: any) => scene?.id));
  if (planSceneIds.size > 0) for (const sceneId of assignedScenes) if (!planSceneIds.has(sceneId)) warnings.push(`Generated media is assigned to scene ${sceneId}, which the plan does not contain; it would be paid for and never appear.`);
  const timingFile = resolve(context.sourceDir, "TIMING_PLAN.json");
  const timingPlanPresent = existsSync(timingFile);
  let voiceManifestPresent = false;
  if (timingPlanPresent) {
    const timing = readJson(timingFile, {});
    if (typeof timing.voiceManifest === "string") {
      try {
        voiceManifestPresent = existsSync(context.resolveConfiguredPath(timing.voiceManifest, "TIMING_PLAN.voiceManifest"));
      } catch (error) {
        warnings.push(error instanceof Error ? error.message : String(error));
      }
    }
    if (!voiceManifestPresent) warnings.push("TIMING_PLAN.json exists but its voice manifest is missing.");
  } else warnings.push("TIMING_PLAN.json is missing; build timing after voiceover generation.");
  return {videoId, passed: errors.length === 0, errors: [...new Set(errors)], warnings: [...new Set(warnings)], plan: {present: Boolean(savedPlan), valid: planValid}, script: {present: existsSync(scriptFile), valid: script.passed, segments: script.segments.length}, generation: {imageModel: typeof imageGeneration?.model === "string" ? imageGeneration.model : null, videoModel: typeof videoGeneration?.model === "string" ? videoGeneration.model : null, voiceModel, imageAssets: imageAssets.length, videoAssets: videoAssets.length, assignedScenes: [...assignedScenes]}, timing: {planPresent: timingPlanPresent, voiceManifestPresent}};
};

export const startTiming = (videoId: string, force = false): TimingJob => startJob(newJob(videoId, {}) as TimingJob, async () => {
  const validation = validateScript(videoId);
  if (!validation.passed) throw new Error(`Script validation failed: ${validation.errors.join(" ")}`);
  await runTimingPackage(videoId, force);
});

export const getTimingJob = (jobId: string) => getJob<TimingJob>(jobId, "Timing");

export const uploadSource = (videoId: string, filename: string, data: Buffer): SourceUpload => {
  const context = loadVideoContext(videoId);
  const safeName = basename(filename).replace(/[^a-zA-Z0-9._-]+/g, "-");
  const type = sourceType(safeName);
  if (!type) throw new Error("Supported source files are PDF, DOCX, EPUB, Markdown, and text.");
  if (data.byteLength === 0) throw new Error("The uploaded source file is empty.");
  if (data.byteLength > 100 * 1024 * 1024) throw new Error("Source files must be smaller than 100 MB.");
  const configuredSources = Array.isArray(context.config.sources) ? context.config.sources : [];
  const used = new Set(configuredSources.map((source: any) => String(source?.id ?? "")));
  const id = sourceId(safeName, used);
  const uploadDir = resolve(context.sourceDir, "sources", "uploads");
  mkdirSync(uploadDir, {recursive: true});
  const file = resolve(uploadDir, safeName);
  if (!insideRoot(file)) throw new Error("Source filename is invalid.");
  writeFileSync(file, data, {flag: "wx"});
  const input = relative(projectRoot, file);
  const source = {id, title: basename(safeName, extname(safeName)), type, input, rights: "user-provided"};
  const config = {...context.config, sources: [...configuredSources, source]};
  writeJson(context.configPath, config);
  return {videoId, source};
};

export const startSourceIngest = (videoId: string, force = true): SourceJob =>
  startJob(newJob(videoId, {}) as SourceJob, () => runSourceIngest(videoId, force));

export const getSourceJob = (jobId: string) => getJob<SourceJob>(jobId, "Source");

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
    const sceneIndex = index.scenes.findIndex((item: any) => item.id === id);
    const scene = index.scenes[sceneIndex];
    if (!scene) throw new Error(`Unknown scene: ${id}`);
    const previous = sceneIndex > 0 ? index.scenes[sceneIndex - 1] : null;
    const next = sceneIndex < index.scenes.length - 1 ? index.scenes[sceneIndex + 1] : null;
    if (!previous && startFrame !== 0) throw new Error("The first scene must start at frame 0.");
    if (!next && endFrame !== context.composition.durationInFrames) throw new Error("The last scene must end at the composition duration.");
    if (previous && startFrame <= previous.startFrame) throw new Error(`Scene ${id} would consume the previous scene.`);
    if (next && endFrame >= next.endFrame) throw new Error(`Scene ${id} would consume the next scene.`);
    if (previous) {
      previous.endFrame = startFrame;
      previous.durationInFrames = previous.endFrame - previous.startFrame;
    }
    scene.startFrame = startFrame;
    scene.endFrame = endFrame;
    scene.durationInFrames = endFrame - startFrame;
    if (next) {
      next.startFrame = endFrame;
      next.durationInFrames = next.endFrame - next.startFrame;
    }
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
  const video = normalizeGoogleModel(input.video);
  const voice = normalizeGoogleModel(input.voice);
  if (image) config.imageGeneration = {...(config.imageGeneration ?? {}), model: image, assets: config.imageGeneration?.assets ?? []};
  if (video) config.videoGeneration = {...(config.videoGeneration ?? {}), model: video, assets: config.videoGeneration?.assets ?? []};
  if (voice) config.voice = {...(config.voice ?? {}), model: voice, voiceName: config.voice?.voiceName ?? "Kore", direction: config.voice?.direction ?? "Clear documentary narration.", timingMode: config.voice?.timingMode ?? "narration"};
  writeJson(context.configPath, config);
  return {image: config.imageGeneration?.model ?? null, video: config.videoGeneration?.model ?? null, voice: config.voice?.model ?? null};
};

/**
 * Link the media a generator actually wrote back onto the scenes that requested it.
 * The manifest is the generator's record; SCENE_INDEX.json is what the renderer reads.
 */
const syncGeneratedAssets = (videoId: string, kind: "images" | "video") => {
  const context = loadVideoContext(videoId);
  const manifestFile = resolve(context.publicDir, kind === "images" ? "images/generated/manifest.json" : "video/generated/manifest.json");
  if (!existsSync(manifestFile)) return {updatedSceneIds: [], missingSceneIds: []};
  const manifest = readJson(manifestFile, {assets: []});
  const configured = context.config[kind === "images" ? "imageGeneration" : "videoGeneration"] as Record<string, any> | undefined;
  const configuredAssets = Array.isArray(configured?.assets) ? configured.assets : [];
  const indexFile = resolve(context.sourceDir, "SCENE_INDEX.json");
  const index = readJson(indexFile, {assets: {}, scenes: []});
  if (!index.assets || typeof index.assets !== "object" || Array.isArray(index.assets)) index.assets = {};
  const updatedSceneIds: string[] = [];
  const missingSceneIds: string[] = [];
  let changed = false;
  for (const asset of configuredAssets) {
    const generated = Array.isArray(manifest.assets) ? manifest.assets.find((item: any) => item?.id === asset?.id) : null;
    if (!generated || typeof generated.output !== "string") continue;
    const output = resolve(context.publicDir, generated.output);
    const outputRelative = relative(context.publicDir, output);
    if (outputRelative === ".." || outputRelative.startsWith(`..${sep}`) || !existsSync(output)) continue;
    const projectPath = relative(projectRoot, output);
    if (index.assets[asset.id] !== projectPath) { index.assets[asset.id] = projectPath; changed = true; }
    const sceneIds = Array.isArray(asset?.sceneIds) ? asset.sceneIds : asset?.sceneId ? [asset.sceneId] : [];
    for (const sceneId of sceneIds) {
      const scene = Array.isArray(index.scenes) ? index.scenes.find((item: any) => item?.id === sceneId) : null;
      if (!scene) { missingSceneIds.push(sceneId); continue; }
      const sceneAssetIds = Array.isArray(scene.assetIds) ? scene.assetIds : [];
      if (!sceneAssetIds.includes(asset.id)) { scene.assetIds = [...sceneAssetIds, asset.id]; changed = true; }
      updatedSceneIds.push(sceneId);
    }
  }
  if (changed) writeJson(indexFile, index);
  return {updatedSceneIds: [...new Set(updatedSceneIds)], missingSceneIds: [...new Set(missingSceneIds)]};
};

const validateRenderInputs = (videoId: string) => {
  syncGeneratedAssets(videoId, "images");
  syncGeneratedAssets(videoId, "video");
  const context = loadVideoContext(videoId);
  const indexFile = resolve(context.sourceDir, "SCENE_INDEX.json");
  if (!existsSync(indexFile)) throw new Error(`SCENE_INDEX.json is missing for ${videoId}.`);
  const index = readJson(indexFile, null);
  const errors: string[] = [];
  const scenes = Array.isArray(index?.scenes) ? index.scenes : [];
  const duration = Number(context.composition.durationInFrames);
  if (scenes.length === 0) errors.push("SCENE_INDEX.json has no scenes.");
  const sceneIds = new Set<string>();
  let previousEnd = 0;
  for (const scene of scenes) {
    if (!scene || typeof scene.id !== "string") { errors.push("SCENE_INDEX.json contains a scene without an id."); continue; }
    if (sceneIds.has(scene.id)) errors.push(`Scene id ${scene.id} is duplicated.`);
    sceneIds.add(scene.id);
    const start = Number(scene.startFrame); const end = Number(scene.endFrame);
    if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end <= start || end > duration) errors.push(`Scene ${scene.id} has an invalid frame range.`);
    else {
      if (start !== previousEnd) errors.push(`Scene ${scene.id} must start at frame ${previousEnd}, not ${start}.`);
      if (Number(scene.durationInFrames) !== end - start) errors.push(`Scene ${scene.id} duration does not match its frame range.`);
      previousEnd = end;
    }
    for (const assetId of Array.isArray(scene.assetIds) ? scene.assetIds : []) {
      const configuredPath = index.assets?.[assetId];
      if (typeof configuredPath !== "string") { errors.push(`Scene ${scene.id} references missing asset ${assetId}.`); continue; }
      try { if (!resolveProjectAssetFile(videoId, assetId, configuredPath)) errors.push(`Scene ${scene.id} asset ${assetId} is not available.`); }
      catch (error) { errors.push(error instanceof Error ? error.message : String(error)); }
    }
  }
  if (scenes.length > 0 && previousEnd !== duration) errors.push(`Scenes end at frame ${previousEnd}, but the composition ends at ${duration}.`);
  for (const caption of Array.isArray(index?.captions) ? index.captions : []) {
    const start = Number(caption?.startFrame); const end = Number(caption?.endFrame);
    if (!caption?.id || !Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end <= start || end > duration) errors.push(`Caption ${caption?.id ?? "unknown"} has an invalid frame range.`);
  }
  if (errors.length > 0) throw new Error(`Render inputs are invalid:\n${[...new Set(errors)].map((error) => `- ${error}`).join("\n")}`);
};

const qaFailureDetail = (videoId: string, kind: "video" | "images" | "generated-videos", fallback: string) => {
  const reportName = {video: "qa-report.json", images: "image-qa-report.json", "generated-videos": "clip-qa-report.json"}[kind];
  const report = readJson(resolve(projectRoot, "output", videoId, reportName), null);
  if (report?.videoId !== videoId || report?.passed !== false) return fallback;
  const failures: string[] = [];
  for (const check of report?.checks ?? []) if (check?.pass === false) failures.push(String(check.id));
  for (const item of [...(report?.images ?? []), ...(report?.clips ?? [])]) for (const [id, passed] of Object.entries(item?.checks ?? {})) if (passed === false) failures.push(`${item.id}:${id}`);
  return failures.length > 0 ? `${fallback} Failed checks: ${[...new Set(failures)].join(", ")}.` : fallback;
};

export const runGeneration = async (videoId: string, kind: "images" | "video" | "voiceover" | "music", force = false) => {
  if (!["images", "video", "voiceover", "music"].includes(kind)) throw new Error(`Unknown generation kind: ${kind}`);
  if (kind === "voiceover") {
    const validation = validateScript(videoId);
    if (!validation.passed) throw new Error(`Script validation failed: ${validation.errors.join(" ")}`);
  }
  const args = [videoId, ...(force ? ["--force"] : [])];
  // An asset assigned to a scene that no longer exists is attached to nothing, so
  // the media just never appears. Say so here, immediately after paying for it.
  const attach = (media: "images" | "video") => {
    const {missingSceneIds} = syncGeneratedAssets(videoId, media);
    if (missingSceneIds.length > 0) log(`! Generated ${media} are assigned to scenes the project does not have: ${missingSceneIds.join(", ")}. They will not appear until the assignment is corrected.`);
  };
  if (kind === "images") { await runImages(args); attach("images"); }
  else if (kind === "video") { await runVideos(args); attach("video"); }
  else if (kind === "voiceover") {
    await runVoiceover(args);
    if (existsSync(resolve(loadVideoContext(videoId).sourceDir, "TIMING_PLAN.json"))) await runTimingPackage(videoId, true);
  }
  else await runMusic(args);
  return getProjectState(videoId);
};

export const startGeneration = (videoId: string, kind: "images" | "video" | "voiceover" | "music", force = false): GenerationJob => {
  if (!["images", "video", "voiceover", "music"].includes(kind)) throw new Error(`Unknown generation kind: ${kind}`);
  return startJob(newJob(videoId, {kind}) as GenerationJob, () => runGeneration(videoId, kind, force));
};

export const getGenerationJob = (jobId: string) => getJob<GenerationJob>(jobId, "Generation");

export const startRender = (videoId: string, kind: "still" | "preview" | "final", force = false): RenderJob => {
  if (!["still", "preview", "final"].includes(kind)) throw new Error(`Unknown render kind: ${kind}`);
  return startJob(newJob(videoId, {kind}) as RenderJob, async () => {
    validateRenderInputs(videoId);
    await runRender(kind, videoId, force);
    if (kind === "still") return;
    const context = loadVideoContext(videoId);
    const output = kind === "preview" ? context.outputs.silent : context.outputs.final;
    await runQa("video", videoId, relative(projectRoot, output));
  }, (message) => message.includes("QA exited") ? qaFailureDetail(videoId, "video", message) : message);
};

export const getRenderJob = (jobId: string) => getJob<RenderJob>(jobId, "Render");

export const startQa = (videoId: string, kind: "video" | "images" | "generated-videos"): QaJob => {
  if (!["video", "images", "generated-videos"].includes(kind)) throw new Error(`Unknown QA kind: ${kind}`);
  return startJob(newJob(videoId, {kind}) as QaJob, () => runQa(kind, videoId), (message) => qaFailureDetail(videoId, kind, message));
};

export const getQaJob = (jobId: string) => getJob<QaJob>(jobId, "QA");


export const createAssetRevision = (videoId: string, input: any) => {
  const context = loadVideoContext(videoId);
  const project = getProjectState(videoId);
  const stateFile = resolve(context.sourceDir, "PROJECT_STATE.json");
  const state = readJson(stateFile, {version: 1, revisionRequests: []});
  if (!Array.isArray(state.revisionRequests)) state.revisionRequests = [];
  const assetId = String(input.assetId ?? "");
  const asset = project.assets.find((item: any) => item.id === assetId && item.kind === "image");
  if (!asset) throw new Error("Unknown image asset.");
  if (![".png", ".jpg", ".jpeg", ".webp"].includes(extname(asset.path).toLowerCase())) throw new Error("Image revisions require a PNG, JPEG, or WebP source.");
  const instruction = String(input.instruction ?? "").trim();
  if (!instruction) throw new Error("An edit instruction is required.");
  const config = readJson(context.configPath);
  const imageGeneration = config.imageGeneration && typeof config.imageGeneration === "object" ? config.imageGeneration : {};
  const configuredAssets = Array.isArray(imageGeneration.assets) ? imageGeneration.assets : [];
  const modelId = normalizeGoogleModel(input.modelId ?? imageGeneration.model);
  if (typeof modelId !== "string" || !modelId) throw new Error("Choose an image model before generating a revision.");
  const baseId = assetId.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "image";
  const usedIds = new Set(configuredAssets.map((item: any) => String(item?.id ?? "")));
  let version = 1;
  let revisionAssetId = `${baseId}-revision-${version}`;
  while (usedIds.has(revisionAssetId)) revisionAssetId = `${baseId}-revision-${++version}`;
  const original = configuredAssets.find((item: any) => item?.id === assetId);
  const revisionAsset = {
    ...(original ?? {}),
    id: revisionAssetId,
    model: modelId,
    prompt: [original?.prompt, `Edit request: ${instruction}`, "Preserve every visual element not mentioned in the edit request."].filter(Boolean).join("\n\n"),
    reference: asset.path,
    output: `images/generated/${revisionAssetId}.png`,
    sceneIds: asset.sceneId ? [asset.sceneId] : [],
    aspectRatio: original?.aspectRatio ?? aspectRatio(context.composition.width, context.composition.height),
  };
  config.imageGeneration = {...imageGeneration, model: imageGeneration.model ?? modelId, assets: [...configuredAssets, revisionAsset]};
  const request = {id: randomUUID(), assetId, revisionAssetId, sceneId: asset.sceneId, modelId, instruction, status: "queued", createdAt: new Date().toISOString()};
  state.selectedAssetIds ??= project.assets.filter((item: any) => item.selected).map((item: any) => item.id);
  state.revisionRequests.push(request);
  writeJson(context.configPath, config);
  writeJson(stateFile, state);
  const updateRequest = (values: Record<string, unknown>) => {
    const current = readJson(stateFile, {version: 1, revisionRequests: []});
    if (!Array.isArray(current.revisionRequests)) current.revisionRequests = [];
    const revision = current.revisionRequests.find((item: any) => item.id === request.id);
    if (revision) Object.assign(revision, values);
    writeJson(stateFile, current);
    return current;
  };
  const job: GenerationJob = {id: request.id, videoId, kind: "images", status: "queued", createdAt: request.createdAt};
  return startJob(job, async () => {
    updateRequest({status: "running"});
    try {
      await runImages([videoId, `--asset=${revisionAssetId}`]);
      syncGeneratedAssets(videoId, "images");
      const current = updateRequest({status: "succeeded", completedAt: new Date().toISOString()});
      // The revision replaces its scene's selection without deleting what it revised.
      const currentProject = getProjectState(videoId);
      const selected = new Set(Array.isArray(current.selectedAssetIds) ? current.selectedAssetIds : []);
      for (const item of currentProject.assets) if (item.sceneId === asset.sceneId) selected.delete(item.id);
      selected.add(revisionAssetId);
      current.selectedAssetIds = [...selected];
      writeJson(stateFile, current);
    } catch (error) {
      updateRequest({status: "failed", error: error instanceof Error ? error.message : String(error), completedAt: new Date().toISOString()});
      throw error;
    }
  });
};

const getProjectDelivery = (videoId: string): ProjectDelivery | null => {
  const context = loadVideoContext(videoId);
  const declared = existsSync(resolve(context.sourceDir, "DELIVERABLES.json"));
  const report = getDeliveryReport(videoId);
  if (!declared) return report ? {variants: [], report, error: null} : null;
  try { return {variants: loadDeliverables(videoId), report, error: null}; }
  catch (error) { return {variants: [], report, error: error instanceof Error ? error.message : String(error)}; }
};

export const getDeliverables = (videoId: string) => ({videoId, variants: loadDeliverables(videoId), report: getDeliveryReport(videoId)});

export const startDelivery = (videoId: string, variantIds: string[] = [], force = false): DeliveryJob => {
  const declared = loadDeliverables(videoId);
  const unknown = variantIds.filter((id) => !declared.some((variant) => variant.id === id));
  if (unknown.length > 0) throw new Error(`Unknown delivery variants: ${unknown.join(", ")}`);
  return startJob(newJob(videoId, {variantIds}) as DeliveryJob, () => runDelivery(videoId, {variantIds, force}));
};

export const getDeliveryJob = (jobId: string) => getJob<DeliveryJob>(jobId, "Delivery");

/**
 * Report which rendered outputs are behind the project files they were built from.
 * Comparing modification times is enough to answer "what has to be rebuilt after
 * this edit", and it costs nothing — no render, no probe, no model call.
 */
export const getBuildStatus = (videoId: string): BuildStatus => {
  const context = loadVideoContext(videoId);
  const modifiedAt = (file: string) => existsSync(file) ? statSync(file).mtimeMs : null;
  const inputs = new Map<string, number>();
  const addInput = (file: string) => {
    const modified = modifiedAt(file);
    if (modified !== null && insideRoot(file)) inputs.set(relative(projectRoot, file), modified);
  };

  addInput(context.configPath);
  for (const name of ["SCENE_INDEX.json", "REMOTION_TIMELINE.json", "SCRIPT.md"]) addInput(resolve(context.sourceDir, name));
  const index = readJson(resolve(context.sourceDir, "SCENE_INDEX.json"), {assets: {}});
  for (const [assetId, configuredPath] of Object.entries(index?.assets ?? {})) {
    try {
      const file = resolveProjectAssetFile(videoId, assetId, String(configuredPath));
      if (file) addInput(file);
    } catch { /* validateRenderInputs is the place that reports a broken asset path */ }
  }
  const audioDir = resolve(context.publicDir, "audio");
  addInput(resolve(audioDir, "voiceover", "voiceover.wav"));
  addInput(resolve(audioDir, "music", "underscore.mp3"));
  const sfxDir = resolve(audioDir, "sfx");
  if (existsSync(sfxDir)) for (const file of readdirSync(sfxDir).sort()) addInput(resolve(sfxDir, file));

  const outputs: BuildOutput[] = [];
  const describe = (id: string, kind: BuildOutput["kind"], label: string, file: string, extra: string[] = []) => {
    const built = modifiedAt(file);
    const candidates = [...inputs.entries(), ...extra.flatMap((path) => {
      const modified = modifiedAt(resolve(projectRoot, path));
      return modified === null ? [] : [[path, modified] as const];
    })];
    const staleInputs = built === null ? [] : candidates.filter(([, modified]) => modified > built).map(([path]) => path).sort();
    outputs.push({id, kind, label, path: relative(projectRoot, file), exists: built !== null, modifiedAt: built === null ? null : new Date(built).toISOString(), stale: staleInputs.length > 0, staleInputs});
  };

  const labels: Record<string, string> = {still: "Cover image", silent: "Preview video", final: "Final video"};
  for (const [id, file] of Object.entries(context.outputs)) if (id in labels) describe(id, "render", labels[id], file);
  if (existsSync(resolve(context.sourceDir, "DELIVERABLES.json"))) {
    try {
      for (const variant of loadDeliverables(videoId)) {
        describe(variant.id, "delivery", `Delivery variant ${variant.id}`, resolve(projectRoot, variant.output), variant.translation ? [variant.translation] : []);
      }
    } catch { /* getDeliverables reports an invalid DELIVERABLES.json with its own message */ }
  }

  return {
    videoId,
    checkedAt: new Date().toISOString(),
    upToDate: outputs.every((output) => !output.stale),
    inputs: [...inputs.entries()].map(([path, modified]) => ({path, modifiedAt: new Date(modified).toISOString()})).sort((left, right) => left.path.localeCompare(right.path)),
    outputs,
    stale: outputs.filter((output) => output.stale).map((output) => output.id),
    missing: outputs.filter((output) => !output.exists).map((output) => output.id),
  };
};

export const listSeries = () => listSeriesProjects();

export const getSeries = (seriesId: string) => {
  const context = loadSeriesContext(seriesId);
  return {seriesId, plan: context.plan, bible: context.bible};
};

export const verifySeries = (seriesId: string): SeriesVerification => verifySeriesPlan(seriesId);

export const buildSeriesCoverage = (seriesId: string, force = true): SeriesCoverageArtifact => buildSeriesCoverageFile(seriesId, force);

export const resolveMediaPath = (configuredPath: string) => {
  const file = resolve(projectRoot, configuredPath);
  const allowed = new Set([".jpg", ".jpeg", ".png", ".webp", ".svg", ".mp4", ".mov", ".webm", ".wav", ".mp3", ".m4a"]);
  if (!insideRoot(file) || !existsSync(file) || !allowed.has(extname(file).toLowerCase())) throw new Error("Media file not found.");
  return file;
};
