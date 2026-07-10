import React from 'react';
import type { SelectionState } from '../types/graph';
import { X, ArrowUp, ArrowDown, Minus } from 'lucide-react';

interface Props {
	selection: SelectionState;
	systemConfig?: {
		tasks: Array<{ c: number; d: number; name?: string }>;
		m?: number;
	};
	onClose: () => void;
}

const ReleaseIcon: React.FC<{ rel: string }> = ({ rel }) => {
	if (rel === 'up') return <ArrowUp size={12} className="release-up" />;
	if (rel === 'down') return <ArrowDown size={12} className="release-down" />;
	return <Minus size={12} className="release-none" />;
};

export const Sidebar: React.FC<Props> = ({
	selection,
	systemConfig,
	onClose
}) => {
	const { nodes, group } = selection;
	const node = nodes.length === 1 ? nodes[0] : null;

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
