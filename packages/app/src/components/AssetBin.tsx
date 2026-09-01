import {useRef, useState} from 'react';
import {Button} from '@astryxdesign/core/Button';
import {SegmentedControl, SegmentedControlItem} from '@astryxdesign/core/SegmentedControl';
import type {Asset, DeliveryJob, ProjectState, ProjectTransport, QaJob, QaKind, RenderJob, RenderKind} from '@make-video/contracts';

type TaskStatus = 'idle' | 'running' | 'passed' | 'failed';

type AssetBinProps = {
  state: ProjectState;
  selected: string | null;
  onSelect: (asset: Asset) => void;
  transport: ProjectTransport;
  refresh: () => Promise<void>;
  notice: (value: string) => void;
};

export const AssetBin = ({state, selected, onSelect, transport, refresh, notice}: AssetBinProps) => {
  const [tab, setTab] = useState<'media' | 'renders'>('media');
  const [uploading, setUploading] = useState(false);
  const [renderStatus, setRenderStatus] = useState<Record<RenderKind, TaskStatus>>({preview: 'idle', final: 'idle', still: 'idle'});
  const [qaStatus, setQaStatus] = useState<Record<QaKind, TaskStatus>>({video: 'idle', images: 'idle', 'generated-videos': 'idle'});
  const [renderErrors, setRenderErrors] = useState<Record<RenderKind, string | undefined>>({preview: undefined, final: undefined, still: undefined});
  const [qaErrors, setQaErrors] = useState<Record<QaKind, string | undefined>>({video: undefined, images: undefined, 'generated-videos': undefined});
  const inputRef = useRef<HTMLInputElement>(null);
  const upload = async (file: File) => {
    setUploading(true);
    try {
      await transport.uploadSource(state.videoId, file);
      let job = await transport.ingestSources(state.videoId, true);
      while (job.status === 'queued' || job.status === 'running') {
        await new Promise((resolve) => window.setTimeout(resolve, 500));
        job = await transport.getSourceJob(job.id);
      }
      if (job.status === 'failed') throw new Error(job.error ?? 'Source ingestion failed');
      await refresh();
      notice(`Imported ${file.name}`);
    } catch (error) { notice(error instanceof Error ? error.message : String(error)); }
    finally { setUploading(false); }
  };

  return (
    <aside className="min-h-0 overflow-auto border-r border-[#242830] bg-[#101318] p-3">
      <div className="flex h-8 items-center justify-between text-xs">
        <strong>Project media</strong>
        <>
          <input ref={inputRef} className="hidden" type="file" accept=".pdf,.docx,.epub,.md,.txt" onChange={(event) => { const file = event.currentTarget.files?.[0]; event.currentTarget.value = ''; if (file) void upload(file); }} />
          <Button label={uploading ? 'Importing…' : 'Add source'} variant="ghost" size="sm" isIconOnly icon={<span>＋</span>} isDisabled={uploading} onClick={() => inputRef.current?.click()} />
        </>
      </div>
      <SegmentedControl className="my-2 mb-3" label="Project media view" value={tab} onChange={(value) => setTab(value as 'media' | 'renders')} layout="fill" size="sm">
        <SegmentedControlItem value="media" label="Assets" />
        <SegmentedControlItem value="renders" label="Outputs" />
      </SegmentedControl>
      {tab === 'media' ? (
        <div className="grid gap-2">
          <div className="rounded-md border border-[#252c35] bg-[#14181e] px-2 py-1.5 text-[9px] text-[#87909d]">Sources: <strong className="text-[#d7dde5]">{state.sources.length}</strong> structured documents</div>
          <div className="grid grid-cols-2 gap-2">
          {state.assets.map((asset) => (
            <button className={`relative min-w-0 cursor-pointer rounded-md border p-1.5 text-left ${selected === asset.id ? 'border-[#d68b46]' : 'border-transparent bg-[#171b21]'}`} onClick={() => onSelect(asset)} key={asset.id}>
              {asset.kind === 'image' ? <img className="block aspect-[16/10] w-full rounded bg-[#080a0d] object-cover" src={asset.url} alt={asset.id} loading="lazy" /> : <video className="block aspect-[16/10] w-full rounded bg-[#080a0d] object-cover" src={asset.url} muted autoPlay loop playsInline preload="metadata" />}
              {state.cover?.assetId === asset.id && <em className="absolute right-2 top-2 rounded bg-[#d68b46] px-1.5 py-1 text-[8px] font-extrabold uppercase not-italic text-[#17100a]">Cover</em>}
              <span className="mt-1 block truncate text-[9px]">{asset.id}</span>
              <small className="text-[8px] uppercase text-[#68717d]">{asset.kind}</small>
            </button>
          ))}
          </div>
        </div>
      ) : (
        <div className="grid gap-1">
          <div className="mb-2 grid grid-cols-2 gap-1.5">
            <RenderButton label="Render preview" kind="preview" videoId={state.videoId} transport={transport} refresh={refresh} notice={notice} onStatus={(status, error) => { setRenderStatus((current) => ({...current, preview: status})); setRenderErrors((current) => ({...current, preview: error})); }} />
            <RenderButton label="Render final" kind="final" videoId={state.videoId} transport={transport} refresh={refresh} notice={notice} onStatus={(status, error) => { setRenderStatus((current) => ({...current, final: status})); setRenderErrors((current) => ({...current, final: error})); }} />
            <PreparationButton videoId={state.videoId} transport={transport} refresh={refresh} notice={notice} />
            <StoryboardButton videoId={state.videoId} transport={transport} notice={notice} />
          </div>
          <div className="mb-2 rounded-md border border-[#252c35] bg-[#14181e] p-2"><strong className="text-[9px]">Render jobs</strong><div className="mt-1.5 grid gap-1"><TaskRow label="Preview" status={renderStatus.preview === 'idle' && state.stages.some((stage) => stage.id === 'silent' && stage.exists) ? 'passed' : renderStatus.preview} error={renderErrors.preview} /><TaskRow label="Final" status={renderStatus.final === 'idle' && state.stages.some((stage) => stage.id === 'final' && stage.exists) ? 'passed' : renderStatus.final} error={renderErrors.final} /></div></div>
          <div className="mb-2 rounded-md border border-[#252c35] bg-[#14181e] p-2">
            <div className="mb-1.5 flex items-center justify-between text-[9px]"><strong>QA</strong><span className={state.qa?.passed ? 'text-[#61b88f]' : 'text-[#737c87]'}>{state.qa ? (state.qa.passed ? 'Passed' : 'Issues') : 'Not run'}</span></div>
            <div className="grid grid-cols-3 gap-1">
              <QaButton label="Video" kind="video" videoId={state.videoId} transport={transport} refresh={refresh} notice={notice} onStatus={(status, error) => { setQaStatus((current) => ({...current, video: status})); setQaErrors((current) => ({...current, video: error})); }} />
              <QaButton label="Images" kind="images" videoId={state.videoId} transport={transport} refresh={refresh} notice={notice} onStatus={(status, error) => { setQaStatus((current) => ({...current, images: status})); setQaErrors((current) => ({...current, images: error})); }} />
              <QaButton label="Clips" kind="generated-videos" videoId={state.videoId} transport={transport} refresh={refresh} notice={notice} onStatus={(status, error) => { setQaStatus((current) => ({...current, 'generated-videos': status})); setQaErrors((current) => ({...current, 'generated-videos': error})); }} />
            </div>
            <div className="mt-2 grid gap-1"><TaskRow label="Video QA" status={qaStatus.video === 'idle' ? persistedQaStatus(state, 'video') : qaStatus.video} error={qaErrors.video} /><TaskRow label="Image QA" status={qaStatus.images === 'idle' ? persistedQaStatus(state, 'images') : qaStatus.images} error={qaErrors.images} /><TaskRow label="Clip QA" status={qaStatus['generated-videos'] === 'idle' ? persistedQaStatus(state, 'generated-videos') : qaStatus['generated-videos']} error={qaErrors['generated-videos']} /></div>
          </div>
          <DeliveryPanel state={state} transport={transport} refresh={refresh} notice={notice} />
          {state.stages.map((stage) => (
            <div className={`grid grid-cols-[10px_1fr_auto] items-center gap-2 rounded-md bg-[#171b21] p-2 text-[10px] ${stage.exists ? '' : ''}`} key={stage.id}>
              <i className={`h-1.5 w-1.5 rounded-full ${stage.exists ? 'bg-[#61b88f]' : 'bg-[#4a5059]'}`} />
              <span>{stage.label}</span>
              <small className="text-[#737b86]">{stage.exists ? 'Ready' : 'Missing'}</small>
            </div>
          ))}
        </div>
      )}
    </aside>
  );
};

