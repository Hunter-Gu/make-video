export type Scene = {id: string; startFrame: number; endFrame: number; durationInFrames: number; timingSource: string; assetIds?: string[]};
export type Caption = {id: string; sceneId: string; startFrame: number; endFrame: number; text: string};
export type RemotionEffect = {id: string; sceneId: string; type: string; label: string; startFrame: number; endFrame: number; parameters?: Record<string, unknown>};
export type Asset = {id: string; groupId?: string; sceneId: string | null; kind: "image" | "video"; selected: boolean; provider?: string; path: string; url: string};
export type Stage = {id: string; label: string; kind?: string; path: string; exists: boolean; url: string | null};
export type Model = {id: string; label: string; provider: string; capabilities: string[]};
export type Cover = {assetId: string; sceneId: string | null; path: string; selectedAt: string};
export type ProjectState = {videoId: string; composition: {fps: number; durationInFrames: number; width: number; height: number}; models: {image: string | null; voice: string | null}; registry: {image: Model[]; voice: Model[]}; scenes: Scene[]; captions: Caption[]; effects: RemotionEffect[]; cover: Cover | null; assets: Asset[]; stages: Stage[]; revisions: Array<{id: string; assetId: string; instruction: string; status: string}>; qa: {passed: boolean} | null};

export interface WorkbenchTransport {
  listProjects(): Promise<string[]>;
  getProject(videoId: string): Promise<ProjectState>;
  updateCaption(videoId: string, caption: Caption): Promise<void>;
  updateModels(videoId: string, models: {image?: string; voice?: string}): Promise<void>;
  createAssetRevision(videoId: string, input: {assetId: string; sceneId: string | null; modelId: string | null; instruction: string}): Promise<void>;
  setCover(videoId: string, assetId: string): Promise<void>;
  generatePlan(brief: string, videoId?: string, modelId?: string): Promise<{
    plan: {
      title: string;
      language: string;
      scenes: Array<{id: string; narration: string; visualPrompt: string; durationSeconds: number}>;
    };
    model: string;
    usage?: {inputTokens?: number; outputTokens?: number};
  }>;
}
