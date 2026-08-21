import {useMemo, useRef, useState} from 'react';
import {Selector} from '@astryxdesign/core/Selector';
import type {ProjectState} from '@make-video/contracts';
import type {PreviewMode} from '../types';
import {formatTime} from '../lib/format-time';

type PreviewProps = {
  state: ProjectState;
  mode: PreviewMode;
  setMode: (mode: PreviewMode) => void;
  stage: ProjectState['stages'][number] | null;
  setStageId: (id: string) => void;
  sceneId: string | null;
  selectScene: (id: string) => void;
};

export const Preview = ({state, mode, setMode, stage, setStageId, sceneId, selectScene}: PreviewProps) => {
  const sceneAssets = useMemo(
    () => new Map(state.assets.filter((item) => item.sceneId).map((item) => [item.sceneId, item])),
    [state.assets],
  );
  const videoRef = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false);
  const selectedIndex = state.scenes.findIndex((scene) => scene.id === sceneId);
  const selectedScene = state.scenes[selectedIndex];
  const isVideo = Boolean(stage?.url && stage.kind !== 'still' && !stage.path.endsWith('.png'));
  const togglePlayback = async () => {
    if (!videoRef.current) return;
    if (videoRef.current.paused) await videoRef.current.play();
    else videoRef.current.pause();
  };

  return (
    <section className="preview-zone">
      <div className="preview-toolbar">
        <div className="view-switch">
          <button className={mode === 'player' ? 'active' : ''} onClick={() => setMode('player')}>Player</button>
          <button className={mode === 'storyboard' ? 'active' : ''} onClick={() => setMode('storyboard')}>Storyboard</button>
        </div>
        {mode === 'player' && (
          <Selector
            className="stage-selector"
            label="Preview stage"
            isLabelHidden
            options={state.stages.filter((item) => item.exists).map((item) => ({value: item.id, label: item.label}))}
            value={stage?.id ?? ''}
            onChange={setStageId}
          />
        )}
        <span>{state.composition.width} × {state.composition.height}</span>
      </div>
      {mode === 'player' ? (
        <div className="player-canvas">
          {stage?.url ? (
            stage.kind === 'still' || stage.path.endsWith('.png') ? <img src={stage.url} /> : (
              <video ref={videoRef} src={stage.url} onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} onEnded={() => setPlaying(false)} />
            )
          ) : <div className="empty">No rendered preview</div>}
        </div>
      ) : (
        <div className="storyboard-strip">
          {state.scenes.map((scene, index) => {
            const asset = sceneAssets.get(scene.id);
            return (
              <button className={sceneId === scene.id ? 'selected' : ''} onClick={() => selectScene(scene.id)} key={scene.id}>
                <div>{asset?.kind === 'image' ? <img src={asset.url} /> : <span>{String(index + 1).padStart(2, '0')}</span>}</div>
                <strong>{scene.id}</strong>
                <small>{(scene.durationInFrames / state.composition.fps).toFixed(1)}s</small>
              </button>
            );
          })}
        </div>
      )}
      <div className="preview-controls">
        <button disabled={selectedIndex <= 0} onClick={() => selectScene(state.scenes[selectedIndex - 1].id)}>◀</button>
        <button className="preview-play" disabled={!isVideo || mode !== 'player'} onClick={togglePlayback}>{playing ? 'Ⅱ' : '▶'}</button>
        <button disabled={selectedIndex < 0 || selectedIndex >= state.scenes.length - 1} onClick={() => selectScene(state.scenes[selectedIndex + 1].id)}>▶</button>
        <span>{selectedScene ? formatTime(selectedScene.startFrame, state.composition.fps) : '00:00.00'} / {formatTime(state.composition.durationInFrames, state.composition.fps)}</span>
      </div>
    </section>
  );
};
