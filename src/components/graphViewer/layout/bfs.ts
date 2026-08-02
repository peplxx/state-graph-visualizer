import type { GraphNode, GraphEdge } from '../../../types/graph';

export function computeBFSDepths(
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
