import {StrictMode, useEffect, useMemo, useRef, useState} from "react";
import {createRoot} from "react-dom/client";
import {Badge} from "@astryxdesign/core/Badge";
import {Theme} from "@astryxdesign/core/theme";
import {neutralTheme} from "@astryxdesign/theme-neutral/built";
import {mcpTransport} from "./mcp-transport";
import type {Asset, Caption, ProjectState, RemotionEffect, WorkbenchTransport} from "@make-video/contracts";
import "./astryx.css";
import "./styles.css";
import "./editor-overrides.css";

type PreviewMode = "player" | "storyboard";
type InspectorMode = "scene" | "caption" | "image" | "settings";

const Workbench = ({transport}: {transport: WorkbenchTransport}) => {
  const [projects, setProjects] = useState<string[]>([]);
  const [videoId, setVideoId] = useState("");
  const [state, setState] = useState<ProjectState | null>(null);
  const [sceneId, setSceneId] = useState<string | null>(null);
  const [assetId, setAssetId] = useState<string | null>(null);
  const [stageId, setStageId] = useState<string | null>(null);
  const [previewMode, setPreviewMode] = useState<PreviewMode>("player");
  const [inspectorMode, setInspectorMode] = useState<InspectorMode>("scene");
  const [notice, setNotice] = useState("Loading project…");

  const refresh = async (id = videoId) => {
    if (!id) return;
    const next = await transport.getProject(id);
    setState(next);
    setSceneId((value) => next.scenes.some((item) => item.id === value) ? value : next.scenes[0]?.id ?? null);
    setAssetId((value) => next.assets.some((item) => item.id === value) ? value : next.assets[0]?.id ?? null);
    setStageId((value) => next.stages.some((item) => item.id === value && item.exists) ? value : next.stages.find((item) => item.exists && item.kind !== "still" && !item.path.endsWith(".png"))?.id ?? next.stages.find((item) => item.exists)?.id ?? null);
    setNotice("");
  };

  useEffect(() => {
    transport.listProjects().then((items) => {
      setProjects(items);
      setVideoId(items[0] ?? "");
      return refresh(items[0]);
    }).catch((error) => setNotice(error.message));
  }, []);

  if (!state) return <main className="loading">{notice}</main>;
  const scene = state.scenes.find((item) => item.id === sceneId) ?? null;
  const asset = state.assets.find((item) => item.id === assetId) ?? null;
  const stage = state.stages.find((item) => item.id === stageId) ?? null;
  const caption = state.captions.find((item) => item.sceneId === sceneId || item.id === sceneId) ?? null;

  const selectScene = (id: string) => {
    setSceneId(id);
    const linked = state.assets.find((item) => item.sceneId === id);
    if (linked) setAssetId(linked.id);
  };

  return <main className="editor">
    <header className="topbar">
      <div className="brand"><span>MV</span><strong>Make Video</strong></div>
      <select value={videoId} onChange={(event) => {setVideoId(event.target.value); refresh(event.target.value);}}>{projects.map((id) => <option key={id}>{id}</option>)}</select>
      <div />
      <div className="topbar-actions"><Badge className="qa-badge" variant={state.qa?.passed ? "success" : "warning"} label={state.qa?.passed ? "QA passed" : "QA pending"} /><button onClick={() => setInspectorMode("settings")}>Project settings</button><button className="render-button" onClick={() => setPreviewMode("player")}>Render</button></div>
    </header>

    <section className="edit-area">
      <AssetBin state={state} selected={assetId} onSelect={(item) => {setAssetId(item.id); if (item.sceneId) selectScene(item.sceneId); setInspectorMode("image");}} />
      <Preview state={state} mode={previewMode} setMode={setPreviewMode} stage={stage} setStageId={setStageId} sceneId={sceneId} selectScene={selectScene} />
      <Inspector state={state} mode={inspectorMode} setMode={setInspectorMode} scene={scene} caption={caption} asset={asset} transport={transport} refresh={refresh} notice={setNotice} />
    </section>

    <Timeline state={state} sceneId={sceneId} selectScene={selectScene} />
    {notice && <div className="toast">{notice}</div>}
  </main>;
};

