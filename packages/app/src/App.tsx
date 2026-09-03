import {useCallback, useEffect, useState} from 'react';
import {Badge} from '@astryxdesign/core/Badge';
import {Button} from '@astryxdesign/core/Button';
import {Selector} from '@astryxdesign/core/Selector';
import type {Asset, GenerationEstimate, GenerationReadiness, ProjectState, ProjectTransport} from '@make-video/contracts';
import {AssetBin} from './components/AssetBin';
import {Inspector} from './components/Inspector';
import {ModelSettingsDialog} from './components/ModelSettingsDialog';
import {Preview} from './components/Preview';
import {Timeline} from './components/Timeline';
import type {InspectorMode, PreviewMode, TimelineSelection} from './types';

export const App = ({transport}: {transport: ProjectTransport}) => {
  const [projects, setProjects] = useState<string[]>([]);
  const [videoId, setVideoId] = useState('');
  const [state, setState] = useState<ProjectState | null>(null);
  const [sceneId, setSceneId] = useState<string | null>(null);
  const [assetId, setAssetId] = useState<string | null>(null);
  const [stageId, setStageId] = useState<string | null>(null);
  const [selection, setSelection] = useState<TimelineSelection | null>(null);
  const [playheadFrame, setPlayheadFrame] = useState(0);
  const [previewMode, setPreviewMode] = useState<PreviewMode>('player');
  const [inspectorMode, setInspectorMode] = useState<InspectorMode>('scene');
  const [modelSettingsOpen, setModelSettingsOpen] = useState(false);
  const [readiness, setReadiness] = useState<GenerationReadiness | null>(null);
  const [estimate, setEstimate] = useState<GenerationEstimate | null>(null);
  const [readinessOpen, setReadinessOpen] = useState(false);
  const [notice, setNotice] = useState('Loading project…');

  const refreshReadiness = useCallback(async (id: string) => {
    if (!id) return;
    try { setReadiness(await transport.checkGenerationReadiness(id)); }
    catch { setReadiness(null); }
  }, [transport]);

  const refresh = useCallback(async (id: string) => {
    if (!id) return;
    const next = await transport.getProject(id);
    setState(next);
    await refreshReadiness(id);
    // A project without a declared cost plan simply has no price to show.
    try { setEstimate(await transport.estimateGeneration(id)); } catch { setEstimate(null); }
    setSceneId((value) => next.scenes.some((item) => item.id === value) ? value : (next.scenes[0]?.id ?? null));
    setAssetId((value) => next.assets.some((item) => item.id === value) ? value : (next.assets[0]?.id ?? null));
    setStageId((value) => next.stages.some((item) => item.id === value && item.exists) ? value : (next.stages.find((item) => item.exists && item.kind !== 'still' && !item.path.endsWith('.png'))?.id ?? next.stages.find((item) => item.exists)?.id ?? null));
    setSelection((value) => value && selectionExists(next, value) ? value : (next.scenes[0] ? {type: 'scene', id: next.scenes[0].id} : null));
    setPlayheadFrame((value) => Math.min(value, next.composition.durationInFrames));
    setNotice('');
  }, [refreshReadiness, transport]);

  const refreshCurrent = useCallback(() => refresh(videoId), [refresh, videoId]);

  useEffect(() => {
    if (!videoId) return undefined;
    const interval = window.setInterval(() => { void refreshReadiness(videoId); }, 3000);
    return () => window.clearInterval(interval);
  }, [refreshReadiness, videoId]);

  useEffect(() => {
    transport.listProjects().then((items) => {
      setProjects(items);
      setVideoId(items[0] ?? '');
      if (items[0]) return refresh(items[0]);
      setNotice('No video projects found.');
      return undefined;
    }).catch((error) => setNotice(error instanceof Error ? error.message : String(error)));
  }, [refresh, transport]);

  const handleRangeChange = useCallback(async (item: TimelineSelection, range: {startFrame: number; endFrame: number}) => {
    if (item.type === 'music') return;
    setState((current) => {
      if (!current) return current;
      if (item.type === 'scene') return {...current, scenes: current.scenes.map((scene) => scene.id === item.id ? {...scene, ...range, durationInFrames: range.endFrame - range.startFrame} : scene)};
      if (item.type === 'effect') return {...current, effects: current.effects.map((effect) => effect.id === item.id ? {...effect, ...range} : effect)};
      if (item.type === 'caption' || item.type === 'voice') return {...current, captions: current.captions.map((caption) => caption.id === item.id ? {...caption, ...range} : caption)};
      return current;
    });
    try { await transport.updateTimelineRange(videoId, {...item, ...range}); await refreshCurrent(); setNotice('Timeline range saved'); }
    catch (error) { setNotice(error instanceof Error ? error.message : String(error)); void refreshCurrent(); }
  }, [refreshCurrent, transport, videoId]);

  if (!state) return <main className="grid min-h-screen place-items-center bg-[#090b0e] text-[#858e99]">{notice}</main>;
  const scene = state.scenes.find((item) => item.id === sceneId) ?? null;
  const asset = state.assets.find((item) => item.id === assetId) ?? null;
  const stage = state.stages.find((item) => item.id === stageId) ?? null;
  const selectedCaptionId = selection?.type === 'caption' || selection?.type === 'voice' ? selection.id : null;
  const caption = state.captions.find((item) => item.id === selectedCaptionId) ?? state.captions.find((item) => item.sceneId === sceneId) ?? null;
  const selectScene = (id: string) => {
    setSceneId(id);
    setSelection({type: 'scene', id});
    const nextScene = state.scenes.find((item) => item.id === id);
    if (nextScene) setPlayheadFrame(nextScene.startFrame);
    const linked = state.assets.find((item) => item.sceneId === id);
    if (linked) setAssetId(linked.id);
  };
  const selectAsset = (item: Asset) => {
    setAssetId(item.id);
    if (item.sceneId) selectScene(item.sceneId);
    setInspectorMode('image');
  };
  const selectTimeline = (next: TimelineSelection) => {
    setSelection(next);
    if (next.type === 'scene') {
      selectScene(next.id);
      setInspectorMode('scene');
      return;
    }
    if (next.type === 'effect') {
      const effect = state.effects.find((item) => item.id === next.id);
      if (effect) { setSceneId(effect.sceneId); setPlayheadFrame(effect.startFrame); }
      setInspectorMode('effect');
      return;
    }
    if (next.type === 'caption' || next.type === 'voice') {
      const caption = state.captions.find((item) => item.id === next.id);
      if (caption) { setSceneId(caption.sceneId); setPlayheadFrame(caption.startFrame); }
      setInspectorMode(next.type);
      return;
    }
    setInspectorMode('audio');
  };
  return (
    <main className="grid h-screen min-w-[1024px] grid-rows-[52px_minmax(330px,1fr)_282px] overflow-hidden bg-[#090b0e] text-[#e8eaed]">
      <header className="grid grid-cols-[190px_220px_1fr_auto] items-center gap-3 border-b border-[#242830] bg-[#101318] px-3 max-[1120px]:grid-cols-[150px_190px_1fr_auto]">
        <div className="flex items-center gap-2.5"><span className="grid h-7 w-7 place-items-center rounded-md bg-[#d68b46] text-[10px] font-black text-[#17100a]">MV</span><strong className="text-[13px]">Make Video</strong></div>
        <Selector className="min-w-0" label="Project" isLabelHidden options={projects} value={videoId} onChange={(id) => { setVideoId(id); void refresh(id); }} />
        <div />
        <div className="relative flex items-center gap-2">
          <Badge className="max-[1120px]:hidden" variant={state.qa?.passed ? 'success' : 'warning'} label={state.qa?.passed ? 'QA passed' : 'QA pending'} />
          <Button label={readiness ? (readiness.passed ? (readiness.warnings.length ? 'Generation warnings' : 'Generation ready') : 'Generation blocked') : 'Readiness unavailable'} variant="secondary" size="sm" onClick={() => setReadinessOpen((value) => !value)} />
          <Button label="Model settings" variant="secondary" size="sm" className="!bg-[#20252d] !text-[#e8eaed] hover:!bg-[#2b323d]" onClick={() => setModelSettingsOpen(true)} />
          <Button label="Preview" variant="primary" size="sm" onClick={() => setPreviewMode('player')} />
          {readinessOpen && readiness && <ReadinessPanel readiness={readiness} estimate={estimate} refresh={() => refreshReadiness(videoId)} openModelSettings={() => { setReadinessOpen(false); setModelSettingsOpen(true); }} onClose={() => setReadinessOpen(false)} />}
        </div>
      </header>
      <section className="grid min-h-0 grid-cols-[220px_minmax(460px,1fr)_300px] max-[1120px]:grid-cols-[180px_minmax(430px,1fr)_260px]">
        <AssetBin state={state} selected={assetId} onSelect={selectAsset} transport={transport} refresh={refreshCurrent} notice={setNotice} />
        <Preview state={state} mode={previewMode} setMode={setPreviewMode} stage={stage} setStageId={setStageId} sceneId={sceneId} selectScene={selectScene} playheadFrame={playheadFrame} onPlayheadChange={setPlayheadFrame} />
        <Inspector state={state} mode={inspectorMode} setMode={setInspectorMode} scene={scene} caption={caption} asset={asset} effect={selection?.type === 'effect' ? state.effects.find((item) => item.id === selection.id) ?? null : null} readiness={readiness} transport={transport} refresh={refreshCurrent} notice={setNotice} />
      </section>
      <Timeline state={state} selection={selection} playheadFrame={playheadFrame} onSelect={selectTimeline} onSeek={setPlayheadFrame} onRangeChange={handleRangeChange} />
      {modelSettingsOpen && <ModelSettingsDialog state={state} transport={transport} listModels={transport.listModels} refresh={refreshCurrent} notice={setNotice} onClose={() => setModelSettingsOpen(false)} />}
      {notice && <div className="fixed bottom-[270px] right-[18px] rounded-md border border-[#4b535e] bg-[#20252d] px-3 py-2.5 text-[11px] text-[#e8eaed] shadow-[0_8px_24px_#0008]">{notice}</div>}
    </main>
  );
};

