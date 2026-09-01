import {installExample} from "./example";
import {linkAssets} from "./link";
import {parseTargetArgs} from "./context";

const [mode, ...args] = process.argv.slice(2);
if (mode !== "link" && mode !== "example") throw new Error("Usage: assets.mjs <link|example> <video-id> [--force]");
const {videoId, force} = parseTargetArgs(args);
if (mode === "example") installExample(videoId, force);
else linkAssets(videoId);
