/** Shared identity for the server-side AI provider package. */
export const AI_PACKAGE_VERSION = "0.1.0";

export {googleMediaProvider} from "./media-provider";
export type {GeneratedMedia, MediaProvider, VideoFrame} from "./media-provider";
export {runMusic, runVoiceover} from "./audio";
export {estimateGeneration} from "./estimate";
export type {EstimatedAsset, GenerationEstimate} from "./estimate";
export {runImages} from "./images";
export {runVideos} from "./videos";
