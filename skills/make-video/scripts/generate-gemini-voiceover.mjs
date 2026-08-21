import {createHash} from "node:crypto";
import {existsSync, mkdirSync, readFileSync, writeFileSync} from "node:fs";
import {resolve} from "node:path";

import {
  assertOutputsAvailable,
  loadVideoContext,
  parseTargetArgs,
} from "./video-context.mjs";
import {firstInlineAudio, generateContent} from "./gemini-client.mjs";
import {assertTargetsUnlocked} from "./approval-lock-lib.mjs";

const {videoId, force} = parseTargetArgs(process.argv.slice(2));
const context = loadVideoContext(videoId);
const {audioDirs, composition, config} = context;
const sceneIndexFile = resolve(context.sourceDir, "SCENE_INDEX.json");
const indexedCaptions = existsSync(sceneIndexFile) ? JSON.parse(readFileSync(sceneIndexFile, "utf8")).captions : null;
const captions = Array.isArray(config.captions) ? config.captions : indexedCaptions;
const voice = config.voice;

if (!Array.isArray(captions) || captions.length === 0) {
  throw new Error(`${videoId} has no caption segments for voice generation.`);
}

if (!voice || typeof voice !== "object") {
  throw new Error(`${videoId} has no voice configuration.`);
}

for (const segment of captions) {
  if (!segment || typeof segment !== "object") {
    throw new Error(`${videoId} has an invalid caption segment.`);
  }

  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(segment.id)) {
    throw new Error(
      `Caption id "${segment.id}" must use lowercase kebab-case.`,
    );
  }
}

const outputDir = audioDirs.voiceover;
const narrationTiming = voice.timingMode === "narration";
const outputFiles = [
  ...captions.map((segment) => resolve(outputDir, `${segment.id}.wav`)),
  ...(!narrationTiming ? [resolve(outputDir, "voiceover.wav")] : []),
  resolve(outputDir, "manifest.json"),
];

assertTargetsUnlocked(context, outputFiles);
assertOutputsAvailable(outputFiles, {
  force,
  action: `Voice generation for ${videoId}`,
});

const apiKey = process.env.GEMINI_API_KEY;

if (!apiKey) {
  throw new Error(
    "GEMINI_API_KEY is required. Pass it in the environment; do not store it in this package.",
  );
}

const sampleRate = 24000;
const channels = 1;
const bytesPerSample = 2;
const totalSamples = Math.ceil(
  (composition.durationInFrames / composition.fps) * sampleRate,
);
const timelinePcm = Buffer.alloc(totalSamples * bytesPerSample);
const startAt = process.env.TTS_START_AT ?? null;
if (startAt && !captions.some((segment) => segment.id === startAt)) {
  throw new Error(`TTS_START_AT does not match a caption id: ${startAt}`);
}
let reachedStart = startAt === null;
/**
 * @type {{
 *   videoId: string,
 *   model: string,
 *   voiceName: string,
 *   segments: Record<string, {hash: string, durationSeconds: number}>,
 * }}
 */
const manifest = {
  videoId,
  model: process.env.GEMINI_TTS_MODEL ?? voice.model,
  voiceName: process.env.GEMINI_TTS_VOICE ?? voice.voiceName,
  segments: {},
};

mkdirSync(outputDir, {recursive: true});

/**
 * @param {string} fileName
 * @param {Buffer} pcm
 * @returns {void}
 */
const writeWave = (fileName, pcm) => {
  const header = Buffer.alloc(44);
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(channels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(sampleRate * channels * bytesPerSample, 28);
  header.writeUInt16LE(channels * bytesPerSample, 32);
  header.writeUInt16LE(bytesPerSample * 8, 34);
  header.write("data", 36);
  header.writeUInt32LE(pcm.length, 40);
  writeFileSync(fileName, Buffer.concat([header, pcm]));
};

for (const segment of captions) {
  const prompt = `${voice.direction}

Transcript:
${segment.text}`;
  const hash = createHash("sha256")
    .update(
      JSON.stringify({
        prompt,
        model: manifest.model,
        voiceName: manifest.voiceName,
      }),
    )
    .digest("hex");
  const segmentFile = resolve(outputDir, `${segment.id}.wav`);

  if (startAt === segment.id) {
    reachedStart = true;
  }

  /** @type {Buffer} */
  let pcm;
  if (!reachedStart) {
    if (!existsSync(segmentFile)) {
      throw new Error(
        `Cannot resume at "${startAt}": ${segmentFile} does not exist.`,
      );
    }

    pcm = readFileSync(segmentFile).subarray(44);
    console.log(`Reused ${segment.id}`);
  } else {
    const response = await generateContent(manifest.model, apiKey, {
      contents: [{parts: [{text: prompt}]}],
      generationConfig: {
        responseModalities: ["AUDIO"],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: {
              voiceName: manifest.voiceName,
            },
          },
        },
      },
    });
    const base64 = firstInlineAudio(response);

    if (!base64) {
      throw new Error(`Gemini returned no audio for segment "${segment.id}".`);
    }

    pcm = Buffer.from(base64, "base64");
  }

  const availableSamples = Math.floor(
    ((segment.endFrame - segment.startFrame) / config.composition.fps) *
      sampleRate,
  );
  const generatedSamples = Math.floor(pcm.length / bytesPerSample);

  if (!narrationTiming && generatedSamples > availableSamples) {
    throw new Error(
      `Voice segment "${segment.id}" is ${(
        generatedSamples / sampleRate
      ).toFixed(2)}s but its timeline slot is ${(
        availableSamples / sampleRate
      ).toFixed(2)}s. Shorten the line or request a faster delivery.`,
    );
  }

  writeWave(segmentFile, pcm);
  manifest.segments[segment.id] = {
    hash,
    durationSeconds: generatedSamples / sampleRate,
  };

  if (!narrationTiming) {
    const startSample = Math.round((segment.startFrame / config.composition.fps) * sampleRate);
    pcm.copy(timelinePcm, startSample * bytesPerSample);
  }
  console.log(
    `Generated ${segment.id}: ${(generatedSamples / sampleRate).toFixed(2)}s`,
  );
}

if (!narrationTiming) writeWave(resolve(outputDir, "voiceover.wav"), timelinePcm);
writeFileSync(
  resolve(outputDir, "manifest.json"),
  `${JSON.stringify(manifest, null, 2)}\n`,
);
console.log(`Generated the aligned Gemini voiceover timeline for ${videoId}.`);
