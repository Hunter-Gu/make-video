import {useCallback, useEffect, useRef, useState} from 'react';
import {Button} from '@astryxdesign/core/Button';
import {Slider} from '@astryxdesign/core/Slider';
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
  onRangeChange: (selection: TimelineSelection, range: Range) => Promise<void>;
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
  const seekFromClientX = useCallback((clientX: number, element: HTMLElement | null) => {
    if (!element) return;
    const rect = element.getBoundingClientRect();
    onSeek(Math.round(Math.max(0, Math.min(1, (clientX - rect.left) / rect.width)) * total));
  }, [onSeek, total]);

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
        void onRangeChange({type: resizing.type, id: resizing.id} as TimelineSelection, resizing.current).finally(() => {
          setRangeOverrides((value) => {
            const next = {...value};
            delete next[resizing.key];
            return next;
          });
        });
      }
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    return () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); };
  }, [onRangeChange, seekFromClientX, total]);

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
    <section className="grid min-h-0 grid-rows-[38px_1fr] border-t border-[#2a2f37] bg-[#0d1014]">
      <div className="flex items-center justify-between border-b border-[#20242a] px-3.5 text-[11px]">
        <strong>Timeline</strong>
        <div className="flex items-center gap-[5px]">
          <Button label="Zoom out" variant="ghost" size="sm" isIconOnly icon={<span>−</span>} onClick={() => setSafeZoom(zoom - 25)} />
          <Slider label="Timeline zoom" isLabelHidden min={50} max={250} value={zoom} onChange={setSafeZoom} valueDisplay="none" width={100} />
          <Button label="Zoom in" variant="ghost" size="sm" isIconOnly icon={<span>＋</span>} onClick={() => setSafeZoom(zoom + 25)} />
          <span className="w-[38px] text-right text-[9px] text-[#737c87]">{zoom}%</span>
        </div>
      </div>
      <div className="min-h-0 overflow-auto [overscroll-behavior-x:contain] [scrollbar-color:#59616c_#171b20]">
        <div className="relative min-w-[1100px] cursor-crosshair select-none px-3 pb-3" style={{width: canvasWidth}} onPointerDown={beginSeek}>
          <div className="ml-20 flex h-[27px] cursor-crosshair items-center justify-between border-b border-[#252a31] text-[8px] text-[#59626d]" ref={rulerRef} onPointerDown={(event) => { event.stopPropagation(); beginSeek(event); }}>
            <span>00:00</span><span>{formatTime(total / 4, state.composition.fps)}</span><span>{formatTime(total / 2, state.composition.fps)}</span><span>{formatTime(total * 0.75, state.composition.fps)}</span><span>{formatTime(total, state.composition.fps)}</span>
          </div>
          <div className="absolute bottom-3 top-[27px] z-20 w-0.5 cursor-ew-resize bg-[#e09a57] shadow-[0_0_8px_#e09a5799]" style={{left: `calc(92px + (100% - 104px) * ${Math.max(0, Math.min(total, playheadFrame)) / total})`}} onPointerDown={(event) => { event.stopPropagation(); beginSeek(event); }} role="slider" aria-label="Playhead" aria-valuemin={0} aria-valuemax={total} aria-valuenow={playheadFrame} tabIndex={0}><i className="absolute -left-1.5 -top-1 h-0 w-0 border-x-[7px] border-t-[8px] border-x-transparent border-t-[#e09a57]" /></div>
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
  <div className="grid h-[51px] grid-cols-[80px_1fr] border-b border-[#1c2026]">
    <label className="px-2.5 py-[17px] text-[9px] text-[#747d88]">{label}</label>
    <div className="relative flex gap-0.5 py-[5px]">
      {items.map((item) => <TimelineBlock key={item.id} item={item} type={type} className={className} total={total} selected={selection?.type === type && selection.id === item.id} onSelect={onSelect} onResize={onResize} resizable={resizable} />)}
    </div>
  </div>
);