const DeliveryPanel = ({state, transport, refresh, notice}: {state: ProjectState; transport: ProjectTransport; refresh: () => Promise<void>; notice: (value: string) => void}) => {
  const [running, setRunning] = useState(false);
  const delivery = state.delivery;
  if (!delivery) return null;
  const rendered = delivery.report?.variants ?? {};
  const pending = delivery.variants.filter((variant) => !rendered[variant.id]);
  const readyCount = delivery.variants.length - pending.length;
  const run = async (variantIds: string[]) => {
    setRunning(true);
    try {
      let job: DeliveryJob = await transport.deliver(state.videoId, variantIds);
      while (job.status === 'queued' || job.status === 'running') {
        await new Promise((resolve) => window.setTimeout(resolve, 500));
        job = await transport.getDeliveryJob(job.id);
      }
      if (job.status === 'failed') throw new Error(job.error ?? 'Delivery failed');
      await refresh();
      notice(`Delivered ${variantIds.length || delivery.variants.length} variant(s)`);
    } catch (error) { notice(error instanceof Error ? error.message : String(error)); }
    finally { setRunning(false); }
  };
  return (
    <div className="mb-2 rounded-md border border-[#252c35] bg-[#14181e] p-2">
      <div className="mb-1.5 flex items-center justify-between text-[9px]"><strong>Delivery variants</strong><span className="text-[#737c87]">{readyCount}/{delivery.variants.length} rendered</span></div>
      {delivery.error && <div className="mb-1.5 rounded bg-[#3b2426] px-2 py-1 text-[9px] leading-[1.35] text-[#f1b2b2]">{delivery.error}</div>}
      <div className="grid gap-1">
        {delivery.variants.map((variant) => {
          const result = rendered[variant.id];
          return (
            <div className="grid grid-cols-[10px_1fr_auto] items-center gap-2 text-[9px]" key={variant.id}>
              <i className={`h-1.5 w-1.5 rounded-full ${result ? 'bg-[#61b88f]' : 'bg-[#4a5059]'}`} />
              <span className="truncate" title={variant.output}>{variant.id}</span>
              <small className="text-[#737b86]">{variant.width}×{variant.height}{variant.captions ? '' : ' · clean'}{variant.translation ? ' · translated' : ''}</small>
            </div>
          );
        })}
      </div>
      <Button className="mt-2" label={running ? 'Rendering variants…' : pending.length ? `Render ${pending.length} pending variant(s)` : 'All variants rendered'} variant="secondary" size="sm" width="100%" isDisabled={running || pending.length === 0} onClick={() => run(pending.map((variant) => variant.id))} />
    </div>
  );
};

