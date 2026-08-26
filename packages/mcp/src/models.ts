import {Models} from "@opencode-ai/models";
import type {ModelCatalog} from "@make-video/contracts";

let cached: {expiresAt: number; value: ModelCatalog} | null = null;

export const getModelCatalog = async (): Promise<ModelCatalog> => {
  if (cached && cached.expiresAt > Date.now()) return cached.value;
  const catalog = await Models.make().catalog();
  const geminiModels = Object.entries(catalog.providers).flatMap(([providerId, provider]) => Object.entries(provider.models)
    .filter(([modelId, model]) => `${providerId}/${modelId}`.startsWith('google/gemini-') && model.status !== 'deprecated')
    .map(([modelId, model]) => ({
      id: `${providerId}/${modelId}`,
      label: model.name || modelId,
      provider: provider.name || providerId,
      capabilities: capabilities(model),
      modalities: model.modalities,
      contextWindow: model.limit.context,
      status: model.status,
      releaseDate: model.release_date || model.last_updated || '',
    }))
    .sort((left, right) => right.releaseDate.localeCompare(left.releaseDate) || left.label.localeCompare(right.label))
    .map(({releaseDate: _releaseDate, ...model}) => model));
  const value = {
    image: geminiModels.filter((model) => model.modalities?.output.includes('image')),
    video: geminiModels.filter((model) => model.modalities?.output.includes('video')),
    voice: geminiModels.filter((model) => model.modalities?.output.includes('audio')),
  };
  cached = {expiresAt: Date.now() + 10 * 60 * 1000, value};
  return value;
};

const capabilities = (model: {modalities: {input: string[]; output: string[]}; reasoning: boolean; tool_call: boolean; attachment: boolean}) => [
  ...model.modalities.input.map((modality) => `input:${modality}`),
  ...model.modalities.output.map((modality) => `output:${modality}`),
  ...(model.reasoning ? ['reasoning'] : []),
  ...(model.tool_call ? ['tools'] : []),
  ...(model.attachment ? ['attachments'] : []),
];
