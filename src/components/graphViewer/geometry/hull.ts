import * as d3 from 'd3';
import type { LabelPosition } from '../../../types/graph';
import type { LabelTransform, NodePos } from '../types';

/** Circumscribed circle radius of triangle a-b-c. */
function circumradius(
	a: [number, number],
	b: [number, number],
	c: [number, number]
): number {
	const ax = b[0] - a[0],
		ay = b[1] - a[1];
	const bx = c[0] - a[0],
		by = c[1] - a[1];
	const cross = Math.abs(ax * by - ay * bx);
	if (cross < 1e-10) return Infinity;
	const ab = Math.hypot(b[0] - a[0], b[1] - a[1]);
	const bc = Math.hypot(c[0] - b[0], c[1] - b[1]);
	const ca = Math.hypot(a[0] - c[0], a[1] - c[1]);
	return (ab * bc * ca) / (2 * cross);
}

/**
 * Sample points around each node and return a tight concave-hull (alpha-shape)
 * polygon that hugs only the member nodes.  Falls back to convex hull when the
 * alpha shape is degenerate (single node, collinear nodes, etc.).
 */
export function computeHull(
	nodeIds: string[],
	nodeMap: Map<string, NodePos>,
	pad = 24
): [number, number][] | null {
	const points: [number, number][] = [];
	let maxEr = 0;

	for (const id of nodeIds) {
		const n = nodeMap.get(id);
		if (!n) continue;
		const r =
			n.shape === 'circle'
				? n.radius
				: Math.max(n.width / 2, n.height / 2);
		const er = r + pad;
		if (er > maxEr) maxEr = er;
		// More sample points → smoother boundary resolution
		const N = 32;
		for (let i = 0; i < N; i++) {
			const a = (i / N) * 2 * Math.PI;
			points.push([n.x + er * Math.cos(a), n.y + er * Math.sin(a)]);
		}
	}

	if (points.length < 3) return null;

	// Alpha controls tightness: circumradius > alpha → triangle is removed.
	// 1.5 × maxEr keeps adjacent nodes connected while skipping large gaps.
	const alpha = maxEr * 1.5;

	try {
		const delaunay = d3.Delaunay.from(
			points,
			(d) => d[0],
			(d) => d[1]
		);
		const tris = delaunay.triangles;

		// Count how many kept triangles each edge belongs to.
		const edgeCnt = new Map<string, number>();
		const edgeSrc = new Map<string, [number, number]>();

		for (let i = 0; i < tris.length; i += 3) {
			const ai = tris[i],
				bi = tris[i + 1],
				ci = tris[i + 2];
			if (circumradius(points[ai], points[bi], points[ci]) > alpha)
				continue;

			for (const [p, q] of [
				[ai, bi],
				[bi, ci],
				[ci, ai]
			] as [number, number][]) {
				const key = p < q ? `${p}|${q}` : `${q}|${p}`;
				edgeCnt.set(key, (edgeCnt.get(key) ?? 0) + 1);
				if (!edgeSrc.has(key)) edgeSrc.set(key, [p, q]);
			}
		}

		// Boundary edges appear in exactly one kept triangle.
		const adj = new Map<number, number[]>();
		for (const [key, cnt] of edgeCnt) {
			if (cnt !== 1) continue;
			const [p, q] = edgeSrc.get(key)!;
			if (!adj.has(p)) adj.set(p, []);
			if (!adj.has(q)) adj.set(q, []);
			adj.get(p)!.push(q);
			adj.get(q)!.push(p);
		}

		if (adj.size < 3) return d3.polygonHull(points) ?? null;

		// Walk boundary to form a closed polygon.
		let startIdx: number | undefined;
		for (const k of adj.keys()) {
			startIdx = k;
			break;
		}
		if (startIdx === undefined) return d3.polygonHull(points) ?? null;

		const polygon: [number, number][] = [];
		const visited = new Set<number>();
		let cur = startIdx;
		let prev = -1;

		for (;;) {
			if (visited.has(cur)) break;
			visited.add(cur);
			polygon.push(points[cur]);
			const neighbors = adj.get(cur)!;
			const next = neighbors.find((n) => n !== prev) ?? -1;
			if (next === -1) break;
			prev = cur;
			cur = next;
		}

		if (polygon.length >= 3) return polygon;
	} catch {
		// fall through
	}

	return d3.polygonHull(points) ?? null;
}

