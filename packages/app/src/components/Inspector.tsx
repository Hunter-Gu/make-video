import {useEffect, useRef, useState} from 'react';
import {Button} from '@astryxdesign/core/Button';
import {NumberInput} from '@astryxdesign/core/NumberInput';
import {SegmentedControl, SegmentedControlItem} from '@astryxdesign/core/SegmentedControl';
import {TextArea} from '@astryxdesign/core/TextArea';
import type {Asset, AudioTrack, Caption, GenerationJob, GenerationReadiness, ProjectState, ProjectTransport, RemotionEffect, TimingJob} from '@make-video/contracts';
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
  readiness: GenerationReadiness | null;
  transport: ProjectTransport;
  refresh: () => Promise<void>;
  notice: (value: string) => void;
};

export const Inspector = ({state, mode, setMode, scene, caption, asset, effect, audioSelection, readiness, transport, refresh, notice}: InspectorProps) => (
  <aside className="min-h-0 overflow-auto border-l border-[#242830] bg-[#101318]">
    <SegmentedControl className="m-2.5 flex-wrap" label="Inspector view" value={mode} onChange={(value) => setMode(value as InspectorMode)} layout="fill" size="sm">
      {(['scene', 'caption', 'voice', 'effect', 'audio', 'image'] as const).map((tab) => <SegmentedControlItem key={tab} value={tab} label={tab === 'image' ? 'Visual' : tab === 'audio' ? 'Music' : tab[0].toUpperCase() + tab.slice(1)} />)}
    </SegmentedControl>
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
    ) : <div className="grid h-full place-items-center text-xs text-[#68717d]">This scene has no caption.</div>)}
    {mode === 'voice' && (caption ? <VoiceInspector caption={caption} fps={state.composition.fps} track={state.audio.voiceover} readiness={readiness} generate={() => transport.generate(state.videoId, 'voiceover')} getJob={transport.getGenerationJob} buildTiming={() => transport.buildTiming(state.videoId, true)} getTimingJob={transport.getTimingJob} notice={notice} refresh={refresh} /> : <div className="grid h-full place-items-center text-xs text-[#68717d]">Select a voice block.</div>)}
    {mode === 'effect' && <EffectInspector effect={effect} fps={state.composition.fps} />}
    {mode === 'audio' && <AudioInspector track={audioSelection ? state.audio.music : state.audio.music} generate={() => transport.generate(state.videoId, 'music')} getJob={transport.getGenerationJob} notice={notice} refresh={refresh} />}
    {mode === 'image' && <ImageInspector state={state} asset={asset} readiness={readiness} transport={transport} refresh={refresh} notice={notice} />}
  </aside>
);

const SceneInspector = ({scene, asset, fps, effects}: {scene: ProjectState['scenes'][number] | null; asset: Asset | null; fps: number; effects: RemotionEffect[]}) => scene ? (
  <div className="px-4 pb-5 pt-2.5">
    <span className="text-[9px] tracking-[.13em] text-[#6e7884]">CURRENT SCENE</span>
    <h2 className="my-2 mb-5 font-serif text-[22px] font-medium">{scene.id}</h2>
    {asset?.url && <div className="mb-4 overflow-hidden rounded-md bg-[#080a0d]">{asset.kind === 'image' ? <img className="block aspect-video w-full object-contain" src={asset.url} alt={asset.id} /> : <video className="block aspect-video w-full object-contain" src={asset.url} controls />}</div>}
    <dl className="grid grid-cols-[1fr_1.2fr] gap-3 text-[11px]">
      <dt className="text-[#737c87]">Start</dt><dd className="m-0 text-right [overflow-wrap:anywhere]">{formatTime(scene.startFrame, fps)}</dd>
      <dt className="text-[#737c87]">End</dt><dd className="m-0 text-right [overflow-wrap:anywhere]">{formatTime(scene.endFrame, fps)}</dd>
      <dt className="text-[#737c87]">Duration</dt><dd className="m-0 text-right [overflow-wrap:anywhere]">{(scene.durationInFrames / fps).toFixed(2)}s</dd>
      <dt className="text-[#737c87]">Timing</dt><dd className="m-0 text-right [overflow-wrap:anywhere]">{scene.timingSource}</dd>
      <dt className="text-[#737c87]">Assets</dt><dd className="m-0 text-right [overflow-wrap:anywhere]">{scene.assetIds?.join(', ') || 'None'}</dd>
    </dl>
    <div className="mt-6 border-t border-[#252a31] pt-4">
      <span className="text-[9px] tracking-[.13em] text-[#6e7884]">REMOTION EFFECTS</span>
      {effects.length ? effects.map((effect) => (
        <div className="mt-2.5 flex items-center gap-2 rounded-md bg-[#171b21] p-2" key={effect.id}>
          <i className={`h-1.5 w-1.5 shrink-0 rounded-full ${effectDotColor(effect.type)}`} />
          <span><strong className="block text-[10px]">{effect.label}</strong><small className="mt-[3px] block text-[8px] text-[#737c87]">{effect.type} · {effect.endFrame - effect.startFrame}f</small></span>
        </div>
      )) : <small className="my-2.5 block text-[9px] leading-[1.45] text-[#737c87]">No declared effects</small>}
    </div>
  </div>
) : <div className="grid h-full place-items-center text-xs text-[#68717d]">Select a scene.</div>;

