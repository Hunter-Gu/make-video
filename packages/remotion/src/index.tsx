import type {CSSProperties, ReactNode} from 'react';
import {AbsoluteFill, interpolate, useCurrentFrame} from 'remotion';

export type TimelineEffect = {
  id: string;
  sceneId: string;
  type: string;
  label: string;
  startFrame: number;
  endFrame: number;
  parameters?: Record<string, unknown>;
};

const numberParameter = (effect: TimelineEffect | null, key: string, fallback: number) => {
  const value = effect?.parameters?.[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
};

export const timelineEffectProgress = (frame: number, effect: TimelineEffect | null) => effect
  ? interpolate(frame, [effect.startFrame, effect.endFrame], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'})
  : 0;

export const timelineEffectForScene = (effects: TimelineEffect[], sceneId: string, frame: number) =>
  effects.find((effect) => effect.sceneId === sceneId && frame >= effect.startFrame && frame < effect.endFrame) ??
  effects.find((effect) => effect.sceneId === sceneId) ?? null;

export const timelineImageTransform = (frame: number, effect: TimelineEffect | null, fallbackProgress: number, fallbackFrom = 1.03, fallbackTo = 1.11) => {
  const progress = effect ? timelineEffectProgress(frame, effect) : fallbackProgress;
  const from = numberParameter(effect, 'zoomFrom', fallbackFrom);
  const to = numberParameter(effect, 'zoomTo', fallbackTo);
  return `scale(${interpolate(progress, [0, 1], [from, to])})`;
};

const Overlay = ({effect, progress}: {effect: TimelineEffect | null; progress: number}) => {
  if (!effect) return null;
  const common: CSSProperties = {position: 'absolute', inset: 0, pointerEvents: 'none'};
  if (effect.type === 'split-reveal') {
    const width = `${(1 - progress) * 50}%`;
    return <>
      <div style={{...common, right: 'auto', width, background: '#090d14'}} />
      <div style={{...common, left: 'auto', width, background: '#090d14'}} />
    </>;
  }
  if (effect.type === 'progressive-reveal') {
    return <div style={{...common, inset: 'auto 8% 14%', height: 3, width: `${progress * 100}%`, background: '#d7a84b', boxShadow: '0 0 18px #d7a84b99'}} />;
  }
  if (effect.type === 'document-reveal') {
    const rotation = numberParameter(effect, 'rotation', -1.5);
    return <div style={{...common, inset: '12% 16%', opacity: 1 - progress, transform: `rotate(${rotation * (1 - progress)}deg)`, border: '1px solid #e8dcc1aa', background: '#e8dcc122'}} />;
  }
  if (effect.type === 'path-draw') {
    return <div style={{...common, inset: '48% 12% auto', height: 2, transformOrigin: 'left', transform: `scaleX(${progress})`, background: '#d7a84b', boxShadow: '0 0 16px #d7a84b'}} />;
  }
  if (effect.type === 'network-draw') {
    return <div style={{...common, inset: '32% 20% 32%', opacity: progress, border: '1px solid #d7a84b88', borderRadius: '50%', transform: `scale(${.8 + progress * .2})`}} />;
  }
  if (effect.type === 'montage') {
    return <div style={{...common, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, padding: '7%', opacity: progress * .8}}><i style={{border: '1px solid #d7a84b88'}} /><i style={{border: '1px solid #d7a84b88'}} /><i style={{border: '1px solid #d7a84b88'}} /><i style={{border: '1px solid #d7a84b88'}} /></div>;
  }
  if (effect.type === 'depth-focus') {
    return <div style={{...common, background: `radial-gradient(circle at 35% 50%, transparent ${24 + progress * 14}%, #090d1466 70%)`}} />;
  }
  return null;
};

export const TimelineEffectFrame = ({children, effects, sceneId, globalStartFrame}: {children: ReactNode; effects: TimelineEffect[]; sceneId: string; globalStartFrame: number}) => {
  const frame = useCurrentFrame() + globalStartFrame;
  const effect = timelineEffectForScene(effects, sceneId, frame);
  const progress = timelineEffectProgress(frame, effect);
  const titleProgress = effect?.type === 'title-reveal' ? progress : 1;
  return <AbsoluteFill style={{opacity: titleProgress, transform: `translateY(${(1 - titleProgress) * 28}px)`}}>
    {children}
    <Overlay effect={effect} progress={progress} />
  </AbsoluteFill>;
};
