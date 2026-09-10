import type { SystemConfig } from '../types/graph';

export function SystemConfigPanel({ system }: { system: SystemConfig }) {
	return (
		<section className="legend" aria-label="System Config">
			<h4 className="legend-title">System Config</h4>
			{system.tasks.map((task, index) => (
				<div className="detail-row" key={index}>
					<span className="detail-label">
						τ<sub>{index + 1}</sub>
					</span>
					<code className="detail-value">
						({task.c},{task.d})
					</code>
				</div>
			))}
			{system.m !== undefined && (
				<div className="detail-row">
					<span className="detail-label">Processors</span>
					<code className="detail-value">m = {system.m}</code>
				</div>
			)}
		</section>
	);
}
