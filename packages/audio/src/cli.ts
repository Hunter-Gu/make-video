import {buildTiming} from "./timing";
import {generateSfx} from "./sfx";
import {prepareAudio} from "./prepare";
import {parseTargetArgs} from "./context";

const [mode, ...args] = process.argv.slice(2);
const {videoId, force} = parseTargetArgs(args);
if (mode === "prepare") await prepareAudio(videoId, force);
else if (mode === "timing") buildTiming(videoId, force);
else if (mode === "sfx") generateSfx(videoId, force);
else throw new Error("Usage: audio.mjs <prepare|timing|sfx> <video-id> [--force]");
