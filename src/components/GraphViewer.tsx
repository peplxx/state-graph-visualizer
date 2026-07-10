import {
	useEffect,
	useRef,
	useState,
	forwardRef,
	useImperativeHandle,
	useCallback
} from 'react';
import * as d3 from 'd3';
import { buildNodeLabel, estimateNodeSize } from '../core/labelBuilder';
import type {
	GraphFile,
	GraphNode,
	GraphEdge,
	SelectedNodeData,
	NodeTaskDisplay
} from '../types/graph';
import type { LayoutName } from '../core/layoutConfig';

// ── Internal types ────────────────────────────────────────────────────────────
interface NodePos {
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
}

interface D3SpanNode {
	id: string;
	children: D3SpanNode[];
}

// ── BFS utilities ─────────────────────────────────────────────────────────────
function computeBFSDepths(
	nodes: GraphNode[],
	edges: GraphEdge[]
): Map<string, number> {
	const adj = new Map<string, string[]>();
	for (const n of nodes) adj.set(n.id, []);
	const hasIncoming = new Set<string>();

	for (const e of edges) {
		if (e.type !== 'normal') continue;
		adj.get(e.source)?.push(e.target);
		hasIncoming.add(e.target);
	}

	const depth = new Map<string, number>();
	const queue: string[] = [];

	for (const n of nodes) {
		if (n.isInitial || !hasIncoming.has(n.id)) {
			depth.set(n.id, 0);
			queue.push(n.id);
		}
	}

	let head = 0;
	while (head < queue.length) {
		const id = queue[head++];
		const d = depth.get(id)!;
		for (const child of adj.get(id) ?? []) {
			if (!depth.has(child)) {
				depth.set(child, d + 1);
				queue.push(child);
			}
		}
	}

	for (const n of nodes) {
		if (!depth.has(n.id)) depth.set(n.id, 0);
	}

	return depth;
}

/** BFS path from initial node to target; returns {nodes, edgeIds} */
function findRootPath(
	targetId: string,
	data: GraphFile
): { nodes: Set<string>; edgeIds: Set<string> } {
	const empty = { nodes: new Set<string>([targetId]), edgeIds: new Set<string>() };

	const root = data.nodes.find((n) => n.isInitial);
	if (!root) return empty;
	if (root.id === targetId) return { nodes: new Set([targetId]), edgeIds: new Set() };

	const adj = new Map<string, Array<{ to: string; eid: string }>>();
	for (const n of data.nodes) adj.set(n.id, []);
	for (const e of data.edges) {
		if (e.type === 'normal') {
			adj.get(e.source)?.push({
				to: e.target,
				eid: e.id ?? `${e.source}--${e.target}`
			});
		}
	}

	const parent = new Map<string, { nid: string; eid: string }>();
	const visited = new Set([root.id]);
	const queue = [root.id];
	let found = false;

	while (queue.length > 0) {
		const cur = queue.shift()!;
		if (cur === targetId) { found = true; break; }
		for (const { to, eid } of adj.get(cur) ?? []) {
			if (!visited.has(to)) {
				visited.add(to);
				parent.set(to, { nid: cur, eid });
				queue.push(to);
			}
		}
	}

	if (!found) return empty;

	const pathNodes = new Set<string>();
	const pathEdges = new Set<string>();
	let cur: string | undefined = targetId;
	while (cur) {
		pathNodes.add(cur);
		const p = parent.get(cur);
		if (p) pathEdges.add(p.eid);
		cur = p?.nid;
	}

	return { nodes: pathNodes, edgeIds: pathEdges };
}

// ── Radial layout: tree-structure aware, children cluster under parents ────────
const RADIAL_BASE = 100;
const RADIAL_GAP = 90;

