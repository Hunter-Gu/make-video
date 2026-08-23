import type {CSSProperties, ReactNode} from 'react';
import {AbsoluteFill, Img, interpolate, useCurrentFrame} from 'remotion';
import type {ProjectState, SceneContent} from '@make-video/contracts';

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

const SceneContentView = ({content, progress, assetUrl}: {content: SceneContent | undefined; progress: number; assetUrl: string | null}) => {
  const title = content?.title;
  if (content?.type === 'quote') return <AbsoluteFill style={{alignItems: 'center', justifyContent: 'center', padding: '10%', textAlign: 'center'}}><div style={{color: '#d7a84b', fontSize: 'clamp(42px, 8vw, 120px)', lineHeight: .7}}>“</div><div style={{fontSize: 'clamp(22px, 4vw, 58px)', lineHeight: 1.3}}>{content.quote}</div><div style={{marginTop: 20, color: '#b7ad9e', fontFamily: 'Arial, sans-serif', fontSize: 'clamp(11px, 1.5vw, 22px)'}}>{content.attribution}</div></AbsoluteFill>;
  if (content?.type === 'comparison') return <AbsoluteFill style={{justifyContent: 'center', padding: '8%'}}><h1 style={{margin: 0, fontSize: 'clamp(24px, 4vw, 58px)', textAlign: 'center'}}>{title}</h1><div style={{display: 'flex', gap: 16, marginTop: 28}}>{[content.left, content.right].map((item) => <div key={item?.label} style={{flex: 1, padding: 22, border: '1px solid #d7a84b88', background: '#ffffff0a'}}><strong style={{color: '#d7a84b', fontSize: 'clamp(14px, 2vw, 28px)'}}>{item?.label}</strong><p style={{color: '#b7ad9e', fontFamily: 'Arial, sans-serif', fontSize: 'clamp(11px, 1.3vw, 19px)', lineHeight: 1.45}}>{item?.detail}</p></div>)}</div></AbsoluteFill>;
  if (content?.type === 'timeline') return <AbsoluteFill style={{justifyContent: 'center', padding: '8%'}}><h1 style={{margin: 0, fontSize: 'clamp(24px, 4vw, 58px)'}}>{title}</h1><div style={{display: 'flex', gap: 12, marginTop: 34, borderTop: '3px solid #d7a84b', paddingTop: 18}}>{(content.events ?? []).map((event, index) => <div key={event.label} style={{flex: 1, opacity: interpolate(progress, [index / Math.max(content.events?.length ?? 1, 1), 1], [0, 1], {extrapolateLeft: 'clamp'}), transform: `translateY(${(1 - progress) * 18}px)`}}><strong style={{color: '#d7a84b', fontFamily: 'Arial, sans-serif', fontSize: 'clamp(11px, 1.3vw, 18px)'}}>{event.label}</strong><p style={{marginTop: 8, color: '#b7ad9e', fontFamily: 'Arial, sans-serif', fontSize: 'clamp(10px, 1.1vw, 16px)', lineHeight: 1.4}}>{event.detail}</p></div>)}</div></AbsoluteFill>;
  if (content?.type === 'chart') return <AbsoluteFill style={{justifyContent: 'center', padding: '8%'}}><h1 style={{margin: 0, fontSize: 'clamp(24px, 4vw, 58px)'}}>{title}</h1><div style={{display: 'flex', alignItems: 'end', gap: 18, height: '48%', marginTop: 24}}>{(content.items ?? []).map((item) => <div key={item.label} style={{display: 'flex', flex: 1, height: '100%', flexDirection: 'column', justifyContent: 'end', textAlign: 'center'}}><strong style={{fontFamily: 'Arial, sans-serif', fontSize: 12}}>{item.value}</strong><div style={{height: `${Math.max(item.value * progress * .9, 2)}%`, minHeight: 3, background: '#d7a84b'}} /><small style={{marginTop: 8, color: '#b7ad9e', fontFamily: 'Arial, sans-serif'}}>{item.label}</small></div>)}</div></AbsoluteFill>;
  if (content?.type === 'statistic') return <AbsoluteFill style={{alignItems: 'center', justifyContent: 'center', textAlign: 'center'}}><div style={{color: '#d7a84b', fontSize: 'clamp(50px, 10vw, 150px)', lineHeight: 1}}>{content.value}</div><div style={{marginTop: 20, fontSize: 'clamp(20px, 3vw, 44px)'}}>{content.label}</div><div style={{marginTop: 10, color: '#b7ad9e', fontFamily: 'Arial, sans-serif'}}>{content.subtitle}</div></AbsoluteFill>;
  if (content?.type === 'map') return <AbsoluteFill style={{padding: '8%'}}><h1 style={{margin: 0, fontSize: 'clamp(24px, 4vw, 58px)'}}>{title}</h1><svg viewBox="0 0 100 55" style={{width: '100%', flex: 1, marginTop: 10}}><rect width="100" height="55" rx="3" fill="#142131" stroke="#35475d" /><polyline points={(content.points ?? []).map((point) => `${point.x},${point.y}`).join(' ')} fill="none" stroke="#d7a84b" strokeWidth="1" strokeDasharray="1" strokeDashoffset={1 - progress} pathLength="1" />{(content.points ?? []).map((point) => <g key={point.label}><circle cx={point.x} cy={point.y} r="1.4" fill="#d7a84b" /><text x={point.x + 2} y={point.y - 1} fill="#f4ead7" fontSize="3">{point.label}</text></g>)}</svg></AbsoluteFill>;
  if (content?.type === 'document') return <AbsoluteFill style={{alignItems: 'center', justifyContent: 'center', padding: '8%'}}><div style={{width: '75%', padding: '6%', background: '#e8dcc1', color: '#29231b', boxShadow: '0 20px 60px #0008', transform: `scale(${.94 + progress * .06})`}}><h1 style={{margin: 0, borderBottom: '2px solid #8f8068', paddingBottom: 12, fontSize: 'clamp(20px, 3vw, 42px)'}}>{title}</h1><p style={{fontSize: 'clamp(14px, 2vw, 28px)', lineHeight: 1.55}}>{content.documentText}</p><small style={{color: '#6d604e'}}>{content.attribution}</small></div></AbsoluteFill>;
  if (content?.type === 'relationship') return <AbsoluteFill style={{alignItems: 'center', justifyContent: 'center', padding: '8%', textAlign: 'center'}}><h1 style={{margin: 0, fontSize: 'clamp(24px, 4vw, 58px)'}}>{title}</h1><div style={{display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: 14, marginTop: 38}}>{[...new Set((content.relations ?? []).flatMap((relation) => [relation.from, relation.to]))].map((name) => <div key={name} style={{padding: '12px 20px', border: '2px solid #d7a84b', borderRadius: 40, fontFamily: 'Arial, sans-serif', fontSize: 'clamp(11px, 1.5vw, 22px)'}}>{name}</div>)}</div><p style={{color: '#b7ad9e', fontFamily: 'Arial, sans-serif', fontSize: 'clamp(10px, 1.2vw, 17px)'}}>{(content.relations ?? []).map((relation) => `${relation.from} → ${relation.to}`).join(' · ')}</p></AbsoluteFill>;
  if (content?.type === 'montage' && assetUrl) return <AbsoluteFill style={{display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, padding: '6%'}}>{(content.images ?? [assetUrl, assetUrl, assetUrl, assetUrl]).slice(0, 4).map((_, index) => <Img key={index} src={assetUrl} style={{width: '100%', height: '100%', objectFit: 'cover', opacity: interpolate(progress, [index * .12, 1], [0, 1], {extrapolateLeft: 'clamp'})}} />)}<div style={{position: 'absolute', left: '9%', top: '9%', fontSize: 'clamp(24px, 4vw, 58px)', textShadow: '0 3px 15px #000'}}>{title}</div></AbsoluteFill>;
  return <AbsoluteFill style={{justifyContent: 'center', padding: '8%'}}><div style={{fontSize: 'clamp(28px, 5vw, 76px)', lineHeight: 1.08, maxWidth: '70%'}}>{title}</div>{content?.subtitle ? <div style={{maxWidth: '60%', marginTop: 20, color: '#b7ad9e', fontFamily: 'Arial, sans-serif', fontSize: 'clamp(12px, 1.6vw, 24px)', lineHeight: 1.45}}>{content.subtitle}</div> : null}</AbsoluteFill>;
};