const QaButton = ({label, kind, videoId, transport, refresh, notice, onStatus}: {label: string; kind: QaKind; videoId: string; transport: ProjectTransport; refresh: () => Promise<void>; notice: (value: string) => void; onStatus: (status: TaskStatus, error?: string) => void}) => {
  const [running, setRunning] = useState(false);
  const run = async () => {
    setRunning(true);
    onStatus('running');
    try {
      let job: QaJob = await transport.runQa(videoId, kind);
      while (job.status === 'queued' || job.status === 'running') {
        await new Promise((resolve) => window.setTimeout(resolve, 500));
        job = await transport.getQaJob(job.id);
      }
      if (job.status === 'failed') throw new Error(job.error ?? `${label} QA failed`);
      onStatus('passed');
      await refresh(); notice(`${label} QA complete`);
    } catch (error) { const message = error instanceof Error ? error.message : String(error); onStatus('failed', message); notice(message); }
    finally { setRunning(false); }
  };
  return <button className="rounded border border-[#343c47] bg-[#20252d] px-1 py-1.5 text-[8px] text-[#c7cdd4] hover:bg-[#2b323d] disabled:cursor-wait disabled:opacity-60" disabled={running} onClick={run}>{running ? `${label}…` : label}</button>;
};

const RenderButton = ({label, kind, videoId, transport, refresh, notice, onStatus}: {label: string; kind: RenderKind; videoId: string; transport: ProjectTransport; refresh: () => Promise<void>; notice: (value: string) => void; onStatus: (status: TaskStatus, error?: string) => void}) => {
  const [running, setRunning] = useState(false);
  const run = async () => {
    setRunning(true);
    onStatus('running');
    try {
      let job: RenderJob = await transport.render(videoId, kind);
      while (job.status === 'queued' || job.status === 'running') {
        await new Promise((resolve) => window.setTimeout(resolve, 500));
        job = await transport.getRenderJob(job.id);
      }
      if (job.status === 'failed') throw new Error(job.error ?? `${label} failed`);
      onStatus('passed');
      await refresh(); notice(`${label} complete`);
    } catch (error) { const message = error instanceof Error ? error.message : String(error); onStatus('failed', message); notice(message); }
    finally { setRunning(false); }
  };
  return <button className="rounded-md border border-[#343c47] bg-[#20252d] px-2 py-2 text-[9px] text-[#d7dde5] hover:bg-[#2b323d] disabled:cursor-wait disabled:opacity-60" disabled={running} onClick={run}>{running ? `${label}…` : label}</button>;
};

