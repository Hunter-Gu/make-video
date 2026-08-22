import {buildCatalog} from "./catalog";
import {ingestSources} from "./ingest";
import {parseTargetArgs} from "./context";

const [mode, ...args] = process.argv.slice(2);
const {videoId, force} = parseTargetArgs(args);
if (mode === "ingest") await ingestSources(videoId, force);
else if (mode === "catalog") buildCatalog(videoId, force);
else throw new Error("Usage: sources.mjs <ingest|catalog> <video-id> [--force]");
