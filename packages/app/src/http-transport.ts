import type {Caption, GenerationJob, GenerationKind, GenerationPreparation, GenerationReadiness, ProjectTransport, QaJob, QaKind, RenderJob, RenderKind, SourceCatalog, SourceIndex, SourceJob, SourceUpload, StoryboardArtifact, TimingJob, VideoPlan} from "@make-video/contracts";

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
  generate: (videoId: string, kind: GenerationKind, force = false) => request<GenerationJob>("/api/generate", {method: "POST", body: JSON.stringify({videoId, kind, force})}),
  getGenerationJob: (jobId: string) => request<GenerationJob>(`/api/generate/${encodeURIComponent(jobId)}`),
  render: (videoId: string, kind: RenderKind, force = false) => request<RenderJob>("/api/render", {method: "POST", body: JSON.stringify({videoId, kind, force})}),
  getRenderJob: (jobId: string) => request<RenderJob>(`/api/render/${encodeURIComponent(jobId)}`),
  runQa: (videoId: string, kind: QaKind) => request<QaJob>("/api/qa", {method: "POST", body: JSON.stringify({videoId, kind})}),
  getQaJob: (jobId: string) => request<QaJob>(`/api/qa/${encodeURIComponent(jobId)}`),
  uploadSource: async (videoId, file) => {
    const form = new FormData();
    form.append("file", file, file.name);
    const response = await fetch(`/api/sources/upload?videoId=${encodeURIComponent(videoId)}`, {method: "POST", body: form});
    const value = await response.json();
    if (!response.ok) throw new Error(value.error ?? "Source upload failed.");
    return value as SourceUpload;
  },
  ingestSources: (videoId: string, force = true) => request<SourceJob>("/api/sources/ingest", {method: "POST", body: JSON.stringify({videoId, force})}),
  getSourceJob: (jobId: string) => request<SourceJob>(`/api/sources/ingest/${encodeURIComponent(jobId)}`),
  buildTiming: (videoId: string, force = false) => request<TimingJob>("/api/timing", {method: "POST", body: JSON.stringify({videoId, force})}),
  getTimingJob: (jobId: string) => request<TimingJob>(`/api/timing/${encodeURIComponent(jobId)}`),
  checkGenerationReadiness: (videoId: string) => request<GenerationReadiness>(`/api/generation/readiness?videoId=${encodeURIComponent(videoId)}`),
  buildStoryboard: (videoId: string, force = true) => request<StoryboardArtifact>("/api/storyboard", {method: "POST", body: JSON.stringify({videoId, force})}),
  prepareGeneration: (videoId: string) => request<GenerationPreparation>("/api/generation/prepare", {method: "POST", body: JSON.stringify({videoId})}),
  getSources: (videoId: string) => request<SourceIndex>(`/api/sources?videoId=${encodeURIComponent(videoId)}`),
  buildSourceCatalog: (videoId: string, force = true) => request<SourceCatalog>("/api/sources/catalog", {method: "POST", body: JSON.stringify({videoId, force})}),
  getPlan: async (videoId: string) => (await request<{plan: VideoPlan | null}>(`/api/plan?videoId=${encodeURIComponent(videoId)}`)).plan,
  savePlan: (videoId: string, plan: VideoPlan) => request<VideoPlan>("/api/plan", {method: "PUT", body: JSON.stringify({videoId, plan})}),
  createAssetRevision: (videoId, input) => request<GenerationJob>("/api/assets/revisions", {method: "POST", body: JSON.stringify({videoId, ...input})}),
  setCover: async (videoId, assetId) => { await request("/api/cover", {method: "PUT", body: JSON.stringify({videoId, assetId})}); },
};
