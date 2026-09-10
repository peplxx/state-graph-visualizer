import React from 'react';
import { Hourglass, Timer } from 'lucide-react';
import type { GraphNode, GraphEdge, SystemConfig } from '../types/graph';
import { findPathToNode } from '../utils/pathFinder';
import { SchedulingDiagram } from './SchedulingDiagram';

interface Props {
	nodeIds: string[];
	colorOverrides?: Map<string, { fill?: string }>;
	graph: { nodes: GraphNode[]; edges: GraphEdge[] };
	system: SystemConfig;
	showDeadlines: boolean;
	showRemainingWork: boolean;
	onDeadlinesChange: () => void;
	onRemainingWorkChange: () => void;
}

export function ScheduleComparison({
	nodeIds,
	colorOverrides,
	graph,
	system,
	showDeadlines,
	showRemainingWork,
	onDeadlinesChange,
	onRemainingWorkChange
}: Props) {
	const containerRef = React.useRef<HTMLDivElement>(null);
	const schedules = React.useMemo(
		() =>
			nodeIds.map((id) => ({
				id,
				path: findPathToNode(graph.nodes, graph.edges, id)
			})),
		[nodeIds, graph]
	);
	// Identical horizons and scroll positions keep the time axes aligned.
	let timelineEnd = 6;
	for (const { path } of schedules) {
		if (!path?.length) continue;
		const selectedTime = path.length - 1;
		timelineEnd = Math.max(timelineEnd, selectedTime + 3);
		path.forEach((node, t) =>
			node.tasks.forEach(({ task, release }) => {
				if (showDeadlines && release === 'up' && task.d > 0)
					timelineEnd = Math.max(timelineEnd, t + task.d);
			})
		);
		for (const { task } of path[selectedTime].tasks) {
			if (task.c > 0 && (showRemainingWork || task.c > task.d))
				timelineEnd = Math.max(
					timelineEnd,
					Math.ceil(selectedTime + task.c)
				);
		}
	}

	return (
		<section className="schedule-comparison">
			<div className="sched-section-header">
				<h4 className="section-title" style={{ margin: 0 }}>
					Schedules
				</h4>
				<div className="sched-controls">
					<button
						type="button"
						className={`sched-toggle-btn${showDeadlines ? ' is-active' : ''}`}
						aria-pressed={showDeadlines}
						onClick={onDeadlinesChange}
					>
						<Timer size={11} />
						Deadlines
					</button>
					<button
						type="button"
						className={`sched-toggle-btn${showRemainingWork ? ' is-active' : ''}`}
						aria-pressed={showRemainingWork}
						onClick={onRemainingWorkChange}
						title="Show remaining work assuming continuous execution; deadline violations stay visible"
					>
						<Hourglass size={11} />
						Remaining work
					</button>
				</div>
			</div>
			<div
				ref={containerRef}
				className="schedule-comparison-list"
				onScrollCapture={(event) => {
					const target = event.target as HTMLElement;
					if (!target.classList.contains('sched-diagram-scroll'))
						return;
					containerRef.current
						?.querySelectorAll<HTMLElement>('.sched-diagram-scroll')
						.forEach((element) => {
							if (
								element !== target &&
								element.scrollLeft !== target.scrollLeft
							)
								element.scrollLeft = target.scrollLeft;
						});
				}}
			>
				{schedules.map(({ id, path }) => (
					<div key={id} className="schedule-comparison-item">
						<h5 className="schedule-comparison-label">
							<code>{id}</code>
							{path && <span>t = {path.length - 1}</span>}
						</h5>
						{path ? (
							<SchedulingDiagram
								path={path}
								systemConfig={system}
								showDeadlines={showDeadlines}
								showRemainingWork={showRemainingWork}
								minimumTimelineEnd={timelineEnd}
								stateFillColor={
									colorOverrides?.get(id)?.fill ??
									path[path.length - 1].fillColor
								}
							/>
						) : (
							<p className="sched-no-path">
								No path from initial state to this node
							</p>
						)}
					</div>
				))}
			</div>
		</section>
	);
}
