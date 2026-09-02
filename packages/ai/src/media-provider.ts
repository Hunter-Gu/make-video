import {experimental_generateVideo, generateImage, generateSpeech, generateText} from "ai";

import {google} from "./provider";

export type GeneratedMedia = {bytes: Buffer; mediaType: string};

export type VideoFrame = {data: Buffer; mediaType: string; frameType: "first_frame" | "last_frame"};

/**
 * The four model calls this package makes, behind one replaceable interface.
 *
 * Everything around these calls — output paths, overwrite refusal, provenance,
 * prompt assembly, resume decisions — is deterministic and must be testable
 * without spending money, so each generator takes the provider as an argument.
 */
export type MediaProvider = {
  image(request: {model: string; prompt: string; reference?: Buffer; aspectRatio?: string}): Promise<GeneratedMedia>;
  video(request: {model: string; prompt: string; frames: VideoFrame[]; aspectRatio?: string; resolution?: string; durationSeconds?: number; pollIntervalMs: number; pollTimeoutMs: number}): Promise<GeneratedMedia>;
  speech(request: {model: string; text: string; voice: string}): Promise<GeneratedMedia>;
  music(request: {model: string; prompt: string}): Promise<GeneratedMedia>;
};

export const googleMediaProvider: MediaProvider = {
  async image({model, prompt, reference, aspectRatio}) {
    const result = await generateImage({
      model: google().image(model),
      prompt: reference ? {images: [reference], text: prompt} : prompt,
      aspectRatio: aspectRatio as `${number}:${number}` | undefined,
    });
    return {bytes: Buffer.from(result.image.uint8Array), mediaType: result.image.mediaType};
  },

  async video({model, prompt, frames, aspectRatio, resolution, durationSeconds, pollIntervalMs, pollTimeoutMs}) {
    const result = await experimental_generateVideo({
      model: google().video(model),
      prompt,
      frameImages: frames.map((frame) => ({image: {data: frame.data, mediaType: frame.mediaType}, frameType: frame.frameType})),
      aspectRatio,
      resolution,
      duration: durationSeconds,
      generateAudio: false,
      poll: {intervalMs: pollIntervalMs, timeoutMs: pollTimeoutMs},
    } as any);
    return {bytes: Buffer.from(result.video.uint8Array), mediaType: "video/mp4"};
  },

  async speech({model, text, voice}) {
    const result = await generateSpeech({model: google().speech(model), text, voice, outputFormat: "wav"});
    return {bytes: Buffer.from(result.audio.uint8Array), mediaType: result.audio.mediaType ?? "audio/wav"};
  },

  async music({model, prompt}) {
    // Lyria is exposed through Google's Interactions API in the AI SDK.
    const languageModel = model.startsWith("lyria-") ? google().interactions(model as any) : google().languageModel(model);
    const providerOptions = model.startsWith("lyria-")
      ? {google: {responseModalities: ["audio"], responseFormat: [{type: "audio", mimeType: "audio/mpeg"}]}}
      : {google: {responseModalities: ["AUDIO"]}};
    const result = await generateText({model: languageModel, prompt, providerOptions: providerOptions as any});
    const audio = result.files.find((file) => file.mediaType.startsWith("audio/"));
    if (!audio) throw new Error("AI SDK returned no audio for music generation.");
    return {bytes: Buffer.from(audio.uint8Array), mediaType: audio.mediaType};
  },
};
