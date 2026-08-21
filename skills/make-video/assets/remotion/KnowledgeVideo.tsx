import type {CSSProperties, ReactNode} from "react";
import {
  AbsoluteFill,
  Img,
  OffthreadVideo,
  Sequence,
  interpolate,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";

export type KnowledgeScene = {
  id: string;
  type: "chapter" | "image" | "portrait" | "depth" | "video" | "quote" | "timeline" | "comparison" | "statistic" | "chart" | "map" | "document" | "relationship" | "montage";
  durationInFrames: number;
  title?: string;
  subtitle?: string;
  narration?: string;
  captionStartInFrames?: number;
  captionEndInFrames?: number;
  image?: string;
  imagePosition?: string;
  panX?: number;
  panY?: number;
  zoomFrom?: number;
  zoomTo?: number;
  archival?: boolean;
  layers?: Array<{image: string; depth: number; x?: number; y?: number; scale?: number; mask?: string; opacity?: number}>;
  focus?: {fromDepth: number; toDepth: number};
  video?: string;
  videoFit?: "cover" | "contain";
  videoStartInFrames?: number;
  videoPlaybackRate?: number;
  videoMuted?: boolean;
  videoVolume?: number;
  quote?: string;
  attribution?: string;
  events?: Array<{label: string; detail: string}>;
  left?: {label: string; detail: string};
  right?: {label: string; detail: string};
  value?: string;
  label?: string;
  items?: Array<{label: string; value: number; detail?: string}>;
  points?: Array<{label: string; x: number; y: number}>;
  documentText?: string;
  relations?: Array<{from: string; to: string; label?: string}>;
  images?: string[];
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
  const scale = interpolate(frame, [0, scene.durationInFrames], [scene.zoomFrom ?? 1.02, scene.zoomTo ?? 1.12], {
    extrapolateRight: "clamp",
  });
  const x = interpolate(frame, [0, scene.durationInFrames], [0, scene.panX ?? 0]);
  const y = interpolate(frame, [0, scene.durationInFrames], [0, scene.panY ?? 0]);
  return (
    <AbsoluteFill>
      {scene.image ? (
        <Img
          src={staticFile(scene.image)}
          style={{width: "100%", height: "100%", objectFit: "cover", objectPosition: scene.imagePosition ?? "center", transform: `translate(${x}px, ${y}px) scale(${scale})`, filter: scene.archival ? "sepia(.3) saturate(.72) contrast(1.08)" : undefined}}
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

const PortraitScene = ({scene}: {scene: KnowledgeScene}) => {
  const frame = useCurrentFrame();
  const reveal = interpolate(frame, [0, 35], [0, 100], {extrapolateRight: "clamp"});
  return <AbsoluteFill style={{alignItems: "center", justifyContent: "center"}}>
    {scene.image ? <Img src={staticFile(scene.image)} style={{width: "62%", height: "86%", objectFit: "cover", objectPosition: scene.imagePosition ?? "center", clipPath: `inset(${100 - reveal}% 0 0 0 round 400px 400px 40px 40px)`, filter: "drop-shadow(0 30px 60px #0009)"}} /> : null}
    <div style={{position: "absolute", left: 120, bottom: 110, fontSize: 68}}>{scene.title}</div>
  </AbsoluteFill>;
};

const DepthScene = ({scene}: {scene: KnowledgeScene}) => {
  const frame = useCurrentFrame();
  const progress = interpolate(frame, [0, scene.durationInFrames], [0, 1], {extrapolateRight: "clamp"});
  const focusDepth = interpolate(progress, [0, 1], [scene.focus?.fromDepth ?? 0, scene.focus?.toDepth ?? 1]);
  return <AbsoluteFill style={{overflow: "hidden"}}>
    {(scene.layers ?? []).map((layer, index) => {
      const shift = (layer.depth + .25) * 55;
      return <Img key={`${layer.image}-${index}`} src={staticFile(layer.image)} style={{position: "absolute", inset: "-8%", width: "116%", height: "116%", objectFit: "cover", opacity: layer.opacity ?? 1, clipPath: layer.mask, transform: `translate(${(layer.x ?? 0) + shift * progress}px, ${(layer.y ?? 0) - shift * .35 * progress}px) scale(${layer.scale ?? 1})`, filter: `blur(${Math.abs(layer.depth - focusDepth) * 5}px)`}} />;
    })}
    <AbsoluteFill style={{background: "linear-gradient(0deg, #080c12bb, transparent 60%)"}} />
    <div style={{position: "absolute", left: 130, bottom: 110, fontSize: 64}}>{scene.title}</div>
  </AbsoluteFill>;
};

const VideoScene = ({scene}: {scene: KnowledgeScene}) => (
  <AbsoluteFill style={{background: "#000"}}>
    {scene.video ? (
      <OffthreadVideo
        src={staticFile(scene.video)}
        trimBefore={scene.videoStartInFrames ?? 0}
        playbackRate={scene.videoPlaybackRate ?? 1}
        muted={scene.videoMuted ?? true}
        volume={scene.videoVolume ?? 1}
        style={{width: "100%", height: "100%", objectFit: scene.videoFit ?? "cover"}}
      />
    ) : null}
    {scene.title || scene.subtitle ? (
      <AbsoluteFill style={{justifyContent: "end", padding: "120px 140px", background: "linear-gradient(0deg, #080c12cc, transparent 55%)"}}>
        <Enter>
          <div style={{fontSize: 62}}>{scene.title}</div>
          <div style={{fontSize: 30, color: "var(--muted)", marginTop: 18}}>{scene.subtitle}</div>
        </Enter>
      </AbsoluteFill>
    ) : null}
  </AbsoluteFill>
);

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

const StatisticScene = ({scene}: {scene: KnowledgeScene}) => (
  <AbsoluteFill style={{justifyContent: "center", alignItems: "center", padding: 150}}><Enter>
    <div style={{fontSize: 190, color: "var(--accent)", lineHeight: 1}}>{scene.value}</div>
    <div style={{fontSize: 48, marginTop: 30, textAlign: "center"}}>{scene.label}</div>
    <div style={{fontSize: 28, color: "var(--muted)", marginTop: 24}}>{scene.subtitle}</div>
  </Enter></AbsoluteFill>
);

const ChartScene = ({scene}: {scene: KnowledgeScene}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const items = scene.items ?? [];
  const max = Math.max(...items.map((item) => item.value), 1);
  return <AbsoluteFill style={{justifyContent: "center", padding: 130}}>
    <div style={{fontSize: 64, marginBottom: 55}}>{scene.title}</div>
    <div style={{display: "flex", height: 500, alignItems: "end", gap: 34}}>{items.map((item, index) => {
      const progress = spring({frame: frame - index * 8, fps, config: {damping: 18}});
      return <div key={item.label} style={{flex: 1, textAlign: "center"}}>
        <div style={{fontSize: 28, marginBottom: 12}}>{item.value}</div>
        <div style={{height: `${(item.value / max) * 360 * progress}px`, background: "var(--accent)", minHeight: 2}} />
        <div style={{fontSize: 24, color: "var(--muted)", marginTop: 16}}>{item.label}</div>
      </div>;
    })}</div>
  </AbsoluteFill>;
};

const MapScene = ({scene}: {scene: KnowledgeScene}) => {
  const frame = useCurrentFrame();
  const progress = interpolate(frame, [10, scene.durationInFrames - 25], [0, 1], {extrapolateLeft: "clamp", extrapolateRight: "clamp"});
  const points = scene.points ?? [];
  const path = points.map((point) => `${point.x},${point.y}`).join(" ");
  return <AbsoluteFill style={{padding: 120}}><div style={{fontSize: 62}}>{scene.title}</div>
    <svg viewBox="0 0 100 55" style={{width: "100%", flex: 1, marginTop: 20}}>
      <rect width="100" height="55" rx="3" fill="#142131" stroke="#35475d" />
      <polyline points={path} fill="none" stroke="var(--accent)" strokeWidth="1" pathLength="1" strokeDasharray="1" strokeDashoffset={1 - progress} />
      {points.map((point, index) => <g key={point.label} opacity={progress * points.length >= index ? 1 : .25}>
        <circle cx={point.x} cy={point.y} r="1.4" fill="var(--accent)" />
        <text x={point.x + 2} y={point.y - 1} fill="var(--foreground)" fontSize="3">{point.label}</text>
      </g>)}
    </svg></AbsoluteFill>;
};

const DocumentScene = ({scene}: {scene: KnowledgeScene}) => {
  const frame = useCurrentFrame();
  const scale = interpolate(frame, [0, scene.durationInFrames], [1, 1.08]);
  return <AbsoluteFill style={{justifyContent: "center", alignItems: "center", padding: 110}}>
    <div style={{width: 1120, minHeight: 610, padding: 75, background: "#e8dcc1", color: "#29231b", boxShadow: "0 30px 90px #0008", transform: `scale(${scale})`}}>
      <div style={{fontSize: 38, borderBottom: "2px solid #8f8068", paddingBottom: 22}}>{scene.title}</div>
      <div style={{fontSize: 34, lineHeight: 1.7, marginTop: 48}}>{scene.documentText}</div>
      <div style={{fontSize: 23, marginTop: 42, color: "#6d604e"}}>{scene.attribution}</div>
    </div>
  </AbsoluteFill>;
};

const RelationshipScene = ({scene}: {scene: KnowledgeScene}) => {
  const names = [...new Set((scene.relations ?? []).flatMap((relation) => [relation.from, relation.to]))];
  return <AbsoluteFill style={{justifyContent: "center", padding: 120}}><div style={{fontSize: 62, marginBottom: 60}}>{scene.title}</div>
    <div style={{display: "flex", flexWrap: "wrap", justifyContent: "center", gap: 34}}>{names.map((name) => <div key={name} style={{padding: "28px 44px", border: "2px solid var(--accent)", borderRadius: 60, fontSize: 30}}>{name}</div>)}</div>
    <div style={{marginTop: 55, textAlign: "center", color: "var(--muted)", fontSize: 26}}>{(scene.relations ?? []).map((relation) => `${relation.from} → ${relation.to}${relation.label ? ` (${relation.label})` : ""}`).join("  ·  ")}</div>
  </AbsoluteFill>;
};

const MontageScene = ({scene}: {scene: KnowledgeScene}) => {
  const frame = useCurrentFrame();
  return <AbsoluteFill style={{display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 18, padding: 70}}>
    {(scene.images ?? []).slice(0, 4).map((image, index) => <Img key={image} src={staticFile(image)} style={{width: "100%", height: "100%", objectFit: "cover", opacity: interpolate(frame - index * 8, [0, 16], [0, 1], {extrapolateLeft: "clamp", extrapolateRight: "clamp"})}} />)}
    <div style={{position: "absolute", left: 110, top: 90, fontSize: 58, textShadow: "0 3px 15px #000"}}>{scene.title}</div>
  </AbsoluteFill>;
};

const Scene = ({scene}: {scene: KnowledgeScene}) => {
  if (scene.type === "chapter") return <ChapterScene scene={scene} />;
  if (scene.type === "image") return <ImageScene scene={scene} />;
  if (scene.type === "portrait") return <PortraitScene scene={scene} />;
  if (scene.type === "depth") return <DepthScene scene={scene} />;
  if (scene.type === "video") return <VideoScene scene={scene} />;
  if (scene.type === "quote") return <QuoteScene scene={scene} />;
  if (scene.type === "timeline") return <TimelineScene scene={scene} />;
  if (scene.type === "comparison") return <ComparisonScene scene={scene} />;
  if (scene.type === "statistic") return <StatisticScene scene={scene} />;
  if (scene.type === "chart") return <ChartScene scene={scene} />;
  if (scene.type === "map") return <MapScene scene={scene} />;
  if (scene.type === "document") return <DocumentScene scene={scene} />;
  if (scene.type === "relationship") return <RelationshipScene scene={scene} />;
  if (scene.type === "montage") return <MontageScene scene={scene} />;
  return <ImageScene scene={scene} />;
};

const Caption = ({text, start = 0, end = Infinity}: {text?: string; start?: number; end?: number}) => {
  const frame = useCurrentFrame();
  return text && frame >= start && frame < end ? (
    <div style={{position: "absolute", left: 180, right: 180, bottom: 54, textAlign: "center", fontFamily: "Arial, sans-serif", fontSize: 30, lineHeight: 1.35, textShadow: "0 2px 10px #000", zIndex: 10}}>
      {text}
    </div>
  ) : null;
};

export const KnowledgeVideo = ({spec, showCaptions = true, sceneOverrides = {}}: {spec: KnowledgeVideoSpec; showCaptions?: boolean; sceneOverrides?: Record<string, Partial<KnowledgeScene>>}) => {
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
      {spec.scenes.map((originalScene) => {
        const scene = {...originalScene, ...sceneOverrides[originalScene.id]};
        const from = start;
        start += scene.durationInFrames;
        return (
          <Sequence key={scene.id} from={from} durationInFrames={scene.durationInFrames} premountFor={30}>
            <Scene scene={scene} />
            <Caption text={showCaptions ? scene.narration : undefined} start={scene.captionStartInFrames} end={scene.captionEndInFrames} />
          </Sequence>
        );
      })}
    </AbsoluteFill>
  );
};
