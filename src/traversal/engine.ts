import type { GraphFile } from '../types/graph';
import type {
	Priority,
	PriorityFunction,
	QueueEntry,
	Run,
	Snapshot,
	StepEvent,
	TraversalState
} from './types';

export function defaultStarts(graph: GraphFile): string[] {
	const initial = graph.nodes.filter((n) => n.isInitial).map((n) => n.id);
	return initial.length ? initial : graph.nodes.slice(0, 1).map((n) => n.id);
}
function stateFor(
	graph: GraphFile,
	id: string,
	depth: number,
	parentId: string | null,
	insertionOrder: number
): TraversalState {
	const node = graph.nodes.find((n) => n.id === id);
	if (!node) throw new Error(`Unknown node: ${id}`);
	return {
		id,
		label: node.label,
		metadata: node.metadata,
		tasks: node.tasks.map((t) => ({ ...t.task, release: t.release })),
		depth,
		parentId,
		insertionOrder
	};
}
export function seed(graph: GraphFile, starts: string[]): Snapshot {
	const discovered = [...new Set(starts)].map((id, i) =>
		stateFor(graph, id, 0, null, i)
	);
	if (!discovered.length) throw new Error('Select at least one start node.');
	return {
		step: 0,
		queue: discovered.map((state) => ({ state, priority: 0 })),
		discovered,
		expandedIds: [],
		currentId: null,
		shape: null
	};
}
export function comparePriority(a: Priority, b: Priority): number {
	const aa = typeof a === 'number' ? [a] : a;
	const bb = typeof b === 'number' ? [b] : b;
	for (let i = 0; i < aa.length; i++)
		if (aa[i] !== bb[i]) return aa[i] < bb[i] ? -1 : 1;
	return 0;
}
export function sortQueue(queue: QueueEntry[]): QueueEntry[] {
	return [...queue].sort(
		(a, b) =>
			comparePriority(a.priority, b.priority) ||
			a.state.insertionOrder - b.state.insertionOrder
	);
}
export function evaluate(
	graph: GraphFile,
	snapshot: Snapshot,
	fn: PriorityFunction
): Snapshot {
	let shape = snapshot.shape;
	const candidates = [...snapshot.queue].sort(
		(a, b) => a.state.insertionOrder - b.state.insertionOrder
	);
	const context = {
		graph,
		system: graph.system,
		step: snapshot.step,
		expandedIds: snapshot.expandedIds,
		queueIds: candidates.map((e) => e.state.id)
	};
	const queue = candidates.map((entry) => {
		try {
			const priority = fn(entry.state, context);
			const values = typeof priority === 'number' ? [priority] : priority;
			if (
				!Array.isArray(values) ||
				!values.length ||
				!values.every(
					(v) => typeof v === 'number' && Number.isFinite(v)
				)
			)
				throw new Error(
					'Return a finite number or a non-empty tuple of finite numbers.'
				);
			const nextShape =
				typeof priority === 'number' ? 0 : priority.length;
			if (shape !== null && shape !== nextShape)
				throw new Error(
					'Priority kind and tuple length must remain consistent within a run.'
				);
			shape = nextShape;
			return {
				state: entry.state,
				priority:
					typeof priority === 'number' ? priority : [...priority]
			};
		} catch (error) {
			throw new Error(
				`Node ${entry.state.id}: ${error instanceof Error ? error.message : String(error)}`
			);
		}
	});
	return { ...snapshot, queue: sortQueue(queue), shape };
}
// The displayed queue has already been evaluated for this step. Its first entry
// is therefore exactly the node that the next expansion removes.
export function expand(
	graph: GraphFile,
	snapshot: Snapshot
): { snapshot: Snapshot; event: StepEvent } {
	const first = snapshot.queue[0];
	if (!first) throw new Error('Traversal is complete.');
	const known = new Set(snapshot.discovered.map((s) => s.id));
	const added: TraversalState[] = [];
	const edges = graph.edges
		.filter((e) => e.source === first.state.id)
		.map((edge) => {
			const isNew = !known.has(edge.target);
			if (isNew) {
				known.add(edge.target);
				added.push(
					stateFor(
						graph,
						edge.target,
						first.state.depth + 1,
						first.state.id,
						snapshot.discovered.length + added.length
					)
				);
			}
			return {
				source: edge.source,
				target: edge.target,
				type: edge.type,
				added: isNew
			};
		});
	return {
		snapshot: {
			...snapshot,
			step: snapshot.step + 1,
			queue: [
				...snapshot.queue.slice(1),
				...added.map((state) => ({ state, priority: 0 }))
			],
			discovered: [...snapshot.discovered, ...added],
			expandedIds: [...snapshot.expandedIds, first.state.id],
			currentId: first.state.id
		},
		event: {
			nodeId: first.state.id,
			edges,
			added,
			priorities: [],
			shape: snapshot.shape
		}
	};
}
function samePriority(a: Priority | undefined, b: Priority) {
	return a !== undefined && JSON.stringify(a) === JSON.stringify(b);
}
export function finishEvent(
	before: Snapshot,
	after: Snapshot,
	event: StepEvent
): StepEvent {
	const old = new Map(before.queue.map((e) => [e.state.id, e.priority]));
	const added = new Set(event.added.map((s) => s.id));
	return {
		...event,
		shape: after.shape,
		priorities: after.queue
			.filter(
				(e) =>
					added.has(e.state.id) ||
					!samePriority(old.get(e.state.id), e.priority)
			)
			.map((e) => ({ id: e.state.id, priority: e.priority }))
	};
}
export function replayEvent(before: Snapshot, event: StepEvent): Snapshot {
	const priorities = new Map(event.priorities.map((p) => [p.id, p.priority]));
	const queue = [
		...before.queue.filter((e) => e.state.id !== event.nodeId),
		...event.added.map((state) => ({ state, priority: 0 as Priority }))
	].map((e) => ({
		...e,
		priority: priorities.get(e.state.id) ?? e.priority
	}));
	return {
		step: before.step + 1,
		queue: sortQueue(queue),
		discovered: [...before.discovered, ...event.added],
		expandedIds: [...before.expandedIds, event.nodeId],
		currentId: event.nodeId,
		shape: event.shape
	};
}
export function snapshotAt(run: Run, cursor: number): Snapshot {
	const at = Math.max(0, Math.min(run.events.length, cursor));
	const checkpoint = [...run.checkpoints].reverse().find((c) => c.at <= at);
	let snapshot = checkpoint?.snapshot ?? run.initial;
	for (let i = checkpoint?.at ?? 0; i < at; i++)
		snapshot = replayEvent(snapshot, run.events[i]);
	return snapshot;
}
export function appendEvent(
	run: Run,
	event: StepEvent,
	snapshot: Snapshot
): Run {
	const events = [...run.events, event];
	return {
		...run,
		events,
		checkpoints:
			events.length % 64 === 0
				? [...run.checkpoints, { at: events.length, snapshot }]
				: run.checkpoints
	};
}
export function sourceAt(run: Run, cursor: number): string {
	return [...run.revisions].reverse().find((r) => r.at <= cursor)!.source;
}
export function forkRun(
	run: Run,
	cursor: number,
	source: string,
	snapshot: Snapshot,
	id: string
): Run {
	const events = run.events.slice(0, cursor);
	if (cursor) {
		const previous = snapshotAt(run, cursor - 1);
		events[cursor - 1] = finishEvent(
			previous,
			snapshot,
			events[cursor - 1]
		);
	}
	return {
		...run,
		id,
		name: `${run.name} · branch`,
		createdAt: new Date().toISOString(),
		initial: cursor ? run.initial : snapshot,
		events,
		checkpoints: run.checkpoints.filter((c) => c.at < cursor),
		revisions: [
			...run.revisions.filter((r) => r.at < cursor),
			{ at: cursor, source }
		]
	};
}
