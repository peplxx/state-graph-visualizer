import { describe, expect, test } from 'bun:test';
import { readFileSync, readdirSync } from 'node:fs';
import { parseFile } from '../src/core/parser';
import { estimateNodeSize } from '../src/core/labelBuilder';
import { computeRadialPositions } from '../src/components/graphViewer/layout/radial';
import {
	routeRadialEdges,
	routeRadialGraph,
	segmentHitsBox
} from '../src/components/graphViewer/geometry/radialRoutes';
import type { NodePos, Point } from '../src/components/graphViewer/types';
import type { GraphEdge, GraphFile } from '../src/types/graph';

function viewerNodes(graph: GraphFile): Map<string, NodePos> {
	const layout = computeRadialPositions(graph.nodes, graph.edges);
	return new Map(
		graph.nodes.map((node) => {
			const size = estimateNodeSize(node.tasks);
			return [
				node.id,
				{
					...node,
					...layout.positions.get(node.id)!,
					width: Math.round(size.width * 0.72),
					height: Math.round(size.height * 0.72),
					radius: 20,
					shape: 'rect',
					label: node.id,
					isInitial: node.isInitial ?? false
				}
			];
		})
	);
}

// Sample the actual serialized geometry, including rounding and Bézier smoothing.
function samplePath(path: string): Point[] {
	const tokens = path.match(/[MLQC]|-?\d+(?:\.\d+)?(?:e[+-]?\d+)?/gi)!;
	const points: Point[] = [];
	let index = 0;
	const point = () => ({
		x: Number(tokens[index++]),
		y: Number(tokens[index++])
	});
	while (index < tokens.length) {
		const command = tokens[index++];
		if (command === 'M' || command === 'L') points.push(point());
		else if (command === 'Q') {
			const start = points.at(-1)!,
				control = point(),
				end = point();
			for (let step = 1; step <= 40; step++) {
				const t = step / 40,
					u = 1 - t;
				points.push({
					x: u * u * start.x + 2 * u * t * control.x + t * t * end.x,
					y: u * u * start.y + 2 * u * t * control.y + t * t * end.y
				});
			}
		} else if (command === 'C') {
			const start = points.at(-1)!,
				cp1 = point(),
				cp2 = point(),
				end = point();
			for (let step = 1; step <= 80; step++) {
				const t = step / 80,
					u = 1 - t;
				points.push({
					x:
						u * u * u * start.x +
						3 * u * u * t * cp1.x +
						3 * u * t * t * cp2.x +
						t * t * t * end.x,
					y:
						u * u * u * start.y +
						3 * u * u * t * cp1.y +
						3 * u * t * t * cp2.y +
						t * t * t * end.y
				});
			}
		} else throw new Error(`Unsupported SVG command ${command}`);
	}
	return points;
}
function validateRoutes(edges: GraphEdge[], nodes: Map<string, NodePos>) {
	const routes = routeRadialEdges(edges, nodes);
	expect(routes.diagnostics.unresolved).toEqual([]);
	expect(routes.paths.size).toBe(edges.length);
	for (const edge of edges) {
		const path = routes.paths.get(edge)!;
		expect(path).not.toMatch(/NaN|Infinity/);
		const points = samplePath(path);
		for (const [endpoint, id] of [
			[points[0], edge.source],
			[points.at(-1)!, edge.target]
		] as const) {
			const node = nodes.get(id)!;
			const x = Math.abs(endpoint.x - node.x),
				y = Math.abs(endpoint.y - node.y);
			expect(
				x <= node.width / 2 + 1.002 && y <= node.height / 2 + 1.002
			).toBe(true);
			expect(
				Math.min(
					Math.abs(x - node.width / 2 - 1),
					Math.abs(y - node.height / 2 - 1)
				)
			).toBeLessThan(0.002);
		}
		for (const node of nodes.values()) {
			if (node.id === edge.source || node.id === edge.target) continue;
			const badge = node.tasks.some(({ task }) => task.c > task.d)
				? 9
				: 0;
			// 0.01 tolerance allows the SVG's three-decimal coordinate serialization.
			const box = {
				id: node.id,
				left: node.x - node.width / 2 - 11.99,
				right: node.x + node.width / 2 + 11.99 + badge,
				top: node.y - node.height / 2 - 11.99 - badge,
				bottom: node.y + node.height / 2 + 11.99
			};
			for (let i = 1; i < points.length; i++)
				if (segmentHitsBox(points[i - 1], points[i], box))
					throw new Error(
						`${edge.source} -> ${edge.target} crosses ${node.id}`
					);
		}
	}
	return routes;
}
function box(id: string, x: number, y: number): NodePos {
	return {
		id,
		x,
		y,
		width: 40,
		height: 40,
		radius: 20,
		shape: 'rect',
		label: id,
		tasks: [],
		isInitial: false
	};
}

