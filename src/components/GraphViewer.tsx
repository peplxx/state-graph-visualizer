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
	SelectionState,
	NodeTaskDisplay
} from '../types/graph';
import type { LayoutName } from '../core/layoutConfig';

const SELECTION_STROKE = '#9B2E23';

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

const ENTRANCE_LAYER_STEP_MS = 130;
const ENTRANCE_LAYER_JITTER_MS = 170;
const ENTRANCE_DURATION_MS = 420;
const ENTRANCE_EDGE_LAG_MS = 90;
const ENTRANCE_EDGE_JITTER_MS = 110;

function prefersReducedMotion(): boolean {
	return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function buildNodeEntranceDelays(
	depths: Map<string, number>
): Map<string, number> {
	const byLayer = new Map<number, string[]>();

	for (const [id, depth] of depths) {
		const layer = byLayer.get(depth);
		if (layer) layer.push(id);
		else byLayer.set(depth, [id]);
	}

	const delays = new Map<string, number>();
	for (const [depth, ids] of byLayer) {
		for (const id of ids) {
			delays.set(
				id,
				depth * ENTRANCE_LAYER_STEP_MS +
					Math.random() * ENTRANCE_LAYER_JITTER_MS
			);
		}
	}

	return delays;
}

function buildEdgeEntranceDelays(
	edges: Iterable<GraphEdge>,
	nodeDelays: Map<string, number>
): Map<string, number> {
	const delays = new Map<string, number>();
	for (const edge of edges) {
		const id = edgeId(edge);
		const base = nodeDelays.get(edge.target) ?? 0;
		delays.set(
			id,
			base +
				ENTRANCE_EDGE_LAG_MS +
				Math.random() * ENTRANCE_EDGE_JITTER_MS
		);
	}
	return delays;
}

function buildLoopEdgeEntranceDelays(
	edges: Iterable<GraphEdge>,
	nodeDelays: Map<string, number>
): Map<string, number> {
	const delays = new Map<string, number>();
	for (const edge of edges) {
		const id = edgeId(edge);
		const nodeShownAt =
			(nodeDelays.get(edge.source) ?? 0) + ENTRANCE_DURATION_MS;
		delays.set(
			id,
			nodeShownAt +
				ENTRANCE_EDGE_LAG_MS +
				Math.random() * ENTRANCE_EDGE_JITTER_MS
		);
	}
	return delays;
}

function buildBundleTrunkEntranceDelays(
	bundles: LoopBundle[],
	nodeDelays: Map<string, number>
): Map<string, number> {
	const delays = new Map<string, number>();
	for (const bundle of bundles) {
		let latestBranchEnd = 0;
		for (const edge of bundle.edges) {
			const branchStart =
				(nodeDelays.get(edge.source) ?? 0) +
				ENTRANCE_DURATION_MS +
				ENTRANCE_EDGE_LAG_MS;
			latestBranchEnd = Math.max(
				latestBranchEnd,
				branchStart + ENTRANCE_DURATION_MS
			);
		}
		delays.set(
			bundle.id,
			latestBranchEnd +
				ENTRANCE_EDGE_LAG_MS +
				Math.random() * ENTRANCE_EDGE_JITTER_MS
		);
	}
	return delays;
}

function animateNodeEntrance(
	nodeGroups: d3.Selection<SVGGElement, NodePos, SVGGElement, unknown>,
	delays: Map<string, number>
) {
	if (prefersReducedMotion()) {
		nodeGroups.style('opacity', 1);
		return;
	}

	nodeGroups.interrupt('node-entrance');
	nodeGroups
		.style('opacity', 0)
		.transition('node-entrance')
		.delay((d) => delays.get(d.id) ?? 0)
		.duration(ENTRANCE_DURATION_MS)
		.ease(d3.easeCubicOut)
		.style('opacity', 1);
}

function animateStrokeDrawEntrance<T>(
	paths: d3.Selection<SVGPathElement, T, SVGGElement, unknown>,
	delays: Map<string, number>,
	idOf: (datum: T) => string,
	finishedDasharray?: string | null
) {
	if (paths.empty()) return;

	if (prefersReducedMotion()) {
		paths.attr('opacity', 1);
		if (finishedDasharray !== undefined) {
			paths
				.attr('stroke-dasharray', finishedDasharray)
				.attr('stroke-dashoffset', null);
		}
		return;
	}

	paths.interrupt('edge-entrance');
	paths.each(function () {
		const length = (this as SVGPathElement).getTotalLength();
		const path = d3.select(this);
		const markerEnd = path.attr('marker-end');
		if (markerEnd) {
			path.attr('data-marker-end', markerEnd).attr('marker-end', null);
		}
		path
			.attr('opacity', 1)
			.attr('stroke-dasharray', `${length} ${length}`)
			.attr('stroke-dashoffset', length);
	});

	paths
		.transition('edge-entrance')
		.delay((d) => delays.get(idOf(d)) ?? 0)
		.duration(ENTRANCE_DURATION_MS)
		.ease(d3.easeQuadOut)
		.attr('stroke-dashoffset', 0)
		.on('end', function () {
			const path = d3.select(this);
			const markerEnd = path.attr('data-marker-end');
			path
				.attr('stroke-dasharray', finishedDasharray ?? null)
				.attr('stroke-dashoffset', null);
			if (markerEnd) {
				path.attr('marker-end', markerEnd).attr('data-marker-end', null);
			}
		});
}

const SVG_NS = 'http://www.w3.org/2000/svg';
const EXPORT_FONT_CSS = `
@import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500&display=swap');
text, tspan {
	font-family: 'JetBrains Mono', 'Fira Mono', ui-monospace, monospace;
}
`;

function prepareExportSvg(svg: SVGSVGElement): SVGSVGElement {
	const w = svg.clientWidth;
	const h = svg.clientHeight;
	const clone = svg.cloneNode(true) as SVGSVGElement;

	clone.setAttribute('xmlns', SVG_NS);
	clone.setAttribute('xmlns:xlink', 'http://www.w3.org/1999/xlink');
	clone.setAttribute('width', String(w));
	clone.setAttribute('height', String(h));
	clone.setAttribute('viewBox', `0 0 ${w} ${h}`);
	clone.removeAttribute('class');
	clone.style.removeProperty('width');
	clone.style.removeProperty('height');

	let defs = clone.querySelector('defs');
	if (!defs) {
		defs = document.createElementNS(SVG_NS, 'defs');
		clone.insertBefore(defs, clone.firstChild);
	}
	const style = document.createElementNS(SVG_NS, 'style');
	style.setAttribute('type', 'text/css');
	style.textContent = EXPORT_FONT_CSS;
	defs.insertBefore(style, defs.firstChild);

	clone.querySelectorAll('.node-group').forEach((node) => {
		node.setAttribute('opacity', '1');
		(node as SVGGElement).style.opacity = '1';
		const transform = node.getAttribute('transform');
		if (transform) {
			const match = transform.match(/translate\(([-\d.]+),([-\d.]+)\)/);
			if (match) {
				node.setAttribute(
					'transform',
					`translate(${match[1]},${match[2]})`
				);
			}
		}
		node.classList.remove('is-lasso-preview');
	});

	clone.querySelectorAll('path').forEach((path) => {
		path.setAttribute('opacity', '1');
		path.removeAttribute('stroke-dasharray');
		path.removeAttribute('stroke-dashoffset');
	});

	clone.querySelectorAll('text, tspan').forEach((el) => {
		const fontSize = el.getAttribute('font-size');
		if (fontSize?.endsWith('px')) {
			el.setAttribute('font-size', fontSize.slice(0, -2));
		}
		if (el.tagName === 'text' && !el.getAttribute('fill')) {
			el.setAttribute('fill', '#1A1A1A');
		}
	});

	return clone;
}

function svgToDataUrl(svg: SVGSVGElement): string {
	const prepared = prepareExportSvg(svg);
	const svgStr = new XMLSerializer().serializeToString(prepared);
	return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgStr)}`;
}

/** BFS path from initial node to target; returns {nodes, edgeIds} */
function findRootPath(
	targetId: string,
	data: GraphFile
): { nodes: Set<string>; edgeIds: Set<string> } {
	const empty = {
		nodes: new Set<string>([targetId]),
		edgeIds: new Set<string>()
	};

	const root = data.nodes.find((n) => n.isInitial);
	if (!root) return empty;
	if (root.id === targetId)
		return { nodes: new Set([targetId]), edgeIds: new Set() };

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
		if (cur === targetId) {
			found = true;
			break;
		}
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
			ch.length === 0
				? 1
				: ch.reduce((s, c) => s + (leafCount.get(c) ?? 1), 0)
		);
	}

	// Assign angle ranges proportionally by subtree size, starting from top (−π/2)
	const aStart = new Map<string, number>();
	const aEnd = new Map<string, number>();
	const totalRootLeaves = rootIds.reduce(
		(s, r) => s + (leafCount.get(r) ?? 1),
		0
	);
	let cur = -Math.PI / 2;
	for (const rid of rootIds) {
		const range =
			((leafCount.get(rid) ?? 1) / totalRootLeaves) * 2 * Math.PI;
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
		const totalL = children.reduce(
			(s, c) => s + (leafCount.get(c) ?? 1),
			0
		);
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
			const r =
				d === 0
					? RADIAL_BASE * 0.45
					: RADIAL_BASE + (d - 1) * RADIAL_GAP;
			const angle =
				((aStart.get(n.id) ?? 0) + (aEnd.get(n.id) ?? 2 * Math.PI)) / 2;
			positions.set(n.id, {
				x: r * Math.cos(angle),
				y: r * Math.sin(angle)
			});
		}
	}

	return { positions, ringRadii };
}

// ── Tree layout: Reingold-Tilford via d3.tree ─────────────────────────────────
const TREE_LEVEL_GAP = 130;
const TREE_Y_OFFSET = 130;
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
): {
	positions: Map<string, { x: number; y: number }>;
	levelYs: number[];
} {
	const spanTree = buildSpanningTree(nodes, edges);
	const hierarchy = d3.hierarchy<D3SpanNode>(spanTree, (d) => d.children);

	const treeLayout = d3
		.tree<D3SpanNode>()
		.nodeSize([nodeWidth + 24, TREE_LEVEL_GAP])
		.separation((a, b) => (a.parent === b.parent ? 1 : 1.4));

	treeLayout(hierarchy);

	const positions = new Map<string, { x: number; y: number }>();
	const levelYs = new Set<number>();
	for (const node of hierarchy.descendants()) {
		if (node.data.id === '__root__') continue;
		const y = ((node as any).y as number) + TREE_Y_OFFSET;
		positions.set(node.data.id, {
			x: (node as any).x as number,
			y
		});
		levelYs.add(y);
	}

	return {
		positions,
		levelYs: [...levelYs].sort((a, b) => a - b)
	};
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

function routeNormalEdge(
	source: NodePos,
	target: NodePos,
	isRadial: boolean
): string {
	const srcEP = getBorderPoint(source, target.x, target.y);
	const tgtEP = getBorderPoint(target, source.x, source.y);

	const dx = tgtEP.x - srcEP.x;
	const dy = tgtEP.y - srcEP.y;
	const distance = Math.hypot(dx, dy);
	if (distance < 1) {
		return `M ${srcEP.x},${srcEP.y} L ${tgtEP.x},${tgtEP.y}`;
	}

	if (!isRadial) {
		return `M ${srcEP.x},${srcEP.y} L ${tgtEP.x},${tgtEP.y}`;
	}

	const ux = dx / distance;
	const uy = dy / distance;
	const nx = -uy;
	const ny = ux;

	// Short axial handles keep entry/exit smooth; a tiny perpendicular offset
	// adds a gentle fillet to the body without a visible outward bulge.
	const handle = Math.max(12, Math.min(distance * 0.2, 44));
	const round = Math.min(distance * 0.04, 4.5);
	const cp1 = {
		x: srcEP.x + ux * handle + nx * round,
		y: srcEP.y + uy * handle + ny * round
	};
	const cp2 = {
		x: tgtEP.x - ux * handle - nx * round,
		y: tgtEP.y - uy * handle - ny * round
	};

	return `M ${srcEP.x},${srcEP.y} C ${cp1.x},${cp1.y} ${cp2.x},${cp2.y} ${tgtEP.x},${tgtEP.y}`;
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

function pointIntersectsNode(
	point: Point,
	node: NodePos,
	padding: number
): boolean {
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
				collisions * 42 + bend + (side === preferredSide ? 0 : 4);
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
	const endDistance = Math.hypot(end.x - bundle.hub.x, end.y - bundle.hub.y);
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

function isAdditiveSelect(event: MouseEvent | PointerEvent): boolean {
	return event.metaKey || event.ctrlKey;
}

function pointInPolygon(x: number, y: number, polygon: Point[]): boolean {
	if (polygon.length < 3) return false;
	let inside = false;
	for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
		const xi = polygon[i].x;
		const yi = polygon[i].y;
		const xj = polygon[j].x;
		const yj = polygon[j].y;
		const intersects =
			yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;
		if (intersects) inside = !inside;
	}
	return inside;
}

function isLassoModifier(
	shiftKeyRef: { current: boolean },
	event: { shiftKey: boolean }
): boolean {
	return shiftKeyRef.current || event.shiftKey;
}

function graphToWrapper(
	wrapper: HTMLElement,
	svg: SVGSVGElement,
	point: Point
): Point {
	const wrapperRect = wrapper.getBoundingClientRect();
	const svgRect = svg.getBoundingClientRect();
	const transform = d3.zoomTransform(svg);
	const [sx, sy] = transform.apply([point.x, point.y]);
	return {
		x: sx + (svgRect.left - wrapperRect.left),
		y: sy + (svgRect.top - wrapperRect.top)
	};
}

function nodeHitsLassoRegion(
	node: NodePos,
	wrapper: HTMLElement,
	svg: SVGSVGElement,
	wrapperRegion: Point[]
): boolean {
	if (wrapperRegion.length < 2) return false;

	const hw = node.width / 2;
	const hh = node.height / 2;
	const graphSamples = [
		{ x: node.x, y: node.y },
		{ x: node.x - hw, y: node.y - hh },
		{ x: node.x + hw, y: node.y - hh },
		{ x: node.x + hw, y: node.y + hh },
		{ x: node.x - hw, y: node.y + hh }
	];
	const samples = graphSamples.map((sample) =>
		graphToWrapper(wrapper, svg, sample)
	);

	if (wrapperRegion.length >= 3) {
		return samples.some((sample) =>
			pointInPolygon(sample.x, sample.y, wrapperRegion)
		);
	}

	const xs = wrapperRegion.map((point) => point.x);
	const ys = wrapperRegion.map((point) => point.y);
	const minX = Math.min(...xs);
	const maxX = Math.max(...xs);
	const minY = Math.min(...ys);
	const maxY = Math.max(...ys);

	return samples.some(
		(sample) =>
			sample.x >= minX &&
			sample.x <= maxX &&
			sample.y >= minY &&
			sample.y <= maxY
	);
}

function computeLassoHits(
	wrapperPoints: Point[],
	wrapper: HTMLElement,
	svg: SVGSVGElement,
	nodeMap: Map<string, NodePos>,
	gRoot: SVGGElement | null
): Set<string> {
	if (wrapperPoints.length < 2) return new Set();

	const hitIds = new Set<string>();
	if (nodeMap.size > 0) {
		for (const [id, node] of nodeMap) {
			if (nodeHitsLassoRegion(node, wrapper, svg, wrapperPoints)) {
				hitIds.add(id);
			}
		}
	} else if (gRoot) {
		d3.select(gRoot)
			.selectAll<SVGGElement, NodePos>('.node-group')
			.each((node) => {
				if (nodeHitsLassoRegion(node, wrapper, svg, wrapperPoints)) {
					hitIds.add(node.id);
				}
			});
	}

	return hitIds;
}

function computeGroupConnectivity(
	selectedIds: Set<string>,
	edges: GraphEdge[]
): GroupConnectivity {
	let internalEdges = 0;
	let externalEdgesIn = 0;
	let externalEdgesOut = 0;

	for (const edge of edges) {
		const sourceSelected = selectedIds.has(edge.source);
		const targetSelected = selectedIds.has(edge.target);
		if (sourceSelected && targetSelected) {
			internalEdges++;
		} else if (sourceSelected) {
			externalEdgesOut++;
		} else if (targetSelected) {
			externalEdgesIn++;
		}
	}

	return {
		nodeCount: selectedIds.size,
		internalEdges,
		externalEdgesIn,
		externalEdgesOut,
		totalIndegree: 0,
		totalOutdegree: 0
	};
}

// ── Props / handle ────────────────────────────────────────────────────────────
interface Props {
	graphData: GraphFile | null;
	layout: LayoutName;
	showLoopbacks: boolean;
	showNormalEdges: boolean;
	enableAnimation: boolean;
	onSelectionChange?: (selection: SelectionState | null) => void;
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
	(
		{
			graphData,
			layout,
			showLoopbacks,
			showNormalEdges,
			enableAnimation,
			onSelectionChange,
			onStatsChange
		},
		ref
	) => {
		const svgRef = useRef<SVGSVGElement>(null);
		const wrapperRef = useRef<HTMLDivElement>(null);
		const gRef = useRef<SVGGElement | null>(null);
		const zoomRef = useRef<d3.ZoomBehavior<SVGSVGElement, unknown> | null>(
			null
		);
		const selectedIdsRef = useRef<Set<string>>(new Set());
		const nodePosRef = useRef<Map<string, NodePos>>(new Map());
		const indegreeMapRef = useRef<Map<string, number>>(new Map());
		const outdegreeMapRef = useRef<Map<string, number>>(new Map());
		const graphDataRef = useRef(graphData);
		graphDataRef.current = graphData;
		const onSelectionChangeRef = useRef(onSelectionChange);
		onSelectionChangeRef.current = onSelectionChange;
		const spaceKeyRef = useRef(false);
		const shiftKeyRef = useRef(false);
		const suppressClickRef = useRef(false);
		const lassoActiveRef = useRef(false);
		const entranceGraphRef = useRef<GraphFile | null>(null);
		const entranceLayoutRef = useRef<LayoutName | null>(null);
		const onStatsChangeRef = useRef(onStatsChange);
		onStatsChangeRef.current = onStatsChange;

		const [activeLayout, setActiveLayout] = useState<LayoutName>(layout);
		useEffect(() => {
			setActiveLayout(layout);
		}, [layout]);

		const [tooltip, setTooltip] = useState<{
			x: number;
			y: number;
			lines: string[];
		} | null>(null);
		const [lassoPoints, setLassoPoints] = useState<Point[]>([]);
		const [panHeld, setPanHeld] = useState(false);
		const [panDragging, setPanDragging] = useState(false);
		const [shiftHeld, setShiftHeld] = useState(false);

		const buildSelectionState = useCallback(
			(ids: Set<string>): SelectionState | null => {
				if (ids.size === 0) return null;
				const data = graphDataRef.current;
				if (!data) return null;

				const nodes = [...ids]
					.map((id) => {
						const d = nodePosRef.current.get(id);
						if (!d) return null;
						return {
							id: d.id,
							label: d.label,
							tasks: d.tasks,
							isInitial: d.isInitial,
							borderColor: d.borderColor,
							fillColor: d.fillColor,
							indegree: indegreeMapRef.current.get(id) ?? 0,
							outdegree: outdegreeMapRef.current.get(id) ?? 0
						} satisfies SelectedNodeData;
					})
					.filter((node): node is SelectedNodeData => node !== null)
					.sort((a, b) => a.id.localeCompare(b.id));

				if (nodes.length === 0) return null;
				if (nodes.length === 1) return { nodes };

				const group = computeGroupConnectivity(ids, data.edges);
				group.totalIndegree = nodes.reduce(
					(sum, node) => sum + node.indegree,
					0
				);
				group.totalOutdegree = nodes.reduce(
					(sum, node) => sum + node.outdegree,
					0
				);
				return { nodes, group };
			},
			[]
		);

		const emitSelection = useCallback(
			(ids: Set<string>) => {
				onSelectionChangeRef.current?.(buildSelectionState(ids));
			},
			[buildSelectionState]
		);

		// ── Highlight: click selection ─────────────────────────────────────
		const clearSelection = useCallback(() => {
			if (!gRef.current) return;
			const g = d3.select(gRef.current);
			g.selectAll<SVGGElement, NodePos>('.node-group')
				.style('opacity', 1)
				.classed('is-selected', false)
				.classed('is-lasso-preview', false)
				.each(function (d) {
					const shape = d3.select(this).select('rect, circle');
					if (shape.empty()) return;
					shape
						.attr('stroke', d.borderColor ?? '#1A1A1A')
						.attr('stroke-width', d.isInitial ? 3 : 1.8)
						.attr('stroke-dasharray', null);
				});
			g.selectAll<SVGPathElement, GraphEdge>('.edge-path')
				.style('opacity', 1)
				.attr('stroke', '#2C2C2C')
				.attr('stroke-width', 1.4);
			g.selectAll<SVGPathElement, GraphEdge>('.arc-path').style(
				'opacity',
				1
			);
			g.selectAll<SVGPathElement, LoopBundle>('.arc-trunk').style(
				'opacity',
				1
			);
		}, []);

		const applySelection = useCallback(
			(ids: Set<string>, data: GraphFile) => {
				if (!gRef.current || ids.size === 0) return;
				const g = d3.select(gRef.current);
				const connected = new Set(ids);
				const connectedEdgeIds = new Set<string>();
				for (const e of data.edges) {
					if (ids.has(e.source) || ids.has(e.target)) {
						connected.add(e.source);
						connected.add(e.target);
						connectedEdgeIds.add(edgeId(e));
					}
				}
				g.selectAll<SVGGElement, NodePos>('.node-group')
					.style('opacity', (d) => (connected.has(d.id) ? 1 : 0.1))
					.classed('is-selected', (d) => ids.has(d.id))
					.classed('is-lasso-preview', false)
					.each(function (d) {
						const group = d3.select(this);
						const shape = group.select('rect, circle');
						if (shape.empty()) return;
						if (ids.has(d.id)) {
							shape
								.attr('stroke', SELECTION_STROKE)
								.attr('stroke-width', 2.4)
								.attr('stroke-dasharray', null);
							return;
						}
						shape
							.attr('stroke', d.borderColor ?? '#1A1A1A')
							.attr('stroke-width', d.isInitial ? 3 : 1.8)
							.attr('stroke-dasharray', null);
					});
				g.selectAll<SVGPathElement, GraphEdge>('.edge-path').style(
					'opacity',
					(d) => (connectedEdgeIds.has(edgeId(d)) ? 1 : 0.05)
				);
				g.selectAll<SVGPathElement, GraphEdge>('.arc-path').style(
					'opacity',
					(d) => (connectedEdgeIds.has(edgeId(d)) ? 1 : 0.05)
				);
				g.selectAll<SVGPathElement, LoopBundle>('.arc-trunk').style(
					'opacity',
					(bundle) =>
						bundle.edges.some((edge) =>
							connectedEdgeIds.has(edgeId(edge))
						)
							? 1
							: 0.05
				);
			},
			[]
		);

		const applySelectionRef = useRef(applySelection);
		applySelectionRef.current = applySelection;
		const clearSelectionRef = useRef(clearSelection);
		clearSelectionRef.current = clearSelection;
		const emitSelectionRef = useRef(emitSelection);
		emitSelectionRef.current = emitSelection;

		const applyLassoPreview = useCallback(
			(hitIds: Set<string>, additive: boolean) => {
				if (!gRef.current) return;
				const g = d3.select(gRef.current);

				const styleNodeShape = (
					group: d3.Selection<
						d3.BaseType,
						NodePos,
						d3.BaseType,
						unknown
					>,
					d: NodePos,
					mode: 'normal' | 'preview' | 'selected'
				) => {
					const shape = group.select('rect, circle');
					if (shape.empty()) return;

					if (mode === 'selected') {
						shape
							.attr('stroke', SELECTION_STROKE)
							.attr('stroke-width', 2.4)
							.attr('stroke-dasharray', null);
						return;
					}

					if (mode === 'preview') {
						shape
							.attr('stroke', SELECTION_STROKE)
							.attr('stroke-width', 2)
							.attr('stroke-dasharray', '5 3');
						return;
					}

					shape
						.attr('stroke', d.borderColor ?? '#1A1A1A')
						.attr('stroke-width', d.isInitial ? 3 : 1.8)
						.attr('stroke-dasharray', null);
				};

				g.selectAll<SVGGElement, NodePos>('.node-group').each(function (
					d
				) {
					const group = d3.select(this);
					const inPreview = hitIds.has(d.id);
					const isSelected =
						additive && selectedIdsRef.current.has(d.id);

					group
						.style('opacity', 1)
						.classed('is-selected', isSelected)
						.classed('is-lasso-preview', inPreview);

					if (isSelected) {
						styleNodeShape(group, d, 'selected');
					} else if (inPreview) {
						styleNodeShape(group, d, 'preview');
					} else {
						styleNodeShape(group, d, 'normal');
					}
				});
				g.selectAll<SVGPathElement, GraphEdge>('.edge-path').style(
					'opacity',
					1
				);
				g.selectAll<SVGPathElement, GraphEdge>('.arc-path').style(
					'opacity',
					1
				);
				g.selectAll<SVGPathElement, LoopBundle>('.arc-trunk').style(
					'opacity',
					1
				);
			},
			[]
		);

		const clearLassoPreview = useCallback(() => {
			if (!gRef.current) return;
			const g = d3.select(gRef.current);
			g.selectAll<SVGGElement, NodePos>('.node-group').each(function (d) {
				const group = d3.select(this);
				group.classed('is-lasso-preview', false);
				const selected = selectedIdsRef.current.has(d.id);
				const shape = group.select('rect, circle');
				if (!shape.empty() && !selected) {
					shape
						.attr('stroke', d.borderColor ?? '#1A1A1A')
						.attr('stroke-width', d.isInitial ? 3 : 1.8)
						.attr('stroke-dasharray', null);
				}
			});

			const data = graphDataRef.current;
			if (selectedIdsRef.current.size > 0 && data) {
				applySelectionRef.current(selectedIdsRef.current, data);
				return;
			}

			g.selectAll<SVGGElement, NodePos>('.node-group').style('opacity', 1);
			g.selectAll<SVGPathElement, GraphEdge>('.edge-path').style(
				'opacity',
				1
			);
			g.selectAll<SVGPathElement, GraphEdge>('.arc-path').style(
				'opacity',
				1
			);
			g.selectAll<SVGPathElement, LoopBundle>('.arc-trunk').style(
				'opacity',
				1
			);
		}, []);

		const applyLassoPreviewRef = useRef(applyLassoPreview);
		applyLassoPreviewRef.current = applyLassoPreview;
		const clearLassoPreviewRef = useRef(clearLassoPreview);
		clearLassoPreviewRef.current = clearLassoPreview;

		// ── Highlight: hover path from root ───────────────────────────────
		const applyHoverPath = useCallback((id: string, data: GraphFile) => {
			if (!gRef.current) return;
			const g = d3.select(gRef.current);
			const { nodes: pathNodes, edgeIds: pathEdges } = findRootPath(
				id,
				data
			);

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
					return pathEdges.has(eid) ? SELECTION_STROKE : '#2C2C2C';
				})
				.attr('stroke-width', (d) => {
					const eid = d.id ?? `${d.source}--${d.target}`;
					return pathEdges.has(eid) ? 2.2 : 1.4;
				})
				.attr('marker-end', (d) => {
					const eid = d.id ?? `${d.source}--${d.target}`;
					return pathEdges.has(eid)
						? 'url(#arrow-normal-blue)'
						: 'url(#arrow-normal)';
				});
			g.selectAll<SVGPathElement, GraphEdge>('.arc-path').style(
				'opacity',
				0.08
			);
			g.selectAll<SVGPathElement, LoopBundle>('.arc-trunk').style(
				'opacity',
				0.08
			);
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

			const scale = Math.min(
				(0.88 * w) / bounds.width,
				(0.88 * h) / bounds.height,
				3
			);
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
					.attr('refX', 9)
					.attr('refY', 5)
					.attr('markerWidth', 6)
					.attr('markerHeight', 6)
					.attr('orient', 'auto')
					.append('path')
					.attr('d', 'M 0 1 L 10 5 L 0 9 Z')
					.attr('fill', color);
			};
			addMarker('arrow-normal', '#2C2C2C');
			addMarker('arrow-normal-blue', SELECTION_STROKE);
			addMarker('arrow-loop', 'context-stroke');

			const g = svg.append('g').attr('class', 'zoom-group');
			gRef.current = g.node();

			g.append('g').attr('class', 'rings-layer');
			g.append('g').attr('class', 'loopback-layer');
			g.append('g').attr('class', 'edges-layer');
			g.append('g').attr('class', 'nodes-layer');

			const zoom = d3
				.zoom<SVGSVGElement, unknown>()
				.scaleExtent([0.02, 10])
				.filter((event) => {
					if (event.type === 'wheel' || event.button === 1) return true;
					if (spaceKeyRef.current) {
						return (
							!event.ctrlKey &&
							!event.metaKey &&
							event.button !== 2
						);
					}
					return false;
				})
				.on('start', () => {
					if (spaceKeyRef.current) setPanDragging(true);
				})
				.on('end', () => setPanDragging(false))
				.on('zoom', (event) => g.attr('transform', event.transform));

			svg.call(zoom);
			zoomRef.current = zoom;

			return () => {
				svg.selectAll('*').remove();
				gRef.current = null;
				zoomRef.current = null;
			};
		}, []); // eslint-disable-line react-hooks/exhaustive-deps

		useEffect(() => {
			const zoom = zoomRef.current;
			const svg = svgRef.current;
			if (!zoom || !svg) return;
			zoom.filter((event) => {
				if (event.type === 'wheel' || event.button === 1) return true;
				if (spaceKeyRef.current) {
					return (
						!event.ctrlKey && !event.metaKey && event.button !== 2
					);
				}
				return false;
			});
			d3.select(svg).call(zoom);
		}, [panHeld]);

		useEffect(() => {
			const isTypingTarget = (target: EventTarget | null) =>
				target instanceof HTMLInputElement ||
				target instanceof HTMLTextAreaElement ||
				target instanceof HTMLSelectElement;

			const onKeyDown = (event: KeyboardEvent) => {
				if (isTypingTarget(event.target)) return;

				if (event.key === 'Shift' && !event.repeat) {
					shiftKeyRef.current = true;
					setShiftHeld(true);
				}

				if (event.code === 'Space' && !event.repeat) {
					event.preventDefault();
					spaceKeyRef.current = true;
					setPanHeld(true);
				}
			};

			const onKeyUp = (event: KeyboardEvent) => {
				if (event.key === 'Shift') {
					shiftKeyRef.current = false;
					setShiftHeld(false);
				}

				if (event.code === 'Space') {
					spaceKeyRef.current = false;
					setPanHeld(false);
					setPanDragging(false);
				}
			};

			const onBlur = () => {
				shiftKeyRef.current = false;
				setShiftHeld(false);
				spaceKeyRef.current = false;
				setPanHeld(false);
				setPanDragging(false);
			};

			window.addEventListener('keydown', onKeyDown);
			window.addEventListener('keyup', onKeyUp);
			window.addEventListener('blur', onBlur);
			return () => {
				window.removeEventListener('keydown', onKeyDown);
				window.removeEventListener('keyup', onKeyUp);
				window.removeEventListener('blur', onBlur);
			};
		}, []);

		useEffect(() => {
			const svg = svgRef.current;
			const wrapper = wrapperRef.current;
			if (!svg || !wrapper) return;

			const DRAG_THRESHOLD = 4;
			let pendingPointer = false;
			let drawing = false;
			let pointerId = -1;
			let startClient = { x: 0, y: 0 };
			let wrapperPoints: Point[] = [];
			let additiveAtStart = false;

			const wrapperPoint = (clientX: number, clientY: number): Point => {
				const rect = wrapper.getBoundingClientRect();
				return {
					x: clientX - rect.left,
					y: clientY - rect.top
				};
			};

			const clearGraphSelection = () => {
				selectedIdsRef.current = new Set();
				clearSelectionRef.current();
				onSelectionChangeRef.current?.(null);
			};

			const cleanupWindowListeners = () => {
				window.removeEventListener('pointermove', onWindowPointerMove);
				window.removeEventListener('pointerup', onWindowPointerUp);
				window.removeEventListener('pointercancel', onWindowPointerUp);
			};

			const finishLasso = () => {
				setLassoPoints([]);
				clearLassoPreviewRef.current();

				if (wrapperPoints.length < 2) return;

				const hitIds = computeLassoHits(
					wrapperPoints,
					wrapper,
					svg,
					nodePosRef.current,
					gRef.current
				);

				const next = additiveAtStart
					? new Set([...selectedIdsRef.current, ...hitIds])
					: hitIds;
				selectedIdsRef.current = next;

				const data = graphDataRef.current;
				if (!data) return;
				if (next.size === 0) {
					if (!additiveAtStart) clearGraphSelection();
					return;
				}

				applySelectionRef.current(next, data);
				emitSelectionRef.current(next);
			};

			const updateLassoPreview = () => {
				if (wrapperPoints.length < 2) return;
				const hitIds = computeLassoHits(
					wrapperPoints,
					wrapper,
					svg,
					nodePosRef.current,
					gRef.current
				);
				applyLassoPreviewRef.current(hitIds, additiveAtStart);
			};

			const onWindowPointerMove = (event: PointerEvent) => {
				if (event.pointerId !== pointerId) return;

				const point = wrapperPoint(event.clientX, event.clientY);

				if (pendingPointer && !drawing) {
					const moved = Math.hypot(
						event.clientX - startClient.x,
						event.clientY - startClient.y
					);
					if (moved < DRAG_THRESHOLD) return;

					event.preventDefault();
					pendingPointer = false;
					drawing = true;
					wrapperPoints.push(point);
					setLassoPoints([...wrapperPoints]);
					updateLassoPreview();
					return;
				}

				if (!drawing) return;

				event.preventDefault();
				const last = wrapperPoints[wrapperPoints.length - 1];
				if (Math.hypot(point.x - last.x, point.y - last.y) < 2) return;
				wrapperPoints.push(point);
				setLassoPoints([...wrapperPoints]);
				updateLassoPreview();
			};

			const onWindowPointerUp = (event: PointerEvent) => {
				if (event.pointerId !== pointerId) return;

				cleanupWindowListeners();
				lassoActiveRef.current = false;

				if (wrapper.hasPointerCapture(event.pointerId)) {
					wrapper.releasePointerCapture(event.pointerId);
				}

				if (drawing) {
					drawing = false;
					finishLasso();
					suppressClickRef.current = true;
				} else {
					clearLassoPreviewRef.current();
					setLassoPoints([]);
				}

				pendingPointer = false;
				pointerId = -1;
			};

			const onPointerDown = (event: PointerEvent) => {
				if (spaceKeyRef.current || event.button !== 0) return;
				if (!isLassoModifier(shiftKeyRef, event)) return;

				event.preventDefault();
				event.stopPropagation();

				lassoActiveRef.current = true;
				setTooltip(null);

				pendingPointer = true;
				drawing = false;
				pointerId = event.pointerId;
				additiveAtStart = isAdditiveSelect(event);
				startClient = { x: event.clientX, y: event.clientY };
				wrapperPoints = [wrapperPoint(event.clientX, event.clientY)];
				wrapper.setPointerCapture(event.pointerId);

				window.addEventListener('pointermove', onWindowPointerMove, {
					passive: false
				});
				window.addEventListener('pointerup', onWindowPointerUp);
				window.addEventListener('pointercancel', onWindowPointerUp);
			};

			const onBackgroundClick = (event: MouseEvent) => {
				if (suppressClickRef.current) {
					suppressClickRef.current = false;
					event.stopPropagation();
					return;
				}
				if ((event.target as Element).closest('.node-group')) return;
				if (isAdditiveSelect(event)) return;
				clearGraphSelection();
			};

			const onClickCapture = (event: MouseEvent) => {
				if (!suppressClickRef.current) return;
				suppressClickRef.current = false;
				event.stopPropagation();
				event.preventDefault();
			};

			const onSelectStart = (event: Event) => {
				if (isLassoModifier(shiftKeyRef, event as PointerEvent)) {
					event.preventDefault();
				}
			};

			const onKeyDown = (event: KeyboardEvent) => {
				if (event.code === 'Escape') {
					if (
						event.target instanceof HTMLInputElement ||
						event.target instanceof HTMLTextAreaElement
					) {
						return;
					}
					clearLassoPreviewRef.current();
					setLassoPoints([]);
					lassoActiveRef.current = false;
					clearGraphSelection();
					return;
				}
			};

			wrapper.addEventListener('pointerdown', onPointerDown, true);
			svg.addEventListener('click', onBackgroundClick);
			wrapper.addEventListener('click', onClickCapture, true);
			wrapper.addEventListener('selectstart', onSelectStart);
			window.addEventListener('keydown', onKeyDown);

			return () => {
				cleanupWindowListeners();
				wrapper.removeEventListener('pointerdown', onPointerDown, true);
				svg.removeEventListener('click', onBackgroundClick);
				wrapper.removeEventListener('click', onClickCapture, true);
				wrapper.removeEventListener('selectstart', onSelectStart);
				window.removeEventListener('keydown', onKeyDown);
			};
		}, []);

		// ── Draw graph ────────────────────────────────────────────────────
		useEffect(() => {
			if (!graphData || !gRef.current) return;

			const g = d3.select(gRef.current);
			setTooltip(null);

			const isRadial = activeLayout === 'radial';

			const shouldAnimateEntrance =
				enableAnimation &&
				(entranceGraphRef.current !== graphData ||
					entranceLayoutRef.current !== activeLayout);
			entranceGraphRef.current = graphData;
			entranceLayoutRef.current = activeLayout;
			const entranceDelays = shouldAnimateEntrance
				? buildNodeEntranceDelays(
						computeBFSDepths(graphData.nodes, graphData.edges)
					)
				: null;

			const sampleSize =
				graphData.nodes.length > 0
					? estimateNodeSize(graphData.nodes[0].tasks)
					: { width: 80, height: 36 };

			let positions: Map<string, { x: number; y: number }>;
			let ringRadii: number[] = [];
			let treeLevelYs: number[] = [];

			if (isRadial) {
				const result = computeRadialPositions(
					graphData.nodes,
					graphData.edges
				);
				positions = result.positions;
				ringRadii = result.ringRadii;
			} else {
				const result = computeTreePositions(
					graphData.nodes,
					graphData.edges,
					sampleSize.width
				);
				positions = result.positions;
				treeLevelYs = result.levelYs;
			}

			// ── Node map
			const nodeMap = new Map<string, NodePos>();
			for (const node of graphData.nodes) {
				const { width: wFull, height: hFull } = estimateNodeSize(
					node.tasks
				);
				const width = isRadial ? Math.round(wFull * 0.72) : wFull;
				const height = isRadial ? Math.round(hFull * 0.72) : hFull;
				const pos = positions.get(node.id) ?? { x: 0, y: 0 };
				nodeMap.set(node.id, {
					id: node.id,
					x: pos.x,
					y: pos.y,
					width,
					height,
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

			selectedIdsRef.current = new Set(
				[...selectedIdsRef.current].filter((id) => nodeMap.has(id))
			);
			if (selectedIdsRef.current.size === 0) {
				onSelectionChangeRef.current?.(null);
			}

			// ── Degree maps
			const indegreeMap = new Map<string, number>();
			const outdegreeMap = new Map<string, number>();
			for (const n of graphData.nodes) {
				indegreeMap.set(n.id, 0);
				outdegreeMap.set(n.id, 0);
			}
			for (const e of graphData.edges) {
				indegreeMap.set(e.target, (indegreeMap.get(e.target) ?? 0) + 1);
				outdegreeMap.set(
					e.source,
					(outdegreeMap.get(e.source) ?? 0) + 1
				);
			}
			indegreeMapRef.current = indegreeMap;
			outdegreeMapRef.current = outdegreeMap;

			const normalEdges = graphData.edges.filter(
				(e) => e.type === 'normal'
			);
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

			// ── Depth guides (radial rings / tree levels) ─────────────────
			const ringsLayer = g.select('.rings-layer');
			ringsLayer.selectAll('*').remove();

			if (isRadial) {
				ringRadii.forEach((r, i) => {
					ringsLayer
						.append('circle')
						.attr('r', r)
						.attr('fill', 'none')
						.attr('stroke', '#BBBBBB')
						.attr('stroke-width', 0.6)
						.attr('stroke-dasharray', '5,5');

					ringsLayer
						.append('text')
						.attr('x', r + 6)
						.attr('y', 4)
						.attr('font-size', '10px')
						.attr('fill', '#AAAAAA')
						.attr('font-family', 'Inter, sans-serif')
						.attr('pointer-events', 'none')
						.text(`L${i + 1}`);
				});
			} else if (treeLevelYs.length > 0) {
				let minX = Infinity;
				let maxX = -Infinity;
				for (const node of nodeMap.values()) {
					minX = Math.min(minX, node.x - node.width / 2);
					maxX = Math.max(maxX, node.x + node.width / 2);
				}
				const padX = 48;
				minX -= padX;
				maxX += padX;

				treeLevelYs.forEach((y, i) => {
					ringsLayer
						.append('line')
						.attr('x1', minX)
						.attr('y1', y)
						.attr('x2', maxX)
						.attr('y2', y)
						.attr('stroke', '#BBBBBB')
						.attr('stroke-width', 0.6)
						.attr('stroke-dasharray', '5,5');

					const label = `L${i + 1}`;
					for (const [x, anchor] of [
						[minX - 8, 'end'],
						[maxX + 8, 'start']
					] as const) {
						ringsLayer
							.append('text')
							.attr('x', x)
							.attr('y', y + 4)
							.attr('text-anchor', anchor)
							.attr('font-size', '10px')
							.attr('fill', '#AAAAAA')
							.attr('font-family', 'Inter, sans-serif')
							.attr('pointer-events', 'none')
							.text(label);
					}
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
			const arcTrunkPaths = loopbackLayer
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
			const arcBranchPaths = loopbackLayer
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

			const normalEdgePaths = edgesLayer
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
					return routeNormalEdge(src, tgt, isRadial);
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
			nodeGroups
				.filter((d) => d.isInitial)
				.append('line')
				.attr('x1', 0)
				.attr(
					'y1',
					(d) =>
						-(d.shape === 'circle' ? d.radius : d.height / 2) - 22
				)
				.attr('x2', 0)
				.attr(
					'y2',
					(d) => -(d.shape === 'circle' ? d.radius : d.height / 2) - 4
				)
				.attr('stroke', '#1A1A1A')
				.attr('stroke-width', 1.8)
				.attr('marker-end', 'url(#arrow-normal)');

			// Circle shape
			nodeGroups
				.filter((d) => d.shape === 'circle')
				.append('circle')
				.attr('r', (d) => d.radius)
				.attr('fill', (d) => d.fillColor ?? '#FFFFFF')
				.attr('stroke', (d) => d.borderColor ?? '#1A1A1A')
				.attr('stroke-width', (d) => (d.isInitial ? 3 : 1.8));

			// Rect shape
			nodeGroups
				.filter((d) => d.shape === 'rect')
				.append('rect')
				.attr('x', (d) => -d.width / 2)
				.attr('y', (d) => -d.height / 2)
				.attr('width', (d) => d.width)
				.attr('height', (d) => d.height)
				.attr('rx', 6)
				.attr('ry', 6)
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

				const textEl = group
					.append('text')
					.attr('text-anchor', 'middle')
					.attr(
						'font-family',
						'"JetBrains Mono", "Fira Mono", monospace'
					)
					.attr('font-size', `${fontSize}px`)
					.attr('fill', '#1A1A1A')
					.attr('pointer-events', 'none');

				lines.forEach((line, i) => {
					textEl
						.append('tspan')
						.attr('x', 0)
						.attr('y', startY + i * lineH)
						.text(line);
				});
			});

			if (shouldAnimateEntrance && entranceDelays) {
				fitView(false);

				animateNodeEntrance(nodeGroups, entranceDelays);

				const edgeDelays = buildEdgeEntranceDelays(
					normalEdges,
					entranceDelays
				);
				const loopDelays = buildLoopEdgeEntranceDelays(
					loopEdges,
					entranceDelays
				);
				const bundleDelays = buildBundleTrunkEntranceDelays(
					loopBundles,
					entranceDelays
				);

				animateStrokeDrawEntrance(
					normalEdgePaths,
					edgeDelays,
					(edge) => edgeId(edge)
				);
				animateStrokeDrawEntrance(
					arcBranchPaths,
					loopDelays,
					(edge) => edgeId(edge),
					'7,6'
				);
				animateStrokeDrawEntrance(
					arcTrunkPaths,
					bundleDelays,
					(bundle) => bundle.id,
					'7,6'
				);
			} else {
				nodeGroups.interrupt('node-entrance');
				nodeGroups.style('opacity', 1);
				normalEdgePaths.interrupt('edge-entrance').attr('opacity', 1);
				arcTrunkPaths
					.interrupt('edge-entrance')
					.attr('opacity', 1)
					.attr('stroke-dasharray', '7,6')
					.attr('stroke-dashoffset', null);
				arcBranchPaths
					.interrupt('edge-entrance')
					.attr('opacity', 1)
					.attr('stroke-dasharray', '7,6')
					.attr('stroke-dashoffset', null);
			}

			// ── Events ────────────────────────────────────────────────────
			nodeGroups.on('mouseenter', function (_evt, d) {
				if (!svgRef.current) return;
				if (lassoActiveRef.current) return;

				// Tooltip
				const transform = d3.zoomTransform(svgRef.current);
				const [px, py] = transform.apply([d.x, d.y]);
				const lines: string[] = [`ID: ${d.id}`];
				d.tasks.forEach((t, i) => {
					const rel =
						t.release === 'up'
							? ' ↑ released'
							: t.release === 'down'
								? ' ↓ completing'
								: '';
					lines.push(`τ${i + 1}: c=${t.task.c}  d=${t.task.d}${rel}`);
				});
				setTooltip({ x: px + 14, y: py - 8, lines });

				// Hover path highlight only when nothing is selected
				if (selectedIdsRef.current.size === 0) {
					applyHoverPath(d.id, graphData);
				}
			});

			nodeGroups.on('mouseleave', () => {
				if (lassoActiveRef.current) return;
				setTooltip(null);
				if (selectedIdsRef.current.size === 0) {
					clearHoverPath();
				}
			});

			nodeGroups.on('click', function (event, d) {
				event.stopPropagation();

				if (suppressClickRef.current) {
					suppressClickRef.current = false;
					return;
				}

				let next: Set<string>;
				if (isAdditiveSelect(event)) {
					next = new Set(selectedIdsRef.current);
					if (next.has(d.id)) next.delete(d.id);
					else next.add(d.id);
				} else {
					next = new Set([d.id]);
				}

				selectedIdsRef.current = next;
				if (next.size === 0) {
					clearSelection();
					onSelectionChangeRef.current?.(null);
					return;
				}

				applySelection(next, graphData);
				emitSelection(next);
			});

			if (selectedIdsRef.current.size > 0) {
				applySelection(selectedIdsRef.current, graphData);
				emitSelection(selectedIdsRef.current);
			}

			onStatsChangeRef.current?.({
				nodes: graphData.nodes.length,
				edges: graphData.edges.length
			});
			if (!shouldAnimateEntrance) {
				fitView(false);
			}
		}, [
			graphData,
			activeLayout,
			showLoopbacks,
			showNormalEdges,
			enableAnimation,
			clearSelection,
			applySelection,
			applyHoverPath,
			clearHoverPath,
			fitView,
			emitSelection
		]);

		// ── Imperative handle ─────────────────────────────────────────────
		useImperativeHandle(ref, () => ({
			fit() {
				fitView(true);
			},

			zoomIn() {
				const svg = svgRef.current;
				const zoom = zoomRef.current;
				if (!svg || !zoom) return;
				d3.select(svg)
					.transition()
					.duration(200)
					.call(zoom.scaleBy, 1.3);
			},

			zoomOut() {
				const svg = svgRef.current;
				const zoom = zoomRef.current;
				if (!svg || !zoom) return;
				d3.select(svg)
					.transition()
					.duration(200)
					.call(zoom.scaleBy, 0.77);
			},

			exportPNG() {
				const svg = svgRef.current;
				if (!svg) return '';
				return svgToDataUrl(svg);
			},

			focusNode(id: string) {
				const nodeData = nodePosRef.current.get(id);
				const data = graphDataRef.current;
				if (!nodeData || !data || !svgRef.current || !zoomRef.current)
					return;

				const next = new Set([id]);
				selectedIdsRef.current = next;
				applySelection(next, data);
				emitSelection(next);

				const svg = svgRef.current;
				const zoom = zoomRef.current;
				const w = svg.clientWidth || svg.getBoundingClientRect().width;
				const h =
					svg.clientHeight || svg.getBoundingClientRect().height;
				d3.select(svg)
					.transition()
					.duration(450)
					.call(
						zoom.transform,
						d3.zoomIdentity
							.translate(
								w / 2 - 2 * nodeData.x,
								h / 2 - 2 * nodeData.y
							)
							.scale(2)
					);
			},

			runLayout(name: LayoutName) {
				setActiveLayout(name);
			}
		}));

		return (
			<div
				ref={wrapperRef}
				className={`graph-viewer-wrapper${shiftHeld || lassoPoints.length > 0 ? ' lasso-mode' : ''}${panHeld ? ' pan-mode' : ''}${panDragging ? ' pan-dragging' : ''}`}
			>
				<svg
					ref={svgRef}
					className="graph-svg"
					style={{ width: '100%', height: '100%' }}
				/>
				{lassoPoints.length > 1 && (
					<svg className="lasso-overlay" aria-hidden="true">
						<path
							className="lasso-path"
							d={`M ${lassoPoints.map((p) => `${p.x},${p.y}`).join(' L ')} Z`}
						/>
					</svg>
				)}
				{tooltip && (
					<div
						className="node-tooltip"
						style={{ left: tooltip.x, top: tooltip.y }}
					>
						{tooltip.lines.map((line, i) => (
							<div key={i}>{line}</div>
						))}
					</div>
				)}
			</div>
		);
	}
);

GraphViewer.displayName = 'GraphViewer';
export default GraphViewer;
