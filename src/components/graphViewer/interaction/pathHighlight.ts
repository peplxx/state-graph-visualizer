import type { GraphFile } from '../../../types/graph';

/** BFS path from initial node to target; returns {nodes, edgeIds} */
export function findRootPath(
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
