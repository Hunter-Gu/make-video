import {existsSync, readFileSync} from "node:fs";
import {dirname, isAbsolute, relative, resolve, sep} from "node:path";
import {fileURLToPath} from "node:url";

// Where this script itself lives, wherever the skill was installed — used to
// locate sibling scripts, never to locate the user's project files.
export const scriptsDir = dirname(fileURLToPath(import.meta.url));

// The user's project: this skill carries no project of its own, so every
// src/public/output/node_modules path is resolved against the directory the
// agent is running commands from.
export const projectRoot = process.cwd();

const videoIdPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/**
 * @param {unknown} configuredPath
 * @param {string} label
 * @returns {string}
 */
const resolveInsideRepository = (configuredPath, label) => {
  if (typeof configuredPath !== "string" || configuredPath.length === 0) {
    throw new Error(`${label} must be a non-empty project-relative path.`);
  }

  if (isAbsolute(configuredPath)) {
    throw new Error(`${label} must not be absolute: ${configuredPath}`);
  }

  const resolvedPath = resolve(projectRoot, configuredPath);
  const relativePath = relative(projectRoot, resolvedPath);

  if (relativePath === ".." || relativePath.startsWith(`..${sep}`)) {
    throw new Error(`${label} escapes the project: ${configuredPath}`);
  }

  return resolvedPath;
};

/**
 * @param {unknown} value
 * @param {string} label
 * @returns {Record<string, unknown>}
 */
