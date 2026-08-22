import {Models} from "@opencode-ai/models";
import type {ModelCatalog} from "@make-video/contracts";

let cached: {expiresAt: number; value: ModelCatalog} | null = null;

export const getModelCatalog = async (): Promise<ModelCatalog> => {
  if (cached && cached.expiresAt > Date.now()) return cached.value;
  const catalog = await Models.make().catalog();
  const all = Object.entries(catalog.providers).flatMap(([providerId, provider]) => {
    const models = Object.entries(provider.models).map(([modelId, model]) => ({
      id: `${providerId}/${modelId}`,
      label: model.name || modelId,
      provider: provider.name || providerId,
      capabilities: capabilities(model),
      modalities: model.modalities,
      contextWindow: model.limit.context,
      status: model.status,
    }));
    return models;
  }).filter((model) => model.id.startsWith('google/gemini-') && model.status !== 'deprecated')
    .sort((left, right) => left.label.localeCompare(right.label));
  const value = {
    all,
    image: all.filter((model) => model.modalities?.output.includes('image')),
    voice: all.filter((model) => model.modalities?.output.includes('audio')),
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