const AssetBin = ({state, selected, onSelect}: {state: ProjectState; selected: string | null; onSelect: (asset: Asset) => void}) => {
  const [tab, setTab] = useState<"media" | "renders">("media");
  return <aside className="asset-bin panel">
    <div className="panel-heading"><strong>Project media</strong><button>＋</button></div>
    <div className="mini-tabs"><button className={tab === "media" ? "active" : ""} onClick={() => setTab("media")}>Assets</button><button className={tab === "renders" ? "active" : ""} onClick={() => setTab("renders")}>Outputs</button></div>
    {tab === "media" ? <div className="asset-grid">{state.assets.map((asset) => <button className={selected === asset.id ? "selected" : ""} onClick={() => onSelect(asset)} key={asset.id}>{asset.kind === "image" ? <img src={asset.url} /> : <video src={asset.url} muted />}{state.cover?.assetId === asset.id && <em>Cover</em>}<span>{asset.id}</span><small>{asset.kind}</small></button>)}</div> : <div className="output-list">{state.stages.map((stage) => <div className={stage.exists ? "ready" : ""} key={stage.id}><i /><span>{stage.label}</span><small>{stage.exists ? "Ready" : "Missing"}</small></div>)}</div>}
  </aside>;
};

const Preview = ({state, mode, setMode, stage, setStageId, sceneId, selectScene}: {state: ProjectState; mode: PreviewMode; setMode: (mode: PreviewMode) => void; stage: ProjectState["stages"][number] | null; setStageId: (id: string) => void; sceneId: string | null; selectScene: (id: string) => void}) => {
  const sceneAssets = useMemo(() => new Map(state.assets.filter((item) => item.sceneId).map((item) => [item.sceneId, item])), [state.assets]);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false);
  const selectedIndex = state.scenes.findIndex((scene) => scene.id === sceneId);
  const selectedScene = state.scenes[selectedIndex];
  const isVideo = Boolean(stage?.url && stage.kind !== "still" && !stage.path.endsWith(".png"));
  const togglePlayback = async () => {
    if (!videoRef.current) return;
    if (videoRef.current.paused) await videoRef.current.play(); else videoRef.current.pause();
  };
  return <section className="preview-zone">
    <div className="preview-toolbar"><div className="view-switch"><button className={mode === "player" ? "active" : ""} onClick={() => setMode("player")}>Player</button><button className={mode === "storyboard" ? "active" : ""} onClick={() => setMode("storyboard")}>Storyboard</button></div>{mode === "player" && <select value={stage?.id ?? ""} onChange={(event) => setStageId(event.target.value)}>{state.stages.filter((item) => item.exists).map((item) => <option value={item.id} key={item.id}>{item.label}</option>)}</select>}<span>{state.composition.width} × {state.composition.height}</span></div>
    {mode === "player" ? <div className="player-canvas">{stage?.url ? stage.kind === "still" || stage.path.endsWith(".png") ? <img src={stage.url} /> : <video ref={videoRef} src={stage.url} onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} onEnded={() => setPlaying(false)} /> : <div className="empty">No rendered preview</div>}</div> : <div className="storyboard-strip">{state.scenes.map((scene, index) => {const asset = sceneAssets.get(scene.id); return <button className={sceneId === scene.id ? "selected" : ""} onClick={() => selectScene(scene.id)} key={scene.id}><div>{asset?.kind === "image" ? <img src={asset.url} /> : <span>{String(index + 1).padStart(2, "0")}</span>}</div><strong>{scene.id}</strong><small>{(scene.durationInFrames / state.composition.fps).toFixed(1)}s</small></button>;})}</div>}
    <div className="preview-controls"><button disabled={selectedIndex <= 0} onClick={() => selectScene(state.scenes[selectedIndex - 1].id)}>◀</button><button className="preview-play" disabled={!isVideo || mode !== "player"} onClick={togglePlayback}>{playing ? "Ⅱ" : "▶"}</button><button disabled={selectedIndex < 0 || selectedIndex >= state.scenes.length - 1} onClick={() => selectScene(state.scenes[selectedIndex + 1].id)}>▶</button><span>{selectedScene ? formatTime(selectedScene.startFrame, state.composition.fps) : "00:00.00"} / {formatTime(state.composition.durationInFrames, state.composition.fps)}</span></div>
  </section>;
};

