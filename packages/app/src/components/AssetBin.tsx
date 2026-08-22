import {useState} from 'react';
import {Button} from '@astryxdesign/core/Button';
import {SegmentedControl, SegmentedControlItem} from '@astryxdesign/core/SegmentedControl';
import type {Asset, ProjectState} from '@make-video/contracts';

type AssetBinProps = {
  state: ProjectState;
  selected: string | null;
  onSelect: (asset: Asset) => void;
};

export const AssetBin = ({state, selected, onSelect}: AssetBinProps) => {
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
