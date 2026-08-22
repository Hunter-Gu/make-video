import {useEffect, useMemo, useState} from 'react';
import {Button} from '@astryxdesign/core/Button';
import {Dialog, DialogHeader} from '@astryxdesign/core/Dialog';
import {Layout, LayoutContent, LayoutFooter} from '@astryxdesign/core/Layout';
import {SelectableCard} from '@astryxdesign/core/SelectableCard';
import {TextInput} from '@astryxdesign/core/TextInput';
import type {Model, ModelCatalog, ProjectState, ProjectTransport} from '@make-video/contracts';

type ModelSettingsDialogProps = {
  state: ProjectState;
  transport: ProjectTransport;
  listModels: () => Promise<ModelCatalog>;
  refresh: () => Promise<void>;
  notice: (value: string) => void;
  onClose: () => void;
};

export const ModelSettingsDialog = ({state, transport, listModels, refresh, notice, onClose}: ModelSettingsDialogProps) => {
  const [image, setImage] = useState(state.models.image ?? state.registry.image[0]?.id ?? '');
  const [voice, setVoice] = useState(state.models.voice ?? state.registry.voice[0]?.id ?? '');
  const [apiKeys, setApiKeys] = useState<Record<string, string>>({});
  const [catalog, setCatalog] = useState<ModelCatalog | null>(null);
  const [query, setQuery] = useState('');
  useEffect(() => { void listModels().then(setCatalog).catch((error) => notice(error instanceof Error ? error.message : String(error))); }, [listModels, notice]);
  const imageModels = catalog?.image.length ? catalog.image : state.registry.image;
  const voiceModels = catalog?.voice.length ? catalog.voice : state.registry.voice;
  const allModels = catalog?.all ?? [];
  const providers = useMemo(() => Array.from(new Set([...imageModels, ...voiceModels].map((model) => model.provider))), [imageModels, voiceModels]);
  const filteredModels = allModels.filter((model) => `${model.provider} ${model.label} ${model.id}`.toLowerCase().includes(query.toLowerCase())).slice(0, 250);

  useEffect(() => {
    setImage(state.models.image ?? state.registry.image[0]?.id ?? '');
    setVoice(state.models.voice ?? state.registry.voice[0]?.id ?? '');
  }, [state.models.image, state.models.voice, state.registry.image, state.registry.voice]);

  useEffect(() => {
    if (!catalog) return;
    setImage(resolveModelId(state.models.image, imageModels));
    setVoice(resolveModelId(state.models.voice, voiceModels));
  }, [catalog, imageModels, voiceModels, state.models.image, state.models.voice]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    setApiKeys(Object.fromEntries(providers.map((provider) => [provider, window.localStorage.getItem(apiKeyStorageKey(provider)) ?? ''])));
  }, [providers]);

  const save = async () => {
    try {
      await transport.updateModels(state.videoId, {image: image || undefined, voice: voice || undefined});
      if (typeof window !== 'undefined') providers.forEach((provider) => {
        const key = apiKeyStorageKey(provider);
        if (apiKeys[provider]) window.localStorage.setItem(key, apiKeys[provider]);
        else window.localStorage.removeItem(key);
      });
      await refresh();
      notice('Model settings saved');
      onClose();
    } catch (error) {
      notice(error instanceof Error ? error.message : String(error));
    }
  };

  return (
    <Dialog isOpen onOpenChange={(open) => { if (!open) onClose(); }} purpose="form" width="min(720px, calc(100vw - 48px))" maxHeight="calc(100vh - 48px)" padding={0}>
      <Layout
        className="min-h-0"
        header={<DialogHeader title="Generation models" subtitle="Active Gemini models and local provider keys" onOpenChange={(open) => { if (!open) onClose(); }} hasDivider />}
        content={<LayoutContent className="min-h-0" padding={6}>
          <ModelList title="Image models" models={imageModels} selected={image} onSelect={setImage} />
          <ModelList title="Voice models" models={voiceModels} selected={voice} onSelect={setVoice} />
          <section className="mt-6">
            <div className="mb-2 flex items-center justify-between"><h3 className="m-0 text-[12px] font-medium">Active Gemini models</h3><span className="text-[10px] text-[#737c87]">{allModels.length ? `${allModels.length.toLocaleString()} available` : 'Loading catalog…'}</span></div>
            <TextInput label="Search Gemini models" isLabelHidden placeholder="Search model or id" value={query} onChange={setQuery} />
            {allModels.length > 0 && <div className="max-h-48 overflow-auto rounded-md border border-[#2d3540] bg-[#0e1217]">{filteredModels.map((model) => <div key={model.id} className="border-b border-[#202731] px-3 py-2 last:border-b-0"><strong className="block truncate text-[10px]">{model.label}</strong><small className="mt-0.5 block truncate text-[8px] text-[#737c87]">{model.provider} · {model.id}</small></div>)}</div>}
            {allModels.length > filteredModels.length && <small className="my-3 block text-[10px] leading-[1.45] text-[#737c87]">Showing {filteredModels.length.toLocaleString()} matching models. Refine the search to browse the full catalog.</small>}
          </section>
          <div className="mt-5 border-t border-[#252a31] pt-4"><span className="text-[9px] tracking-[.13em] text-[#6e7884]">PROVIDER KEYS</span></div>
          {providers.map((provider) => <TextInput key={provider} label={`${provider} API key`} type="password" value={apiKeys[provider] ?? ''} placeholder="Stored only in this browser" onChange={(value) => setApiKeys((current) => ({...current, [provider]: value}))} />)}
          <small className="my-3 block text-[10px] leading-[1.45] text-[#737c87]">API keys stay in this browser and are not sent through MCP. Saving model selection does not start generation.</small>
        </LayoutContent>}
        footer={<LayoutFooter hasDivider className="flex justify-end gap-2"><Button label="Cancel" variant="secondary" onClick={onClose} /><Button label="Save settings" variant="primary" onClick={save} /></LayoutFooter>}
      />
    </Dialog>
  );
};

const ModelList = ({title, models, selected, onSelect}: {title: string; models: Model[]; selected: string; onSelect: (id: string) => void}) => (
  <section className="mb-6 last:mb-0">
    <div className="mb-2 flex items-center justify-between"><h3 className="m-0 text-[12px] font-medium">{title}</h3><span className="text-[10px] text-[#737c87]">{models.length} available</span></div>
    <div className="grid gap-2">
      {models.map((model) => <SelectableCard key={model.id} className="flex items-center justify-between text-left" label={`Select ${model.label}`} isSelected={selected === model.id} onChange={(isSelected) => { if (isSelected) onSelect(model.id); }} padding={3}>
        <span><strong className="block text-[11px]">{model.label}</strong><small className="mt-1 block text-[9px] text-[#7d8793]">{model.provider} · {model.capabilities.join(' · ')}</small></span>
        {selected === model.id && <em className="rounded bg-[#d68b46] px-2 py-1 text-[9px] font-bold not-italic text-[#17100a]">Selected</em>}
      </SelectableCard>)}
    </div>
  </section>
);

const apiKeyStorageKey = (provider: string) => `make-video.api-key.${provider.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
const resolveModelId = (current: string | null, models: Model[]) => models.find((model) => model.id === current || model.id.endsWith(`/${current ?? ''}`))?.id ?? models[0]?.id ?? current ?? '';
