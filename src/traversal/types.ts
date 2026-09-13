import type { GraphFile } from '../types/graph';
import type { GraphViewState } from '../components/graphViewer/types';

export type Priority = number | readonly number[];
export interface TraversalState {
	id: string;
	label?: string;
	metadata?: Record<string, unknown>;
	tasks: { c: number; d: number; release: 'up' | 'down' | 'none' }[];
	depth: number;
	parentId: string | null;
	insertionOrder: number;
}
export interface TraversalContext {
	graph: Readonly<GraphFile>;
	system: GraphFile['system'];
	step: number;
	expandedIds: readonly string[];
	queueIds: readonly string[];
}
export type PriorityFunction = (
	state: TraversalState,
	context: TraversalContext
) => Priority;
export interface QueueEntry {
	state: TraversalState;
	priority: Priority;
}
export interface Snapshot {
	step: number;
	queue: QueueEntry[];
	discovered: TraversalState[];
	expandedIds: string[];
	currentId: string | null;
	shape: number | null; // 0 = scalar; positive = tuple length
}
export interface StepEvent {
	nodeId: string;
	edges: {
		source: string;
		target: string;
		type: 'normal' | 'loop';
		added: boolean;
	}[];
	added: TraversalState[];
	priorities: { id: string; priority: Priority }[];
	shape: number | null;
}
export interface TraversalAppearance {
	showAreas: boolean;
	hiddenAreaIds: string[];
	showDeadlineBadges: boolean;
}
export interface Run {
	appearance?: TraversalAppearance;
	id: string;
	name: string;
	createdAt: string;
	graph: GraphFile;
	filename: string;
	starts: string[];
	initial: Snapshot;
	events: StepEvent[];
	checkpoints: { at: number; snapshot: Snapshot }[];
	revisions: { at: number; source: string }[];
}
export interface Strategy {
	id: string;
	name: string;
	source: string;
}
export interface TraversalLibrary {
	defaultsInitialized?: boolean;
	strategies: Strategy[];
	records: Run[];
}
export interface SimulatorState {
	panelWidths: { strategy: number; inspector: number };
	appearance: TraversalAppearance;
	graphData: GraphFile | null;
	filename: string;
	draft: string;
	strategyId: string;
	starts: string[];
	run: Run | null;
	cursor: number;
	layout: 'radial' | 'tree';
	view: GraphViewState | null;
	selectedIds: string[];
	speed: number;
}
