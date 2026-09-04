import {log, readJsonFile} from "@make-video/project";
import {spawnSync} from "node:child_process";
import {existsSync, mkdirSync, renameSync, writeFileSync} from "node:fs";
import {dirname, extname, relative, resolve} from "node:path";

import {linkAssets} from "@make-video/assets";
import type {Caption, DeliveryReport, DeliveryVariant, ProjectState, SceneContent} from "@make-video/contracts";

import {assertOutputsAvailable, loadRenderContext, projectRoot, type RenderContext} from "./context";
import {runRemotion} from "./remotion";
import {buildProjectState} from "./state";

const compositionId = "MakeVideo";
const kebabCase = (value: unknown) => typeof value === "string" && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value);

const readJson = (file: string): any => readJsonFile(file);

const positiveInteger = (value: unknown, fallback: number, label: string) => {
  if (value === undefined) return fallback;
  if (!Number.isInteger(value) || (value as number) <= 0) throw new Error(`${label} must be a positive integer.`);
  return value as number;
};

/** Read and validate the delivery variants declared by a video project. */
export const loadDeliverables = (videoId: string): DeliveryVariant[] => {
  const context = loadRenderContext(videoId);
  const file = resolve(context.sourceDir, "DELIVERABLES.json");
  if (!existsSync(file)) throw new Error(`DELIVERABLES.json not found for ${videoId}: ${file}`);
  const document = readJson(file);
  if (!document || typeof document !== "object" || document.version !== 1) throw new Error("DELIVERABLES.json must be an object with version 1.");
  if (!Array.isArray(document.variants) || document.variants.length === 0) throw new Error("DELIVERABLES.json needs a non-empty variants array.");
  const duration = Number(context.composition.durationInFrames);
  const productionOutputs = new Set(Object.values(context.outputs));
  const ids = new Set<string>();
  const outputs = new Set<string>();
  return document.variants.map((variant: any, index: number): DeliveryVariant => {
    const label = `DELIVERABLES.json variants[${index}]`;
    if (!variant || typeof variant !== "object" || Array.isArray(variant)) throw new Error(`${label} must be an object.`);
    if (!kebabCase(variant.id)) throw new Error(`${label} needs a kebab-case id.`);
    if (ids.has(variant.id)) throw new Error(`Duplicate delivery variant id: ${variant.id}`);
    ids.add(variant.id);
    if (variant.kind !== "video" && variant.kind !== "still") throw new Error(`Delivery variant ${variant.id} must be a video or still.`);
    const output = context.resolveConfiguredPath(variant.output, `Delivery variant ${variant.id} output`);
    const expected = variant.kind === "still" ? ".png" : ".mp4";
    if (extname(output).toLowerCase() !== expected) throw new Error(`Delivery variant ${variant.id} needs a ${expected} output path.`);
    if (productionOutputs.has(output)) throw new Error(`Delivery variant ${variant.id} must not overwrite a production output.`);
    if (outputs.has(output)) throw new Error(`Delivery variant ${variant.id} reuses another variant's output path.`);
    outputs.add(output);
    if (variant.captions !== undefined && typeof variant.captions !== "boolean") throw new Error(`Delivery variant ${variant.id} captions must be a boolean.`);
    const translation = variant.translation === undefined || variant.translation === null
      ? null
      : context.resolveConfiguredPath(variant.translation, `Delivery variant ${variant.id} translation`);
    if (translation && !existsSync(translation)) throw new Error(`Delivery variant ${variant.id} translation was not found: ${translation}`);
    let frame: number | null = null;
    let frames: [number, number] | null = null;
    if (variant.kind === "still") {
      const configured = variant.frame ?? context.production.stillFrame ?? 0;
      if (!Number.isInteger(configured) || configured < 0 || configured >= duration) throw new Error(`Delivery variant ${variant.id} frame must be inside the composition.`);
      frame = configured;
    } else if (variant.frames !== undefined) {
      if (!Array.isArray(variant.frames) || variant.frames.length !== 2) throw new Error(`Delivery variant ${variant.id} frames must be [startFrame, endFrame].`);
      const [start, end] = variant.frames;
      if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end <= start || end > duration) throw new Error(`Delivery variant ${variant.id} frames must stay inside the composition.`);
      frames = [start, end];
    }
    return {
      id: variant.id,
      kind: variant.kind,
      width: positiveInteger(variant.width, Number(context.composition.width), `Delivery variant ${variant.id} width`),
      height: positiveInteger(variant.height, Number(context.composition.height), `Delivery variant ${variant.id} height`),
      captions: variant.captions ?? true,
      translation: translation ? relative(projectRoot, translation) : null,
      frame,
      frames,
      output: relative(projectRoot, output),
      master: variant.kind === "video" && Boolean(variant.master ?? context.production.mastering),
    };
  });
};

