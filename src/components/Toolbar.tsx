import React from 'react';
import type { LayoutName } from '../core/layoutConfig';

interface Props {
	layout: LayoutName;
	onLayoutChange: (layout: LayoutName) => void;
	showLoopbacks: boolean;
	onShowLoopbacksChange: (show: boolean) => void;
	showNormalEdges: boolean;
	onShowNormalEdgesChange: (show: boolean) => void;
	onFit: () => void;
	onZoomIn: () => void;
	onZoomOut: () => void;
	onExport: () => void;
	onSearch: (q: string) => void;
	stats: { nodes: number; edges: number } | null;
}

export const Toolbar: React.FC<Props> = ({
	layout,
	onLayoutChange,
	showLoopbacks,
	onShowLoopbacksChange,
	showNormalEdges,
	onShowNormalEdgesChange,
	onFit,
	onZoomIn,
	onZoomOut,
	onExport,
	onSearch,
	stats
}) => (
	<div className="toolbar">
		<input
			className="search-input"
			type="text"
			placeholder="Find node by ID…"
			onChange={(e) => onSearch(e.target.value)}
		/>
		<label className="layout-control">
			<span>Layout</span>
			<select
				className="layout-select"
				value={layout}
				onChange={(e) => onLayoutChange(e.target.value as LayoutName)}
				title="Layout algorithm"
			>
				<option value="radial">Radial</option>
				<option value="tree">Tree</option>
			</select>
		</label>
		<button
			className={`edge-toggle${showNormalEdges ? ' active' : ''}`}
			type="button"
			aria-pressed={showNormalEdges}
			onClick={() => onShowNormalEdgesChange(!showNormalEdges)}
			title="Show or hide state transitions"
		>
			<span className="edge-toggle-icon">→</span>
			Transitions
		</button>
		<button
			className={`edge-toggle${showLoopbacks ? ' active' : ''}`}
			type="button"
			aria-pressed={showLoopbacks}
			onClick={() => onShowLoopbacksChange(!showLoopbacks)}
			title="Show or hide return transitions"
		>
			<span className="edge-toggle-icon">↩</span>
			Returns
		</button>
		<div className="tb-sep" />

		<button className="tb-btn" onClick={onZoomIn} title="Zoom in">
			＋
		</button>
		<button className="tb-btn" onClick={onZoomOut} title="Zoom out">
			－
		</button>
		<button className="tb-btn" onClick={onFit} title="Fit all">
			⤢
		</button>
		<button className="tb-btn" onClick={onExport} title="Export PNG">
			PNG
		</button>

		{stats && (
			<span className="tb-stats">
				{stats.nodes.toLocaleString()} nodes ·{' '}
				{stats.edges.toLocaleString()} edges
			</span>
		)}
	</div>
);
