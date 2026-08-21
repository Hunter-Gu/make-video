import {StrictMode, useEffect, useState} from "react";
import {createRoot} from "react-dom/client";
import {httpTransport} from "./http-transport";
import type {Asset, Caption, ProjectState, WorkbenchTransport} from "./types";
import "./styles.css";

const tabs = ["Assets", "Timeline", "Renders", "Captions", "Models"] as const;
type Tab = typeof tabs[number];

const Workbench = ({transport}: {transport: WorkbenchTransport}) => {
  const [projects, setProjects] = useState<string[]>([]);
  const [videoId, setVideoId] = useState("");
  const [state, setState] = useState<ProjectState | null>(null);
  const [tab, setTab] = useState<Tab>("Assets");
  const [sceneId, setSceneId] = useState<string | null>(null);
  const [asset, setAsset] = useState<Asset | null>(null);
  const [stageId, setStageId] = useState<string | null>(null);
  const [notice, setNotice] = useState("Loading project…");
  const refresh = async (id = videoId) => { if (!id) return; const next = await transport.getProject(id); setState(next); setSceneId((value) => next.scenes.some((item) => item.id === value) ? value : next.scenes[0]?.id ?? null); setAsset((value) => next.assets.find((item) => item.id === value?.id) ?? next.assets[0] ?? null); setStageId((value) => next.stages.some((item) => item.id === value) ? value : next.stages.find((item) => item.exists)?.id ?? null); setNotice(""); };
  useEffect(() => { transport.listProjects().then((items) => { setProjects(items); setVideoId(items[0] ?? ""); return refresh(items[0]); }).catch((error) => setNotice(error.message)); }, []);
  const scene = state?.scenes.find((item) => item.id === sceneId) ?? null;
  const stage = state?.stages.find((item) => item.id === stageId) ?? null;
  if (!state) return <main className="loading">{notice}</main>;
  return <main className="app">
    <header><div><span className="eyebrow">MAKE VIDEO</span><h1>Production Workbench</h1></div><div className="project-tools"><select value={videoId} onChange={(event) => {setVideoId(event.target.value); refresh(event.target.value);}}>{projects.map((id) => <option key={id}>{id}</option>)}</select><span className={`qa ${state.qa?.passed ? "pass" : ""}`}>{state.qa?.passed ? "QA passed" : "QA pending"}</span></div></header>
    <nav>{tabs.map((item) => <button className={tab === item ? "active" : ""} onClick={() => setTab(item)} key={item}>{item}</button>)}</nav>
    <div className="workspace">
      <aside className="scenes"><div className="section-title">Scenes <span>{state.scenes.length}</span></div>{state.scenes.map((item, index) => <button key={item.id} className={sceneId === item.id ? "selected" : ""} onClick={() => setSceneId(item.id)}><b>{String(index + 1).padStart(2, "0")}</b><span>{item.id}<small>{(item.durationInFrames / state.composition.fps).toFixed(1)}s · {item.timingSource}</small></span></button>)}</aside>
      <section className="content">
        {tab === "Assets" && <Assets state={state} selected={asset} setSelected={setAsset} transport={transport} refresh={refresh} />}
        {tab === "Timeline" && <Timeline state={state} selected={sceneId} setSelected={setSceneId} />}
        {tab === "Renders" && <Renders state={state} selected={stage} setSelected={setStageId} />}
        {tab === "Captions" && <Captions state={state} transport={transport} refresh={refresh} />}
        {tab === "Models" && <Models state={state} transport={transport} refresh={refresh} />}
      </section>
      <aside className="inspector"><div className="section-title">Inspector</div>{scene ? <><h2>{scene.id}</h2><dl><dt>Start</dt><dd>{(scene.startFrame / state.composition.fps).toFixed(2)}s</dd><dt>End</dt><dd>{(scene.endFrame / state.composition.fps).toFixed(2)}s</dd><dt>Frames</dt><dd>{scene.durationInFrames}</dd><dt>Assets</dt><dd>{scene.assetIds?.join(", ") || "None"}</dd></dl></> : null}<div className="revision-count"><strong>{state.revisions.length}</strong><span>pending image revisions</span></div></aside>
    </div>
    {notice && <div className="toast">{notice}</div>}
  </main>;
};

const Assets = ({state, selected, setSelected, transport, refresh}: {state: ProjectState; selected: Asset | null; setSelected: (asset: Asset) => void; transport: WorkbenchTransport; refresh: () => Promise<void>}) => {
  const [instruction, setInstruction] = useState("");
  const images = state.assets.filter((item) => item.kind === "image");
  const current = selected?.kind === "image" ? selected : images[0];
  return <div className="asset-layout"><div className="preview-panel">{current ? <img src={current.url} /> : <div className="empty">No image assets</div>}<div className="preview-meta"><span>{current?.id}</span>{current?.selected && <em>Selected</em>}</div></div><div className="asset-strip">{images.map((item) => <button className={current?.id === item.id ? "selected" : ""} onClick={() => setSelected(item)} key={item.id}><img src={item.url} /><span>{item.id}</span></button>)}</div><div className="edit-card"><h3>Request image revision</h3><p>Creates a versioned request. The current asset is never overwritten.</p><textarea value={instruction} onChange={(event) => setInstruction(event.target.value)} placeholder="Describe the visual change…" /><button disabled={!current || !instruction.trim()} onClick={async () => {await transport.createAssetRevision(state.videoId, {assetId: current.id, sceneId: current.sceneId, modelId: state.models.image, instruction}); setInstruction(""); await refresh();}}>Create revision request</button></div></div>;
};

