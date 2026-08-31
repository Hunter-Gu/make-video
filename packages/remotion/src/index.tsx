import type {CSSProperties, ReactNode} from 'react';
import {AbsoluteFill, Audio, Easing, Img, OffthreadVideo, interpolate, useCurrentFrame} from 'remotion';
import type {ProjectState, SceneContent} from '@make-video/contracts';
import type {Asset} from '@make-video/contracts';

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

const stringParameter = (effect: TimelineEffect | null, key: string, fallback: string) => {
  const value = effect?.parameters?.[key];
  return typeof value === 'string' && value.length > 0 ? value : fallback;
};

export const timelineEffectProgress = (frame: number, effect: TimelineEffect | null) => effect
  ? interpolate(frame, [effect.startFrame, effect.endFrame], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'})
  : 0;

export const activeTimelineEffects = (effects: TimelineEffect[], sceneId: string, frame: number) =>
  effects.filter((effect) => effect.sceneId === sceneId && frame >= effect.startFrame && frame < effect.endFrame);

export const timelineEffectForScene = (effects: TimelineEffect[], sceneId: string, frame: number) =>
  activeTimelineEffects(effects, sceneId, frame)[0] ?? null;

const sceneEffect = (effects: TimelineEffect[], sceneId: string, predicate: (effect: TimelineEffect) => boolean) =>
  effects.find((effect) => effect.sceneId === sceneId && predicate(effect)) ?? null;

export const timelineMotionEffectForScene = (effects: TimelineEffect[], sceneId: string) => sceneEffect(effects, sceneId, (effect) => {
  const parameters = effect.parameters ?? {};
  return ['zoomFrom', 'zoomTo', 'xFrom', 'xTo', 'yFrom', 'yTo'].some((key) => typeof parameters[key] === 'number');
}) ?? sceneEffect(effects, sceneId, () => true);

export const timelineTransitionEffectForScene = (effects: TimelineEffect[], sceneId: string) =>
  sceneEffect(effects, sceneId, (effect) => typeof effect.parameters?.transition === 'string');

export const timelineImageTransform = (frame: number, effect: TimelineEffect | null, fallbackProgress: number, fallbackFrom = 1.01, fallbackTo = 1.05) => {
  const rawProgress = effect ? timelineEffectProgress(frame, effect) : fallbackProgress;
  const duration = effect ? Math.max(effect.endFrame - effect.startFrame, 1) : 1;
  const holdIn = effect ? Math.max(0, numberParameter(effect, 'holdInFrames', 0)) / duration : 0;
  const holdOut = effect ? Math.max(0, numberParameter(effect, 'holdOutFrames', 0)) / duration : 0;
  const progress = interpolate(rawProgress, [Math.min(holdIn, .45), Math.max(1 - holdOut, .55)], [0, 1], {
    easing: Easing.inOut(Easing.cubic),
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const from = numberParameter(effect, 'zoomFrom', fallbackFrom);
  const to = numberParameter(effect, 'zoomTo', fallbackTo);
  const x = interpolate(progress, [0, 1], [numberParameter(effect, 'xFrom', 0), numberParameter(effect, 'xTo', 0)]);
  const y = interpolate(progress, [0, 1], [numberParameter(effect, 'yFrom', 0), numberParameter(effect, 'yTo', 0)]);
  return `translate3d(${x}px, ${y}px, 0) scale(${interpolate(progress, [0, 1], [from, to])})`;
};

const transitionStyle = (kind: string, progress: number): CSSProperties => {
  if (kind === 'dissolve') return {opacity: progress};
  if (kind === 'wipe-left') return {clipPath: `inset(0 ${100 - progress * 100}% 0 0)`};
  if (kind === 'wipe-right') return {clipPath: `inset(0 0 0 ${100 - progress * 100}%)`};
  if (kind === 'slide-left') return {transform: `translate3d(${(1 - progress) * 100}%, 0, 0)`};
  return {};
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
  const activeEffects = activeTimelineEffects(effects, sceneId, frame);
  const titleEffect = sceneEffect(effects, sceneId, (effect) => effect.type === 'title-reveal');
  const titleProgress = titleEffect ? timelineEffectProgress(frame, titleEffect) : 1;
  return <AbsoluteFill style={{opacity: titleProgress, transform: `translateY(${(1 - titleProgress) * 28}px)`}}>
    {children}
    {activeEffects.map((effect) => <Overlay key={effect.id} effect={effect} progress={timelineEffectProgress(frame, effect)} />)}
  </AbsoluteFill>;
};

type AssetReference = {url: string; kind: Asset['kind']};

const MediaLayer = ({reference, style, content}: {reference: AssetReference | null; style?: CSSProperties; content?: SceneContent}) => {
  if (!reference) return null;
  if (reference.kind === 'video') return <OffthreadVideo src={reference.url} muted={content?.videoMuted ?? true} volume={content?.videoVolume ?? 1} playbackRate={content?.videoPlaybackRate ?? 1} style={style} />;
  return <Img src={reference.url} style={style} />;
};

const SceneContentView = ({content, progress, assetUrl, assetReferences}: {content: SceneContent | undefined; progress: number; assetUrl: string | null; assetReferences: Map<string, AssetReference>}) => {
  const resolveReference = (value: string | undefined): AssetReference | null => {
    if (!value) return null;
    return assetReferences.get(value) ?? (value.startsWith('/') || value.startsWith('http') ? {url: value, kind: 'image'} : null);
  };
  const montageReferences = (content?.images ?? []).map(resolveReference).filter((reference): reference is AssetReference => reference !== null);
  const layerReferences = (content?.layers ?? []).map((layer) => ({layer, reference: resolveReference(layer.assetId ?? layer.video ?? layer.image)})).filter((item): item is {layer: NonNullable<SceneContent['layers']>[number]; reference: AssetReference} => item.reference !== null);
  const title = content?.title;
  if (content?.type === 'quote') return <AbsoluteFill style={{alignItems: 'center', justifyContent: 'center', padding: '10%', textAlign: 'center'}}><div style={{color: '#d7a84b', fontSize: 'clamp(42px, 8vw, 120px)', lineHeight: .7}}>“</div><div style={{fontSize: 'clamp(22px, 4vw, 58px)', lineHeight: 1.3}}>{content.quote}</div><div style={{marginTop: 20, color: '#b7ad9e', fontFamily: 'Arial, sans-serif', fontSize: 'clamp(11px, 1.5vw, 22px)'}}>{content.attribution}</div></AbsoluteFill>;
  if (content?.type === 'comparison') return <AbsoluteFill style={{justifyContent: 'center', padding: '8%'}}><h1 style={{margin: 0, fontSize: 'clamp(24px, 4vw, 58px)', textAlign: 'center'}}>{title}</h1><div style={{display: 'flex', gap: 16, marginTop: 28}}>{[content.left, content.right].map((item) => <div key={item?.label} style={{flex: 1, padding: 22, border: '1px solid #d7a84b88', background: '#ffffff0a'}}><strong style={{color: '#d7a84b', fontSize: 'clamp(14px, 2vw, 28px)'}}>{item?.label}</strong><p style={{color: '#b7ad9e', fontFamily: 'Arial, sans-serif', fontSize: 'clamp(11px, 1.3vw, 19px)', lineHeight: 1.45}}>{item?.detail}</p></div>)}</div></AbsoluteFill>;
  if (content?.type === 'timeline') return <AbsoluteFill style={{justifyContent: 'center', padding: '8%'}}><h1 style={{margin: 0, fontSize: 'clamp(24px, 4vw, 58px)'}}>{title}</h1><div style={{display: 'flex', gap: 12, marginTop: 34, borderTop: '3px solid #d7a84b', paddingTop: 18}}>{(content.events ?? []).map((event, index) => <div key={event.label} style={{flex: 1, opacity: interpolate(progress, [index / Math.max(content.events?.length ?? 1, 1), 1], [0, 1], {extrapolateLeft: 'clamp'}), transform: `translateY(${(1 - progress) * 18}px)`}}><strong style={{color: '#d7a84b', fontFamily: 'Arial, sans-serif', fontSize: 'clamp(11px, 1.3vw, 18px)'}}>{event.label}</strong><p style={{marginTop: 8, color: '#b7ad9e', fontFamily: 'Arial, sans-serif', fontSize: 'clamp(10px, 1.1vw, 16px)', lineHeight: 1.4}}>{event.detail}</p></div>)}</div></AbsoluteFill>;
  if (content?.type === 'chart') return <AbsoluteFill style={{justifyContent: 'center', padding: '8%'}}><h1 style={{margin: 0, fontSize: 'clamp(24px, 4vw, 58px)'}}>{title}</h1><div style={{display: 'flex', alignItems: 'end', gap: 18, height: '48%', marginTop: 24}}>{(content.items ?? []).map((item) => <div key={item.label} style={{display: 'flex', flex: 1, height: '100%', flexDirection: 'column', justifyContent: 'end', textAlign: 'center'}}><strong style={{fontFamily: 'Arial, sans-serif', fontSize: 12}}>{item.value}</strong><div style={{height: `${Math.max(item.value * progress * .9, 2)}%`, minHeight: 3, background: '#d7a84b'}} /><small style={{marginTop: 8, color: '#b7ad9e', fontFamily: 'Arial, sans-serif'}}>{item.label}</small></div>)}</div></AbsoluteFill>;
  if (content?.type === 'statistic') return <AbsoluteFill style={{alignItems: 'center', justifyContent: 'center', textAlign: 'center'}}><div style={{color: '#d7a84b', fontSize: 'clamp(50px, 10vw, 150px)', lineHeight: 1}}>{content.value}</div><div style={{marginTop: 20, fontSize: 'clamp(20px, 3vw, 44px)'}}>{content.label}</div><div style={{marginTop: 10, color: '#b7ad9e', fontFamily: 'Arial, sans-serif'}}>{content.subtitle}</div></AbsoluteFill>;
  if (content?.type === 'map') return <AbsoluteFill style={{padding: '8%'}}><h1 style={{margin: 0, fontSize: 'clamp(24px, 4vw, 58px)'}}>{title}</h1><svg viewBox="0 0 100 55" style={{width: '100%', flex: 1, marginTop: 10}}><rect width="100" height="55" rx="3" fill="#142131" stroke="#35475d" /><polyline points={(content.points ?? []).map((point) => `${point.x},${point.y}`).join(' ')} fill="none" stroke="#d7a84b" strokeWidth="1" strokeDasharray="1" strokeDashoffset={1 - progress} pathLength="1" />{(content.points ?? []).map((point) => <g key={point.label}><circle cx={point.x} cy={point.y} r="1.4" fill="#d7a84b" /><text x={point.x + 2} y={point.y - 1} fill="#f4ead7" fontSize="3">{point.label}</text></g>)}</svg></AbsoluteFill>;
  if (content?.type === 'document') return <AbsoluteFill style={{alignItems: 'center', justifyContent: 'center', padding: '8%'}}><div style={{width: '75%', padding: '6%', background: '#e8dcc1', color: '#29231b', boxShadow: '0 20px 60px #0008', transform: `scale(${.94 + progress * .06})`}}><h1 style={{margin: 0, borderBottom: '2px solid #8f8068', paddingBottom: 12, fontSize: 'clamp(20px, 3vw, 42px)'}}>{title}</h1><p style={{fontSize: 'clamp(14px, 2vw, 28px)', lineHeight: 1.55}}>{content.documentText}</p><small style={{color: '#6d604e'}}>{content.attribution}</small></div></AbsoluteFill>;
  if (content?.type === 'relationship') return <AbsoluteFill style={{alignItems: 'center', justifyContent: 'center', padding: '8%', textAlign: 'center'}}><h1 style={{margin: 0, fontSize: 'clamp(24px, 4vw, 58px)'}}>{title}</h1><div style={{display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: 14, marginTop: 38}}>{[...new Set((content.relations ?? []).flatMap((relation) => [relation.from, relation.to]))].map((name) => <div key={name} style={{padding: '12px 20px', border: '2px solid #d7a84b', borderRadius: 40, fontFamily: 'Arial, sans-serif', fontSize: 'clamp(11px, 1.5vw, 22px)'}}>{name}</div>)}</div><p style={{color: '#b7ad9e', fontFamily: 'Arial, sans-serif', fontSize: 'clamp(10px, 1.2vw, 17px)'}}>{(content.relations ?? []).map((relation) => `${relation.from} → ${relation.to}`).join(' · ')}</p></AbsoluteFill>;
  if (content?.type === 'montage' && (montageReferences.length > 0 || assetUrl)) {
    const references = montageReferences.length > 0 ? montageReferences : Array.from({length: 4}, () => ({url: assetUrl as string, kind: 'image' as const}));
    return <AbsoluteFill style={{display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, padding: '6%'}}>{references.slice(0, 4).map((reference, index) => <MediaLayer key={`${reference.url}-${index}`} reference={reference} style={{width: '100%', height: '100%', objectFit: 'cover', opacity: interpolate(progress, [index * .12, 1], [0, 1], {extrapolateLeft: 'clamp'})}} content={content} />)}<div style={{position: 'absolute', left: '9%', top: '9%', fontSize: 'clamp(24px, 4vw, 58px)', textShadow: '0 3px 15px #000'}}>{title}</div></AbsoluteFill>;
  }
  if (content?.type === 'depth' && layerReferences.length > 0) return <AbsoluteFill style={{overflow: 'hidden'}}>{layerReferences.map(({layer, reference}, index) => { const depth = layer.depth ?? index; const shift = (depth + .25) * 55; return <MediaLayer key={`${reference.url}-${index}`} reference={reference} content={content} style={{position: 'absolute', inset: '-8%', width: '116%', height: '116%', objectFit: 'cover', opacity: layer.opacity ?? 1, clipPath: layer.mask, transform: `translate(${(layer.x ?? 0) + shift * progress}px, ${(layer.y ?? 0) - shift * .35 * progress}px) scale(${layer.scale ?? 1})`, filter: `blur(${Math.abs(depth - progress) * 5}px)`}} />; })}<AbsoluteFill style={{background: 'linear-gradient(0deg, #080c12bb, transparent 60%)'}} /><div style={{position: 'absolute', left: '9%', bottom: '10%', fontSize: 'clamp(24px, 4vw, 58px)'}}>{title}</div></AbsoluteFill>;
  return <AbsoluteFill style={{justifyContent: 'center', padding: '8%'}}><div style={{fontSize: 'clamp(28px, 5vw, 76px)', lineHeight: 1.08, maxWidth: '70%'}}>{title}</div>{content?.subtitle ? <div style={{maxWidth: '60%', marginTop: 20, color: '#b7ad9e', fontFamily: 'Arial, sans-serif', fontSize: 'clamp(12px, 1.6vw, 24px)', lineHeight: 1.45}}>{content.subtitle}</div> : null}</AbsoluteFill>;
};

export const ProjectComposition = ({state}: {state: ProjectState}) => {
  const frame = useCurrentFrame();
  const sceneIndex = state.scenes.findIndex((item) => frame >= item.startFrame && frame < item.endFrame);
  const scene = sceneIndex >= 0 ? state.scenes[sceneIndex] : null;
  const sceneAssets = scene ? state.assets.filter((item) => item.sceneId === scene.id && item.selected) : [];
  const asset = sceneAssets.find((item) => item.kind === 'image') ?? null;
  const videoAsset = sceneAssets.find((item) => item.kind === 'video') ?? null;
  const assetReferences = new Map<string, AssetReference>();
  for (const item of state.assets) {
    assetReferences.set(item.id, {url: item.url, kind: item.kind});
    assetReferences.set(item.path, {url: item.url, kind: item.kind});
  }
  const caption = state.captions.find((item) => frame >= item.startFrame && frame < item.endFrame);
  const localFrame = scene ? frame - scene.startFrame : 0;
  const progress = scene ? interpolate(localFrame, [0, Math.max(scene.durationInFrames, 1)], [0, 1], {extrapolateRight: 'clamp'}) : 0;
  const motionEffect = scene ? timelineMotionEffectForScene(state.effects, scene.id) : null;
  const transitionEffect = scene ? timelineTransitionEffectForScene(state.effects, scene.id) : null;
  const audioTracks = [state.audio.voiceover, state.audio.music, ...state.audio.sfx].filter((track) => track.exists && track.url);
  const previousScene = sceneIndex > 0 ? state.scenes[sceneIndex - 1] : null;
  const previousAsset = previousScene ? state.assets.find((item) => item.sceneId === previousScene.id && item.selected && item.kind === 'image') ?? null : null;
  const previousEffect = previousScene ? timelineMotionEffectForScene(state.effects, previousScene.id) : null;
  const transitionKind = sceneIndex > 0 ? stringParameter(transitionEffect, 'transition', 'cut') : 'cut';
  const transitionFrames = Math.max(1, numberParameter(transitionEffect, 'transitionFrames', 15));
  const transitionProgress = transitionKind !== 'cut' && scene
    ? interpolate(frame - scene.startFrame, [0, transitionFrames], [0, 1], {easing: Easing.inOut(Easing.cubic), extrapolateLeft: 'clamp', extrapolateRight: 'clamp'})
    : 1;
  return <AbsoluteFill style={{background: '#090d14'}}>
    {previousAsset && previousScene && transitionProgress < 1 ? <Img src={previousAsset.url} style={{width: '100%', height: '100%', objectFit: 'cover', objectPosition: previousScene.content?.imagePosition ?? 'center', transform: timelineImageTransform(previousScene.endFrame, previousEffect, 1)}} /> : null}
    <AbsoluteFill style={transitionStyle(transitionKind, transitionProgress)}>
      <TimelineEffectFrame effects={state.effects} sceneId={scene?.id ?? ''} globalStartFrame={0}>
        <AbsoluteFill style={{background: '#090d14', color: '#f4ead7', fontFamily: 'Georgia, serif'}}>
          {videoAsset?.url ? <OffthreadVideo src={videoAsset.url} trimBefore={scene?.content?.videoStartInFrames ?? 0} playbackRate={scene?.content?.videoPlaybackRate ?? 1} muted={scene?.content?.videoMuted ?? true} volume={scene?.content?.videoVolume ?? 1} style={{width: '100%', height: '100%', objectFit: scene?.content?.videoFit ?? 'cover'}} /> : asset?.url ? <Img src={asset.url} style={{width: '100%', height: '100%', objectFit: 'cover', transform: timelineImageTransform(frame, motionEffect, progress)}} /> : null}
          {scene?.content?.type === 'image' || scene?.content?.type === 'chapter' || scene?.content?.type === 'portrait' || scene?.content?.type === 'depth' || scene?.content?.type === 'video' ? <AbsoluteFill style={{background: 'linear-gradient(90deg, rgba(8,12,18,.94), rgba(8,12,18,.35) 65%, rgba(8,12,18,.1))'}} /> : null}
          <SceneContentView content={scene?.content} progress={progress} assetUrl={asset?.url ?? null} assetReferences={assetReferences} />
          {caption ? <div style={{position: 'absolute', left: '9%', right: '9%', bottom: '5%', padding: '10px 18px', borderRadius: 8, background: '#05080db8', textAlign: 'center', fontFamily: 'Arial, sans-serif', fontSize: 'clamp(13px, 1.8vw, 30px)', lineHeight: 1.35}}>{caption.text}</div> : null}
        </AbsoluteFill>
      </TimelineEffectFrame>
    </AbsoluteFill>
    {audioTracks.map((track) => <Audio key={track.id} src={track.url as string} />)}
  </AbsoluteFill>;
};
