import {existsSync, mkdirSync, readFileSync, writeFileSync} from "node:fs";
import {dirname, extname, relative, resolve, sep} from "node:path";

import {generateImage} from "ai";

import {assertTargetsUnlocked} from "../../../skills/make-video/scripts/approval-lock-lib.mjs";
import {assertGenerationApproved} from "../../../skills/make-video/scripts/generation-approval.mjs";
import {parseGenerationArgs} from "../../../skills/make-video/scripts/generation-args.mjs";
import {loadVideoContext, assertOutputsAvailable} from "../../../skills/make-video/scripts/video-context.mjs";
import {buildVisualContext} from "../../../skills/make-video/scripts/visual-context.mjs";

import {estimate, google, hash, mediaTypeFor, readJson, writeJson} from "./provider";
import type {AnyRecord} from "./types";

export const runImages = async (args: string[]) => {
  const {videoId, force, assetIds} = parseGenerationArgs(args);
  const context = loadVideoContext(videoId);
  const config = context.config as AnyRecord;
  const imageGeneration = config.imageGeneration as AnyRecord | undefined;
  if (!imageGeneration || !Array.isArray(imageGeneration.assets) || imageGeneration.assets.length === 0) throw new Error(`${videoId} has no generated image assets.`);
  const model = process.env.GEMINI_IMAGE_MODEL ?? imageGeneration.model;
  if (typeof model !== "string" || model.length === 0) throw new Error("imageGeneration.model must be a non-empty string.");

  const seen = new Set<string>();
  const outputs = imageGeneration.assets.map((asset: AnyRecord, index: number) => {
    if (!asset || typeof asset !== "object" || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(asset.id) || seen.has(asset.id)) throw new Error(`Invalid or duplicate generated image id at index ${index}.`);
    if (typeof asset.prompt !== "string" || !asset.prompt.trim()) throw new Error(`Generated image "${asset.id}" needs a prompt.`);
    if (typeof asset.output !== "string" || !asset.output) throw new Error(`Generated image "${asset.id}" needs an output path.`);
    seen.add(asset.id);
    const output = resolve(context.publicDir, asset.output);
    const outputRelative = relative(context.publicDir, output);
    if (outputRelative === ".." || outputRelative.startsWith(`..${sep}`)) throw new Error(`Generated image "${asset.id}" must stay inside publicDir.`);
    if (![".png", ".jpg", ".jpeg", ".webp"].includes(extname(output).toLowerCase())) throw new Error(`Generated image "${asset.id}" needs a supported extension.`);
    return output;
  });
  const selected = assetIds.length > 0
    ? imageGeneration.assets.map((asset: AnyRecord, index: number) => assetIds.includes(asset.id) ? index : -1).filter((index: number) => index >= 0)
    : imageGeneration.assets.map((_: AnyRecord, index: number) => index);
  const missing = assetIds.filter((id) => !seen.has(id));
  if (missing.length > 0) throw new Error(`Unknown generated image assets: ${missing.join(", ")}`);
  const manifestFile = resolve(context.publicDir, "images/generated/manifest.json");
  const approved = assertGenerationApproved(context, "image", selected.map((index: number) => imageGeneration.assets[index].id)) as Map<string, AnyRecord>;
  const selectedOutputs = selected.map((index: number) => outputs[index]);
  assertTargetsUnlocked(context, [...selectedOutputs, manifestFile]);
  if (assetIds.length === 0) assertOutputsAvailable([...selectedOutputs, manifestFile], {force, action: `Image generation for ${videoId}`});

  const manifest = assetIds.length > 0 && existsSync(manifestFile)
    ? readJson(manifestFile)
    : {videoId, model, generatedAt: new Date().toISOString(), assets: []};
  manifest.model = model;
  manifest.generatedAt = new Date().toISOString();
  for (const index of selected) {
    const asset = imageGeneration.assets[index] as AnyRecord;
    const output = outputs[index];
    const prompt = [imageGeneration.direction, buildVisualContext(context, asset.characters), asset.prompt].filter(Boolean).join("\n\n");
    const result = await generateImage({model: google().image(model), prompt, aspectRatio: asset.aspectRatio as `${number}:${number}` | undefined});
    const bytes = Buffer.from(result.image.uint8Array);
    const mimeType = result.image.mediaType;
    if (mimeType !== mediaTypeFor(output)) throw new Error(`Generated image "${asset.id}" returned ${mimeType}, which does not match ${extname(output)}.`);
    mkdirSync(dirname(output), {recursive: true});
    writeFileSync(output, bytes);
    manifest.assets = manifest.assets.filter((item: AnyRecord) => item.id !== asset.id);
    manifest.assets.push({id: asset.id, output: relative(context.publicDir, output), mimeType, promptHash: hash(prompt), sha256: hash(bytes), estimatedCost: estimate(approved, asset.id)});
    console.log(`Generated ${asset.id}`);
  }
  const order = new Map(imageGeneration.assets.map((asset: AnyRecord, index: number) => [asset.id, index]));
  manifest.assets.sort((left: AnyRecord, right: AnyRecord) => (order.get(String(left.id)) ?? Infinity) - (order.get(String(right.id)) ?? Infinity));
  mkdirSync(dirname(manifestFile), {recursive: true});
  writeJson(manifestFile, manifest);
  console.log(`Generated images for ${videoId}.`);
};
