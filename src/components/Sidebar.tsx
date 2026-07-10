import React from 'react';
import type { SelectionState, GraphArea, LabelPosition } from '../types/graph';
import { X, ArrowUp, ArrowDown, Minus, RotateCcw, MousePointer2, Layers, Trash2 } from 'lucide-react';

// ── Color palettes ────────────────────────────────────────────────────────────

const FILL_PALETTE: { color: string; label: string }[] = [
	{ color: '#FFFFFF', label: 'White' },
	{ color: '#F5F5F5', label: 'Off-white' },
	{ color: '#E8EBF0', label: 'Mist' },
	{ color: '#EEF2FF', label: 'Lavender' },
	{ color: '#EFF6FF', label: 'Sky' },
	{ color: '#ECFDF5', label: 'Mint' },
	{ color: '#FFFBEB', label: 'Cream' },
	{ color: '#FFE4D6', label: 'Peach' },
	{ color: '#FDECEA', label: 'Blush' },
	{ color: '#F3E8FF', label: 'Lilac' },
	{ color: '#E0F2FE', label: 'Ice' },
	{ color: '#F0FDF4', label: 'Foam' },
];

const BORDER_PALETTE: { color: string; label: string }[] = [
	{ color: '#1A1A1A', label: 'Black' },
	{ color: '#374151', label: 'Dark gray' },
	{ color: '#6B7280', label: 'Gray' },
	{ color: '#9B2E23', label: 'Maroon' },
	{ color: '#DC2626', label: 'Red' },
	{ color: '#D97706', label: 'Amber' },
	{ color: '#2563EB', label: 'Blue' },
	{ color: '#0891B2', label: 'Cyan' },
	{ color: '#059669', label: 'Emerald' },
	{ color: '#7C3AED', label: 'Violet' },
	{ color: '#DB2777', label: 'Pink' },
	{ color: '#0F766E', label: 'Teal' },
];

// ── Types ─────────────────────────────────────────────────────────────────────

type HatchStyle = 'single' | 'cross' | 'none';

interface ColorOverride {
	fill?: string;
	border?: string;
	hatch?: HatchStyle;
}

interface AreaOverride {
	fill?: string;
	border?: string;
	hatch?: HatchStyle;
	labelPosition?: LabelPosition;
}

interface Props {
	// Node selection mode
	selection?: SelectionState;
	systemConfig?: {
		tasks: Array<{ c: number; d: number; name?: string }>;
		m?: number;
	};
	colorOverrides?: Map<string, ColorOverride>;
	onColorChange?: (
		nodeIds: string[],
		fill?: string | null,
		border?: string | null,
		hatch?: HatchStyle | null
	) => void;
	// Area selection mode
	selectedArea?: GraphArea;
	areaOverride?: AreaOverride;
	allAreas?: GraphArea[];
	onAreaColorChange?: (
		fill?: string | null,
		border?: string | null,
		hatch?: HatchStyle | null
	) => void;
	onAreaLabelPositionChange?: (pos: LabelPosition) => void;
	onSelectAreaNodes?: () => void;
	onAssignNodeToArea?: (areaId: string | null) => void;
	onCreateArea?: (nodeIds: string[]) => void;
	onAreaLabelChange?: (label: string) => void;
	onDeleteArea?: () => void;
	// Common
	onClose: () => void;
}

// ── Hatch icons ───────────────────────────────────────────────────────────────

const HatchNoneIcon: React.FC = () => (
	<svg width="16" height="16" viewBox="0 0 16 16" fill="none">
		<rect x="1" y="1" width="14" height="14" rx="2" stroke="currentColor" strokeWidth="1.5" fill="none"/>
	</svg>
);