const TaskRow = ({label, status, error}: {label: string; status: TaskStatus; error?: string}) => <div className="text-[9px]"><div className="flex items-center justify-between"><span className="text-[#9da6b1]">{label}</span><span className={status === 'passed' ? 'text-[#61b88f]' : status === 'failed' ? 'text-[#e08e8e]' : status === 'running' ? 'text-[#e8c78f]' : 'text-[#737c87]'}>{status === 'passed' ? 'Passed' : status === 'failed' ? 'Failed' : status === 'running' ? 'Running' : 'Not run'}</span></div>{error && <div className="mt-1 rounded bg-[#3b2426] px-2 py-1 leading-[1.35] text-[#f1b2b2]">{error}</div>}</div>;
const persistedQaStatus = (state: ProjectState, kind: QaKind): TaskStatus => {
  const report = state.qa?.reports?.find((item) => item.kind === kind);
  return report ? (report.passed ? 'passed' : 'failed') : 'idle';
};

const StoryboardButton = ({videoId, transport, notice}: {videoId: string; transport: ProjectTransport; notice: (value: string) => void}) => {
  const [running, setRunning] = useState(false);
  const run = async () => {
    setRunning(true);
    try { const artifact = await transport.buildStoryboard(videoId, true); notice(`Storyboard written to ${artifact.path}`); }
    catch (error) { notice(error instanceof Error ? error.message : String(error)); }
    finally { setRunning(false); }
  };
  return <Button className="col-span-2" label={running ? 'Building storyboard…' : 'Build storyboard'} variant="secondary" size="sm" width="100%" isDisabled={running} onClick={run} />;
};

const PreparationButton = ({videoId, transport, refresh, notice}: {videoId: string; transport: ProjectTransport; refresh: () => Promise<void>; notice: (value: string) => void}) => {
  const [running, setRunning] = useState(false);
  const run = async () => {
    setRunning(true);
    try { const result = await transport.prepareGeneration(videoId); await refresh(); notice(`Prepared ${result.preparedSceneIds.length} image scenes`); }
    catch (error) { notice(error instanceof Error ? error.message : String(error)); }
    finally { setRunning(false); }
  };
  return <Button className="col-span-2" label={running ? 'Preparing generation…' : 'Prepare generation config'} variant="secondary" size="sm" width="100%" isDisabled={running} onClick={run} />;
};
