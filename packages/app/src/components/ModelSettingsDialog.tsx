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
        className="model-settings-layout"
        header={<DialogHeader title="Generation models" subtitle="Active Gemini models and local provider keys" onOpenChange={(open) => { if (!open) onClose(); }} hasDivider />}
        content={<LayoutContent className="dialog-body" padding={6}>
          <ModelList title="Image models" models={imageModels} selected={image} onSelect={setImage} />
          <ModelList title="Voice models" models={voiceModels} selected={voice} onSelect={setVoice} />
          <section className="model-list-section">
            <div className="model-list-heading"><h3>Active Gemini models</h3><span>{allModels.length ? `${allModels.length.toLocaleString()} available` : 'Loading catalog…'}</span></div>
            <TextInput label="Search Gemini models" isLabelHidden placeholder="Search model or id" value={query} onChange={setQuery} />
            {allModels.length > 0 && <div className="model-catalog-list">{filteredModels.map((model) => <div key={model.id} className="model-catalog-row"><strong>{model.label}</strong><small>{model.provider} · {model.id}</small></div>)}</div>}
            {allModels.length > filteredModels.length && <small>Showing {filteredModels.length.toLocaleString()} matching models. Refine the search to browse the full catalog.</small>}
          </section>
          <div className="settings-divider"><span className="kicker">PROVIDER KEYS</span></div>
          {providers.map((provider) => <TextInput key={provider} label={`${provider} API key`} type="password" value={apiKeys[provider] ?? ''} placeholder="Stored only in this browser" onChange={(value) => setApiKeys((current) => ({...current, [provider]: value}))} />)}
          <small>API keys stay in this browser and are not sent through MCP. Saving model selection does not start generation.</small>
        </LayoutContent>}
        footer={<LayoutFooter hasDivider className="dialog-footer"><Button label="Cancel" variant="secondary" onClick={onClose} /><Button label="Save settings" variant="primary" onClick={save} /></LayoutFooter>}
      />
    </Dialog>
  );
};

const ModelList = ({title, models, selected, onSelect}: {title: string; models: Model[]; selected: string; onSelect: (id: string) => void}) => (
  <section className="model-list-section">
    <div className="model-list-heading"><h3>{title}</h3><span>{models.length} available</span></div>
    <div className="model-list">
      {models.map((model) => <SelectableCard key={model.id} className="model-option" label={`Select ${model.label}`} isSelected={selected === model.id} onChange={(isSelected) => { if (isSelected) onSelect(model.id); }} padding={3}>
        <span><strong>{model.label}</strong><small>{model.provider} · {model.capabilities.join(' · ')}</small></span>
        {selected === model.id && <em>Selected</em>}
      </SelectableCard>)}
    </div>
  </section>
);

const apiKeyStorageKey = (provider: string) => `make-video.api-key.${provider.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
const resolveModelId = (current: string | null, models: Model[]) => models.find((model) => model.id === current || model.id.endsWith(`/${current ?? ''}`))?.id ?? models[0]?.id ?? current ?? '';
