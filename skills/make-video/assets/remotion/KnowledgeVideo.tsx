import type {CSSProperties, ReactNode} from "react";
import {
  AbsoluteFill,
  Img,
  Sequence,
  interpolate,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";

export type KnowledgeScene = {
  id: string;
  type: "chapter" | "image" | "quote" | "timeline" | "comparison";
  durationInFrames: number;
  title?: string;
  subtitle?: string;
  narration?: string;
  image?: string;
  quote?: string;
  attribution?: string;
  events?: Array<{label: string; detail: string}>;
  left?: {label: string; detail: string};
  right?: {label: string; detail: string};
};

export type KnowledgeVideoSpec = {
  title: string;
  palette: {
    background: string;
    foreground: string;
    muted: string;
    accent: string;
  };
  scenes: KnowledgeScene[];
};

const base: CSSProperties = {
  fontFamily: "Georgia, 'Times New Roman', serif",
  color: "var(--foreground)",
};

const Enter = ({children}: {children: ReactNode}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const progress = spring({frame, fps, config: {damping: 18, stiffness: 90}});
  return (
    <div style={{opacity: progress, transform: `translateY(${(1 - progress) * 36}px)`}}>
      {children}
    </div>
  );
};

const ChapterScene = ({scene}: {scene: KnowledgeScene}) => (
  <AbsoluteFill style={{justifyContent: "center", padding: 150}}>
    <Enter>
      <div style={{color: "var(--accent)", fontSize: 26, letterSpacing: 8, marginBottom: 28}}>
        {scene.subtitle}
      </div>
      <div style={{fontSize: 104, lineHeight: 1.02, maxWidth: 1450}}>{scene.title}</div>
    </Enter>
  </AbsoluteFill>
);

const ImageScene = ({scene}: {scene: KnowledgeScene}) => {
  const frame = useCurrentFrame();
  const scale = interpolate(frame, [0, scene.durationInFrames], [1.02, 1.12], {
    extrapolateRight: "clamp",
  });
  return (
    <AbsoluteFill>
      {scene.image ? (
        <Img
          src={staticFile(scene.image)}
          style={{width: "100%", height: "100%", objectFit: "cover", transform: `scale(${scale})`}}
        />
      ) : null}
      <AbsoluteFill style={{background: "linear-gradient(90deg, rgba(8,12,18,.94) 0%, rgba(8,12,18,.42) 58%, transparent 100%)"}} />
      <AbsoluteFill style={{justifyContent: "center", padding: 140}}>
        <Enter>
          <div style={{fontSize: 76, maxWidth: 850, lineHeight: 1.08}}>{scene.title}</div>
          <div style={{fontSize: 34, color: "var(--muted)", maxWidth: 760, marginTop: 30, lineHeight: 1.45}}>
            {scene.subtitle}
          </div>
        </Enter>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

const QuoteScene = ({scene}: {scene: KnowledgeScene}) => (
  <AbsoluteFill style={{justifyContent: "center", alignItems: "center", padding: 180}}>
    <Enter>
      <div style={{color: "var(--accent)", fontSize: 120, height: 85}}>“</div>
      <div style={{fontSize: 64, lineHeight: 1.32, maxWidth: 1350, textAlign: "center"}}>{scene.quote}</div>
      <div style={{fontSize: 28, color: "var(--muted)", textAlign: "center", marginTop: 42}}>
        {scene.attribution}
      </div>
    </Enter>
  </AbsoluteFill>
);

const TimelineScene = ({scene}: {scene: KnowledgeScene}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const events = scene.events ?? [];
  return (
    <AbsoluteFill style={{justifyContent: "center", padding: 130}}>
      <div style={{fontSize: 66, marginBottom: 80}}>{scene.title}</div>
      <div style={{display: "flex", position: "relative", gap: 44}}>
        <div style={{position: "absolute", height: 5, left: 20, right: 20, top: 18, background: "var(--accent)"}} />
        {events.map((event, index) => {
          const progress = spring({frame: frame - index * 12, fps, config: {damping: 16}});
          return (
            <div key={event.label} style={{flex: 1, opacity: progress, transform: `translateY(${(1 - progress) * 24}px)`}}>
              <div style={{width: 40, height: 40, borderRadius: 20, background: "var(--accent)", marginBottom: 28}} />
              <div style={{fontSize: 38}}>{event.label}</div>
              <div style={{fontSize: 25, color: "var(--muted)", marginTop: 14, lineHeight: 1.35}}>{event.detail}</div>
            </div>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};

const ComparisonScene = ({scene}: {scene: KnowledgeScene}) => (
  <AbsoluteFill style={{justifyContent: "center", padding: 130}}>
    <Enter>
      <div style={{fontSize: 64, textAlign: "center", marginBottom: 60}}>{scene.title}</div>
      <div style={{display: "flex", gap: 34}}>
        {[scene.left, scene.right].map((item) => (
          <div key={item?.label} style={{flex: 1, minHeight: 330, padding: 54, border: "1px solid color-mix(in srgb, var(--accent) 48%, transparent)", background: "rgba(255,255,255,.04)"}}>
            <div style={{fontSize: 42, color: "var(--accent)"}}>{item?.label}</div>
            <div style={{fontSize: 29, color: "var(--muted)", lineHeight: 1.5, marginTop: 28}}>{item?.detail}</div>
          </div>
        ))}
      </div>
    </Enter>
  </AbsoluteFill>
);

const Scene = ({scene}: {scene: KnowledgeScene}) => {
  if (scene.type === "chapter") return <ChapterScene scene={scene} />;
  if (scene.type === "image") return <ImageScene scene={scene} />;
  if (scene.type === "quote") return <QuoteScene scene={scene} />;
  if (scene.type === "timeline") return <TimelineScene scene={scene} />;
  return <ComparisonScene scene={scene} />;
};

const Caption = ({text}: {text?: string}) =>
  text ? (
    <div style={{position: "absolute", left: 180, right: 180, bottom: 54, textAlign: "center", fontFamily: "Arial, sans-serif", fontSize: 30, lineHeight: 1.35, textShadow: "0 2px 10px #000", zIndex: 10}}>
      {text}
    </div>
  ) : null;

export const KnowledgeVideo = ({spec}: {spec: KnowledgeVideoSpec}) => {
  let start = 0;
  return (
    <AbsoluteFill
      style={{
        ...base,
        "--background": spec.palette.background,
        "--foreground": spec.palette.foreground,
        "--muted": spec.palette.muted,
        "--accent": spec.palette.accent,
        background: "var(--background)",
      } as CSSProperties}
    >
      {spec.scenes.map((scene) => {
        const from = start;
        start += scene.durationInFrames;
        return (
          <Sequence key={scene.id} from={from} durationInFrames={scene.durationInFrames} premountFor={30}>
            <Scene scene={scene} />
            <Caption text={scene.narration} />
          </Sequence>
        );
      })}
    </AbsoluteFill>
  );
};