const Inspector = ({state, mode, setMode, scene, caption, asset, transport, refresh, notice}: {state: ProjectState; mode: InspectorMode; setMode: (mode: InspectorMode) => void; scene: ProjectState["scenes"][number] | null; caption: Caption | null; asset: Asset | null; transport: WorkbenchTransport; refresh: () => Promise<void>; notice: (value: string) => void}) => <aside className="inspector panel">
  <div className="inspector-tabs"><button className={mode === "scene" ? "active" : ""} onClick={() => setMode("scene")}>Scene</button><button className={mode === "caption" ? "active" : ""} onClick={() => setMode("caption")}>Caption</button><button className={mode === "image" ? "active" : ""} onClick={() => setMode("image")}>Visual</button><button className={mode === "settings" ? "active" : ""} onClick={() => setMode("settings")}>Settings</button></div>
  {mode === "scene" && <SceneInspector scene={scene} fps={state.composition.fps} effects={state.effects.filter((effect) => effect.sceneId === scene?.id)} />}
  {mode === "caption" && (caption ? <CaptionEditor caption={caption} fps={state.composition.fps} save={async (next) => {try {await transport.updateCaption(state.videoId, next); await refresh(); notice("Caption saved");} catch (error) {notice(error instanceof Error ? error.message : String(error));}}} /> : <div className="empty-state">This scene has no caption.</div>)}
  {mode === "image" && <ImageInspector state={state} asset={asset} transport={transport} refresh={refresh} notice={notice} />}
  {mode === "settings" && <ModelSettings state={state} transport={transport} refresh={refresh} notice={notice} />}
</aside>;

const SceneInspector = ({scene, fps, effects}: {scene: ProjectState["scenes"][number] | null; fps: number; effects: RemotionEffect[]}) => scene ? <div className="inspector-body"><span className="kicker">CURRENT SCENE</span><h2>{scene.id}</h2><dl><dt>Start</dt><dd>{formatTime(scene.startFrame, fps)}</dd><dt>End</dt><dd>{formatTime(scene.endFrame, fps)}</dd><dt>Duration</dt><dd>{(scene.durationInFrames / fps).toFixed(2)}s</dd><dt>Timing</dt><dd>{scene.timingSource}</dd><dt>Assets</dt><dd>{scene.assetIds?.join(", ") || "None"}</dd></dl><div className="effect-summary"><span className="kicker">REMOTION EFFECTS</span>{effects.length ? effects.map((effect) => <div key={effect.id}><i className={`effect-dot effect-${effectKind(effect.type)}`} /><span><strong>{effect.label}</strong><small>{effect.type} · {effect.endFrame - effect.startFrame}f</small></span></div>) : <small>No declared effects</small>}</div></div> : <div className="empty-state">Select a scene.</div>;

