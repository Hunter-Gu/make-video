import type {Caption, ProjectTransport} from "@make-video/contracts";

const request = async <T,>(path: string, init?: RequestInit): Promise<T> => {
  const response = await fetch(path, {...init, headers: {"content-type": "application/json", ...init?.headers}});
  const value = await response.json();
  if (!response.ok) throw new Error(value.error ?? "Project request failed.");
  return value;
};

export const httpTransport: ProjectTransport = {
  listProjects: () => request("/api/projects"),
  listModels: () => request("/api/models"),
  getProject: (videoId) => request(`/api/project?videoId=${encodeURIComponent(videoId)}`),
  updateCaption: async (videoId, caption: Caption) => { await request(`/api/captions/${encodeURIComponent(caption.id)}`, {method: "PATCH", body: JSON.stringify({...caption, videoId})}); },
  updateTimelineRange: async (videoId, input) => { await request("/api/timeline", {method: "PATCH", body: JSON.stringify({videoId, ...input})}); },
  updateModels: async (videoId, models) => { await request("/api/models", {method: "PATCH", body: JSON.stringify({videoId, ...models})}); },
  createAssetRevision: async (videoId, input) => { await request("/api/assets/revisions", {method: "POST", body: JSON.stringify({videoId, ...input})}); },
  setCover: async (videoId, assetId) => { await request("/api/cover", {method: "PUT", body: JSON.stringify({videoId, assetId})}); },
};