function computeRadialPositions(
	nodes: GraphNode[],
	edges: GraphEdge[]
): { positions: Map<string, { x: number; y: number }>; ringRadii: number[] } {
	// Build spanning tree via BFS
	const adj = new Map<string, string[]>();
	const hasIncoming = new Set<string>();
	for (const n of nodes) adj.set(n.id, []);
	for (const e of edges) {
		if (e.type !== 'normal') continue;
		adj.get(e.source)?.push(e.target);
		hasIncoming.add(e.target);
	}

	const rootIds = nodes
		.filter((n) => n.isInitial || !hasIncoming.has(n.id))
		.map((n) => n.id);

	const spanChildren = new Map<string, string[]>();
	const depthMap = new Map<string, number>();
	for (const n of nodes) spanChildren.set(n.id, []);

	const visited = new Set<string>(rootIds);
	for (const r of rootIds) depthMap.set(r, 0);
	const bfsQ = [...rootIds];
	let bfsHead = 0;
	while (bfsHead < bfsQ.length) {
		const id = bfsQ[bfsHead++];
		const d = depthMap.get(id)!;
		for (const child of adj.get(id) ?? []) {
			if (!visited.has(child)) {
				visited.add(child);
				depthMap.set(child, d + 1);
				spanChildren.get(id)!.push(child);
				bfsQ.push(child);
			}
		}
	}
	for (const n of nodes) {
		if (!visited.has(n.id)) {
			rootIds.push(n.id);
			depthMap.set(n.id, 0);
		}
	}

	// Leaf count: iterative post-order traversal
	const leafCount = new Map<string, number>();
	const order: string[] = [];
	const orderQ = [...rootIds];
	let oh = 0;
	while (oh < orderQ.length) {
		const id = orderQ[oh++];
		order.push(id);
		for (const c of spanChildren.get(id) ?? []) orderQ.push(c);
	}
	for (let i = order.length - 1; i >= 0; i--) {
		const id = order[i];
		const ch = spanChildren.get(id) ?? [];
		leafCount.set(
			id,
			ch.length === 0 ? 1 : ch.reduce((s, c) => s + (leafCount.get(c) ?? 1), 0)
		);
	}

	// Assign angle ranges proportionally by subtree size, starting from top (−π/2)
	const aStart = new Map<string, number>();
	const aEnd = new Map<string, number>();
	const totalRootLeaves = rootIds.reduce((s, r) => s + (leafCount.get(r) ?? 1), 0);
	let cur = -Math.PI / 2;
	for (const rid of rootIds) {
		const range = ((leafCount.get(rid) ?? 1) / totalRootLeaves) * 2 * Math.PI;
		aStart.set(rid, cur);
		aEnd.set(rid, cur + range);
		cur += range;
	}
	// Propagate ranges to children
	const propQ = [...rootIds];
	let ph = 0;
	while (ph < propQ.length) {
		const id = propQ[ph++];
		const children = spanChildren.get(id) ?? [];
		if (children.length === 0) continue;
		const totalL = children.reduce((s, c) => s + (leafCount.get(c) ?? 1), 0);
		const as = aStart.get(id)!;
		const ae = aEnd.get(id)!;
		let cc = as;
		for (const c of children) {
			const cRange = ((leafCount.get(c) ?? 1) / totalL) * (ae - as);
			aStart.set(c, cc);
			aEnd.set(c, cc + cRange);
			cc += cRange;
			propQ.push(c);
		}
	}

	// Ring radii
	const maxDepth = Math.max(0, ...[...depthMap.values()]);
	const ringRadii: number[] = [];
	for (let d = 1; d <= maxDepth; d++) {
		ringRadii.push(RADIAL_BASE + (d - 1) * RADIAL_GAP);
	}

	// Final positions
	const positions = new Map<string, { x: number; y: number }>();
	const singleRoot = rootIds.length === 1;

	for (const n of nodes) {
		const d = depthMap.get(n.id) ?? 0;
		if (d === 0 && singleRoot) {
			positions.set(n.id, { x: 0, y: 0 });
		} else {
			const r = d === 0 ? RADIAL_BASE * 0.45 : RADIAL_BASE + (d - 1) * RADIAL_GAP;
			const angle = ((aStart.get(n.id) ?? 0) + (aEnd.get(n.id) ?? 2 * Math.PI)) / 2;
			positions.set(n.id, { x: r * Math.cos(angle), y: r * Math.sin(angle) });
		}
	}

	return { positions, ringRadii };
}

// ── Tree layout: Reingold-Tilford via d3.tree ─────────────────────────────────
function buildSpanningTree(nodes: GraphNode[], edges: GraphEdge[]): D3SpanNode {
	const adj = new Map<string, string[]>();
	for (const n of nodes) adj.set(n.id, []);
	const hasIncoming = new Set<string>();

	for (const e of edges) {
		if (e.type !== 'normal') continue;
		adj.get(e.source)?.push(e.target);
		hasIncoming.add(e.target);
	}

	const roots = nodes.filter((n) => n.isInitial || !hasIncoming.has(n.id));
	const visited = new Set<string>();
	const nodeMap = new Map<string, D3SpanNode>();
	for (const n of nodes) nodeMap.set(n.id, { id: n.id, children: [] });

	const virtualRoot: D3SpanNode = { id: '__root__', children: [] };
	const bfsQueue: string[] = roots.map((r) => r.id);
	for (const id of bfsQueue) visited.add(id);
	virtualRoot.children = roots.map((r) => nodeMap.get(r.id)!);

	let head = 0;
	while (head < bfsQueue.length) {
		const id = bfsQueue[head++];
		const node = nodeMap.get(id)!;
		for (const childId of adj.get(id) ?? []) {
			if (!visited.has(childId)) {
				visited.add(childId);
				node.children.push(nodeMap.get(childId)!);
				bfsQueue.push(childId);
			}
		}
	}
	for (const n of nodes) {
		if (!visited.has(n.id)) virtualRoot.children.push(nodeMap.get(n.id)!);
	}

	return virtualRoot;
}

function computeTreePositions(
	nodes: GraphNode[],
	edges: GraphEdge[],
	nodeWidth: number
): Map<string, { x: number; y: number }> {
	const spanTree = buildSpanningTree(nodes, edges);
	const hierarchy = d3.hierarchy<D3SpanNode>(spanTree, (d) => d.children);

	const treeLayout = d3
		.tree<D3SpanNode>()
		.nodeSize([nodeWidth + 24, 130])
		.separation((a, b) => (a.parent === b.parent ? 1 : 1.4));

	treeLayout(hierarchy);

	const positions = new Map<string, { x: number; y: number }>();
	for (const node of hierarchy.descendants()) {
		if (node.data.id === '__root__') continue;
		const yOff = 130;
		positions.set(node.data.id, {
			x: (node as any).x as number,
			y: ((node as any).y as number) + yOff
		});
	}

	return positions;
}

// ── Node geometry ─────────────────────────────────────────────────────────────
function nodeCircleRadius(tasks: NodeTaskDisplay[]): number {
	const lines = Math.max(1, tasks.length);
	// Compact: enough space for the text lines
	return Math.max(20, lines * 9 + 12);
}

function getBorderPoint(
	node: NodePos,
	tx: number,
	ty: number
): { x: number; y: number } {
	const dx = tx - node.x;
	const dy = ty - node.y;
	const len = Math.sqrt(dx * dx + dy * dy);
	if (len < 1) return { x: node.x, y: node.y };
	const nx = dx / len;
	const ny = dy / len;

	if (node.shape === 'circle') {
		const r = node.radius + 1;
		return { x: node.x + nx * r, y: node.y + ny * r };
	}

	const hw = node.width / 2 + 1;
	const hh = node.height / 2 + 1;
	const tr = nx !== 0 ? hw / Math.abs(nx) : Infinity;
	const tc = ny !== 0 ? hh / Math.abs(ny) : Infinity;
	const t = Math.min(tr, tc);
	return { x: node.x + nx * t, y: node.y + ny * t };
}

