import {useEffect, useRef, useState} from 'react';
import type {ProjectState, RemotionEffect} from '@make-video/contracts';
import type {TimelineSelection} from '../types';
import {formatTime} from '../lib/format-time';

type Range = {startFrame: number; endFrame: number};
type ResizeState = {key: string; type: TimelineSelection['type']; id: string; edge: 'start' | 'end'; original: Range; current: Range; track: HTMLElement};

type TimelineProps = {
  state: ProjectState;
  selection: TimelineSelection | null;
  playheadFrame: number;
  onSelect: (selection: TimelineSelection) => void;
  onSeek: (frame: number) => void;
  onRangeChange: (selection: TimelineSelection, range: Range) => void;
};

export const Timeline = ({state, selection, playheadFrame, onSelect, onSeek, onRangeChange}: TimelineProps) => {
  const total = state.composition.durationInFrames;
  const [zoom, setZoom] = useState(100);
  const [rangeOverrides, setRangeOverrides] = useState<Record<string, Range>>({});
  const rulerRef = useRef<HTMLDivElement>(null);
  const seekRef = useRef(false);
  const resizeRef = useRef<ResizeState | null>(null);
  const canvasWidth = Math.round((1600 * zoom) / 100);
  const setSafeZoom = (value: number) => setZoom(Math.max(50, Math.min(250, value)));
  const rangeFor = (type: TimelineSelection['type'], id: string, fallback: Range): Range => rangeOverrides[rangeKey(type, id)] ?? fallback;
  const seekFromClientX = (clientX: number, element: HTMLElement | null) => {
    if (!element) return;
    const rect = element.getBoundingClientRect();
    onSeek(Math.round(Math.max(0, Math.min(1, (clientX - rect.left) / rect.width)) * total));
  };

  useEffect(() => {
    const move = (event: PointerEvent) => {
      if (seekRef.current) seekFromClientX(event.clientX, rulerRef.current);
      const resizing = resizeRef.current;
      if (!resizing) return;
      const rect = resizing.track.getBoundingClientRect();
      const frame = Math.round(Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width)) * total);
      const current = resizing.current;
      const next = resizing.edge === 'start'
        ? {startFrame: Math.min(frame, current.endFrame - 1), endFrame: current.endFrame}
        : {startFrame: current.startFrame, endFrame: Math.max(frame, current.startFrame + 1)};
      resizing.current = next;
      setRangeOverrides((value) => ({...value, [resizing.key]: next}));
    };
    const up = () => {
      seekRef.current = false;
      const resizing = resizeRef.current;
      resizeRef.current = null;
      if (resizing && (resizing.current.startFrame !== resizing.original.startFrame || resizing.current.endFrame !== resizing.original.endFrame)) {
        onRangeChange({type: resizing.type, id: resizing.id} as TimelineSelection, resizing.current);
      }
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    return () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); };
  }, [onRangeChange, onSeek, total]);

  const beginSeek = (event: React.PointerEvent) => {
    event.preventDefault();
    seekRef.current = true;
    seekFromClientX(event.clientX, rulerRef.current);
  };

  const beginResize = (event: React.PointerEvent, type: TimelineSelection['type'], id: string, edge: 'start' | 'end', range: Range) => {
    event.preventDefault();
    event.stopPropagation();
    const handle = event.currentTarget as HTMLElement;
    const track = handle.parentElement?.parentElement;
    if (!track) return;
    resizeRef.current = {key: rangeKey(type, id), type, id, edge, original: range, current: range, track};
  };

  return (
    <section className="timeline-panel">
      <div className="timeline-header">
        <strong>Timeline</strong>
        <div>
          <button aria-label="Zoom out" onClick={() => setSafeZoom(zoom - 25)}>−</button>
          <input aria-label="Timeline zoom" type="range" min="50" max="250" value={zoom} onChange={(event) => setSafeZoom(Number(event.target.value))} />
          <button aria-label="Zoom in" onClick={() => setSafeZoom(zoom + 25)}>＋</button>
          <span>{zoom}%</span>
        </div>
      </div>
      <div className="timeline-scroll">
        <div className="timeline-canvas" style={{width: canvasWidth}}>
          <div className="time-ruler" ref={rulerRef} onPointerDown={beginSeek}>
            <span>00:00</span><span>{formatTime(total / 4, state.composition.fps)}</span><span>{formatTime(total / 2, state.composition.fps)}</span><span>{formatTime(total * 0.75, state.composition.fps)}</span><span>{formatTime(total, state.composition.fps)}</span>
          </div>
          <div className="playhead" style={{left: `calc(92px + (100% - 104px) * ${Math.max(0, Math.min(total, playheadFrame)) / total})`}} onPointerDown={beginSeek} role="slider" aria-label="Playhead" aria-valuemin={0} aria-valuemax={total} aria-valuenow={playheadFrame} tabIndex={0}><i /></div>
          <AbsoluteTrack label="Visual" className="visual" total={total} items={state.scenes.map((scene) => ({id: scene.id, label: scene.id, range: rangeFor('scene', scene.id, {startFrame: scene.startFrame, endFrame: scene.endFrame})}))} selection={selection} type="scene" onSelect={onSelect} onResize={beginResize} />
          <EffectTrack effects={state.effects} total={total} selection={selection} onSelect={onSelect} onResize={beginResize} rangeFor={rangeFor} />
          <AbsoluteTrack label="Voice" className="voice" total={total} items={state.captions.map((caption) => ({id: caption.id, label: `VO · ${caption.id}`, range: rangeFor('voice', caption.id, caption)}))} selection={selection} type="voice" onSelect={onSelect} onResize={beginResize} />
          {state.audio.music.exists && <AbsoluteTrack label="Music" className="music" total={total} items={[{id: state.audio.music.id, label: state.audio.music.label, range: {startFrame: 0, endFrame: total}}]} selection={selection} type="music" onSelect={onSelect} onResize={beginResize} resizable={false} />}
          <AbsoluteTrack label="Captions" className="caption" total={total} items={state.captions.map((caption) => ({id: caption.id, label: caption.text, range: rangeFor('caption', caption.id, caption)}))} selection={selection} type="caption" onSelect={onSelect} onResize={beginResize} />
        </div>
      </div>
    </section>
  );
};

