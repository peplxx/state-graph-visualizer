import React from 'react';
import type { LayoutName } from '../core/layoutConfig';

interface Props {
  onFit: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onExport: () => void;
  onLayoutChange: (l: LayoutName) => void;
  onSearch: (q: string) => void;
  currentLayout: LayoutName;
  stats: { nodes: number; edges: number } | null;
}

const LAYOUTS: { value: LayoutName; label: string }[] = [
  { value: 'dagre',        label: 'Hierarchical' },
  { value: 'breadthfirst', label: 'BFS Tree'     },
  { value: 'fcose',        label: 'Force-Directed'},
  { value: 'grid',         label: 'Grid'          },
];

export const Toolbar: React.FC<Props> = ({
  onFit, onZoomIn, onZoomOut, onExport,
  onLayoutChange, onSearch, currentLayout, stats,
}) => (
  <div className="toolbar">
    <input
      className="search-input"
      type="text"
      placeholder="Find node by ID…"
      onChange={(e) => onSearch(e.target.value)}
    />

    <div className="tb-sep" />

    <label className="tb-label">Layout</label>
    <select
      className="layout-select"
      value={currentLayout}
      onChange={(e) => onLayoutChange(e.target.value as LayoutName)}
    >
      {LAYOUTS.map((l) => (
        <option key={l.value} value={l.value}>{l.label}</option>
      ))}
    </select>

    <div className="tb-sep" />

    <button className="tb-btn" onClick={onZoomIn}  title="Zoom in">＋</button>
    <button className="tb-btn" onClick={onZoomOut} title="Zoom out">－</button>
    <button className="tb-btn" onClick={onFit}     title="Fit all">⤢</button>
    <button className="tb-btn" onClick={onExport}  title="Export PNG">↓ PNG</button>

    {stats && (
      <span className="tb-stats">
        {stats.nodes.toLocaleString()} nodes · {stats.edges.toLocaleString()} edges
      </span>
    )}
  </div>
);
