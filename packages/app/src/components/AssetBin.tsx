import {useState} from 'react';
import {Button} from '@astryxdesign/core/Button';
import {SegmentedControl, SegmentedControlItem} from '@astryxdesign/core/SegmentedControl';
import type {Asset, ProjectState, ProjectTransport, QaJob, QaKind, RenderJob, RenderKind} from '@make-video/contracts';

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

  return (
    <aside className="min-h-0 overflow-auto border-r border-[#242830] bg-[#101318] p-3">
      <div className="flex h-8 items-center justify-between text-xs">
        <strong>Project media</strong>
        <Button label="Add media" variant="ghost" size="sm" isIconOnly icon={<span>＋</span>} />
      </div>
      <SegmentedControl className="my-2 mb-3" label="Project media view" value={tab} onChange={(value) => setTab(value as 'media' | 'renders')} layout="fill" size="sm">
        <SegmentedControlItem value="media" label="Assets" />
        <SegmentedControlItem value="renders" label="Outputs" />
      </SegmentedControl>
      {tab === 'media' ? (
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
      ) : (
        <div className="grid gap-1">
          <div className="mb-2 grid grid-cols-2 gap-1.5">
            <RenderButton label="Render preview" kind="preview" videoId={state.videoId} transport={transport} refresh={refresh} notice={notice} />
            <RenderButton label="Render final" kind="final" videoId={state.videoId} transport={transport} refresh={refresh} notice={notice} />
          </div>
          <div className="mb-2 rounded-md border border-[#252c35] bg-[#14181e] p-2">
            <div className="mb-1.5 flex items-center justify-between text-[9px]"><strong>QA</strong><span className={state.qa?.passed ? 'text-[#61b88f]' : 'text-[#737c87]'}>{state.qa ? (state.qa.passed ? 'Passed' : 'Issues') : 'Not run'}</span></div>
            <div className="grid grid-cols-3 gap-1">
              <QaButton label="Video" kind="video" videoId={state.videoId} transport={transport} refresh={refresh} notice={notice} />
              <QaButton label="Images" kind="images" videoId={state.videoId} transport={transport} refresh={refresh} notice={notice} />
              <QaButton label="Clips" kind="generated-videos" videoId={state.videoId} transport={transport} refresh={refresh} notice={notice} />
            </div>
          </div>
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

const QaButton = ({label, kind, videoId, transport, refresh, notice}: {label: string; kind: QaKind; videoId: string; transport: ProjectTransport; refresh: () => Promise<void>; notice: (value: string) => void}) => {
  const [running, setRunning] = useState(false);
  const run = async () => {
    setRunning(true);
    try {
      let job: QaJob = await transport.runQa(videoId, kind);
      while (job.status === 'queued' || job.status === 'running') {
        await new Promise((resolve) => window.setTimeout(resolve, 500));
        job = await transport.getQaJob(job.id);
      }
      if (job.status === 'failed') throw new Error(job.error ?? `${label} QA failed`);
      await refresh(); notice(`${label} QA complete`);
    } catch (error) { notice(error instanceof Error ? error.message : String(error)); }
    finally { setRunning(false); }
  };
  return <button className="rounded border border-[#343c47] bg-[#20252d] px-1 py-1.5 text-[8px] text-[#c7cdd4] hover:bg-[#2b323d] disabled:cursor-wait disabled:opacity-60" disabled={running} onClick={run}>{running ? `${label}…` : label}</button>;
};

const RenderButton = ({label, kind, videoId, transport, refresh, notice}: {label: string; kind: RenderKind; videoId: string; transport: ProjectTransport; refresh: () => Promise<void>; notice: (value: string) => void}) => {
  const [running, setRunning] = useState(false);
  const run = async () => {
    setRunning(true);
    try {
      let job: RenderJob = await transport.render(videoId, kind);
      while (job.status === 'queued' || job.status === 'running') {
        await new Promise((resolve) => window.setTimeout(resolve, 500));
        job = await transport.getRenderJob(job.id);
      }
      if (job.status === 'failed') throw new Error(job.error ?? `${label} failed`);
      await refresh(); notice(`${label} complete`);
    } catch (error) { notice(error instanceof Error ? error.message : String(error)); }
    finally { setRunning(false); }
  };
  return <button className="rounded-md border border-[#343c47] bg-[#20252d] px-2 py-2 text-[9px] text-[#d7dde5] hover:bg-[#2b323d] disabled:cursor-wait disabled:opacity-60" disabled={running} onClick={run}>{running ? `${label}…` : label}</button>;
};