const HatchSingleIcon: React.FC = () => (
	<svg width="16" height="16" viewBox="0 0 16 16" fill="none">
		<rect x="1" y="1" width="14" height="14" rx="2" stroke="currentColor" strokeWidth="1.5" fill="none"/>
		<line x1="3" y1="13" x2="13" y2="3" stroke="currentColor" strokeWidth="1.2"/>
		<line x1="0" y1="10" x2="6" y2="16" stroke="currentColor" strokeWidth="1.2"/>
		<line x1="10" y1="0" x2="16" y2="6" stroke="currentColor" strokeWidth="1.2"/>
	</svg>
);

const HatchCrossIcon: React.FC = () => (
	<svg width="16" height="16" viewBox="0 0 16 16" fill="none">
		<rect x="1" y="1" width="14" height="14" rx="2" stroke="currentColor" strokeWidth="1.5" fill="none"/>
		<line x1="3" y1="13" x2="13" y2="3" stroke="currentColor" strokeWidth="1.2"/>
		<line x1="3" y1="3" x2="13" y2="13" stroke="currentColor" strokeWidth="1.2"/>
	</svg>
);

// ── Sub-components ────────────────────────────────────────────────────────────

const ReleaseIcon: React.FC<{ rel: string }> = ({ rel }) => {
	if (rel === 'up') return <ArrowUp size={12} className="release-up" />;
	if (rel === 'down') return <ArrowDown size={12} className="release-down" />;
	return <Minus size={12} className="release-none" />;
};

interface ColorRowProps {
	label: string;
	palette: { color: string; label: string }[];
	currentColor: string;
	hasOverride: boolean;
	onSelect: (color: string) => void;
	onReset: () => void;
}

const ColorRow: React.FC<ColorRowProps> = ({
	label,
	palette,
	currentColor,
	hasOverride,
	onSelect,
	onReset,
}) => (
	<div className="appearance-row">
		<div className="appearance-row-header">
			<div className="appearance-current">
				<div
					className="appearance-swatch-preview"
					style={{ background: currentColor }}
				/>
				<span className="appearance-hex">{currentColor}</span>
			</div>
			<div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
				<span className="appearance-row-label">{label}</span>
				<button
					className="appearance-reset-btn"
					disabled={!hasOverride}
					onClick={onReset}
					title="Reset to default"
				>
					<RotateCcw size={9} />
					Reset
				</button>
			</div>
		</div>
		<div className="color-palette">
			{palette.map(({ color, label: tip }) => (
				<button
					key={color}
					className={`color-swatch${currentColor === color ? ' is-active' : ''}`}
					style={{ background: color }}
					title={`${tip} — ${color}`}
					onClick={() => onSelect(color)}
					type="button"
					aria-label={`${label}: ${tip}`}
				/>
			))}
		</div>
	</div>
);

// ── Hatch row sub-component ───────────────────────────────────────────────────

interface HatchRowProps {
	currentHatch: HatchStyle;
	hasOverride: boolean;
	onChange: (h: HatchStyle) => void;
	onReset: () => void;
}

const HATCH_OPTIONS: { value: HatchStyle; label: string; Icon: React.FC }[] = [
	{ value: 'none', label: 'None', Icon: HatchNoneIcon },
	{ value: 'single', label: 'Diagonal', Icon: HatchSingleIcon },
	{ value: 'cross', label: 'Cross', Icon: HatchCrossIcon },
];

const HatchRow: React.FC<HatchRowProps> = ({ currentHatch, hasOverride, onChange, onReset }) => (
	<div className="appearance-row">
		<div className="appearance-row-header">
			<span className="appearance-row-label">Hatch</span>
			<button
				className="appearance-reset-btn"
				disabled={!hasOverride}
				onClick={onReset}
				title="Reset to default"
			>
				<RotateCcw size={9} />
				Reset
			</button>
		</div>
		<div className="hatch-btn-group">
			{HATCH_OPTIONS.map(({ value, label, Icon }) => (
				<button
					key={value}
					type="button"
					className={`hatch-btn${currentHatch === value ? ' is-active' : ''}`}
					title={label}
					onClick={() => onChange(value)}
					aria-pressed={currentHatch === value}
					aria-label={label}
				>
					<Icon />
					<span>{label}</span>
				</button>
			))}
		</div>
	</div>
);

