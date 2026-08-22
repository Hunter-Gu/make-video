import {useEffect, useMemo, useState} from 'react';
import {Button} from '@astryxdesign/core/Button';
import {Dialog, DialogHeader} from '@astryxdesign/core/Dialog';
import {Heading} from '@astryxdesign/core/Heading';
import {HStack} from '@astryxdesign/core/HStack';
import {Item} from '@astryxdesign/core/Item';
import {Layout, LayoutContent, LayoutFooter} from '@astryxdesign/core/Layout';
import {Selector} from '@astryxdesign/core/Selector';
import {Text} from '@astryxdesign/core/Text';
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
    <Dialog isOpen onOpenChange={(open) => { if (!open) onClose(); }} purpose="form" width="min(560px, calc(100vw - 32px))" maxHeight="80vh">
      <Layout
        header={<DialogHeader title="Generation models" subtitle="Active Gemini models and local provider keys" onOpenChange={() => onClose()} hasDivider />}
        content={<LayoutContent>
          <ModelList title="Image models" models={imageModels} selected={image} onSelect={setImage} />
          <ModelList title="Voice models" models={voiceModels} selected={voice} onSelect={setVoice} />
          <section className="mt-6">
            <HStack hAlign="between" vAlign="center" gap={2}>
              <Heading level={3}>Active Gemini models</Heading>
              <Text type="supporting" size="2xs">{allModels.length ? `${allModels.length.toLocaleString()} available` : 'Loading catalog…'}</Text>
            </HStack>
            <TextInput label="Search Gemini models" isLabelHidden placeholder="Search model or id" value={query} onChange={setQuery} />
            {allModels.length > 0 && <div className="max-h-48 overflow-auto rounded-md border border-[#2d3540] bg-[#0e1217]">{filteredModels.map((model) => <Item key={model.id} className="border-b border-[#202731] last:border-b-0" label={model.label} description={`${model.provider} · ${model.id}`} density="compact" />)}</div>}
            {allModels.length > filteredModels.length && <Text type="supporting" size="2xs" display="block">Showing {filteredModels.length.toLocaleString()} matching models. Refine the search to browse the full catalog.</Text>}
          </section>
          <div className="mt-5 border-t border-[#252a31] pt-4"><Text type="supporting" size="3xs">PROVIDER KEYS</Text></div>
          {providers.map((provider) => <TextInput key={provider} label={`${provider} API key`} type="password" value={apiKeys[provider] ?? ''} placeholder="Stored only in this browser" onChange={(value) => setApiKeys((current) => ({...current, [provider]: value}))} />)}
          <Text type="supporting" size="2xs" display="block">API keys stay in this browser and are not sent through MCP. Saving model selection does not start generation.</Text>
        </LayoutContent>}
        footer={<LayoutFooter hasDivider><HStack hAlign="end" gap={2}><Button label="Cancel" variant="secondary" onClick={onClose} /><Button label="Save settings" variant="primary" onClick={save} /></HStack></LayoutFooter>}
      />
    </Dialog>
  );
};

const ModelList = ({title, models, selected, onSelect}: {title: string; models: Model[]; selected: string; onSelect: (id: string) => void}) => (
  <section className="mb-6 last:mb-0">
    <HStack hAlign="between" vAlign="center" gap={2}>
      <Heading level={3}>{title}</Heading>
      <Text type="supporting" size="2xs">{models.length} available</Text>
    </HStack>
    <Selector label={title} isLabelHidden options={models.map((model) => ({value: model.id, label: `${model.label} · ${model.id}`}))} value={selected} onChange={onSelect} width="100%" hasSearch searchPlaceholder="Search models" />
  </section>
);

const apiKeyStorageKey = (provider: string) => `make-video.api-key.${provider.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
const resolveModelId = (current: string | null, models: Model[]) => models.find((model) => model.id === current || model.id.endsWith(`/${current ?? ''}`))?.id ?? models[0]?.id ?? current ?? '';