const translatedContent = (content: SceneContent | undefined, values: Record<string, unknown>): SceneContent => {
  const next: SceneContent = {...(content ?? {})};
  for (const key of ["title", "subtitle", "quote", "attribution", "documentText", "label"] as const) {
    const value = values[key];
    if (typeof value === "string") next[key] = value;
  }
  return next;
};

/** Replace scene copy and caption text with a translated variant of the same timeline. */
export const applyTranslation = (state: ProjectState, file: string): ProjectState => {
  const translation = readJson(file);
  if (!translation || typeof translation !== "object" || Array.isArray(translation)) throw new Error(`Translation file must be an object: ${file}`);
  const entries = Object.keys(translation.scenes ?? {}).length + Object.keys(translation.captions ?? {}).length;
  if (entries === 0) throw new Error(`Translation file has no scene or caption entries: ${file}`);
  const scenes = state.scenes.map((scene) => ({...scene}));
  const captions: Caption[] = state.captions.map((caption) => ({...caption}));
  const captionText = new Map<string, string>();
  for (const [id, value] of Object.entries((translation.captions ?? {}) as Record<string, unknown>)) {
    if (typeof value !== "string" || !value.trim()) throw new Error(`Translated caption ${id} must be a non-empty string.`);
    if (!captions.some((caption) => caption.id === id)) throw new Error(`Translation references an unknown caption: ${id}`);
    captionText.set(id, value);
  }
  for (const [id, value] of Object.entries((translation.scenes ?? {}) as Record<string, Record<string, unknown>>)) {
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`Translated scene ${id} must be an object.`);
    const scene = scenes.find((item) => item.id === id);
    if (!scene) throw new Error(`Translation references an unknown scene: ${id}`);
    scene.content = translatedContent(scene.content, value);
    if (value.narration === undefined) continue;
    if (typeof value.narration !== "string" || !value.narration.trim()) throw new Error(`Translated narration for ${id} must be a non-empty string.`);
    const sceneCaptions = captions.filter((caption) => caption.id === id || caption.sceneId === id);
    const target = sceneCaptions.find((caption) => caption.id === id) ?? (sceneCaptions.length === 1 ? sceneCaptions[0] : null);
    if (!target) throw new Error(`Scene ${id} has ${sceneCaptions.length} captions; translate them under "captions" by id.`);
    captionText.set(target.id, value.narration);
  }
  return {...state, scenes, captions: captions.map((caption) => ({...caption, text: captionText.get(caption.id) ?? caption.text}))};
};

export type DeliveryMeasurement = {width: number | null; height: number | null; duration: number | null};

/**
 * Compare a rendered variant against what DELIVERABLES.json declared. A variant is
 * only delivered if the file on disk carries the dimensions and length that were
 * asked for; otherwise the report says which part of the declaration it missed.
 */
