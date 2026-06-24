import React from 'react';

interface Props {
	onFit: () => void;
	onZoomIn: () => void;
	onZoomOut: () => void;
	onExport: () => void;
	onSearch: (q: string) => void;
	stats: { nodes: number; edges: number } | null;
}

export const Toolbar: React.FC<Props> = ({
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
