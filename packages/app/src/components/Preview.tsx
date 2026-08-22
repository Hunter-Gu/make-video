import {useEffect, useMemo, useRef, useState} from 'react';
import {Button} from '@astryxdesign/core/Button';
import {SegmentedControl, SegmentedControlItem} from '@astryxdesign/core/SegmentedControl';
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
  playheadFrame: number;
  onPlayheadChange: (frame: number) => void;
};

export const Preview = ({state, mode, setMode, stage, setStageId, sceneId, selectScene, playheadFrame, onPlayheadChange}: PreviewProps) => {
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
  useEffect(() => {
    if (!videoRef.current) return;
    const target = playheadFrame / state.composition.fps;
    if (Math.abs(videoRef.current.currentTime - target) > 0.1) videoRef.current.currentTime = target;
  }, [playheadFrame, state.composition.fps]);

  return (
    <section className="grid min-h-0 min-w-0 grid-rows-[44px_minmax(0,1fr)_42px] bg-[#0b0e12]">
      <div className="grid grid-cols-[180px_170px_1fr] items-center gap-2.5 border-b border-[#20242b] px-3.5 py-1">
        <SegmentedControl className="m-0" label="Preview mode" value={mode} onChange={(value) => setMode(value as PreviewMode)} size="sm">
          <SegmentedControlItem value="player" label="Player" />
          <SegmentedControlItem value="storyboard" label="Storyboard" />
        </SegmentedControl>
        {mode === 'player' && (
          <Selector
            className="min-w-0 text-[10px]"
            label="Video"
            isLabelHidden
            options={state.stages.filter((item) => item.exists).map((item) => ({value: item.id, label: item.label}))}
            value={stage?.id ?? ''}
            onChange={setStageId}
          />
        )}
        <span className="text-right text-[10px] text-[#626b76]">{state.composition.width} × {state.composition.height}</span>
      </div>
      {mode === 'player' ? (
        <div className="grid min-h-0 place-items-center bg-[radial-gradient(circle,#181c22,#090b0e_68%)] p-[18px]">
          {stage?.url ? (
            stage.kind === 'still' || stage.path.endsWith('.png') ? <img className="block aspect-video max-h-full max-w-full bg-black object-contain shadow-[0_14px_45px_#000b]" src={stage.url} /> : (
              <video className="block aspect-video max-h-full max-w-full bg-black object-contain shadow-[0_14px_45px_#000b]" ref={videoRef} src={stage.url} onTimeUpdate={(event) => onPlayheadChange(Math.round(event.currentTarget.currentTime * state.composition.fps))} onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} onEnded={() => setPlaying(false)} />
            )
          ) : <div className="grid h-full place-items-center text-xs text-[#68717d]">No rendered preview</div>}
        </div>
      ) : (
        <div className="flex items-center gap-3.5 overflow-x-auto bg-[#0c0f13] px-[22px] py-7">
          {state.scenes.map((scene, index) => {
            const asset = sceneAssets.get(scene.id);
            return (
              <button className={`basis-[220px] grow-0 cursor-pointer rounded-lg border p-2 text-left ${sceneId === scene.id ? 'border-[#d68b46] shadow-[0_0_0_1px_#d68b463d]' : 'border-[#252b33] bg-[#14181e]'}`} onClick={() => selectScene(scene.id)} key={scene.id}>
                <div className="grid aspect-video place-items-center overflow-hidden rounded bg-gradient-to-br from-[#272d35] to-[#12151a] font-serif text-[28px] font-bold text-[#606a77]">{asset?.kind === 'image' ? <img className="h-full w-full object-cover" src={asset.url} /> : <span>{String(index + 1).padStart(2, '0')}</span>}</div>
                <strong className="mt-2 inline-block text-[11px]">{scene.id}</strong>
                <small className="float-right mt-2 text-[#737c87]">{(scene.durationInFrames / state.composition.fps).toFixed(1)}s</small>
              </button>
            );
          })}
        </div>
      )}
      <div className="flex items-center justify-center gap-2 border-t border-[#20242b] bg-[#0b0e12] px-3.5 text-[10px] text-[#737c87]">
        <Button label="Previous scene" variant="ghost" size="sm" isIconOnly icon={<span>◀</span>} isDisabled={selectedIndex <= 0} onClick={() => selectScene(state.scenes[selectedIndex - 1].id)} />
        <Button label={playing ? 'Pause' : 'Play'} variant="primary" size="sm" isIconOnly icon={<span>{playing ? 'Ⅱ' : '▶'}</span>} isDisabled={!isVideo || mode !== 'player'} onClick={togglePlayback} />
        <Button label="Next scene" variant="ghost" size="sm" isIconOnly icon={<span>▶</span>} isDisabled={selectedIndex < 0 || selectedIndex >= state.scenes.length - 1} onClick={() => selectScene(state.scenes[selectedIndex + 1].id)} />
        <span>{selectedScene ? formatTime(selectedScene.startFrame, state.composition.fps) : '00:00.00'} / {formatTime(state.composition.durationInFrames, state.composition.fps)}</span>
      </div>
    </section>
  );
};
