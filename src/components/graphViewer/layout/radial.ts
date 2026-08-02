import type { GraphNode, GraphEdge } from '../../../types/graph';
import { RADIAL_BASE, RADIAL_GAP } from '../constants';

export function computeRadialPositions(
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
