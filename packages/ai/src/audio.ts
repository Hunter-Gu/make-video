import {existsSync, mkdirSync, readFileSync, writeFileSync} from "node:fs";
import {dirname, resolve} from "node:path";

import {generateSpeech, generateText} from "ai";

import {assertTargetsUnlocked} from "../../../skills/make-video/scripts/approval-lock-lib.mjs";
import {assertOutputsAvailable, loadVideoContext, parseTargetArgs} from "../../../skills/make-video/scripts/video-context.mjs";

import {google, hash, readJson, writeJson} from "./provider";
import type {AnyRecord} from "./types";

const pcmFromAudio = (bytes: Uint8Array) => {
  const buffer = Buffer.from(bytes);
  return buffer.toString("ascii", 0, 4) === "RIFF" ? buffer.subarray(44) : buffer;
};

const writeWave = (file: string, pcm: Buffer, sampleRate = 24000, channels = 1) => {
  const header = Buffer.alloc(44);
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(channels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(sampleRate * channels * 2, 28);
  header.writeUInt16LE(channels * 2, 32);
  header.writeUInt16LE(16, 34);
  header.write("data", 36);
  header.writeUInt32LE(pcm.length, 40);
  writeFileSync(file, Buffer.concat([header, pcm]));
};

export const runVoiceover = async (args: string[]) => {
  const {videoId, force} = parseTargetArgs(args);
  const context = loadVideoContext(videoId);
  const config = context.config as AnyRecord;
  const sceneIndex = resolve(context.sourceDir, "SCENE_INDEX.json");
  const indexedCaptions = existsSync(sceneIndex) ? readJson(sceneIndex).captions : null;
  const captions = Array.isArray(config.captions) ? config.captions : indexedCaptions;
  const voice = config.voice as AnyRecord | undefined;
  if (!Array.isArray(captions) || captions.length === 0 || !voice) throw new Error(`${videoId} has no voice configuration or caption segments.`);
  const outputDir = context.audioDirs.voiceover;
  const model = process.env.GEMINI_TTS_MODEL ?? voice.model;
  const voiceName = process.env.GEMINI_TTS_VOICE ?? voice.voiceName;
  const outputFiles = [...captions.map((segment: AnyRecord) => resolve(outputDir, `${segment.id}.wav`)), resolve(outputDir, "manifest.json")];
  assertTargetsUnlocked(context, outputFiles);
  assertOutputsAvailable(outputFiles, {force, action: `Voice generation for ${videoId}`});
  const manifest: AnyRecord = {videoId, model, voiceName, segments: {}};
  mkdirSync(outputDir, {recursive: true});
  for (const segment of captions as AnyRecord[]) {
    const prompt = `${voice.direction ?? "Clear documentary narration."}\n\nTranscript:\n${segment.text}`;
    const result = await generateSpeech({model: google().speech(model), text: prompt, voice: voiceName, outputFormat: "wav"});
    const pcm = pcmFromAudio(result.audio.uint8Array);
    const output = resolve(outputDir, `${segment.id}.wav`);
    writeWave(output, pcm);
    manifest.segments[segment.id] = {hash: hash(prompt), durationSeconds: pcm.length / 2 / 24000};
    console.log(`Generated ${segment.id}: ${(pcm.length / 2 / 24000).toFixed(2)}s`);
  }
  writeJson(resolve(outputDir, "manifest.json"), manifest);
  console.log(`Generated the aligned voiceover timeline for ${videoId}.`);
};

export const runMusic = async (args: string[]) => {
  const {videoId, force} = parseTargetArgs(args);
  const context = loadVideoContext(videoId);
  const music = (context.config as AnyRecord).music as AnyRecord | undefined;
  if (!music) throw new Error(`${videoId} has no music configuration.`);
  const output = resolve(context.audioDirs.music, "lyria-underscore.mp3");
  assertTargetsUnlocked(context, [output]);
  assertOutputsAvailable([output], {force, action: `Music generation for ${videoId}`});
  const model = process.env.LYRIA_MODEL ?? music.model;
  // Lyria is exposed through Google's Interactions API in the AI SDK.
  const languageModel = model.startsWith("lyria-") ? google().interactions(model as any) : google().languageModel(model);
  const providerOptions = model.startsWith("lyria-")
    ? {google: {responseModalities: ["audio"], responseFormat: [{type: "audio", mimeType: "audio/mpeg"}]}}
    : {google: {responseModalities: ["AUDIO"]}};
  const result = await generateText({model: languageModel, prompt: music.prompt, providerOptions: providerOptions as any});
  const audio = result.files.find((file) => file.mediaType.startsWith("audio/"));
  if (!audio) throw new Error("AI SDK returned no audio for music generation.");
  mkdirSync(dirname(output), {recursive: true});
  writeFileSync(output, Buffer.from(audio.uint8Array));
  console.log(`Generated the music bed for ${videoId}.`);
};