const VoiceInspector = ({caption, fps, track, readiness, generate, getJob, buildTiming, getTimingJob, notice, refresh}: {caption: Caption; fps: number; track: AudioTrack; readiness: GenerationReadiness | null; generate: () => Promise<GenerationJob>; getJob: (jobId: string) => Promise<GenerationJob>; buildTiming: () => Promise<TimingJob>; getTimingJob: (jobId: string) => Promise<TimingJob>; notice: (value: string) => void; refresh: () => Promise<void>}) => {
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
    <div className="px-4 pb-5 pt-2.5">
      <span className="text-[9px] tracking-[.13em] text-[#6e7884]">VOICE</span><h2 className="my-2 mb-5 font-serif text-[22px] font-medium">{caption.id}</h2>
      <p className="rounded-md border-l-2 border-[#d68b46] bg-[#171b21] p-3 text-[11px] leading-[1.5] text-[#c7cdd4]">{caption.text}</p>
      {track.url ? <><audio className="mb-3 block w-full" ref={audioRef} src={track.url} controls preload="metadata" /><Button label="Play this caption" variant="primary" width="100%" onClick={playCaption} /></> : <div className="grid h-full place-items-center text-xs text-[#68717d]">Voiceover audio is not available.</div>}
      <GenerationButton label="Generate voiceover" kind="voiceover" readiness={readiness} generate={generate} getJob={getJob} notice={notice} refresh={refresh} />
      <TimingButton build={buildTiming} getJob={getTimingJob} notice={notice} refresh={refresh} />
      <dl className="mt-4 grid grid-cols-[1fr_1.2fr] gap-3 text-[11px]"><dt className="text-[#737c87]">Start</dt><dd className="m-0 text-right">{formatTime(caption.startFrame, fps)}</dd><dt className="text-[#737c87]">End</dt><dd className="m-0 text-right">{formatTime(caption.endFrame, fps)}</dd></dl>
    </div>
  );
};

const TimingButton = ({build, getJob, notice, refresh}: {build: () => Promise<TimingJob>; getJob: (jobId: string) => Promise<TimingJob>; notice: (value: string) => void; refresh: () => Promise<void>}) => {
  const [running, setRunning] = useState(false);
  const run = async () => {
    setRunning(true);
    try {
      let job = await build();
      while (job.status === 'queued' || job.status === 'running') {
        await new Promise((resolve) => window.setTimeout(resolve, 500));
        job = await getJob(job.id);
      }
      if (job.status === 'failed') throw new Error(job.error ?? 'Build timing failed');
      await refresh(); notice('Captions and timing updated');
    } catch (error) { notice(error instanceof Error ? error.message : String(error)); }
    finally { setRunning(false); }
  };
  return <Button className="mt-2" label={running ? 'Build captions & timing…' : 'Build captions & timing'} variant="secondary" width="100%" isDisabled={running} onClick={run} />;
};

