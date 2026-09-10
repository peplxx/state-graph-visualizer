import type { GraphNode, GraphEdge } from '../../../types/graph';
import { RADIAL_BASE, RADIAL_GAP } from '../constants';
import { estimateNodeSize } from '../../../core/labelBuilder';

export interface RadialNodeSize {
	width: number;
	height: number;
}

/** Bounds reserve the selection stroke and deadline badge even while hidden. */
export function radialNodeSize(node: GraphNode): RadialNodeSize {
	const size = estimateNodeSize(node.tasks);
	const reserve = node.tasks.some(({ task }) => task.c > task.d) ? 22 : 6;
	return {
		width: Math.round(size.width * 0.72) + reserve,
		height: Math.round(size.height * 0.72) + reserve
	};
}

const TAU = Math.PI * 2;
const CLEARANCE = 12;

/** Project preferred angles onto cyclic separation constraints, without sorting nodes anew. */
function spreadAngles(
	preferred: number[],
	sizes: RadialNodeSize[],
	radius: number
): number[] | null {
	if (preferred.length < 2) return [...preferred];
	const angles = [...preferred];
	for (let pass = 0; pass < 320; pass++) {
		if (pass < 160)
			for (let i = 0; i < angles.length; i++)
				angles[i] += (preferred[i] - angles[i]) * 0.025;
		let worst = 0;
		for (let i = 0; i < angles.length; i++) {
			const j = (i + 1) % angles.length;
			const end = angles[j] + (j === 0 ? TAU : 0);
			const middle = (angles[i] + end) / 2;
			// Chord direction is the tangent at the angular midpoint. Either axis may separate rectangles.
			const chord = Math.min(
				((sizes[i].width + sizes[j].width) / 2 + CLEARANCE) /
					Math.max(1e-9, Math.abs(Math.sin(middle))),
				((sizes[i].height + sizes[j].height) / 2 + CLEARANCE) /
					Math.max(1e-9, Math.abs(Math.cos(middle)))
			);
			const separation = 2 * Math.asin(Math.min(1, chord / (2 * radius)));
			const deficit = separation - (end - angles[i]);
			if (deficit > 0) {
				angles[i] -= deficit / 2;
				angles[j] += deficit / 2;
				worst = Math.max(worst, deficit);
			}
		}
		if (pass >= 160 && worst < 1e-8) return angles;
	}
	return null;
}

function overlaps(
	a: { x: number; y: number },
	sa: RadialNodeSize,
	b: { x: number; y: number },
	sb: RadialNodeSize
): boolean {
	return (
		Math.abs(a.x - b.x) < (sa.width + sb.width) / 2 + CLEARANCE - 1e-5 &&
		Math.abs(a.y - b.y) < (sa.height + sb.height) / 2 + CLEARANCE - 1e-5
	);
}

export function computeRadialPositions(
	nodes: GraphNode[],
	edges: GraphEdge[]
): {
	positions: Map<string, { x: number; y: number }>;
	/** Increasing visible radii: index depth - 1 for one root; index depth for multiple roots. */
	ringRadii: number[];
	depths: Map<string, number>;
	angles: Map<string, number>;
	sizes: Map<string, RadialNodeSize>;
} {
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

	const maxDepth = Math.max(0, ...depthMap.values());
	const ringRadii: number[] = [];
	const positions = new Map<string, { x: number; y: number }>();
	const angles = new Map<string, number>();
	const sizes = new Map(nodes.map((node) => [node.id, radialNodeSize(node)]));
	const singleRoot = rootIds.length === 1;
	let previousRadius = 0;
	for (let depth = 0; depth <= maxDepth; depth++) {
		const members = nodes
			.filter((node) => depthMap.get(node.id) === depth)
			.sort((a, b) => (aStart.get(a.id) ?? 0) - (aStart.get(b.id) ?? 0));
		const preferred = members.map(
			(node) =>
				((aStart.get(node.id) ?? 0) + (aEnd.get(node.id) ?? TAU)) / 2
		);
		if (depth === 0 && singleRoot) {
			positions.set(members[0].id, { x: 0, y: 0 });
			angles.set(members[0].id, preferred[0]);
			continue;
		}
		if (!members.length) continue;
		const memberSizes = members.map((node) => sizes.get(node.id)!);
		const attempt = (radius: number) => {
			const candidateAngles = spreadAngles(
				preferred,
				memberSizes,
				radius
			);
			if (!candidateAngles) return null;
			const candidatePositions = candidateAngles.map((angle) => ({
				x: radius * Math.cos(angle),
				y: radius * Math.sin(angle)
			}));
			for (let i = 0; i < members.length; i++) {
				// Validate all rectangles, including non-neighbours and already placed inner levels.
				for (let j = 0; j < i; j++)
					if (
						overlaps(
							candidatePositions[i],
							memberSizes[i],
							candidatePositions[j],
							memberSizes[j]
						)
					)
						return null;
				for (const [id, position] of positions)
					if (
						overlaps(
							candidatePositions[i],
							memberSizes[i],
							position,
							sizes.get(id)!
						)
					)
						return null;
			}
			return { candidateAngles, candidatePositions };
		};
		let low =
			depth === 0
				? RADIAL_BASE * 0.45
				: Math.max(
						RADIAL_BASE + (depth - 1) * RADIAL_GAP,
						previousRadius + RADIAL_GAP
					);
		let high = low;
		let result = attempt(high);
		if (!result) {
			do {
				high *= 1.2;
				result = attempt(high);
			} while (!result);
			for (let iteration = 0; iteration < 18; iteration++) {
				const middle = (low + high) / 2;
				const trial = attempt(middle);
				if (trial) {
					high = middle;
					result = trial;
				} else low = middle;
			}
		}
		previousRadius = high;
		// Include a visible inner ring when the graph has several roots.
		ringRadii.push(high);
		members.forEach((node, index) => {
			positions.set(node.id, result.candidatePositions[index]);
			angles.set(node.id, result.candidateAngles[index]);
		});
	}
	return { positions, ringRadii, depths: depthMap, angles, sizes };
}
