import React from 'react';
import type { SelectionState } from '../types/graph';
import { X, ArrowUp, ArrowDown, Minus, RotateCcw } from 'lucide-react';

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

interface ColorOverride {
	fill?: string;
	border?: string;
}

interface Props {
	selection: SelectionState;
	systemConfig?: {
		tasks: Array<{ c: number; d: number; name?: string }>;
		m?: number;
	};
	onClose: () => void;
	colorOverrides?: Map<string, ColorOverride>;
	onColorChange?: (
		nodeIds: string[],
		fill?: string | null,
		border?: string | null
	) => void;
}

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

// ── Main component ────────────────────────────────────────────────────────────

export const Sidebar: React.FC<Props> = ({
	selection,
	systemConfig,
	onClose,
	colorOverrides,
	onColorChange,
}) => {
	const { nodes, group } = selection;
	const node = nodes.length === 1 ? nodes[0] : null;

	const nodeIds = nodes.map((n) => n.id);

	// For multi-node selection, show "mixed" if all nodes share a color, else the first
	const effectiveFill = (id: string, fallback?: string) =>
		colorOverrides?.get(id)?.fill ?? fallback ?? '#FFFFFF';

	const effectiveBorder = (id: string, fallback?: string) =>
		colorOverrides?.get(id)?.border ?? fallback ?? '#1A1A1A';

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

	const hasFillOverride = nodes.some((n) => colorOverrides?.has(n.id) && colorOverrides.get(n.id)?.fill !== undefined);
	const hasBorderOverride = nodes.some((n) => colorOverrides?.has(n.id) && colorOverrides.get(n.id)?.border !== undefined);

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
								</div>
							</>
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