const AudioInspector = ({track, generate, getJob, notice, refresh}: {track: AudioTrack; generate: () => Promise<GenerationJob>; getJob: (jobId: string) => Promise<GenerationJob>; notice: (value: string) => void; refresh: () => Promise<void>}) => (
  <div className="px-4 pb-5 pt-2.5">
    <span className="text-[9px] tracking-[.13em] text-[#6e7884]">AUDIO TRACK</span><h2 className="my-2 mb-5 font-serif text-[22px] font-medium">{track.label}</h2>
    {track.url ? <audio className="mb-3 block w-full" src={track.url} controls preload="metadata" /> : <div className="grid h-full place-items-center text-xs text-[#68717d]">Music audio is not available.</div>}
    <GenerationButton label="Generate music" generate={generate} getJob={getJob} notice={notice} refresh={refresh} />
    <small className="my-2.5 block text-[9px] leading-[1.45] text-[#737c87]">{track.path}</small>
  </div>
);

const EffectInspector = ({effect, fps}: {effect: RemotionEffect | null; fps: number}) => effect ? (
  <div className="px-4 pb-5 pt-2.5">
    <span className="text-[9px] tracking-[.13em] text-[#6e7884]">REMOTION EFFECT</span><h2 className="my-2 mb-5 font-serif text-[22px] font-medium">{effect.label}</h2>
    <dl className="grid grid-cols-[1fr_1.2fr] gap-3 text-[11px]"><dt className="text-[#737c87]">Type</dt><dd className="m-0 text-right [overflow-wrap:anywhere]">{effect.type}</dd><dt className="text-[#737c87]">Start</dt><dd className="m-0 text-right">{formatTime(effect.startFrame, fps)}</dd><dt className="text-[#737c87]">End</dt><dd className="m-0 text-right">{formatTime(effect.endFrame, fps)}</dd><dt className="text-[#737c87]">Duration</dt><dd className="m-0 text-right">{((effect.endFrame - effect.startFrame) / fps).toFixed(2)}s</dd></dl>
    <pre className="mt-5 max-h-48 overflow-auto rounded-md bg-[#0a0d11] p-3 text-[9px] leading-[1.45] text-[#aab6c2]">{JSON.stringify(effect.parameters ?? {}, null, 2)}</pre>
  </div>
) : <div className="grid h-full place-items-center text-xs text-[#68717d]">Select a Remotion effect.</div>;

const CaptionEditor = ({caption, fps, save}: {caption: Caption; fps: number; save: (caption: Caption) => Promise<void>}) => {
  const [draft, setDraft] = useState(caption);
  useEffect(() => setDraft(caption), [caption]);
  return (
    <div className="px-4 pb-5 pt-2.5">
      <span className="text-[9px] tracking-[.13em] text-[#6e7884]">CAPTION</span><h2 className="my-2 mb-5 font-serif text-[22px] font-medium">{caption.id}</h2>
      <TextArea label="Narration" value={draft.text} rows={4} onChange={(value) => setDraft({...draft, text: value})} />
      <div className="grid grid-cols-2 gap-2">
        <NumberInput label="Start frame" value={draft.startFrame} onChange={(value) => setDraft({...draft, startFrame: value})} isIntegerOnly />
        <NumberInput label="End frame" value={draft.endFrame} onChange={(value) => setDraft({...draft, endFrame: value})} isIntegerOnly />
      </div>
      <small className="my-2.5 block text-[9px] leading-[1.45] text-[#737c87]">{(draft.startFrame / fps).toFixed(2)}s – {(draft.endFrame / fps).toFixed(2)}s</small>
      <Button label="Save caption" variant="primary" width="100%" onClick={() => save(draft)} />
    </div>
  );
};

