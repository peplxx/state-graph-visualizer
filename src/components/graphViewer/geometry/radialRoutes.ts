import { roundedPath } from './roundedPath';
import type { GraphEdge } from '../../../types/graph';
import type { LoopBundle, NodePos, Point } from '../types';
import { buildLoopBundles } from './edges';
import { getBorderPoint } from './nodes';

const CLEARANCE = 12;
const LANE_GAP = 5;
const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);
const pointText = (p: Point) => `${p.x.toFixed(3)},${p.y.toFixed(3)}`;
interface Box {
	id: string;
	left: number;
	right: number;
	top: number;
	bottom: number;
}
interface Link {
	to: number;
	length: number;
	users: string[];
	crossings: number;
}
export interface RadialRoutes {
	paths: Map<GraphEdge, string>;
	polylines: Map<GraphEdge, Point[]>;
	diagnostics: { unresolved: string[]; totalLength: number };
}

/** Closed segment versus the interior of an expanded state rectangle. */
export function segmentHitsBox(a: Point, b: Point, box: Box): boolean {
	let lo = 0,
		hi = 1;
	for (const [origin, delta, min, max] of [
		[a.x, b.x - a.x, box.left, box.right],
		[a.y, b.y - a.y, box.top, box.bottom]
	]) {
		if (Math.abs(delta) < 1e-9) {
			if (origin <= min || origin >= max) return false;
		} else {
			const p = (min - origin) / delta,
				q = (max - origin) / delta;
			lo = Math.max(lo, Math.min(p, q));
			hi = Math.min(hi, Math.max(p, q));
			if (hi - lo < 1e-8) return false;
		}
	}
	return hi > 0 && lo < 1;
}
function cross(a: Point, b: Point, c: Point) {
	return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
}
function intersects(a: Point, b: Point, c: Point, d: Point) {
	return (
		cross(a, b, c) * cross(a, b, d) < -1e-6 &&
		cross(c, d, a) * cross(c, d, b) < -1e-6
	);
}
function boxesFor(nodes: NodePos[]): Box[] {
	return nodes.map((n) => {
		const badge = n.tasks.some(({ task }) => task.c > task.d) ? 9 : 0;
		const width =
				n.shape === 'circle'
					? Math.max(n.width, n.radius * 2)
					: n.width,
			height =
				n.shape === 'circle'
					? Math.max(n.height, n.radius * 2)
					: n.height;
		return {
			id: n.id,
			left: n.x - width / 2 - CLEARANCE,
			right: n.x + width / 2 + CLEARANCE + badge,
			top: n.y - height / 2 - CLEARANCE - badge,
			bottom: n.y + height / 2 + CLEARANCE
		};
	});
}
const obstacleIndices = new WeakMap<Box[], Map<string, Box[]>>();
const CELL = 96;
function clear(a: Point, b: Point, boxes: Box[], exclude: string[] = []) {
	if (boxes.length < 100)
		return !boxes.some(
			(box) => !exclude.includes(box.id) && segmentHitsBox(a, b, box)
		);
	let grid = obstacleIndices.get(boxes);
	if (!grid) {
		grid = new Map();
		for (const box of boxes)
			for (
				let x = Math.floor(box.left / CELL);
				x <= Math.floor(box.right / CELL);
				x++
			)
				for (
					let y = Math.floor(box.top / CELL);
					y <= Math.floor(box.bottom / CELL);
					y++
				) {
					const key = `${x},${y}`,
						cell = grid.get(key) ?? [];
					cell.push(box);
					grid.set(key, cell);
				}
		obstacleIndices.set(boxes, grid);
	}
	// Traverse only the cells touched by the segment, including negative coordinates.
	let x = Math.floor(a.x / CELL),
		y = Math.floor(a.y / CELL);
	const endX = Math.floor(b.x / CELL),
		endY = Math.floor(b.y / CELL),
		dx = b.x - a.x,
		dy = b.y - a.y;
	const sx = Math.sign(dx),
		sy = Math.sign(dy),
		stepX = dx === 0 ? Infinity : CELL / Math.abs(dx),
		stepY = dy === 0 ? Infinity : CELL / Math.abs(dy);
	let nextX =
		dx === 0 ? Infinity : ((x + (sx > 0 ? 1 : 0)) * CELL - a.x) / dx;
	let nextY =
		dy === 0 ? Infinity : ((y + (sy > 0 ? 1 : 0)) * CELL - a.y) / dy;
	const checked = new Set<Box>();
	for (
		let remaining = Math.abs(endX - x) + Math.abs(endY - y) + 1;
		remaining > 0;
		remaining--
	) {
		for (const box of grid.get(`${x},${y}`) ?? [])
			if (!checked.has(box)) {
				checked.add(box);
				if (!exclude.includes(box.id) && segmentHitsBox(a, b, box))
					return false;
			}
		if (x === endX && y === endY) break;
		if (nextX < nextY) {
			x += sx;
			nextX += stepX;
		} else {
			y += sy;
			nextY += stepY;
		}
	}
	return true;
}

