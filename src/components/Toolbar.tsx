import React from 'react';
import { Maximize2, ZoomIn, ZoomOut } from 'lucide-react';
import type { LayoutName } from '../core/layoutConfig';

interface Props {
	layout: LayoutName;
	onLayoutChange: (layout: LayoutName) => void;
	showLoopbacks: boolean;
	onShowLoopbacksChange: (show: boolean) => void;
	showNormalEdges: boolean;
	onShowNormalEdgesChange: (show: boolean) => void;
	showAreas: boolean;
	onShowAreasChange: (show: boolean) => void;
	onFit: () => void;
	onZoomIn: () => void;
	onZoomOut: () => void;
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
	showAreas,
	onShowAreasChange,
	onFit,
	onZoomIn,
	onZoomOut,
	onSearch,
	stats
}) => (
	<div className="toolbar">
		<div className="toolbar-section">
			<input
				className="toolbar-search"
				type="search"
				placeholder="Find node by ID…"
				onChange={(e) => onSearch(e.target.value)}
			/>
		</div>

		<div className="toolbar-section">
			<label className="toolbar-field">
				<span className="toolbar-field-label">Layout</span>
				<select
					className="toolbar-select"
					value={layout}
					onChange={(e) =>
						onLayoutChange(e.target.value as LayoutName)
					}
					title="Layout algorithm"
				>
					<option value="radial">Radial</option>
					<option value="tree">Tree</option>
				</select>
			</label>
		</div>

		<div className="toolbar-section toolbar-section--toggles">
			<button
				className={`toolbar-toggle${showNormalEdges ? ' is-active' : ''}`}
				type="button"
				aria-pressed={showNormalEdges}
				onClick={() => onShowNormalEdgesChange(!showNormalEdges)}
				title="Show or hide state transitions"
			>
				<span className="toolbar-toggle-icon" aria-hidden="true">
					→
				</span>
				Transitions
			</button>
			<button
				className={`toolbar-toggle${showLoopbacks ? ' is-active' : ''}`}
				type="button"
				aria-pressed={showLoopbacks}
				onClick={() => onShowLoopbacksChange(!showLoopbacks)}
				title="Show or hide return transitions"
			>
				<span className="toolbar-toggle-icon" aria-hidden="true">
					↩
				</span>
				Returns
			</button>
			<button
				className={`toolbar-toggle${showAreas ? ' is-active' : ''}`}
				type="button"
				aria-pressed={showAreas}
				onClick={() => onShowAreasChange(!showAreas)}
				title="Show or hide areas"
			>
				<span className="toolbar-toggle-icon" aria-hidden="true">
					◻
				</span>
				Areas
			</button>
		</div>

		<div className="toolbar-divider" aria-hidden="true" />

		<div
			className="toolbar-btn-group"
			role="group"
			aria-label="Zoom controls"
		>
			<button
				className="toolbar-icon-btn"
				type="button"
				onClick={onZoomIn}
				title="Zoom in"
			>
				<ZoomIn size={15} strokeWidth={2} />
			</button>
			<button
				className="toolbar-icon-btn"
				type="button"
				onClick={onZoomOut}
				title="Zoom out"
			>
				<ZoomOut size={15} strokeWidth={2} />
			</button>
			<button
				className="toolbar-icon-btn"
				type="button"
				onClick={onFit}
				title="Fit all"
			>
				<Maximize2 size={15} strokeWidth={2} />
			</button>
		</div>

		{stats && (
			<span className="toolbar-stats">
				{stats.nodes.toLocaleString()} nodes ·{' '}
				{stats.edges.toLocaleString()} edges
			</span>
		)}
	</div>
);
