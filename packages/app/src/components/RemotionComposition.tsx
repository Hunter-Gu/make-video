import {AbsoluteFill, Img, interpolate, useCurrentFrame} from 'remotion';
import type {ProjectState} from '@make-video/contracts';
import {TimelineEffectFrame, timelineEffectForScene, timelineImageTransform} from '@make-video/remotion';

export const RemotionComposition = ({state}: {state: ProjectState}) => {
  const frame = useCurrentFrame();
  const scene = state.scenes.find((item) => frame >= item.startFrame && frame < item.endFrame) ?? state.scenes.at(-1);
  const asset = scene ? state.assets.find((item) => item.sceneId === scene.id && item.kind === 'image') : null;
  const caption = state.captions.find((item) => frame >= item.startFrame && frame < item.endFrame);
  const sceneEffect = scene ? state.effects.find((item) => item.sceneId === scene.id) ?? null : null;
  const effect = scene ? timelineEffectForScene(state.effects, scene.id, frame) : null;
  const localFrame = scene ? frame - scene.startFrame : 0;
  const progress = scene ? interpolate(localFrame, [0, Math.max(scene.durationInFrames, 1)], [0, 1], {extrapolateRight: 'clamp'}) : 0;

  return (
    <TimelineEffectFrame effects={state.effects} sceneId={scene?.id ?? ''} globalStartFrame={0}>
      <AbsoluteFill style={{background: '#090d14', color: '#f4ead7', fontFamily: 'Georgia, serif'}}>
        {asset?.url ? <Img src={asset.url} style={{width: '100%', height: '100%', objectFit: 'cover', transform: timelineImageTransform(frame, sceneEffect, progress)}} /> : null}
        <AbsoluteFill style={{background: 'linear-gradient(90deg, rgba(8,12,18,.94), rgba(8,12,18,.35) 65%, rgba(8,12,18,.1))'}} />
        <AbsoluteFill style={{justifyContent: 'center', padding: '8%'}}>
          <div style={{fontSize: 'clamp(28px, 5vw, 76px)', lineHeight: 1.08, maxWidth: '62%'}}>{scene?.id ?? 'No scene selected'}</div>
          {effect ? <div style={{marginTop: 24, color: '#d7a84b', fontFamily: 'Arial, sans-serif', fontSize: 'clamp(12px, 1.3vw, 22px)', letterSpacing: 2}}>{effect.label}</div> : null}
        </AbsoluteFill>
        {caption ? <div style={{position: 'absolute', left: '9%', right: '9%', bottom: '5%', padding: '10px 18px', borderRadius: 8, background: '#05080db8', textAlign: 'center', fontFamily: 'Arial, sans-serif', fontSize: 'clamp(13px, 1.8vw, 30px)', lineHeight: 1.35}}>{caption.text}</div> : null}
      </AbsoluteFill>
    </TimelineEffectFrame>
  );
};