interface Point {
	x: number;
	y: number;
}

interface LoopBundle {
	id: string;
	target: string;
	edges: GraphEdge[];
	hub: Point;
}

function edgeId(edge: GraphEdge): string {
	return edge.id ?? `${edge.source}--${edge.target}`;
}

function loopbackColor(count: number, maxCount: number): string {
	const light = [202, 207, 212];
	const dark = [126, 134, 142];
	const ratio =
		maxCount <= 1 ? 0 : Math.sqrt((count - 1) / Math.max(1, maxCount - 1));
	const channels = light.map((start, index) =>
		Math.round(start + (dark[index] - start) * ratio)
	);
	return `rgb(${channels[0]}, ${channels[1]}, ${channels[2]})`;
}

function buildLoopBundles(
	edges: GraphEdge[],
	nodeMap: Map<string, NodePos>,
	isRadial: boolean
): LoopBundle[] {
	const sectorCount = isRadial ? 4 : 2;
	const groups = new Map<string, GraphEdge[]>();

	for (const edge of edges) {
		const source = nodeMap.get(edge.source);
		const target = nodeMap.get(edge.target);
		if (!source || !target || source.id === target.id) continue;

		const angle =
			(Math.atan2(source.y - target.y, source.x - target.x) +
				Math.PI * 2) %
			(Math.PI * 2);
		const sector = Math.floor((angle / (Math.PI * 2)) * sectorCount);
		const key = `${edge.target}:${sector}`;
		const group = groups.get(key) ?? [];
		group.push(edge);
		groups.set(key, group);
	}

	const bundles: LoopBundle[] = [];
	for (const [key, group] of groups) {
		if (group.length < 2) continue;
		const target = nodeMap.get(group[0].target);
		if (!target) continue;

		let directionX = 0;
		let directionY = 0;
		const distances: number[] = [];
		for (const edge of group) {
			const source = nodeMap.get(edge.source);
			if (!source) continue;
			const dx = source.x - target.x;
			const dy = source.y - target.y;
			const distance = Math.hypot(dx, dy);
			if (distance < 1) continue;
			directionX += dx / distance;
			directionY += dy / distance;
			distances.push(distance);
		}
		if (distances.length < 2) continue;

		const directionLength = Math.hypot(directionX, directionY) || 1;
		directionX /= directionLength;
		directionY /= directionLength;
		distances.sort((a, b) => a - b);
		const medianDistance = distances[Math.floor(distances.length / 2)];
		let hubDistance = Math.max(
			82,
			Math.min(isRadial ? 190 : 230, medianDistance * 0.46)
		);
		let hub = {
			x: target.x + directionX * hubDistance,
			y: target.y + directionY * hubDistance
		};

		// Keep the collector point out of state boxes.
		for (let attempt = 0; attempt < 5; attempt++) {
			const blocked = [...nodeMap.values()].some(
				(node) =>
					node.id !== target.id && pointIntersectsNode(hub, node, 18)
			);
			if (!blocked) break;
			hubDistance += 30;
			hub = {
				x: target.x + directionX * hubDistance,
				y: target.y + directionY * hubDistance
			};
		}

		bundles.push({
			id: `bundle-${key}`,
			target: target.id,
			edges: group,
			hub
		});
	}

	return bundles;
}

function cubicPoint(
	start: Point,
	control1: Point,
	control2: Point,
	end: Point,
	t: number
): Point {
	const mt = 1 - t;
	return {
		x:
			mt * mt * mt * start.x +
			3 * mt * mt * t * control1.x +
			3 * mt * t * t * control2.x +
			t * t * t * end.x,
		y:
			mt * mt * mt * start.y +
			3 * mt * mt * t * control1.y +
			3 * mt * t * t * control2.y +
			t * t * t * end.y
	};
}

function pointIntersectsNode(point: Point, node: NodePos, padding: number): boolean {
	if (node.shape === 'circle') {
		const dx = point.x - node.x;
		const dy = point.y - node.y;
		const radius = node.radius + padding;
		return dx * dx + dy * dy <= radius * radius;
	}

	return (
		Math.abs(point.x - node.x) <= node.width / 2 + padding &&
		Math.abs(point.y - node.y) <= node.height / 2 + padding
	);
}

/**
 * Route a return edge as a compact cubic curve. Several candidate lanes on
 * both sides of the direct edge are sampled; the lane crossing the fewest
 * states wins. This keeps return arrows connected to node borders without
 * sending every edge around the outside of the complete graph.
 */