const ImageInspector = ({state, asset, readiness, transport, refresh, notice}: {state: ProjectState; asset: Asset | null; readiness: GenerationReadiness | null; transport: ProjectTransport; refresh: () => Promise<void>; notice: (value: string) => void}) => {
  const [instruction, setInstruction] = useState('');
  const isCover = Boolean(asset && state.cover?.assetId === asset.id);
  return (
    <div className="px-4 pb-5 pt-2.5">
      <span className="text-[9px] tracking-[.13em] text-[#6e7884]">VISUAL</span><h2 className="my-2 mb-5 font-serif text-[22px] font-medium">{asset?.id ?? 'No asset'}</h2>
      {asset?.kind === 'image' && <div className="relative"><img className="aspect-[16/10] w-full rounded-md bg-[#080a0d] object-contain" src={asset.url} />{isCover && <em className="absolute right-2 top-2 rounded bg-[#d68b46] px-1.5 py-1 text-[8px] font-extrabold uppercase not-italic text-[#17100a]">Current cover</em>}</div>}
      <Button label={isCover ? '✓ Current cover' : 'Set as cover'} variant={isCover ? 'secondary' : 'ghost'} width="100%" className="mt-2" isDisabled={!asset || asset.kind !== 'image' || isCover} onClick={async () => {
        if (!asset) return;
        try { await transport.setCover(state.videoId, asset.id); await refresh(); notice('Cover image selected'); }
        catch (error) { notice(error instanceof Error ? error.message : String(error)); }
      }} />
      <TextArea label="Revision instruction" value={instruction} rows={4} onChange={setInstruction} placeholder="Describe what should change…" />
      <Button label="Request revision" variant="primary" width="100%" isDisabled={!asset || asset.kind !== 'image' || !instruction.trim()} onClick={async () => {
        if (!asset) return;
        try {
          await transport.createAssetRevision(state.videoId, {assetId: asset.id, sceneId: asset.sceneId, modelId: state.models.image, instruction});
          setInstruction(''); await refresh(); notice('Revision request created');
        } catch (error) { notice(error instanceof Error ? error.message : String(error)); }
      }} />
      <GenerationButton label="Generate configured images" kind="images" readiness={readiness} generate={() => transport.generate(state.videoId, 'images')} getJob={transport.getGenerationJob} notice={notice} refresh={refresh} />
      <GenerationButton label="Generate configured video clips" kind="video" generate={() => transport.generate(state.videoId, 'video')} getJob={transport.getGenerationJob} notice={notice} refresh={refresh} />
      <small className="my-2.5 block text-[9px] leading-[1.45] text-[#737c87]">Cover selection is project state. It does not overwrite a rendered thumbnail.</small>
    </div>
  );
};

const GenerationButton = ({label, kind, readiness, generate, getJob, notice, refresh}: {label: string; kind?: 'images' | 'video' | 'voiceover' | 'music'; readiness?: GenerationReadiness | null; generate: () => Promise<GenerationJob>; getJob: (jobId: string) => Promise<GenerationJob>; notice: (value: string) => void; refresh: () => Promise<void>}) => {
  const [running, setRunning] = useState(false);
  const blocked = Boolean(kind !== 'music' && kind !== 'video' && readiness && !readiness.passed);
  const run = async () => {
    setRunning(true);
    try {
      let job = await generate();
      while (job.status === 'queued' || job.status === 'running') {
        await new Promise((resolve) => window.setTimeout(resolve, 500));
        job = await getJob(job.id);
      }
      if (job.status === 'failed') throw new Error(job.error ?? `${label} failed`);
      await refresh(); notice(`${label} complete`);
    }
    catch (error) { notice(error instanceof Error ? error.message : String(error)); }
    finally { setRunning(false); }
  };
  return <Button className="mt-2" label={blocked ? 'Resolve readiness issues' : running ? `${label}…` : label} variant="secondary" width="100%" isDisabled={running || blocked} onClick={run} />;
};

const effectKind = (type: string) => type.includes('video') || type.includes('montage') ? 'media' : type.includes('depth') || type.includes('zoom') || type.includes('burns') ? 'camera' : type.includes('draw') || type.includes('route') || type.includes('network') ? 'draw' : 'reveal';
const effectDotColor = (type: string) => ({media: 'bg-[#cf8dcc]', camera: 'bg-[#73c7ce]', draw: 'bg-[#70cf99]', reveal: 'bg-[#91aee8]'}[effectKind(type)]);