/** Convert hull vertices to a smooth closed SVG path string. */
export function hullToPath(hull: [number, number][]): string | null {
	const line = d3
		.line<[number, number]>()
		.x((d) => d[0])
		.y((d) => d[1])
		.curve(d3.curveBasisClosed);
	return line(hull) ?? null;
}

/**
 * Given the convex hull vertices and a label position, return the SVG transform
 * (translate + rotate) so the label sits just outside the nearest hull edge,
 * rotated to follow that edge.
 *
 * Edge selection: score each edge by dot(outwardNormal, desiredDirection).
 * This correctly picks corner edges for positions like 'bottom-left'.
 */
export function getLabelTransform(
	hull: [number, number][],
	labelPos: LabelPosition
): LabelTransform {
	if (hull.length === 0) return { x: 0, y: 0, rotate: 0, anchor: 'middle' };

	const centX = hull.reduce((s, p) => s + p[0], 0) / hull.length;
	const centY = hull.reduce((s, p) => s + p[1], 0) / hull.length;

	if (labelPos === 'center') {
		return { x: centX, y: centY, rotate: 0, anchor: 'middle' };
	}

	// Target direction for each position (SVG coords: y grows downward)
	// Normalized so corner directions have equal weight on both axes.
	const S2 = Math.SQRT2 / 2; // 1/√2 ≈ 0.707
	const dirX: Record<string, number> = {
		'top-center': 0,
		'top-left': -S2,
		'top-right': S2,
		'bottom-center': 0,
		'bottom-left': -S2,
		'bottom-right': S2
	};
	const dirY: Record<string, number> = {
		'top-center': -1,
		'top-left': -S2,
		'top-right': -S2,
		'bottom-center': 1,
		'bottom-left': S2,
		'bottom-right': S2
	};
	const tdx = dirX[labelPos] ?? 0;
	const tdy = dirY[labelPos] ?? 0;

	// Find the edge whose outward normal best aligns with the target direction
	let bestIdx = -1;
	let bestScore = -Infinity;
	for (let i = 0; i < hull.length; i++) {
		const a = hull[i];
		const b = hull[(i + 1) % hull.length];
		const ex = b[0] - a[0];
		const ey = b[1] - a[1];
		const eLen = Math.sqrt(ex * ex + ey * ey);
		if (eLen === 0) continue;
		const mx = (a[0] + b[0]) / 2;
		const my = (a[1] + b[1]) / 2;
		// Candidate outward normal (one of two perps)
		const n1x = -ey / eLen;
		const n1y = ex / eLen;
		const inward = n1x * (centX - mx) + n1y * (centY - my) > 0;
		const nx = inward ? -n1x : n1x;
		const ny = inward ? -n1y : n1y;
		const score = nx * tdx + ny * tdy;
		if (score > bestScore) {
			bestScore = score;
			bestIdx = i;
		}
	}

	const va = hull[bestIdx];
	const vb = hull[(bestIdx + 1) % hull.length];
	const ex = vb[0] - va[0];
	const ey = vb[1] - va[1];
	const eLen = Math.sqrt(ex * ex + ey * ey);
	const mx = (va[0] + vb[0]) / 2;
	const my = (va[1] + vb[1]) / 2;

	// Outward normal for placement
	const n1x = -ey / eLen;
	const n1y = ex / eLen;
	const inward = n1x * (centX - mx) + n1y * (centY - my) > 0;
	const normX = inward ? -n1x : n1x;
	const normY = inward ? -n1y : n1y;

	const OUTSET = 14; // px outside the hull boundary
	const x = mx + normX * OUTSET;
	const y = my + normY * OUTSET;

	// Edge angle, normalized to [-90, 90] so text is never upside-down
	let angle = (Math.atan2(ey, ex) * 180) / Math.PI;
	if (angle > 90) angle -= 180;
	if (angle < -90) angle += 180;

	// '-left': text hangs to the left of the anchor point → anchor='end'
	// '-right': text hangs to the right → anchor='start'
	const anchor: 'start' | 'middle' | 'end' = labelPos.endsWith('-left')
		? 'end'
		: labelPos.endsWith('-right')
			? 'start'
			: 'middle';

	return { x, y, rotate: angle, anchor };
}
