import type { GraphNode, GraphEdge } from '../types/graph';

/**
 * Finds the shortest path (BFS) from the initial node to the target node.
 * Traverses both normal and loopback edges.
 * Returns the ordered array of GraphNode objects, or null if no path exists.
 */
export function findPathToNode(
	nodes: GraphNode[],
	edges: GraphEdge[],
	targetId: string
): GraphNode[] | null {
	const nodeMap = new Map<string, GraphNode>(nodes.map((n) => [n.id, n]));
	const initial = nodes.find((n) => n.isInitial);

	if (!initial) return null;
	if (initial.id === targetId) return [initial];

	// Build adjacency list (source → list of targets, all edge types)
	const adj = new Map<string, string[]>();
	for (const e of edges) {
		const list = adj.get(e.source) ?? [];
		list.push(e.target);
		adj.set(e.source, list);
	}

	// BFS
	const visited = new Set<string>([initial.id]);
	const queue: string[][] = [[initial.id]];

	while (queue.length > 0) {
		const path = queue.shift()!;
		const last = path[path.length - 1];
		for (const next of adj.get(last) ?? []) {
			if (visited.has(next)) continue;
			const newPath = [...path, next];
			if (next === targetId) {
				const result = newPath
					.map((id) => nodeMap.get(id))
					.filter((n): n is GraphNode => n !== undefined);
				return result.length === newPath.length ? result : null;
			}
			visited.add(next);
			queue.push(newPath);
		}
	}

	return null;
}