export const verifyDeliveredVariant = (
  variant: DeliveryVariant,
  measured: DeliveryMeasurement,
  timing: {fps: number; durationInFrames: number; durationToleranceSeconds?: number},
): string[] => {
  const issues: string[] = [];
  if (measured.width !== variant.width) issues.push(`width is ${measured.width ?? "unreadable"}, declared ${variant.width}`);
  if (measured.height !== variant.height) issues.push(`height is ${measured.height ?? "unreadable"}, declared ${variant.height}`);
  if (variant.kind === "still") return issues;
  const frames = variant.frames ? variant.frames[1] - variant.frames[0] : timing.durationInFrames;
  const expected = frames / timing.fps;
  const tolerance = timing.durationToleranceSeconds ?? 0.25;
  if (!Number.isFinite(measured.duration as number) || Math.abs((measured.duration as number) - expected) > tolerance) {
    issues.push(`duration is ${measured.duration ?? "unreadable"}s, expected ${expected.toFixed(3)}s ± ${tolerance}s`);
  }
  return issues;
};

const probe = (file: string) => {
  const result = spawnSync("ffprobe", ["-v", "error", "-show_entries", "format=duration:stream=width,height", "-of", "json", file], {encoding: "utf8"});
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`ffprobe could not read ${file}: ${result.stderr}`);
  const metadata = JSON.parse(result.stdout);
  const stream = metadata.streams?.find((item: any) => Number.isFinite(item?.width)) ?? {};
  const duration = Number(metadata.format?.duration);
  return {width: Number(stream.width) || null, height: Number(stream.height) || null, duration: Number.isFinite(duration) ? duration : null};
};

const master = (context: RenderContext, input: string, output: string, force: boolean) => {
  const settings = context.production.mastering ?? {};
  const args = ["-hide_banner", "-loglevel", "error", force ? "-y" : "-n", "-i", input, "-map", "0:v:0", "-map", "0:a:0", "-c:v", "copy",
    "-af", `loudnorm=I=${settings.integratedLoudness ?? -16}:TP=${settings.truePeak ?? -1.5}:LRA=${settings.loudnessRange ?? 7}`,
    "-c:a", "aac", "-b:a", settings.audioBitrate ?? "192k", "-ar", String(settings.audioSampleRate ?? 48000), "-movflags", "+faststart", output];
  const result = spawnSync("ffmpeg", args, {cwd: projectRoot, encoding: "utf8"});
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`Mastering failed for ${output}: ${result.stderr}`);
};

const variantState = (videoId: string, variant: DeliveryVariant, context: RenderContext): ProjectState => {
  const base = buildProjectState(videoId, "remotion");
  const translated = variant.translation ? applyTranslation(base, resolve(projectRoot, variant.translation)) : base;
  return {
    ...translated,
    captions: variant.captions ? translated.captions : [],
    composition: {...translated.composition, width: variant.width, height: variant.height},
  };
};

const writeReport = (videoId: string, report: DeliveryReport) => {
  const file = resolve(projectRoot, "output", videoId, "delivery-report.json");
  mkdirSync(dirname(file), {recursive: true});
  const temporary = `${file}.tmp`;
  writeFileSync(temporary, `${JSON.stringify(report, null, 2)}\n`);
  renameSync(temporary, file);
  return file;
};

export const getDeliveryReport = (videoId: string): DeliveryReport | null => {
  const file = resolve(projectRoot, "output", videoId, "delivery-report.json");
  return existsSync(file) ? readJson(file) : null;
};

/**
 * Render the declared delivery variants. Each variant is an independent Remotion
 * render of the same project timeline, so aspect ratio, captions, translation, and
 * extracts stay consistent with the source of truth instead of being re-cut by hand.
 */
