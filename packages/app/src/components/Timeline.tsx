import {useState} from 'react';
import type {Caption, ProjectState, RemotionEffect} from '@make-video/contracts';
import {formatTime} from '../lib/format-time';

type TimelineProps = {state: ProjectState; sceneId: string | null; selectScene: (id: string) => void};

export const Timeline = ({state, sceneId, selectScene}: TimelineProps) => {
  const total = state.composition.durationInFrames;
  const [zoom, setZoom] = useState(100);
  const current = state.scenes.find((item) => item.id === sceneId);
  const playhead = current ? (current.startFrame / total) * 100 : 0;
  const canvasWidth = Math.round((1600 * zoom) / 100);
  const setSafeZoom = (value: number) => setZoom(Math.max(50, Math.min(250, value)));

  return (
    <section className="timeline-panel">
      <div className="timeline-header">
        <strong>Timeline</strong>
        <div>
          <button onClick={() => setSafeZoom(zoom - 25)}>−</button>
          <input aria-label="Timeline zoom" type="range" min="50" max="250" value={zoom} onChange={(event) => setSafeZoom(Number(event.target.value))} />
          <button onClick={() => setSafeZoom(zoom + 25)}>＋</button>
          <span>{zoom}%</span>
        </div>
      </div>
      <div className="timeline-scroll">
        <div className="timeline-canvas" style={{width: canvasWidth}}>
          <div className="time-ruler">
            <span>00:00</span><span>{formatTime(total / 4, state.composition.fps)}</span><span>{formatTime(total / 2, state.composition.fps)}</span><span>{formatTime(total * 0.75, state.composition.fps)}</span><span>{formatTime(total, state.composition.fps)}</span>
          </div>
          <div className="playhead" style={{left: `calc(92px + (100% - 104px) * ${playhead / 100})`}}><i /></div>
          <div className="timeline-track">
            <label>Visual</label>
            <div>{state.scenes.map((scene) => <button className={`visual ${sceneId === scene.id ? 'selected' : ''}`} style={{width: `${(scene.durationInFrames / total) * 100}%`}} onClick={() => selectScene(scene.id)} key={scene.id}><span>{scene.id}</span></button>)}</div>
          </div>
          <EffectTrack effects={state.effects} total={total} selectScene={selectScene} />
          <AbsoluteTrack label="Voice" className="voice" captions={state.captions} total={total} selectScene={selectScene} />
          <AbsoluteTrack label="Captions" className="caption" captions={state.captions} total={total} selectScene={selectScene} />
        </div>
      </div>
    </section>
  );
};

const AbsoluteTrack = ({label, className, captions, total, selectScene}: {label: string; className: string; captions: Caption[]; total: number; selectScene: (id: string) => void}) => (
  <div className="timeline-track absolute-track">
    <label>{label}</label>
    <div>{captions.map((caption) => <button className={className} style={{left: `${(caption.startFrame / total) * 100}%`, width: `${((caption.endFrame - caption.startFrame) / total) * 100}%`}} onClick={() => selectScene(caption.sceneId ?? caption.id)} key={caption.id}><span>{className === 'voice' ? `VO · ${caption.id}` : caption.text}</span></button>)}</div>
  </div>
);

const EffectTrack = ({effects, total, selectScene}: {effects: RemotionEffect[]; total: number; selectScene: (id: string) => void}) => (
  <div className="timeline-track absolute-track effect-track">
    <label>Remotion FX</label>
    <div>{effects.map((effect) => <button className={`effect effect-${effectKind(effect.type)}`} style={{left: `${(effect.startFrame / total) * 100}%`, width: `${((effect.endFrame - effect.startFrame) / total) * 100}%`}} onClick={() => selectScene(effect.sceneId)} title={`${effect.label} · ${effect.type}\n${JSON.stringify(effect.parameters ?? {})}`} key={effect.id}><i /><span>{effect.label}</span></button>)}</div>
  </div>
);

const effectKind = (type: string) => type.includes('video') || type.includes('montage') ? 'media' : type.includes('depth') || type.includes('zoom') || type.includes('burns') ? 'camera' : type.includes('draw') || type.includes('route') || type.includes('network') ? 'draw' : 'reveal';
