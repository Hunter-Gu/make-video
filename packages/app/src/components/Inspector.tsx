import {useEffect, useState} from 'react';
import {Button} from '@astryxdesign/core/Button';
import {Selector} from '@astryxdesign/core/Selector';
import type {Asset, Caption, ProjectState, RemotionEffect, WorkbenchTransport} from '@make-video/contracts';
import type {InspectorMode} from '../types';
import {formatTime} from '../lib/format-time';

type InspectorProps = {
  state: ProjectState;
  mode: InspectorMode;
  setMode: (mode: InspectorMode) => void;
  scene: ProjectState['scenes'][number] | null;
  caption: Caption | null;
  asset: Asset | null;
  transport: WorkbenchTransport;
  refresh: () => Promise<void>;
  notice: (value: string) => void;
};

export const Inspector = ({state, mode, setMode, scene, caption, asset, transport, refresh, notice}: InspectorProps) => (
  <aside className="inspector panel">
    <div className="inspector-tabs">
      {(['scene', 'caption', 'image', 'settings'] as const).map((tab) => (
        <button className={mode === tab ? 'active' : ''} onClick={() => setMode(tab)} key={tab}>
          {tab === 'image' ? 'Visual' : tab[0].toUpperCase() + tab.slice(1)}
        </button>
      ))}
    </div>
    {mode === 'scene' && <SceneInspector scene={scene} fps={state.composition.fps} effects={state.effects.filter((effect) => effect.sceneId === scene?.id)} />}
    {mode === 'caption' && (caption ? (
      <CaptionEditor
        caption={caption}
        fps={state.composition.fps}
        save={async (next) => {
          try { await transport.updateCaption(state.videoId, next); await refresh(); notice('Caption saved'); }
          catch (error) { notice(error instanceof Error ? error.message : String(error)); }
        }}
      />
    ) : <div className="empty-state">This scene has no caption.</div>)}
    {mode === 'image' && <ImageInspector state={state} asset={asset} transport={transport} refresh={refresh} notice={notice} />}
    {mode === 'settings' && <ModelSettings state={state} transport={transport} refresh={refresh} notice={notice} />}
  </aside>
);

const SceneInspector = ({scene, fps, effects}: {scene: ProjectState['scenes'][number] | null; fps: number; effects: RemotionEffect[]}) => scene ? (
  <div className="inspector-body">
    <span className="kicker">CURRENT SCENE</span>
    <h2>{scene.id}</h2>
    <dl>
      <dt>Start</dt><dd>{formatTime(scene.startFrame, fps)}</dd>
      <dt>End</dt><dd>{formatTime(scene.endFrame, fps)}</dd>
      <dt>Duration</dt><dd>{(scene.durationInFrames / fps).toFixed(2)}s</dd>
      <dt>Timing</dt><dd>{scene.timingSource}</dd>
      <dt>Assets</dt><dd>{scene.assetIds?.join(', ') || 'None'}</dd>
    </dl>
    <div className="effect-summary">
      <span className="kicker">REMOTION EFFECTS</span>
      {effects.length ? effects.map((effect) => (
        <div key={effect.id}>
          <i className={`effect-dot effect-${effectKind(effect.type)}`} />
          <span><strong>{effect.label}</strong><small>{effect.type} · {effect.endFrame - effect.startFrame}f</small></span>
        </div>
      )) : <small>No declared effects</small>}
    </div>
  </div>
) : <div className="empty-state">Select a scene.</div>;

const CaptionEditor = ({caption, fps, save}: {caption: Caption; fps: number; save: (caption: Caption) => Promise<void>}) => {
  const [draft, setDraft] = useState(caption);
  useEffect(() => setDraft(caption), [caption]);
  return (
    <div className="inspector-body">
      <span className="kicker">CAPTION</span><h2>{caption.id}</h2>
      <label>Narration<textarea value={draft.text} onChange={(event) => setDraft({...draft, text: event.target.value})} /></label>
      <div className="two-fields">
        <label>Start frame<input type="number" value={draft.startFrame} onChange={(event) => setDraft({...draft, startFrame: Number(event.target.value)})} /></label>
        <label>End frame<input type="number" value={draft.endFrame} onChange={(event) => setDraft({...draft, endFrame: Number(event.target.value)})} /></label>
      </div>
      <small>{(draft.startFrame / fps).toFixed(2)}s – {(draft.endFrame / fps).toFixed(2)}s</small>
      <Button label="Save caption" variant="primary" width="100%" onClick={() => save(draft)} />
    </div>
  );
};