export const ProjectComposition = ({state}: {state: ProjectState}) => {
  const frame = useCurrentFrame();
  const scene = state.scenes.find((item) => frame >= item.startFrame && frame < item.endFrame) ?? state.scenes.at(-1);
  const asset = scene ? state.assets.find((item) => item.sceneId === scene.id && item.kind === 'image') ?? state.assets.find((item) => item.kind === 'image') : null;
  const caption = state.captions.find((item) => frame >= item.startFrame && frame < item.endFrame);
  const effect = scene ? timelineEffectForScene(state.effects, scene.id, frame) : null;
  const localFrame = scene ? frame - scene.startFrame : 0;
  const progress = scene ? interpolate(localFrame, [0, Math.max(scene.durationInFrames, 1)], [0, 1], {extrapolateRight: 'clamp'}) : 0;
  const sceneEffect = scene ? state.effects.find((item) => item.sceneId === scene.id) ?? null : null;
  return <TimelineEffectFrame effects={state.effects} sceneId={scene?.id ?? ''} globalStartFrame={0}>
    <AbsoluteFill style={{background: '#090d14', color: '#f4ead7', fontFamily: 'Georgia, serif'}}>
      {asset?.url ? <Img src={asset.url} style={{width: '100%', height: '100%', objectFit: 'cover', transform: timelineImageTransform(frame, sceneEffect, progress)}} /> : null}
      {scene?.content?.type === 'image' || scene?.content?.type === 'chapter' || scene?.content?.type === 'portrait' || scene?.content?.type === 'depth' || scene?.content?.type === 'video' ? <AbsoluteFill style={{background: 'linear-gradient(90deg, rgba(8,12,18,.94), rgba(8,12,18,.35) 65%, rgba(8,12,18,.1))'}} /> : null}
      <SceneContentView content={scene?.content} progress={progress} assetUrl={asset?.url ?? null} />
      {effect ? <div style={{position: 'absolute', left: '8%', top: '8%', color: '#d7a84b', fontFamily: 'Arial, sans-serif', fontSize: 'clamp(10px, 1.2vw, 18px)', letterSpacing: 2}}>{effect.label}</div> : null}
      {caption ? <div style={{position: 'absolute', left: '9%', right: '9%', bottom: '5%', padding: '10px 18px', borderRadius: 8, background: '#05080db8', textAlign: 'center', fontFamily: 'Arial, sans-serif', fontSize: 'clamp(13px, 1.8vw, 30px)', lineHeight: 1.35}}>{caption.text}</div> : null}
    </AbsoluteFill>
  </TimelineEffectFrame>;
};
