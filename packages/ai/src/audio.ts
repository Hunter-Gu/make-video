import {log} from "@make-video/project";
import {spawnSync} from "node:child_process";
import {existsSync, mkdirSync, statSync, writeFileSync} from "node:fs";
import {dirname, resolve} from "node:path";

import {hash, readJson, writeJson} from "./provider";
import {googleMediaProvider, type MediaProvider} from "./media-provider";
import {assertOutputsAvailable, loadVideoContext, parseTargetArgs} from "./project";
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

/** Read back the length of a segment already on disk, so a resumed run keeps a complete manifest. */
const waveDurationSeconds = (file: string, sampleRate = 24000) => Math.max(0, (statSync(file).size - 44) / 2 / sampleRate);

export const runVoiceover = async (args: string[], provider: MediaProvider = googleMediaProvider) => {
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
  const segmentFile = (segment: AnyRecord) => resolve(outputDir, `${segment.id}.wav`);

  // Narration is generated one segment at a time, so an interrupted run leaves the
  // early segments paid for and on disk. TTS_START_AT resumes at a named caption
  // and reuses those, instead of forcing the whole track to be bought again.
  const startAt = process.env.TTS_START_AT;
  const startIndex = startAt ? captions.findIndex((segment: AnyRecord) => segment.id === startAt) : 0;
  if (startAt && startIndex < 0) throw new Error(`TTS_START_AT=${startAt} is not a caption of ${videoId}. Known ids: ${captions.map((segment: AnyRecord) => segment.id).join(", ")}`);
  const reused = (captions as AnyRecord[]).slice(0, startIndex);
  const pending = (captions as AnyRecord[]).slice(startIndex);
  const missing = reused.filter((segment) => !existsSync(segmentFile(segment)));
  if (missing.length > 0) throw new Error(`TTS_START_AT=${startAt} expects the earlier segments to exist, but ${missing.map((segment) => segment.id).join(", ")} are missing. Drop TTS_START_AT to generate the whole track.`);

  // The manifest is a report and is always rewritten; only unwritten audio is protected.
  const outputFiles = [...pending.map(segmentFile), ...(startIndex === 0 ? [resolve(outputDir, "manifest.json")] : [])];
  assertOutputsAvailable(outputFiles, {force, action: `Voice generation for ${videoId}`});
  const promptFor = (segment: AnyRecord) => `${voice.direction ?? "Clear documentary narration."}\n\nTranscript:\n${segment.text}`;
  const manifest: AnyRecord = {videoId, model, voiceName, segments: {}};
  mkdirSync(outputDir, {recursive: true});
  for (const segment of reused) {
    manifest.segments[segment.id] = {hash: hash(promptFor(segment)), durationSeconds: waveDurationSeconds(segmentFile(segment))};
    log(`Reused ${segment.id}: ${manifest.segments[segment.id].durationSeconds.toFixed(2)}s`);
  }
  for (const segment of pending) {
    const prompt = promptFor(segment);
    const result = await provider.speech({model, text: prompt, voice: voiceName});
    const pcm = pcmFromAudio(result.bytes);
    writeWave(segmentFile(segment), pcm);
    manifest.segments[segment.id] = {hash: hash(prompt), durationSeconds: pcm.length / 2 / 24000};
    log(`Generated ${segment.id}: ${(pcm.length / 2 / 24000).toFixed(2)}s`);
  }
  writeJson(resolve(outputDir, "manifest.json"), manifest);
  log(`Generated the aligned voiceover timeline for ${videoId}.`);
};

/**
 * Confirm the returned bytes really are decodable MP3 before they land on disk.
 * A corrupt music bed otherwise surfaces at mastering, and writing it first would
 * leave a bad file that the no-overwrite rule then refuses to replace.
 */
const assertPlayableMp3 = (bytes: Buffer, mediaType: string) => {
  if (mediaType !== "audio/mpeg" && mediaType !== "audio/mp3") throw new Error(`Music generation returned ${mediaType}, but the music bed is written as MP3. Configure a model that returns MPEG audio.`);
  const probe = spawnSync("ffprobe", ["-v", "error", "-show_entries", "stream=codec_type", "-of", "json", "-i", "pipe:0"], {input: bytes, encoding: "utf8"});
  const streams = probe.status === 0 ? (JSON.parse(probe.stdout).streams as Array<{codec_type?: string}> | undefined) : undefined;
  if (!streams?.some((stream) => stream.codec_type === "audio")) throw new Error("Music generation returned audio that ffprobe cannot read.");
};

export const runMusic = async (args: string[], provider: MediaProvider = googleMediaProvider) => {
  const {videoId, force} = parseTargetArgs(args);
  const context = loadVideoContext(videoId);
  const music = (context.config as AnyRecord).music as AnyRecord | undefined;
  if (!music) throw new Error(`${videoId} has no music configuration.`);
  const output = resolve(context.audioDirs.music, "underscore.mp3");
  assertOutputsAvailable([output], {force, action: `Music generation for ${videoId}`});
  const model = process.env.LYRIA_MODEL ?? music.model;
  const audio = await provider.music({model, prompt: music.prompt});
  assertPlayableMp3(audio.bytes, audio.mediaType);
  mkdirSync(dirname(output), {recursive: true});
  writeFileSync(output, audio.bytes);
  log(`Generated the music bed for ${videoId}.`);
};