const Timeline = ({state, selected, setSelected}: {state: ProjectState; selected: string | null; setSelected: (id: string) => void}) => <div className="timeline-view"><div className="ruler"><span>0s</span><span>{(state.composition.durationInFrames / state.composition.fps / 2).toFixed(0)}s</span><span>{(state.composition.durationInFrames / state.composition.fps).toFixed(0)}s</span></div>{["Scenes", "Visuals", "Voice", "Captions"].map((track) => <div className="track" key={track}><label>{track}</label><div>{state.scenes.map((scene) => <button key={scene.id} className={selected === scene.id ? "selected" : ""} style={{width: `${scene.durationInFrames / state.composition.durationInFrames * 100}%`}} onClick={() => setSelected(scene.id)} title={scene.id}>{track === "Scenes" ? scene.id : track === "Captions" && state.captions.some((caption) => caption.sceneId === scene.id) ? "CC" : track === "Voice" && scene.timingSource === "voice-manifest" ? "VO" : track === "Visuals" ? (scene.assetIds?.length ? "Asset" : "Motion") : ""}</button>)}</div></div>)}</div>;

const Renders = ({state, selected, setSelected}: {state: ProjectState; selected: ProjectState["stages"][number] | null; setSelected: (id: string) => void}) => <div className="renders"><div className="stage-list">{state.stages.map((stage) => <button key={stage.id} disabled={!stage.exists} className={selected?.id === stage.id ? "selected" : ""} onClick={() => setSelected(stage.id)}><span>{stage.label}</span><em>{stage.exists ? "Ready" : "Not rendered"}</em></button>)}</div><div className="video-panel">{selected?.url ? selected.kind === "still" || selected.path.endsWith(".png") ? <img src={selected.url} /> : <video src={selected.url} controls /> : <div className="empty">Select an available render stage</div>}</div></div>;

const Captions = ({state, transport, refresh}: {state: ProjectState; transport: WorkbenchTransport; refresh: () => Promise<void>}) => <div className="caption-list">{state.captions.map((caption) => <CaptionRow key={caption.id} caption={caption} fps={state.composition.fps} save={async (next) => {await transport.updateCaption(state.videoId, next); await refresh();}} />)}</div>;
const CaptionRow = ({caption, fps, save}: {caption: Caption; fps: number; save: (caption: Caption) => Promise<void>}) => { const [draft, setDraft] = useState(caption); useEffect(() => setDraft(caption), [caption]); return <article><header><strong>{caption.id}</strong><span>{(draft.startFrame / fps).toFixed(2)}s → {(draft.endFrame / fps).toFixed(2)}s</span></header><textarea value={draft.text} onChange={(event) => setDraft({...draft, text: event.target.value})} /><div className="frame-fields"><label>Start frame<input type="number" value={draft.startFrame} onChange={(event) => setDraft({...draft, startFrame: Number(event.target.value)})} /></label><label>End frame<input type="number" value={draft.endFrame} onChange={(event) => setDraft({...draft, endFrame: Number(event.target.value)})} /></label><button onClick={() => save(draft)}>Save caption</button></div><small>Changing narration text marks the current voice generation as stale.</small></article>; };

const Models = ({state, transport, refresh}: {state: ProjectState; transport: WorkbenchTransport; refresh: () => Promise<void>}) => { const [image, setImage] = useState(state.models.image ?? state.registry.image[0]?.id); const [voice, setVoice] = useState(state.models.voice ?? state.registry.voice[0]?.id); const imageModel = state.registry.image.find((item) => item.id === image); const voiceModel = state.registry.voice.find((item) => item.id === voice); return <div className="models"><ModelCard title="Image model" models={state.registry.image} value={image} setValue={setImage} selected={imageModel} /><ModelCard title="Voice model" models={state.registry.voice} value={voice} setValue={setVoice} selected={voiceModel} /><button className="save-models" onClick={async () => {await transport.updateModels(state.videoId, {image, voice}); await refresh();}}>Save model choices</button><p className="cost-note">Saving a model does not start generation or create charges.</p></div>; };
const ModelCard = ({title, models, value, setValue, selected}: {title: string; models: ProjectState["registry"]["image"]; value?: string; setValue: (id: string) => void; selected?: ProjectState["registry"]["image"][number]}) => <article><span className="eyebrow">DEFAULT</span><h2>{title}</h2><select value={value} onChange={(event) => setValue(event.target.value)}>{models.map((model) => <option value={model.id} key={model.id}>{model.label}</option>)}</select><div className="chips">{selected?.capabilities.map((capability) => <span key={capability}>{capability}</span>)}</div><p>{selected?.provider}</p></article>;

createRoot(document.getElementById("root")!).render(<StrictMode><Workbench transport={httpTransport} /></StrictMode>);