const EffectTrack = ({effects, total, selection, onSelect, onResize, rangeFor}: {effects: RemotionEffect[]; total: number; selection: TimelineSelection | null; onSelect: (selection: TimelineSelection) => void; onResize: (event: React.PointerEvent, type: TimelineSelection['type'], id: string, edge: 'start' | 'end', range: Range) => void; rangeFor: (type: TimelineSelection['type'], id: string, fallback: Range) => Range}) => (
  <div className="grid h-[51px] grid-cols-[80px_1fr] border-b border-[#1c2026]">
    <label className="px-2.5 py-[17px] text-[9px] text-[#747d88]">Remotion FX</label>
    <div className="relative flex gap-0.5 py-[5px]">{effects.map((effect) => <TimelineBlock key={effect.id} item={{id: effect.id, label: effect.label, range: rangeFor('effect', effect.id, effect)}} type="effect" className={effectKind(effect.type)} total={total} selected={selection?.type === 'effect' && selection.id === effect.id} onSelect={onSelect} onResize={onResize} />)}</div>
  </div>
);

const TimelineBlock = ({item, type, className, total, selected, onSelect, onResize, resizable = true}: {item: {id: string; label: string; range: Range}; type: TimelineSelection['type']; className: string; total: number; selected: boolean; onSelect: (selection: TimelineSelection) => void; onResize: (event: React.PointerEvent, type: TimelineSelection['type'], id: string, edge: 'start' | 'end', range: Range) => void; resizable?: boolean}) => (
  <button className={`${timelineBlockClass(type, className, selected)} absolute min-w-6 cursor-pointer overflow-hidden rounded border p-[5px] text-left text-[8px] ${selected ? 'bg-[#5b412a] outline outline-1 outline-[#e09a57]' : ''}`} style={{left: `${(item.range.startFrame / total) * 100}%`, width: `${((item.range.endFrame - item.range.startFrame) / total) * 100}%`}} onPointerDown={(event) => event.stopPropagation()} onClick={() => onSelect({type, id: item.id} as TimelineSelection)} title={item.label}>
    {resizable && <span className="absolute left-0 top-0 z-10 h-full w-2 cursor-ew-resize opacity-0 hover:bg-[#ffffff33]" aria-label="Resize start" onClick={(event) => event.stopPropagation()} onPointerDown={(event) => onResize(event, type, item.id, 'start', item.range)} />}
    <span className="block overflow-hidden text-ellipsis whitespace-nowrap">{item.label}</span>
    {resizable && <span className="absolute right-0 top-0 z-10 h-full w-2 cursor-ew-resize opacity-0 hover:bg-[#ffffff33]" aria-label="Resize end" onClick={(event) => event.stopPropagation()} onPointerDown={(event) => onResize(event, type, item.id, 'end', item.range)} />}
  </button>
);

const rangeKey = (type: TimelineSelection['type'], id: string) => `${type === 'voice' ? 'caption' : type}:${id}`;
const effectKind = (type: string) => type.includes('video') || type.includes('montage') ? 'media' : type.includes('depth') || type.includes('zoom') || type.includes('burns') ? 'camera' : type.includes('draw') || type.includes('route') || type.includes('network') ? 'draw' : 'reveal';
const timelineBlockClass = (type: TimelineSelection['type'], kind: string, _selected: boolean) => {
  if (type === 'voice') return 'border-[#604970] bg-[#40324b] text-[#b8c1ca] [top:7px] h-[26px]';
  if (type === 'caption') return 'border-[#765e3c] bg-[#51412d] text-[#b8c1ca] [top:10px] h-5';
  if (type === 'music') return 'border-[#6e6c38] bg-[#4d4a28] text-[#b8c1ca] [top:7px] h-[26px]';
  if (type === 'effect') return ({camera: 'border-[#3c7882] bg-[#244b53]', draw: 'border-[#3e7b5e] bg-[#28513f]', media: 'border-[#79527b] bg-[#4d354f]', reveal: 'border-[#566d9a] bg-[#384663]'}[kind] ?? 'border-[#386677] bg-[#234453]') + ' flex items-center gap-[5px] px-1.5 py-1 [top:7px]';
  return 'border-[#3b4853] bg-[#29333c] text-[#b8c1ca] [top:5px] h-10';
};