const CaptionEditor = ({caption, fps, save}: {caption: Caption; fps: number; save: (caption: Caption) => Promise<void>}) => {
  const [draft, setDraft] = useState(caption);
  useEffect(() => setDraft(caption), [caption]);
  return <div className="inspector-body"><span className="kicker">CAPTION</span><h2>{caption.id}</h2><label>Narration<textarea value={draft.text} onChange={(event) => setDraft({...draft, text: event.target.value})} /></label><div className="two-fields"><label>Start frame<input type="number" value={draft.startFrame} onChange={(event) => setDraft({...draft, startFrame: Number(event.target.value)})} /></label><label>End frame<input type="number" value={draft.endFrame} onChange={(event) => setDraft({...draft, endFrame: Number(event.target.value)})} /></label></div><small>{(draft.startFrame / fps).toFixed(2)}s – {(draft.endFrame / fps).toFixed(2)}s</small><button className="primary" onClick={() => save(draft)}>Save caption</button></div>;
};

const ImageInspector = ({state, asset, transport, refresh, notice}: {state: ProjectState; asset: Asset | null; transport: WorkbenchTransport; refresh: () => Promise<void>; notice: (value: string) => void}) => {
  const [instruction, setInstruction] = useState("");
  const isCover = Boolean(asset && state.cover?.assetId === asset.id);
  return <div className="inspector-body"><span className="kicker">VISUAL</span><h2>{asset?.id ?? "No asset"}</h2>{asset?.kind === "image" && <div className="inspector-image-wrap"><img className="inspector-image" src={asset.url} />{isCover && <em>Current cover</em>}</div>}<button className={`cover-button ${isCover ? "selected" : ""}`} disabled={!asset || asset.kind !== "image" || isCover} onClick={async () => {if (!asset) return; try {await transport.setCover(state.videoId, asset.id); await refresh(); notice("Cover image selected");} catch (error) {notice(error instanceof Error ? error.message : String(error));}}}>{isCover ? "✓ Current cover" : "Set as cover"}</button><label>Revision instruction<textarea value={instruction} onChange={(event) => setInstruction(event.target.value)} placeholder="Describe what should change…" /></label><button className="primary" disabled={!asset || asset.kind !== "image" || !instruction.trim()} onClick={async () => {if (!asset) return; try {await transport.createAssetRevision(state.videoId, {assetId: asset.id, sceneId: asset.sceneId, modelId: state.models.image, instruction}); setInstruction(""); await refresh(); notice("Revision request created");} catch (error) {notice(error instanceof Error ? error.message : String(error));}}}>Request revision</button><small>Cover selection is project state. It does not overwrite a rendered thumbnail.</small></div>;
};

const ModelSettings = ({state, transport, refresh, notice}: {state: ProjectState; transport: WorkbenchTransport; refresh: () => Promise<void>; notice: (value: string) => void}) => {
  const [image, setImage] = useState(state.models.image ?? state.registry.image[0]?.id);
  const [voice, setVoice] = useState(state.models.voice ?? state.registry.voice[0]?.id);
  useEffect(() => {setImage(state.models.image ?? state.registry.image[0]?.id); setVoice(state.models.voice ?? state.registry.voice[0]?.id);}, [state.videoId, state.models.image, state.models.voice]);
  return <div className="inspector-body"><span className="kicker">PROJECT SETTINGS</span><h2>Generation models</h2><label>Image model<select value={image} onChange={(event) => setImage(event.target.value)}>{state.registry.image.map((item) => <option value={item.id} key={item.id}>{item.label}</option>)}</select></label><label>Voice model<select value={voice} onChange={(event) => setVoice(event.target.value)}>{state.registry.voice.map((item) => <option value={item.id} key={item.id}>{item.label}</option>)}</select></label><button className="primary" onClick={async () => {try {await transport.updateModels(state.videoId, {image, voice}); await refresh(); notice("Project settings saved");} catch (error) {notice(error instanceof Error ? error.message : String(error));}}}>Save settings</button><small>Saving configuration does not start generation.</small></div>;
};

