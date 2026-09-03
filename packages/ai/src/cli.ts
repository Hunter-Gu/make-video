import {estimateGeneration} from "./estimate";
import {runImages} from "./images";
import {runVideos} from "./videos";
import {runMusic, runVoiceover} from "./audio";
import {parseTargetArgs} from "./project";

const [mode, ...args] = process.argv.slice(2);

if (mode === "estimate") estimateGeneration(parseTargetArgs(args).videoId);
else if (mode === "images") await runImages(args);
else if (mode === "video") await runVideos(args);
else if (mode === "voiceover") await runVoiceover(args);
else if (mode === "music") await runMusic(args);
else throw new Error("Usage: ai.mjs <estimate|images|video|voiceover|music> <video-id> [options]");
