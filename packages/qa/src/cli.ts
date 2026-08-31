import {runGeneratedVideoQa} from "./generated-videos";
import {runImageQa} from "./images";
import {runVideoQa} from "./video";

const [mode, ...args] = process.argv.slice(2);
const report = mode === "video" ? runVideoQa(args)
  : mode === "images" ? runImageQa(args)
    : mode === "generated-videos" ? runGeneratedVideoQa(args)
      : null;
if (report && !report.passed) process.exitCode = 1;
else if (!report) throw new Error("Usage: qa.mjs <video|images|generated-videos> <video-id>");
