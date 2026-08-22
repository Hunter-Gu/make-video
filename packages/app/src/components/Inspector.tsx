import {useEffect, useRef, useState} from 'react';
import {Button} from '@astryxdesign/core/Button';
import type {Asset, AudioTrack, Caption, ProjectState, ProjectTransport, RemotionEffect} from '@make-video/contracts';
import type {InspectorMode} from '../types';
import {formatTime} from '../lib/format-time';

type InspectorProps = {
  state: ProjectState;
  mode: InspectorMode;
  setMode: (mode: InspectorMode) => void;
  scene: ProjectState['scenes'][number] | null;
  caption: Caption | null;
  asset: Asset | null;
  effect: RemotionEffect | null;
  audioSelection: {type: 'music'; id: string} | null;
  transport: ProjectTransport;
  refresh: () => Promise<void>;
  notice: (value: string) => void;
};

export const Inspector = ({state, mode, setMode, scene, caption, asset, effect, audioSelection, transport, refresh, notice}: InspectorProps) => (
  <aside className="inspector panel">
    <div className="inspector-tabs">
      {(['scene', 'caption', 'voice', 'effect', 'audio', 'image'] as const).map((tab) => (
        <button className={mode === tab ? 'active' : ''} onClick={() => setMode(tab)} key={tab}>
          {tab === 'image' ? 'Visual' : tab === 'audio' ? 'Music' : tab[0].toUpperCase() + tab.slice(1)}
        </button>
      ))}
    </div>
    {mode === 'scene' && <SceneInspector scene={scene} asset={asset} fps={state.composition.fps} effects={state.effects.filter((item) => item.sceneId === scene?.id)} />}
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
    {mode === 'voice' && (caption ? <VoiceInspector caption={caption} fps={state.composition.fps} track={state.audio.voiceover} /> : <div className="empty-state">Select a voice block.</div>)}
    {mode === 'effect' && <EffectInspector effect={effect} fps={state.composition.fps} />}
    {mode === 'audio' && <AudioInspector track={audioSelection ? state.audio.music : state.audio.music} />}
    {mode === 'image' && <ImageInspector state={state} asset={asset} transport={transport} refresh={refresh} notice={notice} />}
  </aside>
);

const SceneInspector = ({scene, asset, fps, effects}: {scene: ProjectState['scenes'][number] | null; asset: Asset | null; fps: number; effects: RemotionEffect[]}) => scene ? (
  <div className="inspector-body">
    <span className="kicker">CURRENT SCENE</span>
    <h2>{scene.id}</h2>
    {asset?.url && <div className="scene-asset-preview">{asset.kind === 'image' ? <img src={asset.url} alt={asset.id} /> : <video src={asset.url} controls />}</div>}
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

const VoiceInspector = ({caption, fps, track}: {caption: Caption; fps: number; track: AudioTrack}) => {
  const audioRef = useRef<HTMLAudioElement>(null);
  useEffect(() => {
    if (audioRef.current) audioRef.current.currentTime = caption.startFrame / fps;
  }, [caption.id, caption.startFrame, fps, track.url]);
  const playCaption = async () => {
    if (!audioRef.current || !track.url) return;
    audioRef.current.currentTime = caption.startFrame / fps;
    await audioRef.current.play();
  };
  return (
    <div className="inspector-body">
      <span className="kicker">VOICE</span><h2>{caption.id}</h2>
      <p className="inspector-quote">{caption.text}</p>
      {track.url ? <><audio ref={audioRef} src={track.url} controls preload="metadata" /><Button label="Play this caption" variant="primary" width="100%" onClick={playCaption} /></> : <div className="empty-state">Voiceover audio is not available.</div>}
      <dl><dt>Start</dt><dd>{formatTime(caption.startFrame, fps)}</dd><dt>End</dt><dd>{formatTime(caption.endFrame, fps)}</dd></dl>
    </div>
  );
};

const AudioInspector = ({track}: {track: AudioTrack}) => (
  <div className="inspector-body">
    <span className="kicker">AUDIO TRACK</span><h2>{track.label}</h2>
    {track.url ? <audio src={track.url} controls preload="metadata" /> : <div className="empty-state">Music audio is not available.</div>}
    <small>{track.path}</small>
  </div>
);

const EffectInspector = ({effect, fps}: {effect: RemotionEffect | null; fps: number}) => effect ? (
  <div className="inspector-body">
    <span className="kicker">REMOTION EFFECT</span><h2>{effect.label}</h2>
    <dl><dt>Type</dt><dd>{effect.type}</dd><dt>Start</dt><dd>{formatTime(effect.startFrame, fps)}</dd><dt>End</dt><dd>{formatTime(effect.endFrame, fps)}</dd><dt>Duration</dt><dd>{((effect.endFrame - effect.startFrame) / fps).toFixed(2)}s</dd></dl>
    <pre className="effect-parameters">{JSON.stringify(effect.parameters ?? {}, null, 2)}</pre>
  </div>
) : <div className="empty-state">Select a Remotion effect.</div>;

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

const ImageInspector = ({state, asset, transport, refresh, notice}: {state: ProjectState; asset: Asset | null; transport: ProjectTransport; refresh: () => Promise<void>; notice: (value: string) => void}) => {
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

const effectKind = (type: string) => type.includes('video') || type.includes('montage') ? 'media' : type.includes('depth') || type.includes('zoom') || type.includes('burns') ? 'camera' : type.includes('draw') || type.includes('route') || type.includes('network') ? 'draw' : 'reveal';
