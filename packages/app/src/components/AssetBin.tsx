import {useState} from 'react';
import type {Asset, ProjectState} from '@make-video/contracts';

type AssetBinProps = {
  state: ProjectState;
  selected: string | null;
  onSelect: (asset: Asset) => void;
};

export const AssetBin = ({state, selected, onSelect}: AssetBinProps) => {
  const [tab, setTab] = useState<'media' | 'renders'>('media');

  return (
    <aside className="asset-bin panel">
      <div className="panel-heading">
        <strong>Project media</strong>
        <button>＋</button>
      </div>
      <div className="mini-tabs">
        <button className={tab === 'media' ? 'active' : ''} onClick={() => setTab('media')}>
          Assets
        </button>
        <button className={tab === 'renders' ? 'active' : ''} onClick={() => setTab('renders')}>
          Outputs
        </button>
      </div>
      {tab === 'media' ? (
        <div className="asset-grid">
          {state.assets.map((asset) => (
            <button className={selected === asset.id ? 'selected' : ''} onClick={() => onSelect(asset)} key={asset.id}>
              {asset.kind === 'image' ? <img src={asset.url} alt={asset.id} loading="lazy" /> : <video src={asset.url} muted autoPlay loop playsInline preload="metadata" />}
              {state.cover?.assetId === asset.id && <em>Cover</em>}
              <span>{asset.id}</span>
              <small>{asset.kind}</small>
            </button>
          ))}
        </div>
      ) : (
        <div className="output-list">
          {state.stages.map((stage) => (
            <div className={stage.exists ? 'ready' : ''} key={stage.id}>
              <i />
              <span>{stage.label}</span>
              <small>{stage.exists ? 'Ready' : 'Missing'}</small>
            </div>
          ))}
        </div>
      )}
    </aside>
  );
};
