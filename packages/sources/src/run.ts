import {buildCatalog} from "./catalog";
import {ingestSources} from "./ingest";
import {buildSourceList} from "./list";

export const runSourceIngest = async (videoId: string, force = false) => {
  await ingestSources(videoId, force);
};

export const runSourceCatalog = async (videoId: string, force = false) => {
  buildCatalog(videoId, force);
};

export const runSourceList = async (videoId: string, force = false) => {
  buildSourceList(videoId, force);
};