function routeLoopEdge(
	source: NodePos,
	target: NodePos,
	nodes: Iterable<NodePos>,
	edgeIndex: number
): string {
	if (source.id === target.id) {
		const lane = 28 + (edgeIndex % 4) * 10;
		const start = getBorderPoint(source, source.x + 1, source.y - 1);
		const end = getBorderPoint(source, source.x - 1, source.y - 1);
		return `M ${start.x},${start.y} C ${source.x + lane},${source.y - source.height / 2 - lane} ${source.x - lane},${source.y - source.height / 2 - lane} ${end.x},${end.y}`;
	}

	const dx = target.x - source.x;
	const dy = target.y - source.y;
	const distance = Math.hypot(dx, dy);
	const normal = { x: -dy / distance, y: dx / distance };
	const nodeList = [...nodes].filter(
		(node) => node.id !== source.id && node.id !== target.id
	);
	const preferredSide = edgeIndex % 2 === 0 ? 1 : -1;
	const baseBend = Math.max(28, Math.min(96, distance * 0.18));

	let best:
		| {
				start: Point;
				control1: Point;
				control2: Point;
				end: Point;
				score: number;
		  }
		| undefined;

	for (const side of [preferredSide, -preferredSide]) {
		for (let lane = 0; lane < 7; lane++) {
			const bend = baseBend + lane * 18 + (edgeIndex % 3) * 5;
			const offsetX = normal.x * bend * side;
			const offsetY = normal.y * bend * side;
			const control1 = {
				x: source.x + dx * 0.22 + offsetX,
				y: source.y + dy * 0.22 + offsetY
			};
			const control2 = {
				x: source.x + dx * 0.78 + offsetX,
				y: source.y + dy * 0.78 + offsetY
			};
			const start = getBorderPoint(source, control1.x, control1.y);
			const end = getBorderPoint(target, control2.x, control2.y);

			let collisions = 0;
			for (let sample = 2; sample < 30; sample++) {
				const point = cubicPoint(
					start,
					control1,
					control2,
					end,
					sample / 31
				);
				for (const node of nodeList) {
					if (pointIntersectsNode(point, node, 8)) {
						collisions++;
						break;
					}
				}
			}

			const score =
				collisions * 42 +
				bend +
				(side === preferredSide ? 0 : 4);
			if (!best || score < best.score) {
				best = { start, control1, control2, end, score };
			}
			if (collisions === 0) break;
		}
	}

	if (!best) return '';
	return `M ${best.start.x},${best.start.y} C ${best.control1.x},${best.control1.y} ${best.control2.x},${best.control2.y} ${best.end.x},${best.end.y}`;
}

function routeBundleTrunk(bundle: LoopBundle, target: NodePos): string {
	const dx = target.x - bundle.hub.x;
	const dy = target.y - bundle.hub.y;
	const distance = Math.hypot(dx, dy);
	if (distance < 1) return '';

	const tangent = { x: dx / distance, y: dy / distance };
	const end = getBorderPoint(target, bundle.hub.x, bundle.hub.y);
	const endDistance = Math.hypot(
		end.x - bundle.hub.x,
		end.y - bundle.hub.y
	);
	const handle = Math.max(24, endDistance * 0.34);
	const control1 = {
		x: bundle.hub.x + tangent.x * handle,
		y: bundle.hub.y + tangent.y * handle
	};
	const control2 = {
		x: end.x - tangent.x * handle,
		y: end.y - tangent.y * handle
	};

	return `M ${bundle.hub.x},${bundle.hub.y} C ${control1.x},${control1.y} ${control2.x},${control2.y} ${end.x},${end.y}`;
}

function routeBundleBranch(
	source: NodePos,
	bundle: LoopBundle,
	target: NodePos
): string {
	const trunkDx = target.x - bundle.hub.x;
	const trunkDy = target.y - bundle.hub.y;
	const trunkDistance = Math.hypot(trunkDx, trunkDy);
	if (trunkDistance < 1) return '';
	const tangent = {
		x: trunkDx / trunkDistance,
		y: trunkDy / trunkDistance
	};

	const branchDx = bundle.hub.x - source.x;
	const branchDy = bundle.hub.y - source.y;
	const branchDistance = Math.hypot(branchDx, branchDy);
	if (branchDistance < 1) return '';
	const branchDirection = {
		x: branchDx / branchDistance,
		y: branchDy / branchDistance
	};

	const start = getBorderPoint(source, bundle.hub.x, bundle.hub.y);
	const startHandle = Math.max(24, branchDistance * 0.3);
	const mergeHandle = Math.max(
		22,
		Math.min(72, Math.min(branchDistance * 0.28, trunkDistance * 0.42))
	);
	const control1 = {
		x: start.x + branchDirection.x * startHandle,
		y: start.y + branchDirection.y * startHandle
	};
	// The branch enters the hub along the same tangent with which the shared
	// trunk leaves it. Matching these handles removes hooks at the junction.
	const control2 = {
		x: bundle.hub.x - tangent.x * mergeHandle,
		y: bundle.hub.y - tangent.y * mergeHandle
	};

	return `M ${start.x},${start.y} C ${control1.x},${control1.y} ${control2.x},${control2.y} ${bundle.hub.x},${bundle.hub.y}`;
}

// ── Props / handle ────────────────────────────────────────────────────────────
interface Props {
	graphData: GraphFile | null;
	layout: LayoutName;
	showLoopbacks: boolean;
	showNormalEdges: boolean;
	onNodeClick?: (node: SelectedNodeData | null) => void;
	onStatsChange?: (stats: { nodes: number; edges: number }) => void;
}

export interface GraphViewerHandle {
	fit(): void;
	zoomIn(): void;
	zoomOut(): void;
	exportPNG(): string;
	focusNode(id: string): void;
	runLayout(name: LayoutName): void;
}

