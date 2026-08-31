import {buildTiming} from "./timing";

export const runTiming = async (videoId: string, force = false) => {
  buildTiming(videoId, force);
};
