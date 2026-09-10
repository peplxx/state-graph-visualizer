import type {
	GraphFile,
	GraphArea,
	LabelPosition,
	NodeTaskDisplay,
	GraphEdge,
	SelectionState
} from '../../types/graph';
import type { LayoutName } from '../../core/layoutConfig';

export interface NodePos {
	id: string;
	x: number;
	y: number;
	width: number;
	height: number;
	radius: number;
	shape: 'rect' | 'circle';
	label: string;
	tasks: NodeTaskDisplay[];
	isInitial: boolean;
	borderColor?: string;
	fillColor?: string;
	hatch?: 'single' | 'cross';
}

export interface D3SpanNode {
	id: string;
	children: D3SpanNode[];
}

export interface Point {
	x: number;
	y: number;
}

export interface LoopBundle {
	id: string;
	target: string;
	edges: GraphEdge[];
	hub: Point;
}

export type LabelTransform = {
	x: number;
	y: number;
	rotate: number;
	anchor: 'start' | 'middle' | 'end';
};

export interface NodeColorOverride {
	fill?: string;
	border?: string;
	/** 'none' explicitly removes hatch even if the YAML has one */
	hatch?: 'single' | 'cross' | 'none';
}

export interface AreaOverride {
	fill?: string;
	border?: string;
	hatch?: 'single' | 'cross' | 'none';
	labelPosition?: LabelPosition;
	/** Override the area's node membership */
	nodes?: string[];
}

export interface GraphViewState {
	x: number;
	y: number;
	k: number;
}

export interface GraphViewerProps {
	initialView?: GraphViewState | null;
	initialSelectedIds?: string[];
	initialSelectedAreaId?: string;
	onViewChange?: (view: GraphViewState) => void;
	graphData: GraphFile | null;
	layout: LayoutName;
	showLoopbacks: boolean;
	showNormalEdges: boolean;
	enableAnimation: boolean;
	showDeadlineBadges?: boolean;
	onSelectionChange?: (selection: SelectionState | null) => void;
	onStatsChange?: (stats: { nodes: number; edges: number }) => void;
	colorOverrides?: Map<string, NodeColorOverride>;
	areaOverrides?: Map<string, AreaOverride>;
	onAreaSelect?: (area: GraphArea | null) => void;
	showAreas?: boolean;
	hiddenAreaIds?: Set<string>;
}

export interface GraphViewerHandle {
	getViewState(): GraphViewState | null;
	fit(): void;
	zoomIn(): void;
	zoomOut(): void;
	exportPNG(): string;
	focusNode(id: string): void;
	runLayout(name: LayoutName): void;
	clearSelection(): void;
	selectNodes(nodeIds: string[]): void;
}