// ── Label position picker ─────────────────────────────────────────────────────

const LABEL_POSITIONS: LabelPosition[] = [
	'top-left', 'top-center', 'top-right',
	'center', 'center', 'center',
	'bottom-left', 'bottom-center', 'bottom-right',
];

// 3x3 grid cells: [row, col] positions with a filled dot for the label spot
const GRID_CELLS: { pos: LabelPosition | null; row: number; col: number }[] = [
	{ pos: 'top-left',      row: 0, col: 0 },
	{ pos: 'top-center',    row: 0, col: 1 },
	{ pos: 'top-right',     row: 0, col: 2 },
	{ pos: null,            row: 1, col: 0 },
	{ pos: 'center',        row: 1, col: 1 },
	{ pos: null,            row: 1, col: 2 },
	{ pos: 'bottom-left',   row: 2, col: 0 },
	{ pos: 'bottom-center', row: 2, col: 1 },
	{ pos: 'bottom-right',  row: 2, col: 2 },
];

const LabelPositionPicker: React.FC<{
	current: LabelPosition;
	onChange: (p: LabelPosition) => void;
}> = ({ current, onChange }) => (
	<div className="label-pos-grid">
		{GRID_CELLS.map((cell, i) =>
			cell.pos ? (
				<button
					key={i}
					type="button"
					className={`label-pos-cell${current === cell.pos ? ' is-active' : ''}`}
					title={cell.pos}
					onClick={() => onChange(cell.pos!)}
					aria-pressed={current === cell.pos}
					aria-label={`Label position: ${cell.pos}`}
				>
					<span className="label-pos-dot" />
				</button>
			) : (
				<div key={i} className="label-pos-cell label-pos-empty" />
			)
		)}
	</div>
);

// ── Main component ────────────────────────────────────────────────────────────

