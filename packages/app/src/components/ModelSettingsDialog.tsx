import {useEffect, useMemo, useState} from 'react';
import {Button} from '@astryxdesign/core/Button';
import {Dialog, DialogHeader} from '@astryxdesign/core/Dialog';
import {Heading} from '@astryxdesign/core/Heading';
import {HStack} from '@astryxdesign/core/HStack';
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
  const [image, setImage] = useState(() => readModelSetting('image', state.models.image ?? state.registry.image[0]?.id ?? ''));
  const [video, setVideo] = useState(() => readModelSetting('video', state.models.video ?? state.registry.video[0]?.id ?? ''));
  const [voice, setVoice] = useState(() => readModelSetting('voice', state.models.voice ?? state.registry.voice[0]?.id ?? ''));
  const [apiKeys, setApiKeys] = useState<Record<string, string>>({});
  const [catalog, setCatalog] = useState<ModelCatalog | null>(null);
  useEffect(() => { void listModels().then(setCatalog).catch((error) => notice(error instanceof Error ? error.message : String(error))); }, [listModels, notice]);
  const imageModels = catalog?.image.length ? catalog.image : state.registry.image;
  const videoModels = catalog?.video.length ? catalog.video : state.registry.video;
  const voiceModels = catalog?.voice.length ? catalog.voice : state.registry.voice;
  const providers = useMemo(() => Array.from(new Set([...imageModels, ...videoModels, ...voiceModels].map((model) => model.provider))), [imageModels, videoModels, voiceModels]);
  const selectedImage = resolveModelId(image, imageModels);
  const selectedVideo = resolveModelId(video, videoModels);
  const selectedVoice = resolveModelId(voice, voiceModels);

  const save = async () => {
    try {
      writeModelSetting('image', selectedImage);
      writeModelSetting('video', selectedVideo);
      writeModelSetting('voice', selectedVoice);
      await transport.updateModels(state.videoId, {image: selectedImage || undefined, video: selectedVideo || undefined, voice: selectedVoice || undefined});
      if (typeof window !== 'undefined') providers.forEach((provider) => {
        const key = apiKeyStorageKey(provider);
        const value = apiKeys[provider] ?? window.localStorage.getItem(key) ?? '';
        if (value) window.localStorage.setItem(key, value);
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
        header={<DialogHeader title="Generation models" subtitle="Gemini image, video, and voice models plus local provider keys" onOpenChange={() => onClose()} hasDivider />}
        content={<LayoutContent>
          <ModelList title="Image models" models={imageModels} selected={selectedImage} onSelect={setImage} />
          <ModelList title="Video models" models={videoModels} selected={selectedVideo} onSelect={setVideo} />
          <ModelList title="Voice models" models={voiceModels} selected={selectedVoice} onSelect={setVoice} />
          <div className="mt-5 border-t border-[#252a31] pt-4"><Text type="supporting" size="3xs">PROVIDER KEYS</Text></div>
          {providers.map((provider) => <TextInput key={provider} label={`${provider} API key`} type="password" value={apiKeys[provider] ?? readApiKey(provider)} placeholder="Stored only in this browser" onChange={(value) => setApiKeys((current) => ({...current, [provider]: value}))} />)}
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
const readApiKey = (provider: string) => typeof window === 'undefined' ? '' : window.localStorage.getItem(apiKeyStorageKey(provider)) ?? '';
const modelStorageKey = (kind: 'image' | 'video' | 'voice') => `make-video.model.${kind}`;
const readModelSetting = (kind: 'image' | 'video' | 'voice', fallback: string) => {
  if (typeof window === 'undefined') return fallback;
  return window.localStorage.getItem(modelStorageKey(kind)) ?? fallback;
};
const writeModelSetting = (kind: 'image' | 'video' | 'voice', value: string) => {
  if (typeof window !== 'undefined' && value) window.localStorage.setItem(modelStorageKey(kind), value);
};
const resolveModelId = (current: string | null, models: Model[]) => models.find((model) => model.id === current || model.id.endsWith(`/${current ?? ''}`))?.id ?? models[0]?.id ?? current ?? '';
