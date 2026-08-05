import {readFileSync} from "node:fs";
import {resolve} from "node:path";

import {
  loadVideoContext,
  parseTargetArgs,
} from "./video-context.mjs";
import {firstText, generateContent} from "./gemini-client.mjs";

const {videoId} = parseTargetArgs(process.argv.slice(2));
const {audioDirs} = loadVideoContext(videoId);
const apiKey = process.env.GEMINI_API_KEY;

if (!apiKey) {
  throw new Error(
    "GEMINI_API_KEY is required. Pass it in the environment; do not store it in this package.",
  );
}

const audio = readFileSync(
  resolve(audioDirs.voiceover, "voiceover.wav"),
).toString("base64");
const model = process.env.GEMINI_VERIFY_MODEL ?? "gemini-3.6-flash";
const response = await generateContent(model, apiKey, {
  contents: [
    {
      parts: [
        {
          inlineData: {
            mimeType: "audio/wav",
            data: audio,
          },
        },
        {
          text: "Transcribe only the spoken English words in this audio, in order. Ignore silence. Do not summarize, explain, or add wording.",
        },
      ],
    },
  ],
});
const text = firstText(response);

if (!text) {
  throw new Error("Gemini returned no transcription.");
}

console.log(text.trim());
