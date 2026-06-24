export type LayoutName = 'dagre';

export function buildLayoutOptions(
	name: LayoutName,
	nodeCount: number,
	overrides?: Record<string, unknown>
): any {
	const sf = nodeCount > 5000 ? 0.55 : nodeCount > 1000 ? 0.75 : 1.0;

	const bases: Record<LayoutName, Record<string, unknown>> = {
		dagre: {
			name: 'dagre',
			rankDir: 'TB',
			// network-simplex honours per-edge minLen constraints
			// which is how we enforce BFS-depth rank placement
			ranker: 'network-simplex',
			rankSep: 100 * sf,
			nodeSep: 60 * sf,
			edgeSep: 10,
			animate: false,
			padding: 120
		}
	};

	return { ...bases[name], ...(overrides ?? {}) };
}
