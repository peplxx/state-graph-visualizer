import type { GraphEdge, GroupConnectivity } from '../../../types/graph';

export function computeGroupConnectivity(
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

export function isAdditiveSelect(event: MouseEvent | PointerEvent): boolean {
	return event.metaKey || event.ctrlKey;
}