const ReadinessPanel = ({readiness, estimate, refresh, openModelSettings, onClose}: {readiness: GenerationReadiness; estimate: GenerationEstimate | null; refresh: () => Promise<void>; openModelSettings: () => void; onClose: () => void}) => {
  const hasMissingModel = !readiness.generation.imageModel || !readiness.generation.voiceModel;
  return (
  <div className="absolute right-0 top-11 z-30 w-[360px] rounded-md border border-[#3a424d] bg-[#171b21] p-3 shadow-[0_12px_32px_#0009]">
    <div className="flex items-center justify-between gap-3"><strong className="text-[12px]">Generation readiness</strong><div className="flex items-center gap-1"><Button label="Refresh" variant="ghost" size="sm" onClick={() => void refresh()} /><Button label="Close" variant="ghost" size="sm" onClick={onClose} /></div></div>
    <div className="mt-2 grid grid-cols-2 gap-2 text-[10px] text-[#9aa4af]"><span>Plan: {readiness.plan.valid ? 'valid' : readiness.plan.present ? 'invalid' : 'missing'}</span><span>Script: {readiness.script.valid ? `${readiness.script.segments} segments` : 'invalid'}</span><span>Image model: {readiness.generation.imageModel ? 'configured' : 'missing'}</span><span>Voice model: {readiness.generation.voiceModel ? 'configured' : 'missing'}</span></div>
    {(readiness.errors.length > 0 || readiness.warnings.length > 0) ? <div className="mt-3 space-y-1.5 text-[10px] leading-[1.4]">{readiness.errors.map((error) => <div className="rounded bg-[#3b2426] px-2 py-1.5 text-[#f1b2b2]" key={`error-${error}`}>{error}</div>)}{readiness.warnings.map((warning) => <div className="rounded bg-[#3c3222] px-2 py-1.5 text-[#e8c78f]" key={`warning-${warning}`}>{warning}</div>)}</div> : <div className="mt-3 rounded bg-[#20372c] px-2 py-1.5 text-[10px] text-[#9bd4ae]">Plan and generation inputs are ready.</div>}
    {estimate && <div className="mt-3 rounded bg-[#1e242c] px-2 py-1.5 text-[10px] leading-[1.5] text-[#9aa4af]"><strong className="text-[#e8eaed]">Estimated run: {estimate.totalEstimatedCost.toFixed(2)} {estimate.currency}</strong> over {estimate.sequentialLatencySeconds.min}–{estimate.sequentialLatencySeconds.max}s for {estimate.assets.length} asset(s).{estimate.uncosted.length > 0 && <div className="mt-1 text-[#e8c78f]">Not included in that price: {estimate.uncosted.join(', ')}.</div>}</div>}
    {hasMissingModel && <Button className="mt-3" label="Open model settings" variant="secondary" size="sm" onClick={openModelSettings} />}
  </div>
  );
};

const selectionExists = (state: ProjectState, selection: TimelineSelection) => {
  if (selection.type === 'scene') return state.scenes.some((item) => item.id === selection.id);
  if (selection.type === 'effect') return state.effects.some((item) => item.id === selection.id);
  if (selection.type === 'caption' || selection.type === 'voice') return state.captions.some((item) => item.id === selection.id);
  return selection.id === state.audio.music.id;
};