const requireObject = (value, label) => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object.`);
  }

  return /** @type {Record<string, unknown>} */ (value);
};

/**
 * @typedef {object} TargetArgs
 * @property {string} videoId
 * @property {boolean} force
 */

/**
 * @param {string[]} args
 * @returns {TargetArgs}
 */
export const parseTargetArgs = (args) => {
  const force = args.includes("--force");
  const unknownFlags = args.filter(
    (argument) => argument.startsWith("--") && argument !== "--force",
  );
  const positionals = args.filter((argument) => !argument.startsWith("--"));

  if (unknownFlags.length > 0) {
    throw new Error(`Unknown option: ${unknownFlags.join(", ")}`);
  }

  if (positionals.length !== 1) {
    throw new Error(
      "Exactly one video id is required, for example: dtc-skincare-workflow",
    );
  }

  return {videoId: positionals[0], force};
};

/**
 * @typedef {object} CompositionConfig
 * @property {string} id
 * @property {number} fps
 * @property {number} width
 * @property {number} height
 * @property {number} durationInFrames
 */

/**
 * @typedef {object} ProductionOutputs
 * @property {string} still
 * @property {string} silent
 * @property {string} unmastered
 * @property {string} final
 */

/**
 * @typedef {object} ProductionMastering
 * @property {number} [integratedLoudness]
 * @property {number} [truePeak]
 * @property {number} [loudnessRange]
 * @property {string} [audioBitrate]
 * @property {number} [audioSampleRate]
 */

/**
 * @typedef {object} ProductionAudioSteps
 * @property {boolean} [sfx]
 * @property {boolean} [voiceover]
 * @property {boolean} [music]
 */

/**
 * @typedef {object} ProductionConfig
 * @property {string} [publicPath]
 * @property {Record<string, unknown>} outputs
 * @property {unknown} [assetLinks]
 * @property {ProductionMastering | null} [mastering]
 * @property {ProductionAudioSteps} [audio]
 * @property {number} [stillFrame]
 * @property {Record<string, unknown>} [stillProps]
 * @property {Record<string, unknown>} [silentProps]
 * @property {Record<string, unknown>} [finalProps]
 * @property {{output?: string, audioRequired?: boolean, durationToleranceSeconds?: number}} [qa]
 */

/**
 * @typedef {object} CaptionSegment
 * @property {string} id
 * @property {string} text
 * @property {number} startFrame
 * @property {number} endFrame
 */

/**
 * @typedef {object} VoiceConfig
 * @property {string} model
 * @property {string} voiceName
 * @property {string} direction
 */

/**
 * @typedef {object} MusicConfig
 * @property {string} model
 * @property {string} prompt
 */

/**
 * @typedef {object} GeneratedImageAsset
 * @property {string} id
 * @property {string} prompt
 * @property {string} output
 * @property {string} [aspectRatio]
 */

/**
 * @typedef {object} ImageGenerationConfig
 * @property {string} model
 * @property {string} [direction]
 * @property {GeneratedImageAsset[]} assets
 */

/**
 * @typedef {object} VideoConfig
 * @property {string} videoId
 * @property {CompositionConfig} composition
 * @property {ProductionConfig} production
 * @property {CaptionSegment[]} [captions]
 * @property {VoiceConfig} [voice]
 * @property {MusicConfig} [music]
 * @property {ImageGenerationConfig} [imageGeneration]
 * @property {Array<{id: string, title?: string, type?: string, input?: string, url?: string, rights?: string}>} [sources]
 * @property {{model: string, direction?: string, pollSeconds?: number, timeoutMinutes?: number, assets: Array<{id: string, prompt: string, output: string, aspectRatio?: string, resolution?: string}>}} [videoGeneration]
 */

/**
 * @typedef {object} VideoContext
 * @property {string} videoId
 * @property {VideoConfig} config
 * @property {CompositionConfig} composition
 * @property {ProductionConfig} production
 * @property {string} sourceDir
 * @property {string} configPath
 * @property {string} publicDir
 * @property {{music: string, sfx: string, voiceover: string}} audioDirs
 * @property {ProductionOutputs} outputs
 * @property {(configuredPath: unknown, label: string) => string} resolveConfiguredPath
 */

/**
 * @param {string} videoId
 * @returns {VideoContext}
 */
export const loadVideoContext = (videoId) => {
  if (!videoIdPattern.test(videoId)) {
    throw new Error(
      `Invalid video id "${videoId}". Use lowercase kebab-case directory names.`,
    );
  }

  const sourceDir = resolve(projectRoot, "src", videoId);
  const configPath = resolve(sourceDir, "video.config.json");

  if (!existsSync(configPath)) {
    throw new Error(`Video config not found: ${configPath}`);
  }

  const config = /** @type {VideoConfig} */ (
    JSON.parse(readFileSync(configPath, "utf8"))
  );
  const composition = /** @type {CompositionConfig} */ (
    requireObject(config.composition, "composition")
  );
  const production = /** @type {ProductionConfig} */ (
    requireObject(config.production, "production")
  );

  if (config.videoId !== videoId) {
    throw new Error(
      `video.config.json declares videoId "${config.videoId}" but directory target is "${videoId}".`,
    );
  }

  if (typeof composition.id !== "string" || composition.id.length === 0) {
    throw new Error("composition.id must be a non-empty string.");
  }

  for (const field of /** @type {const} */ (["fps", "width", "height", "durationInFrames"])) {
    if (!Number.isFinite(composition[field]) || composition[field] <= 0) {
      throw new Error(`composition.${field} must be a positive number.`);
    }
  }

  const configuredPublicPath = production.publicPath ?? videoId;
  if (typeof configuredPublicPath !== "string") {
    throw new Error("production.publicPath must be a string when provided.");
  }

  const publicDir = resolve(projectRoot, "public", configuredPublicPath);
  const relativePublicDir = relative(resolve(projectRoot, "public"), publicDir);
  if (
    relativePublicDir === ".." ||
    relativePublicDir.startsWith(`..${sep}`)
  ) {
    throw new Error("production.publicPath must stay inside public/.");
  }

  const outputs = requireObject(production.outputs, "production.outputs");
  const resolveOutput = (/** @type {string} */ name) =>
    resolveInsideRepository(outputs[name], `production.outputs.${name}`);
  const resolvedOutputs = {
    still: resolveOutput("still"),
    silent: resolveOutput("silent"),
    unmastered: resolveOutput("unmastered"),
    final: resolveOutput("final"),
  };

  if (new Set(Object.values(resolvedOutputs)).size !== 4) {
    throw new Error("production output paths must be distinct.");
  }

  return {
    videoId,
    config,
    composition,
    production,
    sourceDir,
    configPath,
    publicDir,
    audioDirs: {
      music: resolve(publicDir, "audio/music"),
      sfx: resolve(publicDir, "audio/sfx"),
      voiceover: resolve(publicDir, "audio/voiceover"),
    },
    outputs: resolvedOutputs,
    resolveConfiguredPath: resolveInsideRepository,
  };
};

/**
 * @param {string[]} paths
 * @param {{force: boolean, action: string}} options
 * @returns {void}
 */
export const assertOutputsAvailable = (paths, {force, action}) => {
  if (force) {
    return;
  }

  const existingPaths = paths.filter((path) => existsSync(path));
  if (existingPaths.length > 0) {
    throw new Error(
      `${action} stopped because generated output already exists:\n${existingPaths
        .map((path) => `- ${path}`)
        .join("\n")}\nPass --force only when regeneration was explicitly requested.`,
    );
  }
};
