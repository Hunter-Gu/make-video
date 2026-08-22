import {runMusic, runVoiceover} from "@make-video/ai";

import {loadAudioContext} from "./context";
import {generateSfx} from "./sfx";

export const prepareAudio = async (videoId: string, force: boolean) => {
  const {production} = loadAudioContext(videoId);
  const audio = production.audio ?? {};
  if (![audio.sfx, audio.voiceover, audio.music].some(Boolean)) throw new Error(`${videoId} has no enabled audio generation steps.`);
  const args = [videoId, ...(force ? ["--force"] : [])];
  if (audio.sfx) generateSfx(videoId, force);
  if (audio.voiceover) await runVoiceover(args);
  if (audio.music) await runMusic(args);
};
