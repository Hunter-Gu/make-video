import {runGeneratedVideoQa} from "./generated-videos";
import {runImageQa} from "./images";
import {runVideoQa} from "./video";

const [mode, ...args] = process.argv.slice(2);
if (mode === "video") runVideoQa(args);
else if (mode === "images") runImageQa(args);
else if (mode === "generated-videos") runGeneratedVideoQa(args);
else throw new Error("Usage: qa.mjs <video|images|generated-videos> <video-id>");
