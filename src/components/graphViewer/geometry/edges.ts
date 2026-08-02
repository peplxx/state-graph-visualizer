import type { GraphEdge } from '../../../types/graph';
import type { LoopBundle, NodePos, Point } from '../types';
import { cubicPoint, getBorderPoint, pointIntersectsNode } from './nodes';

export function edgeId(edge: GraphEdge): string {
	return edge.id ?? `${edge.source}--${edge.target}`;
}

export function loopbackColor(count: number, maxCount: number): string {
	const light = [202, 207, 212];
	const dark = [126, 134, 142];
	const ratio =
		maxCount <= 1 ? 0 : Math.sqrt((count - 1) / Math.max(1, maxCount - 1));
	const channels = light.map((start, index) =>
		Math.round(start + (dark[index] - start) * ratio)
	);
	return `rgb(${channels[0]}, ${channels[1]}, ${channels[2]})`;
}

export function routeNormalEdge(
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

export function buildLoopBundles(
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

/**
 * Route a return edge as a compact cubic curve. Several candidate lanes on
 * both sides of the direct edge are sampled; the lane crossing the fewest
 * states wins. This keeps return arrows connected to node borders without
 * sending every edge around the outside of the complete graph.
 */
export function routeLoopEdge(
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

export function routeBundleTrunk(bundle: LoopBundle, target: NodePos): string {
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

export function routeBundleBranch(
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
