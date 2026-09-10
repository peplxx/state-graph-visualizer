import { describe, expect, test } from 'bun:test';
import { readFileSync, readdirSync } from 'node:fs';
import { computeRadialPositions } from '../src/components/graphViewer/layout/radial';
import { parseFile } from '../src/core/parser';
import type { GraphNode, GraphEdge } from '../src/types/graph';

const node = (id: string, count = 3): GraphNode => ({
	id,
	tasks: Array.from({ length: count }, () => ({
		task: { c: 1, d: 2 },
		release: 'none'
	}))
});
const edge = (source: string, target: string): GraphEdge => ({
	source,
	target,
	type: 'normal'
});
function checkClearance(result: ReturnType<typeof computeRadialPositions>) {
	const ids = [...result.positions.keys()];
	for (let i = 0; i < ids.length; i++)
		for (let j = 0; j < i; j++) {
			const a = result.positions.get(ids[i])!,
				b = result.positions.get(ids[j])!;
			const sa = result.sizes.get(ids[i])!,
				sb = result.sizes.get(ids[j])!;
			expect(
				Math.abs(a.x - b.x) >= (sa.width + sb.width) / 2 + 12 - 1e-4 ||
					Math.abs(a.y - b.y) >=
						(sa.height + sb.height) / 2 + 12 - 1e-4
			).toBe(true);
		}
}

describe('radial constraints', () => {
	test('empty and singleton graphs', () => {
		expect(computeRadialPositions([], []).positions.size).toBe(0);
		expect(
			computeRadialPositions([node('root')], []).positions.get('root')
		).toEqual({ x: 0, y: 0 });
	});
	test('dense variable size ring keeps cyclic sibling order and a common radius', () => {
		const children = Array.from({ length: 60 }, (_, i) =>
			node(`n${i}`, (i % 7) + 1)
		);
		const result = computeRadialPositions(
			[node('root'), ...children],
			children.map((n) => edge('root', n.id))
		);
		checkClearance(result);
		let previous = -Infinity;
		for (const child of children) {
			expect(result.depths.get(child.id)).toBe(1);
			const angle = result.angles.get(child.id)!;
			expect(angle).toBeGreaterThan(previous);
			previous = angle;
			const p = result.positions.get(child.id)!;
			expect(Math.hypot(p.x, p.y)).toBeCloseTo(result.ringRadii[0], 7);
		}
		expect(
			result.angles.get(children.at(-1)!.id)! -
				result.angles.get(children[0].id)!
		).toBeLessThan(2 * Math.PI);
	});
	test('multiple roots and tall descendants occupy separate rings', () => {
		const roots = Array.from({ length: 8 }, (_, i) => node(`r${i}`, i + 1));
		const nodes = [...roots, ...roots.map((_, i) => node(`c${i}`, 12 - i))];
		const result = computeRadialPositions(
			nodes,
			roots.map((r, i) => edge(r.id, `c${i}`))
		);
		checkClearance(result);
		expect(result.ringRadii.length).toBe(2);
		for (const root of roots)
			expect(
				Math.hypot(
					...(Object.values(result.positions.get(root.id)!) as [
						number,
						number
					])
				)
			).toBeCloseTo(result.ringRadii[0], 7);
	});
	for (const file of readdirSync(
		new URL('../examples/', import.meta.url)
	).filter((file) => file.endsWith('.yaml'))) {
		test(`${file}: deterministic, no overlaps, preserved breadth-first levels`, () => {
			const graph = parseFile(
				readFileSync(
					new URL(`../examples/${file}`, import.meta.url),
					'utf8'
				)
			);
			const result = computeRadialPositions(graph.nodes, graph.edges);
			checkClearance(result);
			expect(computeRadialPositions(graph.nodes, graph.edges)).toEqual(
				result
			);
			// Every non-root occupies exactly its depth's ring; no vertical/radial relaxation.
			for (const [id, depth] of result.depths)
				if (depth > 0) {
					const p = result.positions.get(id)!;
					expect(Math.hypot(p.x, p.y)).toBeCloseTo(
						result.ringRadii[depth - 1],
						7
					);
				}
		});
	}
});