describe('radial routes', () => {
	for (const file of readdirSync(
		new URL('../examples/', import.meta.url)
	).filter((file) => file.endsWith('.yaml'))) {
		test(`${file}: every final curve avoids expanded cards and has border ports`, () => {
			const graph = parseFile(
				readFileSync(
					new URL(`../examples/${file}`, import.meta.url),
					'utf8'
				)
			);
			const nodes = viewerNodes(graph);
			validateRoutes(graph.edges, nodes);
		});
	}
	test('deterministic routes around a blocker, with independent parallel edges', () => {
		const nodes = new Map(
			[box('a', -120, 0), box('b', 120, 0), box('obstacle', 0, 0)].map(
				(n) => [n.id, n]
			)
		);
		const edges: GraphEdge[] = [
			{ source: 'a', target: 'b', type: 'normal' },
			{ source: 'b', target: 'a', type: 'loop' },
			{ source: 'b', target: 'a', type: 'loop' }
		];
		const routes = validateRoutes(edges, nodes);
		expect(routeRadialEdges(edges, nodes)).toEqual(routes);
		expect(routes.paths.get(edges[0])).toContain('C');
		expect(routes.polylines.get(edges[1])!.length).toBeGreaterThan(2);
	});
	test('self loop has separate border ports and avoids a neighbouring card', () => {
		const nodes = new Map(
			[box('a', 0, 0), box('block', 70, -40)].map((n) => [n.id, n])
		);
		const edges: GraphEdge[] = [{ source: 'a', target: 'a', type: 'loop' }];
		const routes = validateRoutes(edges, nodes);
		const points = samplePath(routes.paths.get(edges[0])!);
		expect(points[0]).not.toEqual(points.at(-1));
	});
	test('empty routes are valid', () => {
		expect(routeRadialEdges([], new Map()).paths.size).toBe(0);
	});
});

function assertCurveClear(
	path: string,
	nodes: Map<string, NodePos>,
	excluded: string[]
) {
	const points = samplePath(path);
	expect(path).not.toMatch(/NaN|Infinity/);
	for (const node of nodes.values()) {
		if (excluded.includes(node.id)) continue;
		const width =
			node.shape === 'circle'
				? Math.max(node.width, node.radius * 2)
				: node.width;
		const height =
			node.shape === 'circle'
				? Math.max(node.height, node.radius * 2)
				: node.height;
		const badge = node.tasks.some(({ task }) => task.c > task.d) ? 9 : 0;
		const obstacle = {
			id: node.id,
			left: node.x - width / 2 - 11.99,
			right: node.x + width / 2 + 11.99 + badge,
			top: node.y - height / 2 - 11.99 - badge,
			bottom: node.y + height / 2 + 11.99
		};
		for (let i = 1; i < points.length; i++)
			if (segmentHitsBox(points[i - 1], points[i], obstacle))
				throw new Error(`Final curve crosses ${node.id}: ${path}`);
	}
	return points;
}
function expectSamePoint(actual: Point, expected: Point) {
	expect(actual.x).toBeCloseTo(expected.x, 2);
	expect(actual.y).toBeCloseTo(expected.y, 2);
}

