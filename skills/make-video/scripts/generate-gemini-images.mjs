import {createHash} from "node:crypto";
import {existsSync, mkdirSync, readFileSync, writeFileSync} from "node:fs";
import {dirname, extname, relative, resolve, sep} from "node:path";

import {
  assertOutputsAvailable,
  loadVideoContext,
} from "./video-context.mjs";
import {firstInlineImage, generateContent} from "./gemini-client.mjs";
import {assertTargetsUnlocked} from "./approval-lock-lib.mjs";
import {parseGenerationArgs} from "./generation-args.mjs";

const {videoId, force, assetIds} = parseGenerationArgs(process.argv.slice(2));
const context = loadVideoContext(videoId);
const {config, publicDir} = context;
const imageGeneration = config.imageGeneration;

if (!imageGeneration || typeof imageGeneration !== "object") {
  throw new Error(`${videoId} has no imageGeneration configuration.`);
}

if (!Array.isArray(imageGeneration.assets) || imageGeneration.assets.length === 0) {
  throw new Error(`${videoId} has no generated image assets.`);
}

const model = process.env.GEMINI_IMAGE_MODEL ?? imageGeneration.model;
if (typeof model !== "string" || model.length === 0) {
  throw new Error("imageGeneration.model must be a non-empty string.");
}

const seenIds = new Set();
const outputFiles = imageGeneration.assets.map((asset, index) => {
  if (!asset || typeof asset !== "object") {
    throw new Error(`imageGeneration.assets[${index}] must be an object.`);
  }
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(asset.id)) {
    throw new Error(`Generated image id "${asset.id}" must use kebab-case.`);
  }
  if (seenIds.has(asset.id)) {
    throw new Error(`Duplicate generated image id: ${asset.id}`);
  }
  seenIds.add(asset.id);

  if (typeof asset.prompt !== "string" || asset.prompt.trim().length === 0) {
    throw new Error(`Generated image "${asset.id}" needs a prompt.`);
  }
  if (typeof asset.output !== "string" || asset.output.length === 0) {
    throw new Error(`Generated image "${asset.id}" needs an output path.`);
  }

  const output = resolve(publicDir, asset.output);
  const relativeOutput = relative(publicDir, output);
  if (relativeOutput === ".." || relativeOutput.startsWith(`..${sep}`)) {
    throw new Error(`Generated image "${asset.id}" must stay inside publicDir.`);
  }
  if (![".png", ".jpg", ".jpeg", ".webp"].includes(extname(output).toLowerCase())) {
    throw new Error(`Generated image "${asset.id}" needs a supported extension.`);
  }
  return output;
});
const selectedIndexes = assetIds.length > 0
  ? imageGeneration.assets.map((asset, index) => assetIds.includes(asset.id) ? index : -1).filter((index) => index >= 0)
  : imageGeneration.assets.map((_, index) => index);
const missingIds = assetIds.filter((id) => !seenIds.has(id));
if (missingIds.length > 0) throw new Error(`Unknown generated image assets: ${missingIds.join(", ")}`);

const manifestFile = resolve(publicDir, "images/generated/manifest.json");
const selectedOutputs = selectedIndexes.map((index) => outputFiles[index]);
assertTargetsUnlocked(context, [...selectedOutputs, manifestFile]);
assertOutputsAvailable(assetIds.length > 0 ? selectedOutputs : [...selectedOutputs, manifestFile], {
  force,
  action: `Image generation for ${videoId}`,
});

/** @type {{videoId: string, model: string, generatedAt: string, assets: Array<Record<string, string>>}} */
const manifest = assetIds.length > 0 && existsSync(manifestFile)
  ? JSON.parse(readFileSync(manifestFile, "utf8"))
  : {videoId, model, generatedAt: new Date().toISOString(), assets: []};
manifest.model = model;
manifest.generatedAt = new Date().toISOString();
const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) throw new Error("GEMINI_API_KEY is required for image generation.");

for (const index of selectedIndexes) {
  const asset = imageGeneration.assets[index];
  const output = outputFiles[index];
  const prompt = [imageGeneration.direction, asset.prompt]
    .filter(Boolean)
    .join("\n\n");
  const imageConfig = asset.aspectRatio
    ? {aspectRatio: asset.aspectRatio}
    : undefined;

  const response = await generateContent(model, apiKey, {
    contents: [{parts: [{text: prompt}]}],
    generationConfig: {
      responseModalities: ["TEXT", "IMAGE"],
      ...(imageConfig ? {imageConfig} : {}),
    },
  });
  const image = firstInlineImage(response);
  if (!image) {
    throw new Error(`Gemini returned no image for "${asset.id}".`);
  }

  const expectedMimeTypes = {
    ".png": ["image/png"],
    ".jpg": ["image/jpeg"],
    ".jpeg": ["image/jpeg"],
    ".webp": ["image/webp"],
  }[extname(output).toLowerCase()];
  if (!expectedMimeTypes?.includes(image.mimeType)) {
    throw new Error(
      `Generated image "${asset.id}" returned ${image.mimeType}, which does not match ${extname(output)}.`,
    );
  }

  mkdirSync(dirname(output), {recursive: true});
  const bytes = Buffer.from(image.data, "base64");
  writeFileSync(output, bytes);
  const record = {
    id: asset.id,
    output: relative(publicDir, output),
    mimeType: image.mimeType,
    promptHash: createHash("sha256").update(prompt).digest("hex"),
    sha256: createHash("sha256").update(bytes).digest("hex"),
  };
  manifest.assets = manifest.assets.filter((item) => item.id !== asset.id);
  manifest.assets.push(record);
  console.log(`Generated ${asset.id}`);
}
const order = new Map(imageGeneration.assets.map((asset, index) => [asset.id, index]));
manifest.assets.sort((left, right) => (order.get(left.id) ?? Infinity) - (order.get(right.id) ?? Infinity));

mkdirSync(dirname(manifestFile), {recursive: true});
writeFileSync(manifestFile, `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`Generated images for ${videoId}.`);
