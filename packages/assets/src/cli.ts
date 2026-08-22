import {linkAssets} from "./link";
import {parseTargetArgs} from "./context";

const [mode, ...args] = process.argv.slice(2);
if (mode !== "link") throw new Error("Usage: assets.mjs link <video-id>");
const {videoId} = parseTargetArgs(args);
linkAssets(videoId);