describe('radial graph collectors', () => {
	for (const file of readdirSync(
		new URL('../examples/', import.meta.url)
	).filter((file) => file.endsWith('.yaml'))) {
		test(`${file}: complete logical edge identities, safe trunks and continuous branches`, () => {
			const graph = parseFile(
				readFileSync(
					new URL(`../examples/${file}`, import.meta.url),
					'utf8'
				)
			);
			const nodes = viewerNodes(graph);
			const result = routeRadialGraph(graph.edges, nodes);
			if (file === 'gfp-m2-1-2-2-3-3-4.yaml')
				expect(result.bundles.length).toBeGreaterThan(0);
			expect(result.diagnostics.unresolved).toEqual([]);
			expect(result.paths.size).toBe(graph.edges.length);
			if (file === 'gfp-m2-1-2-2-3-3-4.yaml') {
				const opposing = graph.edges.find(
					(e) => e.source === 'n18' && e.target === 'n2'
				)!;
				expect(
					result.bundles.some((bundle) =>
						bundle.edges.includes(opposing)
					)
				).toBe(false);
				const end = samplePath(result.paths.get(opposing)!).at(-1)!;
				expect(end.y).toBeGreaterThan(nodes.get('n2')!.y);
			}

			expect(result.polylines.size).toBe(graph.edges.length);
			const bundled = new Set<GraphEdge>();
			for (const bundle of result.bundles) {
				expect(bundle.path).toBeDefined();
				expect(bundle.edges.length).toBeGreaterThanOrEqual(2);
				if (
					file === 'gfp-m2-1-2-2-3-3-4.yaml' &&
					bundle.target === 'n1'
				) {
					const trunkSamples = samplePath(bundle.path!);
					const direction = {
						x: trunkSamples[1].x - trunkSamples[0].x,
						y: trunkSamples[1].y - trunkSamples[0].y
					};
					for (const edge of bundle.edges) {
						const final = JSON.parse(
							drawnSegments(result.paths.get(edge)!).at(-1)!
						) as (number | string)[];
						expect(final[2]).toBe('C');
						const dx = Number(final.at(-2)) - Number(final.at(-4));
						const dy = Number(final.at(-1)) - Number(final.at(-3));
						const cosine =
							(dx * direction.x + dy * direction.y) /
							(Math.hypot(dx, dy) *
								Math.hypot(direction.x, direction.y));
						expect(cosine).toBeGreaterThan(0.999);
					}
				}

				const trunk = assertCurveClear(bundle.path!, nodes, [
					bundle.target
				]);
				expectSamePoint(trunk[0], bundle.hub);
				for (const edge of bundle.edges) {
					expect(graph.edges.includes(edge)).toBe(true);
					expect(edge.target).toBe(bundle.target);
					expect(bundled.has(edge)).toBe(false);
					bundled.add(edge);
					const branch = assertCurveClear(
						result.paths.get(edge)!,
						nodes,
						[edge.source]
					);
					expectSamePoint(branch.at(-1)!, bundle.hub);
					expectSamePoint(
						result.polylines.get(edge)!.at(-1)!,
						bundle.hub
					);
				}
			}
			for (const edge of graph.edges)
				if (!bundled.has(edge))
					assertCurveClear(result.paths.get(edge)!, nodes, [
						edge.source,
						edge.target
					]);
		});
	}
});

describe('radial routing regressions', () => {
	test('crowded diagonal neighbours allow a compact self loop', () => {
		const nodes = new Map(
			[
				box('a', 0, 0),
				box('b', 65, 65),
				box('c', 65, -65),
				box('d', -65, 65),
				box('e', -65, -65)
			].map((n) => [n.id, n])
		);
		validateRoutes([{ source: 'a', target: 'a', type: 'loop' }], nodes);
	});
	test('a circular obstacle uses its radius even when its label rectangle is smaller', () => {
		const nodes = new Map(
			[
				box('a', -140, 40),
				box('b', 140, 40),
				{ ...box('circle', 0, 0), shape: 'circle' as const, radius: 60 }
			].map((n) => [n.id, n])
		);
		const edge: GraphEdge = { source: 'a', target: 'b', type: 'normal' };
		const result = routeRadialEdges([edge], nodes);
		expect(result.diagnostics.unresolved).toEqual([]);
		assertCurveClear(result.paths.get(edge)!, nodes, ['a', 'b']);
	});
	test('missing endpoints are reported using the logical edge identifier', () => {
		const edge: GraphEdge = {
			id: 'missing-edge',
			source: 'a',
			target: 'missing',
			type: 'loop'
		};
		const nodes = new Map([['a', box('a', 0, 0)]]);
		for (const route of [routeRadialEdges, routeRadialGraph]) {
			const result = route([edge], nodes);
			expect(result.paths.size).toBe(0);
			expect(result.diagnostics.unresolved).toEqual(['missing-edge']);
		}
	});
});

