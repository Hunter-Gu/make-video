import {runImages} from "./images";
import {runVideos} from "./videos";
import {runMusic, runVoiceover} from "./audio";
import {runVerifyVoiceover} from "./verify";

const [mode, ...args] = process.argv.slice(2);

if (mode === "images") await runImages(args);
else if (mode === "video") await runVideos(args);
else if (mode === "voiceover") await runVoiceover(args);
else if (mode === "music") await runMusic(args);
else if (mode === "verify-voiceover") await runVerifyVoiceover(args);
else throw new Error("Usage: ai.mjs <images|video|voiceover|music|verify-voiceover> <video-id> [options]");