/** The routing skeleton stays fixed; only its local corner geometry is rounded. */
function smooth(
	points: Point[],
	boxes: Box[],
	source: string,
	target: string,
	endTangent?: Point
): string {
	return roundedPath(
		points,
		(a, b) => clear(a, b, boxes, [source, target]),
		endTangent
	);
}

/** A shared visibility graph routes around states; occupied corridors get parallel lanes. */
export function routeRadialEdges(
	edges: GraphEdge[],
	nodeMap: Map<string, NodePos>
): RadialRoutes {
	if (edges.length === 0)
		return {
			paths: new Map(),
			polylines: new Map(),
			diagnostics: { unresolved: [], totalLength: 0 }
		};
	const nodes = [...nodeMap.values()].filter(
			(n) => n.width > 0 && n.height > 0
		),
		boxes = boxesFor(nodes);
	const vertices: Point[] = [];
	for (const b of boxes)
		for (const p of [
			{ x: b.left - 18, y: b.top - 18 },
			{ x: b.right + 18, y: b.top - 18 },
			{ x: b.right + 18, y: b.bottom + 18 },
			{ x: b.left - 18, y: b.bottom + 18 }
		]) {
			if (clear(p, p, boxes)) vertices.push(p);
		}
	const links: Link[][] = vertices.map(() => []);
	for (let i = 0; i < vertices.length; i++)
		for (let j = i + 1; j < vertices.length; j++)
			if (clear(vertices[i], vertices[j], boxes)) {
				const length = distance(vertices[i], vertices[j]),
					users: string[] = [];
				links[i].push({ to: j, length, users, crossings: 0 });
				links[j].push({ to: i, length, users, crossings: 0 });
			}
	const paths = new Map<GraphEdge, string>(),
		polylines = new Map<GraphEdge, Point[]>();
	const diagnostics = { unresolved: [] as string[], totalLength: 0 };
	const occupied: { a: Point; b: Point; target: string; normal: boolean }[] =
		[];
	const sorted = edges
		.map((edge, index) => ({ edge, index }))
		.sort(
			(a, b) =>
				Number(a.edge.type === 'loop') -
					Number(b.edge.type === 'loop') || a.index - b.index
		);
	for (const { edge, index } of sorted) {
		const source = nodeMap.get(edge.source),
			target = nodeMap.get(edge.target);
		if (!source || !target) {
			diagnostics.unresolved.push(
				edge.id ?? `${edge.source}--${edge.target}`
			);
			continue;
		}
		const excluded = [source.id, target.id];
		const crossingCost = (a: Point, b: Point) =>
			occupied.reduce(
				(sum, s) =>
					sum +
					(intersects(a, b, s.a, s.b) ? (s.normal ? 160 : 24) : 0),
				0
			);
		const innerRadius = Math.max(
			0,
			Math.min(
				Math.hypot(source.x, source.y),
				Math.hypot(target.x, target.y)
			) - 45
		);
		const inwardCost = (a: Point, b: Point) => {
			const dx = b.x - a.x,
				dy = b.y - a.y,
				t = Math.max(
					0,
					Math.min(
						1,
						-(a.x * dx + a.y * dy) / (dx * dx + dy * dy || 1)
					)
				);
			return (
				Math.max(
					0,
					innerRadius - Math.hypot(a.x + t * dx, a.y + t * dy)
				) * 3
			);
		};
		let points: Point[] = [];
		if (source.id === target.id) {
			const box = boxes.find((b) => b.id === source.id)!;
			for (let attempt = 0; attempt < 20; attempt++) {
				const side = attempt % 4;
				const r = [22 + (index % 3) * LANE_GAP, 8, 2, 40, 65][
					Math.floor(attempt / 4)
				];
				const corners =
					side === 0
						? [
								{ x: box.right + r, y: source.y },
								{ x: box.right + r, y: box.top - r },
								{ x: source.x, y: box.top - r }
							]
						: side === 1
							? [
									{ x: source.x, y: box.bottom + r },
									{ x: box.left - r, y: box.bottom + r },
									{ x: box.left - r, y: source.y }
								]
							: side === 2
								? [
										{ x: box.left - r, y: source.y },
										{ x: box.left - r, y: box.top - r },
										{ x: source.x, y: box.top - r }
									]
								: [
										{ x: source.x, y: box.bottom + r },
										{ x: box.right + r, y: box.bottom + r },
										{ x: box.right + r, y: source.y }
									];
				if (
					corners.every((p, i) =>
						clear(i ? corners[i - 1] : source, p, boxes, excluded)
					) &&
					clear(corners[corners.length - 1], source, boxes, excluded)
				) {
					points = [source, ...corners, target];
					break;
				}
			}
		} else if (
			edge.type === 'normal' &&
			clear(source, target, boxes, excluded)
		)
			points = [source, target];
		else {
			const count = vertices.length;
			const costs = new Float64Array(count).fill(Infinity),
				prev = new Int32Array(count).fill(-1),
				done = new Uint8Array(count);
			const targetVisible = vertices.map((p) =>
				clear(p, target, boxes, [target.id])
			);
			for (let i = 0; i < count; i++)
				if (clear(source, vertices[i], boxes, [source.id]))
					costs[i] =
						distance(source, vertices[i]) +
						crossingCost(source, vertices[i]) +
						inwardCost(source, vertices[i]);
			let best = -1,
				bestCost = Infinity;
			for (let iteration = 0; iteration < count; iteration++) {
				let v = -1,
					min = Infinity;
				for (let j = 0; j < count; j++)
					if (!done[j] && costs[j] < min) {
						v = j;
						min = costs[j];
					}
				if (v < 0 || min >= bestCost) break;
				done[v] = 1;
				if (targetVisible[v]) {
					const cost =
						min +
						distance(vertices[v], target) +
						crossingCost(vertices[v], target) +
						inwardCost(vertices[v], target);
					if (cost < bestCost) {
						best = v;
						bestCost = cost;
					}
				}
				for (const link of links[v]) {
					if (done[link.to]) continue;
					const congestion = link.users.length * 3;
					const candidate =
						min +
						link.length +
						link.crossings +
						congestion +
						inwardCost(vertices[v], vertices[link.to]);
					if (candidate < costs[link.to]) {
						costs[link.to] = candidate;
						prev[link.to] = v;
					}
				}
			}
			if (best >= 0) {
				const route: number[] = [];
				for (let v = best; v >= 0; v = prev[v]) route.push(v);
				route.reverse();
				points = [source, ...route.map((i) => vertices[i]), target];
				// Shift an entire corridor consistently; validate both lanes before accepting.
				const use = Math.max(
					0,
					...route
						.slice(1)
						.map(
							(v, i) =>
								links[route[i]].find((l) => l.to === v)!.users
									.length
						)
				);
				if (use > 0) {
					for (const sign of [1, -1]) {
						const shifted = points.map((p, i) => {
							if (i === 0 || i === points.length - 1) return p;
							const a = points[i - 1],
								b = points[i + 1],
								len = distance(a, b) || 1;
							return {
								x:
									p.x -
									((b.y - a.y) / len) * use * LANE_GAP * sign,
								y:
									p.y +
									((b.x - a.x) / len) * use * LANE_GAP * sign
							};
						});
						if (
							shifted
								.slice(1)
								.every((p, i) =>
									clear(
										shifted[i],
										p,
										boxes,
										i === 0
											? [source.id]
											: i === shifted.length - 2
												? [target.id]
												: []
									)
								)
						) {
							points = shifted;
							break;
						}
					}
				}
				for (let i = 1; i < route.length; i++)
					links[route[i - 1]]
						.find((l) => l.to === route[i])!
						.users.push(target.id);
			}
		}
		if (points.length < 2) {
			diagnostics.unresolved.push(
				edge.id ?? `${source.id}--${target.id}`
			);
			continue;
		}
		points[0] = getBorderPoint(source, points[1].x, points[1].y);
		const last = points.length - 1;
		points[last] = getBorderPoint(
			target,
			points[last - 1].x,
			points[last - 1].y
		);
		paths.set(edge, smooth(points, boxes, source.id, target.id));
		polylines.set(edge, points);
		for (let i = 1; i < points.length; i++) {
			diagnostics.totalLength += distance(points[i - 1], points[i]);
			occupied.push({
				a: points[i - 1],
				b: points[i],
				target: target.id,
				normal: edge.type === 'normal'
			});
		}
		// Cache crossing penalties once per routed edge, rather than during every search.
		const added = occupied.slice(-(points.length - 1));
		for (let i = 0; i < links.length; i++)
			for (const link of links[i])
				link.crossings += added.reduce(
					(sum, s) =>
						sum +
						(intersects(vertices[i], vertices[link.to], s.a, s.b)
							? s.normal
								? 160
								: 24
							: 0),
					0
				);
	}
	// Allocate ports in geometric order so arrowheads do not pile up at a collector.
	const ports = new Map<
		string,
		{
			edge: GraphEdge;
			points: Point[];
			index: number;
			node: NodePos;
			side: string;
			order: number;
		}[]
	>();
	for (const [edge, points] of polylines)
		for (const index of [0, points.length - 1]) {
			const node = nodeMap.get(index === 0 ? edge.source : edge.target)!;
			const p = points[index],
				adj = points[index === 0 ? 1 : index - 1];
			if (node.shape === 'circle') continue;
			const side =
				Math.abs(Math.abs(p.x - node.x) - node.width / 2 - 1) < 1e-6
					? 'x'
					: 'y';
			const sign =
				(side === 'x' ? p.x - node.x : p.y - node.y) < 0 ? -1 : 1;
			const key = `${node.id}:${side}:${sign}`;
			const group = ports.get(key) ?? [];
			group.push({
				edge,
				points,
				index,
				node,
				side,
				order: side === 'x' ? adj.y : adj.x
			});
			ports.set(key, group);
		}
	for (const group of ports.values()) {
		group.sort((a, b) => a.order - b.order);
		for (let i = 0; i < group.length; i++) {
			const { points, index, node, side } = group[i],
				p = points[index],
				adj = points[index === 0 ? 1 : index - 1];
			const span = Math.min(
				(side === 'x' ? node.height : node.width) / 2 - 7,
				((group.length - 1) * LANE_GAP) / 2
			);
			const offset =
				group.length < 2
					? 0
					: -span + (2 * span * i) / (group.length - 1);
			const candidate =
				side === 'x'
					? { x: p.x, y: node.y + offset }
					: { x: node.x + offset, y: p.y };
			if (clear(adj, candidate, boxes, [node.id]))
				points[index] = candidate;
		}
	}
	diagnostics.totalLength = 0;
	for (const [edge, points] of polylines) {
		paths.set(edge, smooth(points, boxes, edge.source, edge.target));
		for (let i = 1; i < points.length; i++)
			diagnostics.totalLength += distance(points[i - 1], points[i]);
	}
	return { paths, polylines, diagnostics };
}

