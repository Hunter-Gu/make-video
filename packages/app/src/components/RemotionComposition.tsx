import {AbsoluteFill, Img, interpolate, useCurrentFrame} from 'remotion';
import type {ProjectState} from '@make-video/contracts';
import type {CSSProperties} from 'react';

type Effect = ProjectState['effects'][number];

const parameterNumber = (effect: Effect | null, key: string, fallback: number) => {
  const value = effect?.parameters?.[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
};

const effectProgress = (frame: number, effect: Effect | null) => effect
  ? interpolate(frame, [effect.startFrame, effect.endFrame], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'})
  : 0;

// Keep the Player's motion driven by the same timeline metadata as rendering.
const EffectOverlay = ({effect, progress}: {effect: Effect | null; progress: number}) => {
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
    const width = `${progress * 100}%`;
    return <div style={{...common, inset: 'auto 8% 14%', height: 3, width, background: '#d7a84b', boxShadow: '0 0 18px #d7a84b99'}} />;
  }
  if (effect.type === 'document-reveal') {
    return <div style={{...common, inset: '12% 16%', opacity: 1 - progress, transform: `rotate(${parameterNumber(effect, 'rotation', -1.5) * (1 - progress)}deg)`, border: '1px solid #e8dcc1aa', background: '#e8dcc122'}} />;
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

export const RemotionComposition = ({state}: {state: ProjectState}) => {
  const frame = useCurrentFrame();
  const scene = state.scenes.find((item) => frame >= item.startFrame && frame < item.endFrame) ?? state.scenes.at(-1);
  const asset = scene ? state.assets.find((item) => item.sceneId === scene.id && item.kind === 'image') : null;
  const caption = state.captions.find((item) => frame >= item.startFrame && frame < item.endFrame);
  const sceneEffect = scene ? state.effects.find((item) => item.sceneId === scene.id) ?? null : null;
  const effect = scene ? state.effects.find((item) => item.sceneId === scene.id && frame >= item.startFrame && frame < item.endFrame) ?? sceneEffect : null;
  const localFrame = scene ? frame - scene.startFrame : 0;
  const progress = scene ? interpolate(localFrame, [0, Math.max(scene.durationInFrames, 1)], [0, 1], {extrapolateRight: 'clamp'}) : 0;
  const motionProgress = effectProgress(frame, sceneEffect);
  const zoomFrom = parameterNumber(sceneEffect, 'zoomFrom', 1.03);
  const zoomTo = parameterNumber(sceneEffect, 'zoomTo', 1.11);
  const titleProgress = sceneEffect?.type === 'title-reveal' ? effectProgress(frame, sceneEffect) : progress;

  return (
    <AbsoluteFill style={{background: '#090d14', color: '#f4ead7', fontFamily: 'Georgia, serif'}}>
      {asset?.url ? <Img src={asset.url} style={{width: '100%', height: '100%', objectFit: 'cover', transform: `scale(${interpolate(motionProgress, [0, 1], [zoomFrom, zoomTo])})`}} /> : null}
      <AbsoluteFill style={{background: 'linear-gradient(90deg, rgba(8,12,18,.94), rgba(8,12,18,.35) 65%, rgba(8,12,18,.1))'}} />
      <AbsoluteFill style={{justifyContent: 'center', padding: '8%', opacity: titleProgress, transform: `translateY(${(1 - titleProgress) * 28}px)`}}>
        <div style={{fontSize: 'clamp(28px, 5vw, 76px)', lineHeight: 1.08, maxWidth: '62%'}}>{scene?.id ?? 'No scene selected'}</div>
        {effect ? <div style={{marginTop: 24, color: '#d7a84b', fontFamily: 'Arial, sans-serif', fontSize: 'clamp(12px, 1.3vw, 22px)', letterSpacing: 2}}>{effect.label}</div> : null}
      </AbsoluteFill>
      <EffectOverlay effect={effect} progress={effectProgress(frame, effect)} />
      {caption ? <div style={{position: 'absolute', left: '9%', right: '9%', bottom: '5%', padding: '10px 18px', borderRadius: 8, background: '#05080db8', textAlign: 'center', fontFamily: 'Arial, sans-serif', fontSize: 'clamp(13px, 1.8vw, 30px)', lineHeight: 1.35}}>{caption.text}</div> : null}
    </AbsoluteFill>
  );
};