const ImageInspector = ({state, asset, transport, refresh, notice}: {state: ProjectState; asset: Asset | null; transport: WorkbenchTransport; refresh: () => Promise<void>; notice: (value: string) => void}) => {
  const [instruction, setInstruction] = useState('');
  const isCover = Boolean(asset && state.cover?.assetId === asset.id);
  return (
    <div className="inspector-body">
      <span className="kicker">VISUAL</span><h2>{asset?.id ?? 'No asset'}</h2>
      {asset?.kind === 'image' && <div className="inspector-image-wrap"><img className="inspector-image" src={asset.url} />{isCover && <em>Current cover</em>}</div>}
      <Button label={isCover ? '✓ Current cover' : 'Set as cover'} variant={isCover ? 'secondary' : 'ghost'} width="100%" className={`cover-button ${isCover ? 'selected' : ''}`} isDisabled={!asset || asset.kind !== 'image' || isCover} onClick={async () => {
        if (!asset) return;
        try { await transport.setCover(state.videoId, asset.id); await refresh(); notice('Cover image selected'); }
        catch (error) { notice(error instanceof Error ? error.message : String(error)); }
      }} />
      <label>Revision instruction<textarea value={instruction} onChange={(event) => setInstruction(event.target.value)} placeholder="Describe what should change…" /></label>
      <Button label="Request revision" variant="primary" width="100%" isDisabled={!asset || asset.kind !== 'image' || !instruction.trim()} onClick={async () => {
        if (!asset) return;
        try {
          await transport.createAssetRevision(state.videoId, {assetId: asset.id, sceneId: asset.sceneId, modelId: state.models.image, instruction});
          setInstruction(''); await refresh(); notice('Revision request created');
        } catch (error) { notice(error instanceof Error ? error.message : String(error)); }
      }} />
      <small>Cover selection is project state. It does not overwrite a rendered thumbnail.</small>
    </div>
  );
};

const ModelSettings = ({state, transport, refresh, notice}: {state: ProjectState; transport: WorkbenchTransport; refresh: () => Promise<void>; notice: (value: string) => void}) => {
  const [image, setImage] = useState(state.models.image ?? state.registry.image[0]?.id);
  const [voice, setVoice] = useState(state.models.voice ?? state.registry.voice[0]?.id);
  useEffect(() => {
    setImage(state.models.image ?? state.registry.image[0]?.id);
    setVoice(state.models.voice ?? state.registry.voice[0]?.id);
  }, [state.videoId, state.models.image, state.models.voice, state.registry.image, state.registry.voice]);
  return (
    <div className="inspector-body">
      <span className="kicker">PROJECT SETTINGS</span><h2>Generation models</h2>
      <label>Image model<Selector className="model-selector" label="Image model" isLabelHidden options={state.registry.image.map((item) => ({value: item.id, label: item.label}))} value={image} onChange={setImage} /></label>
      <label>Voice model<Selector className="model-selector" label="Voice model" isLabelHidden options={state.registry.voice.map((item) => ({value: item.id, label: item.label}))} value={voice} onChange={setVoice} /></label>
      <Button label="Save settings" variant="primary" width="100%" onClick={async () => {
        try { await transport.updateModels(state.videoId, {image, voice}); await refresh(); notice('Project settings saved'); }
        catch (error) { notice(error instanceof Error ? error.message : String(error)); }
      }} />
      <small>Saving configuration does not start generation.</small>
    </div>
  );
};

const effectKind = (type: string) => type.includes('video') || type.includes('montage') ? 'media' : type.includes('depth') || type.includes('zoom') || type.includes('burns') ? 'camera' : type.includes('draw') || type.includes('route') || type.includes('network') ? 'draw' : 'reveal';