export const runDelivery = async (videoId: string, options: {variantIds?: string[]; force?: boolean} = {}) => {
  const context = loadRenderContext(videoId);
  const requested = options.variantIds ?? [];
  const force = options.force ?? false;
  const declared = loadDeliverables(videoId);
  const unknown = requested.filter((id) => !declared.some((variant) => variant.id === id));
  if (unknown.length > 0) throw new Error(`Unknown delivery variants: ${unknown.join(", ")}`);
  const variants = requested.length > 0 ? declared.filter((variant) => requested.includes(variant.id)) : declared;
  linkAssets(videoId, force);
  const baseProps = context.production.finalProps ?? context.production.silentProps;
  const renderEnv = {...process.env, MAKE_VIDEO_VIDEO_ID: videoId};
  const report: DeliveryReport = getDeliveryReport(videoId) ?? {videoId, variants: {}, generatedAt: new Date().toISOString()};
  report.videoId = videoId;
  if (!report.variants || typeof report.variants !== "object") report.variants = {};
  // A variant that is no longer declared is not a delivered file; keeping its old
  // result would leave the report passing, or failing, on something that is gone.
  const declaredIds = new Set(declared.map((variant) => variant.id));
  for (const id of Object.keys(report.variants)) if (!declaredIds.has(id)) delete report.variants[id];
  const failures: string[] = [];

  // Every render takes minutes, so refuse the whole run up front rather than after
  // the variants before the conflict have already been rendered.
  const targets = new Map(variants.map((variant) => {
    const output = resolve(projectRoot, variant.output);
    return [variant.id, {output, unmastered: variant.master ? `${output.slice(0, -extname(output).length)}.unmastered.mp4` : null}];
  }));
  assertOutputsAvailable([...targets.values()].flatMap(({output, unmastered}) => unmastered ? [output, unmastered] : [output]), force, `Delivery for ${videoId}`);

  for (const variant of variants) {
    const {output, unmastered} = targets.get(variant.id)!;
    const renderTarget = unmastered ?? output;
    mkdirSync(dirname(renderTarget), {recursive: true});
    mkdirSync(dirname(output), {recursive: true});
    const props = JSON.stringify({...((baseProps && typeof baseProps === "object") ? baseProps : {}), state: variantState(videoId, variant, context)});
    if (variant.kind === "still") await runRemotion(["still", "src/index.ts", compositionId, output, `--frame=${variant.frame ?? 0}`, `--props=${props}`], renderEnv);
    else await runRemotion(["render", "src/index.ts", compositionId, renderTarget, "--concurrency=1", ...(variant.frames ? [`--frames=${variant.frames[0]}-${variant.frames[1] - 1}`] : []), `--props=${props}`], renderEnv);
    if (unmastered) master(context, unmastered, output, force);
    const measured = probe(output);
    const issues = verifyDeliveredVariant(variant, measured, {
      fps: Number(context.composition.fps),
      durationInFrames: Number(context.composition.durationInFrames),
      durationToleranceSeconds: Number(context.production.qa?.durationToleranceSeconds ?? 0.25),
    });
    report.variants[variant.id] = {
      output: variant.output,
      kind: variant.kind,
      width: measured.width ?? variant.width,
      height: measured.height ?? variant.height,
      duration: variant.kind === "still" ? null : measured.duration,
      captions: variant.captions,
      translation: variant.translation,
      frame: variant.frame,
      frames: variant.frames,
      passed: issues.length === 0,
      issues,
      renderedAt: new Date().toISOString(),
    };
    if (issues.length > 0) failures.push(`${variant.id}: ${issues.join("; ")}`);
    log(`${issues.length === 0 ? "Delivered" : "Delivered with issues"} ${variant.id}: ${variant.output}`);
  }
  report.generatedAt = new Date().toISOString();
  report.passed = Object.values(report.variants).every((result) => result.passed !== false);
  const file = writeReport(videoId, report);
  log(`Delivery report: ${file}`);
  // The report is written first: a variant that missed its declaration is still a
  // recorded fact about the files on disk, not something to lose with the error.
  if (failures.length > 0) throw new Error(`Delivered files do not match DELIVERABLES.json:\n${failures.map((failure) => `- ${failure}`).join("\n")}`);
  return report;
};
