export type LayoutName = 'radial' | 'tree';

const BASE_RADIUS = 120;
const RING_GAP = 160;

export function normalizeLayoutName(name: unknown): LayoutName {
	switch (name) {
		case 'tree':
		case 'dagre':
			return 'tree';
		case 'radial':
		case 'concentric':
		default:
			return 'radial';
	}
}

export function buildLayoutOptions(
	name: LayoutName,
	nodeCount: number,
	overrides?: Record<string, unknown>
): Record<string, unknown> {
	const sf = nodeCount > 5000 ? 0.55 : nodeCount > 1000 ? 0.75 : 1.0;

	const bases: Record<LayoutName, Record<string, unknown>> = {
		tree: {
			name: 'tree',
			rankDir: 'TB',
			ranker: 'network-simplex',
			rankSep: 100 * sf,
			nodeSep: 60 * sf,
			edgeSep: 10,
			animate: false,
			padding: 120
		},
		radial: {
			name: 'radial',
			animate: false,
			padding: 120
		}
	};

	return { ...bases[name], ...(overrides ?? {}) };
}

export function computeConcentricPositions(
	ranks: Map<string, number>,
	nodeIds: string[]
): Map<string, { x: number; y: number }> {
	const byRank = new Map<number, string[]>();

	for (const id of nodeIds) {
		const rank = ranks.get(id) ?? 0;
		if (!byRank.has(rank)) byRank.set(rank, []);
		byRank.get(rank)!.push(id);
	}

	const positions = new Map<string, { x: number; y: number }>();
	const sortedRanks = [...byRank.keys()].sort((a, b) => a - b);

	for (const rank of sortedRanks) {
		const ids = byRank.get(rank)!;
		const radius = rank === 0 ? 0 : BASE_RADIUS + (rank - 1) * RING_GAP;

		if (rank === 0) {
			if (ids.length === 1) {
				positions.set(ids[0], { x: 0, y: 0 });
			} else {
				const clusterRadius = 40;
				ids.forEach((id, index) => {
					const angle = (2 * Math.PI * index) / ids.length;
					positions.set(id, {
						x: clusterRadius * Math.cos(angle),
						y: clusterRadius * Math.sin(angle)
					});
				});
			}
			continue;
		}

		ids.forEach((id, index) => {
			const angle = (2 * Math.PI * index) / ids.length - Math.PI / 2;
			positions.set(id, {
				x: radius * Math.cos(angle),
				y: radius * Math.sin(angle)
			});
		});
	}

	return positions;
}