const Timeline = ({state, sceneId, selectScene}: {state: ProjectState; sceneId: string | null; selectScene: (id: string) => void}) => {
  const total = state.composition.durationInFrames;
  const [zoom, setZoom] = useState(100);
  const current = state.scenes.find((item) => item.id === sceneId);
  const playhead = current ? current.startFrame / total * 100 : 0;
  const canvasWidth = Math.round(1600 * zoom / 100);
  const setSafeZoom = (value: number) => setZoom(Math.max(50, Math.min(250, value)));
  return <section className="timeline-panel">
    <div className="timeline-header"><strong>Timeline</strong><div><button onClick={() => setSafeZoom(zoom - 25)}>−</button><input aria-label="Timeline zoom" type="range" min="50" max="250" value={zoom} onChange={(event) => setSafeZoom(Number(event.target.value))} /><button onClick={() => setSafeZoom(zoom + 25)}>＋</button><span>{zoom}%</span></div></div>
    <div className="timeline-scroll"><div className="timeline-canvas" style={{width: canvasWidth}}><div className="time-ruler"><span>00:00</span><span>{formatTime(total / 4, state.composition.fps)}</span><span>{formatTime(total / 2, state.composition.fps)}</span><span>{formatTime(total * .75, state.composition.fps)}</span><span>{formatTime(total, state.composition.fps)}</span></div><div className="playhead" style={{left: `calc(92px + (100% - 104px) * ${playhead / 100})`}}><i /></div>
      <div className="timeline-track"><label>Visual</label><div>{state.scenes.map((scene) => <button className={`visual ${sceneId === scene.id ? "selected" : ""}`} style={{width: `${scene.durationInFrames / total * 100}%`}} onClick={() => selectScene(scene.id)} key={scene.id}><span>{scene.id}</span></button>)}</div></div>
      <EffectTrack effects={state.effects} total={total} selectScene={selectScene} />
      <AbsoluteTrack label="Voice" className="voice" captions={state.captions} total={total} selectScene={selectScene} />
      <AbsoluteTrack label="Captions" className="caption" captions={state.captions} total={total} selectScene={selectScene} />
    </div></div>
  </section>;
};

const AbsoluteTrack = ({label, className, captions, total, selectScene}: {label: string; className: string; captions: Caption[]; total: number; selectScene: (id: string) => void}) => <div className="timeline-track absolute-track"><label>{label}</label><div>{captions.map((caption) => <button className={className} style={{left: `${caption.startFrame / total * 100}%`, width: `${(caption.endFrame - caption.startFrame) / total * 100}%`}} onClick={() => selectScene(caption.sceneId ?? caption.id)} key={caption.id}><span>{className === "voice" ? `VO · ${caption.id}` : caption.text}</span></button>)}</div></div>;

const EffectTrack = ({effects, total, selectScene}: {effects: RemotionEffect[]; total: number; selectScene: (id: string) => void}) => <div className="timeline-track absolute-track effect-track"><label>Remotion FX</label><div>{effects.map((effect) => <button className={`effect effect-${effectKind(effect.type)}`} style={{left: `${effect.startFrame / total * 100}%`, width: `${(effect.endFrame - effect.startFrame) / total * 100}%`}} onClick={() => selectScene(effect.sceneId)} title={`${effect.label} · ${effect.type}\n${JSON.stringify(effect.parameters ?? {})}`} key={effect.id}><i /><span>{effect.label}</span></button>)}</div></div>;

const effectKind = (type: string) => type.includes("video") || type.includes("montage") ? "media" : type.includes("depth") || type.includes("zoom") || type.includes("burns") ? "camera" : type.includes("draw") || type.includes("route") || type.includes("network") ? "draw" : "reveal";

const formatTime = (frame: number, fps: number) => {
  const seconds = frame / fps;
  const minutes = Math.floor(seconds / 60);
  return `${String(minutes).padStart(2, "0")}:${String(Math.floor(seconds % 60)).padStart(2, "0")}.${String(Math.floor(seconds % 1 * 100)).padStart(2, "0")}`;
};

createRoot(document.getElementById("root")!).render(<StrictMode><Theme theme={neutralTheme}><Workbench transport={mcpTransport} /></Theme></StrictMode>);
