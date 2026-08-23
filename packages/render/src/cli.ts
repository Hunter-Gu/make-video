import {parseTargetArgs} from "./context";
import {runRender} from "./run";

const [action, ...args] = process.argv.slice(2);
if (!["studio", "still", "preview", "final"].includes(action)) throw new Error("Usage: render.mjs <studio|still|preview|final> <video-id> [--force]");
const {videoId, force} = parseTargetArgs(args);
await runRender(action as "studio" | "still" | "preview" | "final", videoId, force);
