import {useCallback, useEffect, useState} from 'react';
import {Badge} from '@astryxdesign/core/Badge';
import {Button} from '@astryxdesign/core/Button';
import {Selector} from '@astryxdesign/core/Selector';
import type {Asset, ProjectState, WorkbenchTransport} from '@make-video/contracts';
import {AssetBin} from './components/AssetBin';
import {Inspector} from './components/Inspector';
import {Preview} from './components/Preview';
import {Timeline} from './components/Timeline';
import type {InspectorMode, PreviewMode} from './types';

export const Workbench = ({transport}: {transport: WorkbenchTransport}) => {
  const [projects, setProjects] = useState<string[]>([]);
  const [videoId, setVideoId] = useState('');
  const [state, setState] = useState<ProjectState | null>(null);
  const [sceneId, setSceneId] = useState<string | null>(null);
  const [assetId, setAssetId] = useState<string | null>(null);
  const [stageId, setStageId] = useState<string | null>(null);
  const [previewMode, setPreviewMode] = useState<PreviewMode>('player');
  const [inspectorMode, setInspectorMode] = useState<InspectorMode>('scene');
  const [notice, setNotice] = useState('Loading project…');

  const refresh = useCallback(async (id: string) => {
    if (!id) return;
    const next = await transport.getProject(id);
    setState(next);
    setSceneId((value) => next.scenes.some((item) => item.id === value) ? value : (next.scenes[0]?.id ?? null));
    setAssetId((value) => next.assets.some((item) => item.id === value) ? value : (next.assets[0]?.id ?? null));
    setStageId((value) => next.stages.some((item) => item.id === value && item.exists) ? value : (next.stages.find((item) => item.exists && item.kind !== 'still' && !item.path.endsWith('.png'))?.id ?? next.stages.find((item) => item.exists)?.id ?? null));
    setNotice('');
  }, [transport]);

  const refreshCurrent = useCallback(() => refresh(videoId), [refresh, videoId]);

  useEffect(() => {
    transport.listProjects().then((items) => {
      setProjects(items);
      setVideoId(items[0] ?? '');
      if (items[0]) return refresh(items[0]);
      return undefined;
    }).catch((error) => setNotice(error instanceof Error ? error.message : String(error)));
  }, [refresh, transport]);

  if (!state) return <main className="loading">{notice}</main>;
  const scene = state.scenes.find((item) => item.id === sceneId) ?? null;
  const asset = state.assets.find((item) => item.id === assetId) ?? null;
  const stage = state.stages.find((item) => item.id === stageId) ?? null;
  const caption = state.captions.find((item) => item.sceneId === sceneId || item.id === sceneId) ?? null;
  const selectScene = (id: string) => {
    setSceneId(id);
    const linked = state.assets.find((item) => item.sceneId === id);
    if (linked) setAssetId(linked.id);
  };
  const selectAsset = (item: Asset) => {
    setAssetId(item.id);
    if (item.sceneId) selectScene(item.sceneId);
    setInspectorMode('image');
  };

  return (
    <main className="editor">
      <header className="topbar">
        <div className="brand"><span>MV</span><strong>Make Video</strong></div>
        <Selector className="project-selector" label="Project" isLabelHidden options={projects} value={videoId} onChange={(id) => { setVideoId(id); void refresh(id); }} />
        <div />
        <div className="topbar-actions">
          <Badge className="qa-badge" variant={state.qa?.passed ? 'success' : 'warning'} label={state.qa?.passed ? 'QA passed' : 'QA pending'} />
          <Button label="Project settings" variant="secondary" size="sm" onClick={() => setInspectorMode('settings')} />
          <Button label="Preview" variant="primary" size="sm" onClick={() => setPreviewMode('player')} />
        </div>
      </header>
      <section className="edit-area">
        <AssetBin state={state} selected={assetId} onSelect={selectAsset} />
        <Preview state={state} mode={previewMode} setMode={setPreviewMode} stage={stage} setStageId={setStageId} sceneId={sceneId} selectScene={selectScene} />
        <Inspector state={state} mode={inspectorMode} setMode={setInspectorMode} scene={scene} caption={caption} asset={asset} transport={transport} refresh={refreshCurrent} notice={setNotice} />
      </section>
      <Timeline state={state} sceneId={sceneId} selectScene={selectScene} />
      {notice && <div className="toast">{notice}</div>}
    </main>
  );
};
