import * as d3 from 'd3';
import type { GraphNode, GraphEdge } from '../../../types/graph';
import type { D3SpanNode } from '../types';
import { TREE_LEVEL_GAP, TREE_Y_OFFSET } from '../constants';

export function buildSpanningTree(
	nodes: GraphNode[],
	edges: GraphEdge[]
): D3SpanNode {
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

export function computeTreePositions(
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
