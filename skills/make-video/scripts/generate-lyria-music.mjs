import {mkdirSync, writeFileSync} from "node:fs";
import {resolve} from "node:path";

import {
  assertOutputsAvailable,
  loadVideoContext,
  parseTargetArgs,
} from "./video-context.mjs";
import {firstInlineAudio, generateContent} from "./gemini-client.mjs";

const {videoId, force} = parseTargetArgs(process.argv.slice(2));
const {audioDirs, config} = loadVideoContext(videoId);
const music = config.music;

if (!music || typeof music !== "object") {
  throw new Error(`${videoId} has no music configuration.`);
}

const outputDir = audioDirs.music;
const outputFile = resolve(outputDir, "lyria-underscore.mp3");

assertOutputsAvailable([outputFile], {
  force,
  action: `Music generation for ${videoId}`,
});

const apiKey = process.env.GEMINI_API_KEY;

if (!apiKey) {
  throw new Error(
    "GEMINI_API_KEY is required. Pass it in the environment; do not store it in this package.",
  );
}

const model = process.env.LYRIA_MODEL ?? music.model;
const response = await generateContent(model, apiKey, {
  contents: [{parts: [{text: music.prompt}]}],
});
const base64 = firstInlineAudio(response);

if (!base64) {
  throw new Error("Lyria returned no audio data.");
}

mkdirSync(outputDir, {recursive: true});
writeFileSync(outputFile, Buffer.from(base64, "base64"));
console.log(`Generated the Lyria underscore for ${videoId}.`);