// ── Component ─────────────────────────────────────────────────────────────────
const GraphViewer = forwardRef<GraphViewerHandle, Props>(
	({ graphData, layout, showLoopbacks, showNormalEdges, onNodeClick, onStatsChange }, ref) => {
		const svgRef = useRef<SVGSVGElement>(null);
		const gRef = useRef<SVGGElement | null>(null);
		const zoomRef = useRef<d3.ZoomBehavior<SVGSVGElement, unknown> | null>(null);
		const selectedIdRef = useRef<string | null>(null);
		const nodePosRef = useRef<Map<string, NodePos>>(new Map());
		const graphDataRef = useRef(graphData);
		graphDataRef.current = graphData;
		const onNodeClickRef = useRef(onNodeClick);
		onNodeClickRef.current = onNodeClick;
		const onStatsChangeRef = useRef(onStatsChange);
		onStatsChangeRef.current = onStatsChange;

		const [activeLayout, setActiveLayout] = useState<LayoutName>(layout);
		useEffect(() => { setActiveLayout(layout); }, [layout]);

		const [tooltip, setTooltip] = useState<{ x: number; y: number; lines: string[] } | null>(null);

		// ── Highlight: click selection ─────────────────────────────────────
		const clearSelection = useCallback(() => {
			if (!gRef.current) return;
			const g = d3.select(gRef.current);
			g.selectAll<SVGGElement, NodePos>('.node-group').style('opacity', 1);
			g.selectAll<SVGPathElement, GraphEdge>('.edge-path')
				.style('opacity', 1)
				.attr('stroke', '#2C2C2C')
				.attr('stroke-width', 1.4);
			g.selectAll<SVGPathElement, GraphEdge>('.arc-path').style('opacity', 1);
			g.selectAll<SVGPathElement, LoopBundle>('.arc-trunk').style('opacity', 1);
		}, []);

		const applySelection = useCallback((id: string, data: GraphFile) => {
			if (!gRef.current) return;
			const g = d3.select(gRef.current);
			const connected = new Set([id]);
			const connectedEdgeIds = new Set<string>();
			for (const e of data.edges) {
				if (e.source === id || e.target === id) {
					connected.add(e.source);
					connected.add(e.target);
					connectedEdgeIds.add(edgeId(e));
				}
			}
			g.selectAll<SVGGElement, NodePos>('.node-group').style('opacity', (d) => connected.has(d.id) ? 1 : 0.1);
			g.selectAll<SVGPathElement, GraphEdge>('.edge-path').style('opacity', (d) =>
				connectedEdgeIds.has(d.id ?? `${d.source}--${d.target}`) ? 1 : 0.05
			);
			g.selectAll<SVGPathElement, GraphEdge>('.arc-path').style('opacity', (d) =>
				connectedEdgeIds.has(edgeId(d)) ? 1 : 0.05
			);
			g.selectAll<SVGPathElement, LoopBundle>('.arc-trunk').style(
				'opacity',
				(bundle) =>
					bundle.edges.some((edge) => connectedEdgeIds.has(edgeId(edge)))
						? 1
						: 0.05
			);
		}, []);

		// ── Highlight: hover path from root ───────────────────────────────
		const applyHoverPath = useCallback((id: string, data: GraphFile) => {
			if (!gRef.current) return;
			const g = d3.select(gRef.current);
			const { nodes: pathNodes, edgeIds: pathEdges } = findRootPath(id, data);

			g.selectAll<SVGGElement, NodePos>('.node-group').style(
				'opacity',
				(d) => (pathNodes.has(d.id) ? 1 : 0.35)
			);
			g.selectAll<SVGPathElement, GraphEdge>('.edge-path')
				.style('opacity', (d) => {
					const eid = d.id ?? `${d.source}--${d.target}`;
					return pathEdges.has(eid) ? 1 : 0.08;
				})
				.attr('stroke', (d) => {
					const eid = d.id ?? `${d.source}--${d.target}`;
					return pathEdges.has(eid) ? '#2563EB' : '#2C2C2C';
				})
				.attr('stroke-width', (d) => {
					const eid = d.id ?? `${d.source}--${d.target}`;
					return pathEdges.has(eid) ? 2.2 : 1.4;
				})
				.attr('marker-end', (d) => {
					const eid = d.id ?? `${d.source}--${d.target}`;
					return pathEdges.has(eid) ? 'url(#arrow-normal-blue)' : 'url(#arrow-normal)';
				});
			g.selectAll<SVGPathElement, GraphEdge>('.arc-path').style('opacity', 0.08);
			g.selectAll<SVGPathElement, LoopBundle>('.arc-trunk').style('opacity', 0.08);
		}, []);

		const clearHoverPath = useCallback(() => {
			if (!gRef.current) return;
			const g = d3.select(gRef.current);
			g.selectAll('.node-group').style('opacity', 1);
			g.selectAll<SVGPathElement, GraphEdge>('.edge-path')
				.style('opacity', 1)
				.attr('stroke', '#2C2C2C')
				.attr('stroke-width', 1.4)
				.attr('marker-end', 'url(#arrow-normal)');
			g.selectAll('.arc-path').style('opacity', 1);
			g.selectAll('.arc-trunk').style('opacity', 1);
		}, []);

		// ── Fit view ──────────────────────────────────────────────────────
		const fitView = useCallback((animated = true) => {
			const svg = svgRef.current;
			const g = gRef.current;
			const zoom = zoomRef.current;
			if (!svg || !g || !zoom) return;

			const bounds = g.getBBox();
			if (bounds.width < 1 || bounds.height < 1) return;

			const w = svg.clientWidth || svg.getBoundingClientRect().width;
			const h = svg.clientHeight || svg.getBoundingClientRect().height;
			if (w < 1 || h < 1) return;

			const scale = Math.min((0.88 * w) / bounds.width, (0.88 * h) / bounds.height, 3);
			const tx = w / 2 - scale * (bounds.x + bounds.width / 2);
			const ty = h / 2 - scale * (bounds.y + bounds.height / 2);

			const sel = d3.select(svg);
			const transform = d3.zoomIdentity.translate(tx, ty).scale(scale);
			if (animated) {
				sel.transition().duration(450).call(zoom.transform, transform);
			} else {
				sel.call(zoom.transform, transform);
			}
		}, []);

		// ── Init SVG + zoom (once) ────────────────────────────────────────
		useEffect(() => {
			if (!svgRef.current) return;
			const svg = d3.select(svgRef.current);
			svg.selectAll('*').remove();

			const defs = svg.append('defs');
			const addMarker = (id: string, color: string) => {
				defs.append('marker')
					.attr('id', id)
					.attr('viewBox', '0 0 10 10')
					.attr('refX', 9).attr('refY', 5)
					.attr('markerWidth', 6).attr('markerHeight', 6)
					.attr('orient', 'auto')
					.append('path')
					.attr('d', 'M 0 1 L 10 5 L 0 9 Z')
					.attr('fill', color);
			};
			addMarker('arrow-normal', '#2C2C2C');
			addMarker('arrow-normal-blue', '#2563EB');
			addMarker('arrow-loop', 'context-stroke');

			const g = svg.append('g').attr('class', 'zoom-group');
			gRef.current = g.node();

			g.append('g').attr('class', 'rings-layer');
			g.append('g').attr('class', 'loopback-layer');
			g.append('g').attr('class', 'edges-layer');
			g.append('g').attr('class', 'nodes-layer');

			const zoom = d3.zoom<SVGSVGElement, unknown>()
				.scaleExtent([0.02, 10])
				.on('zoom', (event) => g.attr('transform', event.transform));

			svg.call(zoom);
			zoomRef.current = zoom;

			svg.on('click', (event) => {
				if (event.target === svgRef.current) {
					selectedIdRef.current = null;
					clearSelection();
					onNodeClickRef.current?.(null);
				}
			});

			return () => {
				svg.selectAll('*').remove();
				gRef.current = null;
				zoomRef.current = null;
			};
		}, []); // eslint-disable-line react-hooks/exhaustive-deps

		// ── Draw graph ────────────────────────────────────────────────────
		useEffect(() => {
			if (!graphData || !gRef.current) return;

			const g = d3.select(gRef.current);
			selectedIdRef.current = null;
			setTooltip(null);

			const isRadial = activeLayout === 'radial';

			const sampleSize =
				graphData.nodes.length > 0
					? estimateNodeSize(graphData.nodes[0].tasks)
					: { width: 80, height: 36 };

			let positions: Map<string, { x: number; y: number }>;
			let ringRadii: number[] = [];

			if (isRadial) {
				const result = computeRadialPositions(graphData.nodes, graphData.edges);
				positions = result.positions;
				ringRadii = result.ringRadii;
			} else {
				positions = computeTreePositions(graphData.nodes, graphData.edges, sampleSize.width);
			}

			// ── Node map
			const nodeMap = new Map<string, NodePos>();
			for (const node of graphData.nodes) {
				const { width: wFull, height: hFull } = estimateNodeSize(node.tasks);
				const width  = isRadial ? Math.round(wFull  * 0.72) : wFull;
				const height = isRadial ? Math.round(hFull  * 0.72) : hFull;
				const pos = positions.get(node.id) ?? { x: 0, y: 0 };
				nodeMap.set(node.id, {
					id: node.id,
					x: pos.x, y: pos.y,
					width, height,
					radius: nodeCircleRadius(node.tasks),
					shape: 'rect',
					label: node.label ?? buildNodeLabel(node.tasks),
					tasks: node.tasks,
					isInitial: node.isInitial ?? false,
					borderColor: node.borderColor,
					fillColor: node.fillColor
				});
			}
			nodePosRef.current = nodeMap;

			// ── Degree maps
			const indegreeMap = new Map<string, number>();
			const outdegreeMap = new Map<string, number>();
			for (const n of graphData.nodes) { indegreeMap.set(n.id, 0); outdegreeMap.set(n.id, 0); }
			for (const e of graphData.edges) {
				indegreeMap.set(e.target, (indegreeMap.get(e.target) ?? 0) + 1);
				outdegreeMap.set(e.source, (outdegreeMap.get(e.source) ?? 0) + 1);
			}

			const normalEdges = graphData.edges.filter((e) => e.type === 'normal');
			const loopEdges = graphData.edges.filter((e) => e.type === 'loop');
			const loopIncoming = new Map<string, number>();
			for (const edge of loopEdges) {
				loopIncoming.set(
					edge.target,
					(loopIncoming.get(edge.target) ?? 0) + 1
				);
			}
			const maxLoopIncoming = Math.max(1, ...loopIncoming.values());
			const colorForTarget = (targetId: string) =>
				loopbackColor(loopIncoming.get(targetId) ?? 1, maxLoopIncoming);

			// ── Concentric rings (radial only) ─────────────────────────────
			const ringsLayer = g.select('.rings-layer');
			ringsLayer.selectAll('*').remove();

			if (isRadial) {
				ringRadii.forEach((r, i) => {
					ringsLayer.append('circle')
						.attr('r', r)
						.attr('fill', 'none')
						.attr('stroke', '#BBBBBB')
						.attr('stroke-width', 0.6)
						.attr('stroke-dasharray', '5,5');

					ringsLayer.append('text')
						.attr('x', r + 6)
						.attr('y', 4)
						.attr('font-size', '10px')
						.attr('fill', '#AAAAAA')
						.attr('font-family', 'Inter, sans-serif')
						.attr('pointer-events', 'none')
						.text(`L${i + 1}`);
				});
			}

			// ── Loopback arcs ──────────────────────────────────────────────
			const loopbackLayer = g.select('.loopback-layer');
			loopbackLayer.style('display', showLoopbacks ? null : 'none');
			loopbackLayer.selectAll('*').remove();

			const loopBundles = buildLoopBundles(loopEdges, nodeMap, isRadial);
			const bundleByEdge = new Map<string, LoopBundle>();
			for (const bundle of loopBundles) {
				for (const edge of bundle.edges) {
					bundleByEdge.set(edgeId(edge), bundle);
				}
			}

			// One shared arrow-bearing trunk per bundle.
			loopbackLayer
				.selectAll<SVGPathElement, LoopBundle>('path.arc-trunk')
				.data(loopBundles, (bundle) => bundle.id)
				.join('path')
				.attr('class', 'arc-trunk')
				.attr('fill', 'none')
				.attr('stroke', (bundle) => colorForTarget(bundle.target))
				.attr('stroke-width', 1.8)
				.attr('stroke-linecap', 'round')
				.attr('stroke-linejoin', 'round')
				.attr('stroke-dasharray', '7,6')
				.attr('marker-end', 'url(#arrow-loop)')
				.attr('d', (bundle) => {
					const target = nodeMap.get(bundle.target);
					if (!target) return '';
					return routeBundleTrunk(bundle, target);
				});

			// Individual branches converge on the shared collector. Only
			// unbundled edges keep their own arrowhead.
			loopbackLayer
				.selectAll<SVGPathElement, GraphEdge>('path.arc-path')
				.data(loopEdges, edgeId)
				.join('path')
				.attr('class', 'arc-path')
				.attr('fill', 'none')
				.attr('stroke', (edge) => colorForTarget(edge.target))
				.attr('stroke-width', 1.5)
				.attr('stroke-linecap', 'round')
				.attr('stroke-linejoin', 'round')
				.attr('stroke-dasharray', '7,6')
				.attr('marker-end', (edge) =>
					bundleByEdge.has(edgeId(edge)) ? null : 'url(#arrow-loop)'
				)
				.attr('d', (edge, idx) => {
					const src = nodeMap.get(edge.source);
					const tgt = nodeMap.get(edge.target);
					if (!src || !tgt) return '';
					const bundle = bundleByEdge.get(edgeId(edge));
					if (bundle) {
						return routeBundleBranch(src, bundle, tgt);
					}
					return routeLoopEdge(src, tgt, nodeMap.values(), idx);
				});

			// ── Normal edges ───────────────────────────────────────────────
			const edgesLayer = g.select('.edges-layer');
			edgesLayer.style('display', showNormalEdges ? null : 'none');
			edgesLayer.selectAll('*').remove();

			edgesLayer
				.selectAll<SVGPathElement, GraphEdge>('path.edge-path')
				.data(normalEdges, (d) => d.id ?? `${d.source}--${d.target}`)
				.join('path')
				.attr('class', 'edge-path')
				.attr('fill', 'none')
				.attr('stroke', '#2C2C2C')
				.attr('stroke-width', 1.4)
				.attr('marker-end', 'url(#arrow-normal)')
				.attr('d', (edge) => {
					const src = nodeMap.get(edge.source);
					const tgt = nodeMap.get(edge.target);
					if (!src || !tgt) return '';
					const srcEP = getBorderPoint(src, tgt.x, tgt.y);
					const tgtEP = getBorderPoint(tgt, src.x, src.y);
					if (isRadial) {
						// Subtle outward curve from graph centre
						const mxn = (src.x + tgt.x) / 2;
						const myn = (src.y + tgt.y) / 2;
						const mdist = Math.sqrt(mxn * mxn + myn * myn);
						const pull = mdist > 5 ? 1.18 : 1;
						return `M ${srcEP.x},${srcEP.y} Q ${mxn * pull},${myn * pull} ${tgtEP.x},${tgtEP.y}`;
					}
					return `M ${srcEP.x},${srcEP.y} L ${tgtEP.x},${tgtEP.y}`;
				});

			// ── Nodes ─────────────────────────────────────────────────────
			const nodesLayer = g.select('.nodes-layer');
			nodesLayer.selectAll('*').remove();

			const nodeGroups = nodesLayer
				.selectAll<SVGGElement, NodePos>('g.node-group')
				.data([...nodeMap.values()], (d) => d.id)
				.join('g')
				.attr('class', 'node-group')
				.attr('transform', (d) => `translate(${d.x},${d.y})`)
				.style('cursor', 'pointer');

			// Initial state arrow
			nodeGroups.filter((d) => d.isInitial).append('line')
				.attr('x1', 0)
				.attr('y1', (d) => -(d.shape === 'circle' ? d.radius : d.height / 2) - 22)
				.attr('x2', 0)
				.attr('y2', (d) => -(d.shape === 'circle' ? d.radius : d.height / 2) - 4)
				.attr('stroke', '#1A1A1A')
				.attr('stroke-width', 1.8)
				.attr('marker-end', 'url(#arrow-normal)');

			// Circle shape
			nodeGroups.filter((d) => d.shape === 'circle')
				.append('circle')
				.attr('r', (d) => d.radius)
				.attr('fill', (d) => d.fillColor ?? '#FFFFFF')
				.attr('stroke', (d) => d.borderColor ?? '#1A1A1A')
				.attr('stroke-width', (d) => (d.isInitial ? 3 : 1.8));

			// Rect shape
			nodeGroups.filter((d) => d.shape === 'rect')
				.append('rect')
				.attr('x', (d) => -d.width / 2)
				.attr('y', (d) => -d.height / 2)
				.attr('width', (d) => d.width)
				.attr('height', (d) => d.height)
				.attr('rx', 6).attr('ry', 6)
				.attr('fill', (d) => d.fillColor ?? '#FFFFFF')
				.attr('stroke', (d) => d.borderColor ?? '#1A1A1A')
				.attr('stroke-width', (d) => (d.isInitial ? 3 : 1.8));

			// Labels
			nodeGroups.each(function (d) {
				const group = d3.select(this);
				const lines = d.label.split('\n');
				const fontSize = isRadial ? 8 : 11;
				const lineH = fontSize + 3;
				const totalH = lines.length * lineH;
				const startY = -totalH / 2 + lineH * 0.72;

				const textEl = group.append('text')
					.attr('text-anchor', 'middle')
					.attr('font-family', '"JetBrains Mono", "Fira Mono", monospace')
					.attr('font-size', `${fontSize}px`)
					.attr('fill', '#1A1A1A')
					.attr('pointer-events', 'none');

				lines.forEach((line, i) => {
					textEl.append('tspan').attr('x', 0).attr('y', startY + i * lineH).text(line);
				});
			});

			// ── Events ────────────────────────────────────────────────────
			nodeGroups.on('mouseenter', function (_evt, d) {
				if (!svgRef.current) return;

				// Tooltip
				const transform = d3.zoomTransform(svgRef.current);
				const [px, py] = transform.apply([d.x, d.y]);
				const lines: string[] = [`ID: ${d.id}`];
				d.tasks.forEach((t, i) => {
					const rel = t.release === 'up' ? ' ↑ released' : t.release === 'down' ? ' ↓ completing' : '';
					lines.push(`τ${i + 1}: c=${t.task.c}  d=${t.task.d}${rel}`);
				});
				setTooltip({ x: px + 14, y: py - 8, lines });

				// Hover path highlight only when nothing is selected
				if (!selectedIdRef.current) {
					applyHoverPath(d.id, graphData);
				}
			});

			nodeGroups.on('mouseleave', () => {
				setTooltip(null);
				if (!selectedIdRef.current) {
					clearHoverPath();
				}
			});

			nodeGroups.on('click', function (event, d) {
				event.stopPropagation();

				if (selectedIdRef.current === d.id) {
					selectedIdRef.current = null;
					clearSelection();
					onNodeClickRef.current?.(null);
					return;
				}

				selectedIdRef.current = d.id;
				applySelection(d.id, graphData);
				onNodeClickRef.current?.({
					id: d.id, label: d.label, tasks: d.tasks,
					isInitial: d.isInitial, borderColor: d.borderColor, fillColor: d.fillColor,
					indegree: indegreeMap.get(d.id) ?? 0,
					outdegree: outdegreeMap.get(d.id) ?? 0
				});
			});

			onStatsChangeRef.current?.({ nodes: graphData.nodes.length, edges: graphData.edges.length });
			requestAnimationFrame(() => fitView(true));
		}, [graphData, activeLayout, showLoopbacks, showNormalEdges, clearSelection, applySelection, applyHoverPath, clearHoverPath, fitView]);

		// ── Imperative handle ─────────────────────────────────────────────
		useImperativeHandle(ref, () => ({
			fit() { fitView(true); },

			zoomIn() {
				const svg = svgRef.current;
				const zoom = zoomRef.current;
				if (!svg || !zoom) return;
				d3.select(svg).transition().duration(200).call(zoom.scaleBy, 1.3);
			},

			zoomOut() {
				const svg = svgRef.current;
				const zoom = zoomRef.current;
				if (!svg || !zoom) return;
				d3.select(svg).transition().duration(200).call(zoom.scaleBy, 0.77);
			},

			exportPNG() {
				const svg = svgRef.current;
				if (!svg) return '';
				const clone = svg.cloneNode(true) as SVGSVGElement;
				clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
				const svgStr = new XMLSerializer().serializeToString(clone);
				return `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(svgStr)))}`;
			},

			focusNode(id: string) {
				const nodeData = nodePosRef.current.get(id);
				const data = graphDataRef.current;
				if (!nodeData || !data || !svgRef.current || !zoomRef.current) return;

				selectedIdRef.current = id;
				applySelection(id, data);

				const indegreeMap = new Map<string, number>();
				const outdegreeMap = new Map<string, number>();
				for (const n of data.nodes) { indegreeMap.set(n.id, 0); outdegreeMap.set(n.id, 0); }
				for (const e of data.edges) {
					indegreeMap.set(e.target, (indegreeMap.get(e.target) ?? 0) + 1);
					outdegreeMap.set(e.source, (outdegreeMap.get(e.source) ?? 0) + 1);
				}

				onNodeClickRef.current?.({
					id: nodeData.id, label: nodeData.label, tasks: nodeData.tasks,
					isInitial: nodeData.isInitial, borderColor: nodeData.borderColor, fillColor: nodeData.fillColor,
					indegree: indegreeMap.get(id) ?? 0, outdegree: outdegreeMap.get(id) ?? 0
				});

				const svg = svgRef.current;
				const zoom = zoomRef.current;
				const w = svg.clientWidth || svg.getBoundingClientRect().width;
				const h = svg.clientHeight || svg.getBoundingClientRect().height;
				d3.select(svg).transition().duration(450).call(
					zoom.transform,
					d3.zoomIdentity.translate(w / 2 - 2 * nodeData.x, h / 2 - 2 * nodeData.y).scale(2)
				);
			},

			runLayout(name: LayoutName) { setActiveLayout(name); }
		}));

		return (
			<div className="graph-viewer-wrapper">
				<svg ref={svgRef} className="graph-svg" style={{ width: '100%', height: '100%' }} />
				{tooltip && (
					<div className="node-tooltip" style={{ left: tooltip.x, top: tooltip.y }}>
						{tooltip.lines.map((line, i) => <div key={i}>{line}</div>)}
					</div>
				)}
			</div>
		);
	}
);

GraphViewer.displayName = 'GraphViewer';
export default GraphViewer;
