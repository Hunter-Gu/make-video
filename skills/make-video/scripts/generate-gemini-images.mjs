import {createHash} from "node:crypto";
import {mkdirSync, writeFileSync} from "node:fs";
import {dirname, extname, relative, resolve, sep} from "node:path";

import {
  assertOutputsAvailable,
  loadVideoContext,
  parseTargetArgs,
} from "./video-context.mjs";
import {firstInlineImage, generateContent} from "./gemini-client.mjs";
import {assertTargetsUnlocked} from "./approval-lock-lib.mjs";

const {videoId, force} = parseTargetArgs(process.argv.slice(2));
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

const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) {
  throw new Error("GEMINI_API_KEY is required for image generation.");
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

const manifestFile = resolve(publicDir, "images/generated/manifest.json");
assertTargetsUnlocked(context, [...outputFiles, manifestFile]);
assertOutputsAvailable([...outputFiles, manifestFile], {
  force,
  action: `Image generation for ${videoId}`,
});

/** @type {{videoId: string, model: string, generatedAt: string, assets: Array<Record<string, string>>}} */
const manifest = {
  videoId,
  model,
  generatedAt: new Date().toISOString(),
  assets: [],
};

for (let index = 0; index < imageGeneration.assets.length; index += 1) {
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
  manifest.assets.push({
    id: asset.id,
    output: relative(publicDir, output),
    mimeType: image.mimeType,
    promptHash: createHash("sha256").update(prompt).digest("hex"),
    sha256: createHash("sha256").update(bytes).digest("hex"),
  });
  console.log(`Generated ${asset.id}`);
}

mkdirSync(dirname(manifestFile), {recursive: true});
writeFileSync(manifestFile, `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`Generated images for ${videoId}.`);