// Track drawn commands across pen-up moves; a second M must never count as a stroke.
function drawnSegments(path: string): string[] {
	const result: string[] = [];
	let start: Point = { x: 0, y: 0 };
	for (const command of path.match(/[MLQC][^MLQC]*/g) ?? []) {
		const numbers = command.slice(1).trim().split(/[ ,]+/).map(Number);
		const end = { x: numbers.at(-2)!, y: numbers.at(-1)! };
		if (command[0] !== 'M')
			result.push(
				JSON.stringify([start.x, start.y, command[0], ...numbers])
			);
		start = end;
	}
	return result;
}

test('shared strokes render once while each logical edge retains its complete route', () => {
	const graph = parseFile(
		readFileSync(
			new URL('../examples/gfp-m2-1-2-2-3-3-4.yaml', import.meta.url),
			'utf8'
		)
	);
	const result = routeRadialGraph(graph.edges, viewerNodes(graph));
	expect(result.sharedSegments.length).toBeGreaterThan(0);
	expect(
		result.sharedSegments.some(
			(shared) => drawnSegments(shared.path!).length > 1
		)
	).toBe(true);
	expect(result.renderPaths.size).toBe(result.paths.size);
	const visible = new Map<string, number>();
	const count = (target: string, path: string) => {
		for (const segment of drawnSegments(path)) {
			const key = target + ':' + segment;
			visible.set(key, (visible.get(key) ?? 0) + 1);
		}
	};
	for (const [edge, path] of result.renderPaths) count(edge.target, path);
	for (const shared of result.sharedSegments) {
		expect(shared.hasArrow).toBe(false);
		expect(new Set(shared.edges).size).toBe(shared.edges.length);
		expect(shared.edges.length).toBeGreaterThanOrEqual(2);
		const segments = drawnSegments(shared.path!);
		expect(segments.length).toBeGreaterThanOrEqual(1);
		for (const edge of shared.edges) {
			expect(graph.edges.includes(edge)).toBe(true);
			expect(edge.target).toBe(shared.target);
			for (const segment of segments) {
				expect(drawnSegments(result.paths.get(edge)!)).toContain(
					segment
				);
				expect(
					drawnSegments(result.renderPaths.get(edge)!)
				).not.toContain(segment);
			}
		}
		count(shared.target, shared.path!);
	}
	for (const shared of result.sharedSegments)
		for (const segment of drawnSegments(shared.path!))
			expect(visible.get(shared.target + ':' + segment)).toBe(1);
	for (const [edge, path] of result.paths) {
		expect(path.match(/M/g)?.length).toBe(1);
		const rebuilt = [
			...drawnSegments(result.renderPaths.get(edge)!),
			...result.sharedSegments
				.filter((s) => s.edges.includes(edge))
				.flatMap((s) => drawnSegments(s.path!))
		];
		expect(rebuilt.sort()).toEqual(drawnSegments(path).sort());
	}
});

test('spatial obstacle index preserves routes when distant nodes cross its activation threshold', () => {
	const core = [box('a', -140, 0), box('b', 140, 0), box('blocker', 0, 0)];
	// Distant obstacles activate indexed lookup without obstructing the local detour.
	const distant = Array.from({ length: 100 }, (_, i) =>
		box(`far-${i}`, 2000 + (i % 10) * 160, 2000 + Math.floor(i / 10) * 160)
	);
	const nodes = new Map([...core, ...distant].map((n) => [n.id, n]));
	const edges: GraphEdge[] = [
		{ source: 'a', target: 'b', type: 'normal' },
		{ source: 'b', target: 'a', type: 'loop' }
	];
	const result = validateRoutes(edges, nodes);
	for (const edge of edges) {
		expect(result.polylines.get(edge)!.length).toBeGreaterThan(2);
		assertCurveClear(result.paths.get(edge)!, nodes, [
			edge.source,
			edge.target
		]);
	}
});
