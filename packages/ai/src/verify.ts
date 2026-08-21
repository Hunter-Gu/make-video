import {readFileSync} from "node:fs";
import {resolve} from "node:path";

import {generateText} from "ai";

import {google} from "./provider";
import {loadVideoContext, parseTargetArgs} from "./project";

export const runVerifyVoiceover = async (args: string[]) => {
  const {videoId} = parseTargetArgs(args);
  const context = loadVideoContext(videoId);
  const audio = readFileSync(resolve(context.audioDirs.voiceover, "voiceover.wav"));
  const model = process.env.GEMINI_VERIFY_MODEL ?? "gemini-3.6-flash";
  const result = await generateText({
    model: google().languageModel(model),
    messages: [{
      role: "user",
      content: [
        {type: "file", data: audio, mediaType: "audio/wav"},
        {type: "text", text: "Transcribe only the spoken English words in this audio, in order. Ignore silence. Do not summarize, explain, or add wording."},
      ],
    }] as any,
  });
  if (!result.text.trim()) throw new Error("AI SDK returned no transcription.");
  console.log(result.text.trim());
};