/** Merge crowded arrivals only after routing their shared trunk around obstacles. */
export function routeRadialGraph(
	edges: GraphEdge[],
	nodeMap: Map<string, NodePos>
): RadialRoutes & {
	bundles: LoopBundle[];
	sharedSegments: LoopBundle[];
	renderPaths: Map<GraphEdge, string>;
} {
	const obstacles = boxesFor([...nodeMap.values()]);
	const bundles = buildLoopBundles(
		edges.filter((e) => e.type === 'loop'),
		nodeMap,
		true
	).filter((b) => b.edges.length >= 2);
	const routedNodes = new Map(nodeMap),
		branches = new Map<GraphEdge, GraphEdge>(),
		trunks = new Map<LoopBundle, GraphEdge>();
	const usable: LoopBundle[] = [];
	for (const bundle of bundles) {
		const target = nodeMap.get(bundle.target)!;
		const angle = Math.atan2(
			bundle.hub.y - target.y,
			bundle.hub.x - target.x
		);
		let hub: Point | undefined;
		for (let step = 0; step < 8 && !hub; step++)
			for (const turn of [0, 0.25, -0.25, 0.5, -0.5]) {
				const radius = 75 + step * 15;
				const candidate = {
					x: target.x + Math.cos(angle + turn) * radius,
					y: target.y + Math.sin(angle + turn) * radius
				};
				if (
					clear(candidate, candidate, obstacles) &&
					clear(candidate, target, obstacles, [target.id])
				) {
					hub = candidate;
					break;
				}
			}
		if (!hub) continue;
		bundle.hub = hub;
		let id = `__route_${bundle.id}`;
		while (routedNodes.has(id)) id += '_';
		routedNodes.set(id, {
			...target,
			id,
			...hub,
			width: 0,
			height: 0,
			radius: -1,
			shape: 'circle',
			tasks: []
		});
		for (const edge of bundle.edges)
			branches.set(edge, { ...edge, target: id });
		trunks.set(bundle, {
			id: `${id}_trunk`,
			source: id,
			target: target.id,
			type: 'normal'
		});
		usable.push(bundle);
	}
	const routed = routeRadialEdges(
		[
			...edges.filter((e) => e.type === 'normal'),
			...trunks.values(),
			...edges
				.filter((e) => e.type === 'loop')
				.map((e) => branches.get(e) ?? e)
		],
		routedNodes
	);
	const paths = new Map<GraphEdge, string>(),
		polylines = new Map<GraphEdge, Point[]>();
	for (const edge of edges) {
		const routedEdge = branches.get(edge) ?? edge;
		const path = routed.paths.get(routedEdge),
			points = routed.polylines.get(routedEdge);
		if (path) paths.set(edge, path);
		if (points) polylines.set(edge, points);
	}
	for (const bundle of usable) {
		const trunk = trunks.get(bundle)!;
		bundle.path = routed.paths.get(trunk);
		const trunkPoints = routed.polylines.get(trunk);
		if (!trunkPoints || trunkPoints.length < 2) continue;
		// The collector is a local choice, not a waypoint every arrival must bend back toward.
		// Try later merges on the existing trunk and trim only its short terminal detour.
		if (trunkPoints.length === 2) {
			const end = trunkPoints[1];
			const angleCost = (a: Point, b: Point, c: Point) => {
				const ab = distance(a, b),
					bc = distance(b, c);
				if (ab < 0.01 || bc < 0.01) return 0;
				return (
					Math.acos(
						Math.max(
							-1,
							Math.min(
								1,
								((b.x - a.x) * (c.x - b.x) +
									(b.y - a.y) * (c.y - b.y)) /
									(ab * bc)
							)
						)
					) ** 2
				);
			};
			let bestCost = Infinity;
			let bestHub = bundle.hub;
			let bestEnd = end;
			let bestRoutes = new Map<GraphEdge, Point[]>();
			const candidates: Point[] = [];
			for (const turn of [0, 0.4, -0.4, 0.8, -0.8])
				for (const fraction of [0, 0.25, 0.5, 0.7]) {
					const dx = (bundle.hub.x - end.x) * (1 - fraction),
						dy = (bundle.hub.y - end.y) * (1 - fraction);
					candidates.push({
						x: end.x + dx * Math.cos(turn) - dy * Math.sin(turn),
						y: end.y + dx * Math.sin(turn) + dy * Math.cos(turn)
					});
				}
			const target = nodeMap.get(bundle.target)!;
			for (const turn of [0.4, -0.4, 0.8, -0.8, 1.2, -1.2, 1.6, -1.6]) {
				const dx = bundle.hub.x - target.x,
					dy = bundle.hub.y - target.y;
				candidates.push({
					x: target.x + dx * Math.cos(turn) - dy * Math.sin(turn),
					y: target.y + dx * Math.sin(turn) + dy * Math.cos(turn)
				});
			}
			for (
				let candidateIndex = 0;
				candidateIndex < candidates.length;
				candidateIndex++
			) {
				const candidate = candidates[candidateIndex];
				const end =
					candidateIndex < 20
						? trunkPoints[1]
						: getBorderPoint(target, candidate.x, candidate.y);

				if (
					segmentHitsBox(candidate, end, {
						id: target.id,
						left: target.x - target.width / 2,
						right: target.x + target.width / 2,
						top: target.y - target.height / 2,
						bottom: target.y + target.height / 2
					})
				)
					continue;

				if (
					!clear(candidate, candidate, obstacles) ||
					!clear(candidate, end, obstacles, [bundle.target])
				)
					continue;
				let total = 0;
				const choices = new Map<GraphEdge, Point[]>();
				for (const edge of bundle.edges) {
					const original = polylines.get(edge);
					if (!original || original.length < 2) continue;
					let choice: Point[] | undefined,
						cost = Infinity;
					for (
						let cut = original.length - 2;
						cut >= Math.max(0, original.length - 4);
						cut--
					) {
						const anchor = original[cut];
						if (
							cut < original.length - 2 &&
							distance(anchor, bundle.hub) > 180
						)
							break;
						if (
							!clear(
								anchor,
								candidate,
								obstacles,
								cut === 0 ? [edge.source] : []
							)
						)
							continue;
						const route = [
							...original.slice(0, cut + 1),
							candidate
						];
						let score = distance(candidate, end);
						for (let i = 1; i < route.length; i++) {
							score += distance(route[i - 1], route[i]);
							if (i > 1)
								score +=
									60 *
									angleCost(
										route[i - 2],
										route[i - 1],
										route[i]
									);
						}
						score += 100 * angleCost(anchor, candidate, end);
						if (score < cost) {
							cost = score;
							choice = route;
						}
					}
					if (!choice) {
						total = Infinity;
						break;
					}
					choices.set(edge, choice);
					total += cost;
				}
				if (choices.size === bundle.edges.length && total < bestCost) {
					bestCost = total;
					bestHub = candidate;
					bestEnd = end;
					bestRoutes = choices;
				}
			}
			if (bestRoutes.size) {
				bundle.hub = bestHub;
				trunkPoints[0] = bestHub;
				trunkPoints[1] = bestEnd;
				bundle.path = smooth(trunkPoints, obstacles, '', bundle.target);
				for (const [edge, points] of bestRoutes)
					polylines.set(edge, points);
			}
		}
		const hub = bundle.hub,
			next = trunkPoints[1],
			len = distance(hub, next) || 1;
		for (const edge of bundle.edges) {
			const points = polylines.get(edge);
			if (!points || points.length < 2) continue;
			// Remove only small terminal zigzags; the long branch detour stays fixed.
			for (
				let i = Math.max(1, points.length - 4);
				i < points.length - 2;
				i++
			) {
				const a = points[i - 1],
					b = points[i],
					c = points[i + 1],
					d = points[i + 2];
				const cross = (p: Point, q: Point, r: Point) =>
					(q.x - p.x) * (r.y - q.y) - (q.y - p.y) * (r.x - q.x);
				const length = distance(a, c);
				const deviation = length
					? Math.abs(cross(a, b, c)) / length
					: Infinity;
				const projection =
					((b.x - a.x) * (c.x - a.x) + (b.y - a.y) * (c.y - a.y)) /
					(length * length);
				if (
					cross(a, b, c) * cross(b, c, d) < 0 &&
					deviation < 18 &&
					projection > 0 &&
					projection < 1 &&
					distance(b, c) < 90 &&
					clear(a, c, obstacles, i === 1 ? [edge.source] : [])
				) {
					points.splice(i, 1);
					i--;
				}
			}
			paths.set(
				edge,
				smooth(points, obstacles, edge.source, '', {
					x: (next.x - hub.x) / len,
					y: (next.y - hub.y) / len
				})
			);
		}
	}

	// Opposing arrivals cannot share a collector naturally. Give them an independent
	// last approach instead of forcing a hairpin merely to retain a bundle.
	for (let index = usable.length - 1; index >= 0; index--) {
		const bundle = usable[index],
			target = nodeMap.get(bundle.target)!;
		const trunkPoints = routed.polylines.get(trunks.get(bundle)!)!;
		const direction = {
			x: trunkPoints[1].x - bundle.hub.x,
			y: trunkPoints[1].y - bundle.hub.y
		};
		for (const edge of [...bundle.edges]) {
			const points = polylines.get(edge)!;
			const anchor = points[points.length - 2];
			const dot =
				(bundle.hub.x - anchor.x) * direction.x +
				(bundle.hub.y - anchor.y) * direction.y;
			if (dot >= 0) continue;
			const port = getBorderPoint(target, anchor.x, anchor.y);
			if (
				!clear(anchor, port, obstacles, [
					edge.target,
					...(points.length === 2 ? [edge.source] : [])
				])
			)
				continue;
			const independent = [...points.slice(0, -1), port];
			polylines.set(edge, independent);
			paths.set(
				edge,
				smooth(independent, obstacles, edge.source, edge.target)
			);
			branches.delete(edge);
			bundle.edges = bundle.edges.filter((e) => e !== edge);
		}
		if (bundle.edges.length < 2) {
			for (const edge of bundle.edges) {
				paths.set(
					edge,
					paths.get(edge)! + ' ' + bundle.path!.replace(/^M/, 'L')
				);
				polylines.set(edge, [
					...polylines.get(edge)!,
					...trunkPoints.slice(1)
				]);
				branches.delete(edge);
			}
			usable.splice(index, 1);
		}
	}

	// Keep full logical paths for diagnostics; render coincident same-target pieces once.
	const segments = new Map<
		string,
		{ start: Point; end: Point; command: string; edges: GraphEdge[] }
	>();
	const edgeSegments = new Map<GraphEdge, string[]>();
	for (const edge of branches.keys()) {
		const path = paths.get(edge);
		if (!path) continue;
		const commands = path.match(/[MLQC][^MLQC]*/g) ?? [];
		let start: Point = { x: 0, y: 0 };
		const keys: string[] = [];
		for (const command of commands) {
			const numbers = command.slice(1).trim().split(/[ ,]+/).map(Number);
			const end = {
				x: numbers[numbers.length - 2],
				y: numbers[numbers.length - 1]
			};
			if (command[0] !== 'M') {
				const key = `${edge.target}:${pointText(start)}:${command.trim()}`;
				const segment = segments.get(key) ?? {
					start,
					end,
					command: command.trim(),
					edges: []
				};
				segment.edges.push(edge);
				segments.set(key, segment);
				keys.push(key);
			}
			start = end;
		}
		edgeSegments.set(edge, keys);
	}
	const sharedSegments: LoopBundle[] = [];
	const visited = new Set<string>();
	const successor = new Map<string, string>();
	const predecessor = new Set<string>();
	for (const keys of edgeSegments.values()) {
		for (let i = 0; i < keys.length - 1; i++) {
			const a = segments.get(keys[i])!,
				b = segments.get(keys[i + 1])!;
			if (
				a.edges.length > 1 &&
				a.edges.length === b.edges.length &&
				a.edges.every((edge, index) => edge === b.edges[index])
			) {
				successor.set(keys[i], keys[i + 1]);
				predecessor.add(keys[i + 1]);
			}
		}
	}
	// A continuing shared stroke is one SVG path, so its dash phase never restarts at a bend.
	for (const [key, segment] of segments) {
		if (
			segment.edges.length < 2 ||
			visited.has(key) ||
			predecessor.has(key)
		)
			continue;
		let path = `M ${pointText(segment.start)}`;
		let cursor: string | undefined = key;
		while (cursor && !visited.has(cursor)) {
			visited.add(cursor);
			path += ` ${segments.get(cursor)!.command}`;
			cursor = successor.get(cursor);
		}
		sharedSegments.push({
			id: `shared-${key}`,
			target: segment.edges[0].target,
			edges: segment.edges,
			hub: segment.start,
			path,
			hasArrow: false
		});
	}

	const renderPaths = new Map(paths);
	for (const [edge, keys] of edgeSegments) {
		let path = '';
		for (const key of keys) {
			const segment = segments.get(key)!;
			if (!path) path = `M ${pointText(segment.start)}`;
			path +=
				segment.edges.length > 1
					? ` M ${pointText(segment.end)}`
					: ` ${segment.command}`;
		}
		renderPaths.set(edge, path);
	}
	return {
		...routed,
		paths,
		polylines,
		bundles: usable,
		sharedSegments,
		renderPaths
	};
}