export const Sidebar: React.FC<Props> = ({
	selection,
	systemConfig,
	onClose,
	colorOverrides,
	onColorChange,
	selectedArea,
	areaOverride,
	allAreas,
	onAreaColorChange,
	onAreaLabelPositionChange,
	onSelectAreaNodes,
	onAssignNodeToArea,
	onCreateArea,
	onAreaLabelChange,
	onDeleteArea,
}) => {
	// Hook must be at top level (before any early returns).
	// Sidebar is keyed by area id in App.tsx so this reinitializes on area change.
	const [labelDraft, setLabelDraft] = React.useState(selectedArea?.label ?? '');

	// ── Area panel ──────────────────────────────────────────────────────
	if (selectedArea) {
		const aFill = areaOverride?.fill ?? selectedArea.fillColor ?? '#F5F5F5';
		const aBorder = areaOverride?.border ?? selectedArea.borderColor ?? '#374151';
		const aHatch: HatchStyle = (areaOverride?.hatch as HatchStyle | undefined) ?? (selectedArea.hatch as HatchStyle | undefined) ?? 'none';
		const aPos: LabelPosition = areaOverride?.labelPosition ?? selectedArea.labelPosition ?? 'top-left';
		const hasFillOv = areaOverride?.fill !== undefined;
		const hasBorderOv = areaOverride?.border !== undefined;
		const hasHatchOv = areaOverride?.hatch !== undefined;

		return (
			<aside className="sidebar">
				<div className="sidebar-header">
					<h3>Area</h3>
					<div style={{ display: 'flex', gap: 4 }}>
						{onDeleteArea && (
							<button
								className="sidebar-close sidebar-delete"
								onClick={onDeleteArea}
								title="Delete area"
							>
								<Trash2 size={14} />
							</button>
						)}
						<button className="sidebar-close" onClick={onClose}>
							<X size={16} />
						</button>
					</div>
				</div>
				<div className="sidebar-body">
					<div className="detail-row">
						<span className="detail-label">ID</span>
						<code className="detail-value">{selectedArea.id}</code>
					</div>
					<div className="detail-row">
						<span className="detail-label">Nodes</span>
						<span className="badge badge-group">
							{selectedArea.nodeIds.length}
						</span>
					</div>
					{onSelectAreaNodes && (
						<button
							className="area-select-nodes-btn"
							type="button"
							onClick={onSelectAreaNodes}
						>
							<MousePointer2 size={13} />
							Select nodes
						</button>
					)}

					<h4 className="section-title">Label</h4>
					<input
						className="area-label-input"
						value={labelDraft}
						onChange={(e) => setLabelDraft(e.target.value)}
						onBlur={() => onAreaLabelChange?.(labelDraft)}
						placeholder="Add label..."
					/>
					{onAreaLabelPositionChange && labelDraft && (
						<div className="appearance-row" style={{ marginTop: 6 }}>
							<span className="appearance-row-label" style={{ marginBottom: 6, display: 'block' }}>Position</span>
							<LabelPositionPicker
								current={aPos}
								onChange={onAreaLabelPositionChange}
							/>
						</div>
					)}

					{onAreaColorChange && (
						<>
							<h4 className="section-title">Appearance</h4>
							<div className="appearance-section">
								<ColorRow
									label="Fill"
									palette={FILL_PALETTE}
									currentColor={aFill}
									hasOverride={hasFillOv}
									onSelect={(c) => onAreaColorChange(c, undefined)}
									onReset={() => onAreaColorChange(null, undefined)}
								/>
								<div className="appearance-divider" />
								<ColorRow
									label="Border"
									palette={BORDER_PALETTE}
									currentColor={aBorder}
									hasOverride={hasBorderOv}
									onSelect={(c) => onAreaColorChange(undefined, c)}
									onReset={() => onAreaColorChange(undefined, null)}
								/>
								<div className="appearance-divider" />
								<HatchRow
									currentHatch={aHatch}
									hasOverride={hasHatchOv}
									onChange={(h) => onAreaColorChange(undefined, undefined, h)}
									onReset={() => onAreaColorChange(undefined, undefined, null)}
								/>
							</div>
						</>
					)}
				</div>
			</aside>
		);
	}

	// ── Node / group panel ──────────────────────────────────────────────
	const { nodes, group } = selection ?? { nodes: [], group: undefined };
	const node = nodes.length === 1 ? nodes[0] : null;

	const nodeIds = nodes.map((n) => n.id);

	// For multi-node selection, show "mixed" if all nodes share a color, else the first
	const effectiveFill = (id: string, fallback?: string) =>
		colorOverrides?.get(id)?.fill ?? fallback ?? '#FFFFFF';

	const effectiveBorder = (id: string, fallback?: string) =>
		colorOverrides?.get(id)?.border ?? fallback ?? '#1A1A1A';

	const effectiveHatch = (id: string, fallback?: HatchStyle): HatchStyle =>
		(colorOverrides?.get(id)?.hatch as HatchStyle | undefined) ?? fallback ?? 'none';

	// Compute display color for single or group
	const displayFill = node
		? effectiveFill(node.id, node.fillColor)
		: (() => {
				const fills = nodes.map((n) => effectiveFill(n.id, n.fillColor));
				const allSame = fills.every((f) => f === fills[0]);
				return allSame ? fills[0] : '#FFFFFF';
			})();

	const displayBorder = node
		? effectiveBorder(node.id, node.borderColor)
		: (() => {
				const borders = nodes.map((n) =>
					effectiveBorder(n.id, n.borderColor)
				);
				const allSame = borders.every((b) => b === borders[0]);
				return allSame ? borders[0] : '#1A1A1A';
			})();

	const displayHatch: HatchStyle = node
		? effectiveHatch(node.id, node.hatch)
		: (() => {
				const hatches = nodes.map((n) => effectiveHatch(n.id, n.hatch));
				const allSame = hatches.every((h) => h === hatches[0]);
				return allSame ? hatches[0] : 'none';
			})();

	const hasFillOverride = nodes.some((n) => colorOverrides?.has(n.id) && colorOverrides.get(n.id)?.fill !== undefined);
	const hasBorderOverride = nodes.some((n) => colorOverrides?.has(n.id) && colorOverrides.get(n.id)?.border !== undefined);
	const hasHatchOverride = nodes.some((n) => colorOverrides?.has(n.id) && colorOverrides.get(n.id)?.hatch !== undefined);

	return (
		<aside className="sidebar">
			<div className="sidebar-header">
				<h3>{node ? 'Node Details' : 'Selection'}</h3>
				<button className="sidebar-close" onClick={onClose}>
					<X size={16} />
				</button>
			</div>

			<div className="sidebar-body">
				{node ? (
					<>
						<div className="detail-row">
							<span className="detail-label">ID</span>
							<code className="detail-value">{node.id}</code>
						</div>

						{node.isInitial && (
							<div className="detail-row">
								<span className="detail-label">Role</span>
								<span className="badge badge-initial">
									Initial State
								</span>
							</div>
						)}

						{onCreateArea && (
							<button
								className="area-select-nodes-btn"
								type="button"
								onClick={() => onCreateArea(nodeIds)}
							>
								<Layers size={13} />
								Create area from selection
							</button>
						)}

						{onColorChange && (
							<>
								<h4 className="section-title">Appearance</h4>
								<div className="appearance-section">
									<ColorRow
										label="Fill"
										palette={FILL_PALETTE}
										currentColor={displayFill}
										hasOverride={hasFillOverride}
										onSelect={(color) =>
											onColorChange(nodeIds, color, undefined)
										}
										onReset={() =>
											onColorChange(nodeIds, null, undefined)
										}
									/>
									<div className="appearance-divider" />
									<ColorRow
										label="Border"
										palette={BORDER_PALETTE}
										currentColor={displayBorder}
										hasOverride={hasBorderOverride}
										onSelect={(color) =>
											onColorChange(nodeIds, undefined, color)
										}
										onReset={() =>
											onColorChange(nodeIds, undefined, null)
										}
									/>
									<div className="appearance-divider" />
									<HatchRow
										currentHatch={displayHatch}
										hasOverride={hasHatchOverride}
										onChange={(h) =>
											onColorChange(nodeIds, undefined, undefined, h)
										}
										onReset={() =>
											onColorChange(nodeIds, undefined, undefined, null)
										}
									/>
								</div>
							</>
						)}

						<h4 className="section-title">Task States</h4>
						<table className="task-table">
							<thead>
								<tr>
									<th>Task</th>
									<th>c (rem.)</th>
									<th>d (deadline)</th>
									<th>Release</th>
								</tr>
							</thead>
							<tbody>
								{node.tasks.map((t, i) => (
									<tr key={i}>
										<td>
											τ<sub>{i + 1}</sub>
											{systemConfig?.tasks[i]?.name
												? ` (${systemConfig.tasks[i].name})`
												: ''}
										</td>
										<td className="mono">{t.task.c}</td>
										<td className="mono">{t.task.d}</td>
										<td>
											<ReleaseIcon rel={t.release} />
											<span className="release-label">
												{t.release === 'none'
													? '—'
													: t.release}
											</span>
										</td>
									</tr>
								))}
							</tbody>
						</table>

						{systemConfig && (
							<>
								<h4 className="section-title">System Config</h4>
								{systemConfig.tasks.map((t, i) => (
									<div className="detail-row" key={i}>
										<span className="detail-label">
											τ<sub>{i + 1}</sub>
										</span>
										<code className="detail-value">
											({t.c},{t.d})
										</code>
									</div>
								))}
								{systemConfig.m !== undefined && (
									<div className="detail-row">
										<span className="detail-label">
											Processors
										</span>
										<code className="detail-value">
											m = {systemConfig.m}
										</code>
									</div>
								)}
							</>
						)}

						<h4 className="section-title">Connectivity</h4>
						<div className="detail-row">
							<span className="detail-label">In-degree</span>
							<code className="detail-value">
								{node.indegree}
							</code>
						</div>
						<div className="detail-row">
							<span className="detail-label">Out-degree</span>
							<code className="detail-value">
								{node.outdegree}
							</code>
						</div>

						{allAreas && allAreas.length > 0 && onAssignNodeToArea && (() => {
							const currentAreaId = allAreas.find((a) =>
								a.nodeIds.includes(node.id)
							)?.id ?? null;
							return (
								<>
									<h4 className="section-title">Area</h4>
									<select
										className="area-assign-select"
										value={currentAreaId ?? ''}
										onChange={(e) =>
											onAssignNodeToArea(e.target.value || null)
										}
									>
										<option value="">— None —</option>
										{allAreas.map((a) => (
											<option key={a.id} value={a.id}>
												{a.label ? `${a.label} (${a.id})` : a.id}
											</option>
										))}
									</select>
								</>
							);
						})()}
					</>
				) : (
					<>
						<div className="detail-row">
							<span className="detail-label">Group</span>
							<span className="badge badge-group">
								{group?.nodeCount ?? nodes.length} nodes
							</span>
						</div>

						{onColorChange && (
							<>
								<h4 className="section-title">Appearance</h4>
								<div className="appearance-section">
									<ColorRow
										label="Fill"
										palette={FILL_PALETTE}
										currentColor={displayFill}
										hasOverride={hasFillOverride}
										onSelect={(color) =>
											onColorChange(nodeIds, color, undefined)
										}
										onReset={() =>
											onColorChange(nodeIds, null, undefined)
										}
									/>
									<div className="appearance-divider" />
									<ColorRow
										label="Border"
										palette={BORDER_PALETTE}
										currentColor={displayBorder}
										hasOverride={hasBorderOverride}
										onSelect={(color) =>
											onColorChange(nodeIds, undefined, color)
										}
										onReset={() =>
											onColorChange(nodeIds, undefined, null)
										}
									/>
									<div className="appearance-divider" />
									<HatchRow
										currentHatch={displayHatch}
										hasOverride={hasHatchOverride}
										onChange={(h) =>
											onColorChange(nodeIds, undefined, undefined, h)
										}
										onReset={() =>
											onColorChange(nodeIds, undefined, undefined, null)
										}
									/>
								</div>
							</>
						)}

						{onCreateArea && (
							<button
								className="area-select-nodes-btn"
								type="button"
								onClick={() => onCreateArea(nodeIds)}
							>
								<Layers size={13} />
								Create area from selection
							</button>
						)}

						<h4 className="section-title">Selected IDs</h4>
						<div className="selection-id-list">
							{nodes.map((n) => (
								<code key={n.id} className="detail-value">
									{n.id}
								</code>
							))}
						</div>

						{group && (
							<>
								<h4 className="section-title">Connectivity</h4>
								<div className="detail-row">
									<span className="detail-label">
										Internal edges
									</span>
									<code className="detail-value">
										{group.internalEdges}
									</code>
								</div>
								<div className="detail-row">
									<span className="detail-label">
										Incoming
									</span>
									<code className="detail-value">
										{group.externalEdgesIn}
									</code>
								</div>
								<div className="detail-row">
									<span className="detail-label">
										Outgoing
									</span>
									<code className="detail-value">
										{group.externalEdgesOut}
									</code>
								</div>
								<div className="detail-row">
									<span className="detail-label">
										Σ in-degree
									</span>
									<code className="detail-value">
										{group.totalIndegree}
									</code>
								</div>
								<div className="detail-row">
									<span className="detail-label">
										Σ out-degree
									</span>
									<code className="detail-value">
										{group.totalOutdegree}
									</code>
								</div>
							</>
						)}
					</>
				)}
			</div>
		</aside>
	);
};