const AbsoluteTrack = ({label, className, total, items, selection, type, onSelect, onResize, resizable = true}: {label: string; className: string; total: number; items: Array<{id: string; label: string; range: Range}>; selection: TimelineSelection | null; type: TimelineSelection['type']; onSelect: (selection: TimelineSelection) => void; onResize: (event: React.PointerEvent, type: TimelineSelection['type'], id: string, edge: 'start' | 'end', range: Range) => void; resizable?: boolean}) => (
  <div className="timeline-track absolute-track">
    <label>{label}</label>
    <div>
      {items.map((item) => <TimelineBlock key={item.id} item={item} type={type} className={className} total={total} selected={selection?.type === type && selection.id === item.id} onSelect={onSelect} onResize={onResize} resizable={resizable} />)}
    </div>
  </div>
);

const EffectTrack = ({effects, total, selection, onSelect, onResize, rangeFor}: {effects: RemotionEffect[]; total: number; selection: TimelineSelection | null; onSelect: (selection: TimelineSelection) => void; onResize: (event: React.PointerEvent, type: TimelineSelection['type'], id: string, edge: 'start' | 'end', range: Range) => void; rangeFor: (type: TimelineSelection['type'], id: string, fallback: Range) => Range}) => (
  <div className="timeline-track absolute-track effect-track">
    <label>Remotion FX</label>
    <div>{effects.map((effect) => <TimelineBlock key={effect.id} item={{id: effect.id, label: effect.label, range: rangeFor('effect', effect.id, effect)}} type="effect" className={`effect effect-${effectKind(effect.type)}`} total={total} selected={selection?.type === 'effect' && selection.id === effect.id} onSelect={onSelect} onResize={onResize} />)}</div>
  </div>
);

const TimelineBlock = ({item, type, className, total, selected, onSelect, onResize, resizable = true}: {item: {id: string; label: string; range: Range}; type: TimelineSelection['type']; className: string; total: number; selected: boolean; onSelect: (selection: TimelineSelection) => void; onResize: (event: React.PointerEvent, type: TimelineSelection['type'], id: string, edge: 'start' | 'end', range: Range) => void; resizable?: boolean}) => (
  <button className={`${className} ${selected ? 'selected' : ''}`} style={{left: `${(item.range.startFrame / total) * 100}%`, width: `${((item.range.endFrame - item.range.startFrame) / total) * 100}%`}} onClick={() => onSelect({type, id: item.id} as TimelineSelection)} title={item.label}>
    {resizable && <span className="resize-handle start" aria-label="Resize start" onClick={(event) => event.stopPropagation()} onPointerDown={(event) => onResize(event, type, item.id, 'start', item.range)} />}
    <span className="block-label">{item.label}</span>
    {resizable && <span className="resize-handle end" aria-label="Resize end" onClick={(event) => event.stopPropagation()} onPointerDown={(event) => onResize(event, type, item.id, 'end', item.range)} />}
  </button>
);

const rangeKey = (type: TimelineSelection['type'], id: string) => `${type === 'voice' ? 'caption' : type}:${id}`;
const effectKind = (type: string) => type.includes('video') || type.includes('montage') ? 'media' : type.includes('depth') || type.includes('zoom') || type.includes('burns') ? 'camera' : type.includes('draw') || type.includes('route') || type.includes('network') ? 'draw' : 'reveal';
