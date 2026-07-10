import type {
	GraphFileYaml,
	GraphNodeYaml,
	LayoutYaml,
	NodeTaskYaml,
	ReleaseIndicator,
	SystemConfigYaml
} from '../schema/graphSchema';
import { normalizeRelease } from '../schema/graphSchema';

export type { ReleaseIndicator };

export interface TaskState {
	c: number;
	d: number;
}

export interface NodeTaskDisplay {
	task: TaskState;
	release: ReleaseIndicator;
}

export type HatchStyle = 'single' | 'cross';

export interface GraphNode {
	id: string;
	label?: string;
	tasks: NodeTaskDisplay[];
	isInitial?: boolean;
	borderColor?: string;
	fillColor?: string;
	hatch?: HatchStyle;
	metadata?: Record<string, unknown>;
}

export interface GraphEdge {
	id?: string;
	source: string;
	target: string;
	type: 'normal' | 'loop';
	label?: string;
	metadata?: Record<string, unknown>;
}

export type SystemConfig = SystemConfigYaml;
export type GraphLayout = LayoutYaml;

export interface GraphFile {
	schemaVersion?: number;
	system?: SystemConfig;
	nodes: GraphNode[];
	edges: GraphEdge[];
	layout?: GraphLayout;
}

export type { GraphFileYaml, GraphNodeYaml, NodeTaskYaml };

export interface SelectedNodeData {
	id: string;
	label: string;
	tasks: NodeTaskDisplay[];
	isInitial: boolean;
	borderColor?: string;
	fillColor?: string;
	hatch?: HatchStyle;
	indegree: number;
	outdegree: number;
}

export interface GroupConnectivity {
	nodeCount: number;
	internalEdges: number;
	externalEdgesIn: number;
	externalEdgesOut: number;
	totalIndegree: number;
	totalOutdegree: number;
}

export interface SelectionState {
	nodes: SelectedNodeData[];
	group?: GroupConnectivity;
}

export function toNodeTaskDisplay(task: NodeTaskYaml): NodeTaskDisplay {
	return {
		task: { c: task.c, d: task.d },
		release: normalizeRelease(task.release ?? 'none')
	};
}
