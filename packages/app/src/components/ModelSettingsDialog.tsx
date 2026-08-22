import {useEffect, useMemo, useState} from 'react';
import {Button} from '@astryxdesign/core/Button';
import type {Model, ProjectState, ProjectTransport} from '@make-video/contracts';

type ModelSettingsDialogProps = {
  state: ProjectState;
  transport: ProjectTransport;
  refresh: () => Promise<void>;
  notice: (value: string) => void;
  onClose: () => void;
};

export const ModelSettingsDialog = ({state, transport, refresh, notice, onClose}: ModelSettingsDialogProps) => {
  const [image, setImage] = useState(state.models.image ?? state.registry.image[0]?.id ?? '');
  const [voice, setVoice] = useState(state.models.voice ?? state.registry.voice[0]?.id ?? '');
  const [apiKeys, setApiKeys] = useState<Record<string, string>>({});
  const providers = useMemo(() => Array.from(new Set([...state.registry.image, ...state.registry.voice].map((model) => model.provider))), [state.registry.image, state.registry.voice]);

  useEffect(() => {
    setImage(state.models.image ?? state.registry.image[0]?.id ?? '');
    setVoice(state.models.voice ?? state.registry.voice[0]?.id ?? '');
  }, [state.models.image, state.models.voice, state.registry.image, state.registry.voice]);

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
    <div className="modal-layer" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="model-settings-dialog" role="dialog" aria-modal="true" aria-labelledby="model-settings-title">
        <header className="dialog-header">
          <div><span className="kicker">MODEL SETTINGS</span><h2 id="model-settings-title">Generation models</h2></div>
          <button className="dialog-close" aria-label="Close model settings" onClick={onClose}>×</button>
        </header>
        <div className="dialog-body">
          <ModelList title="Image models" models={state.registry.image} selected={image} onSelect={setImage} />
          <ModelList title="Voice models" models={state.registry.voice} selected={voice} onSelect={setVoice} />
          <div className="settings-divider"><span className="kicker">PROVIDER KEYS</span></div>
          {providers.map((provider) => <label key={provider}>{provider} API key<input type="password" autoComplete="off" value={apiKeys[provider] ?? ''} placeholder="Stored only in this browser" onChange={(event) => setApiKeys((value) => ({...value, [provider]: event.target.value}))} /></label>)}
          <small>API keys stay in this browser and are not sent through MCP. Saving model selection does not start generation.</small>
        </div>
        <footer className="dialog-footer"><Button label="Cancel" variant="secondary" onClick={onClose} /><Button label="Save settings" variant="primary" onClick={save} /></footer>
      </section>
    </div>
  );
};

const ModelList = ({title, models, selected, onSelect}: {title: string; models: Model[]; selected: string; onSelect: (id: string) => void}) => (
  <section className="model-list-section">
    <div className="model-list-heading"><h3>{title}</h3><span>{models.length} available</span></div>
    <div className="model-list">
      {models.map((model) => <button key={model.id} className={selected === model.id ? 'selected' : ''} onClick={() => onSelect(model.id)}>
        <span><strong>{model.label}</strong><small>{model.provider} · {model.capabilities.join(' · ')}</small></span>
        {selected === model.id && <em>Selected</em>}
      </button>)}
    </div>
  </section>
);

const apiKeyStorageKey = (provider: string) => `make-video.api-key.${provider.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
