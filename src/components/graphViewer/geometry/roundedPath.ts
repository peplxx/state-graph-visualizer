import type { Point } from '../types';

const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);
const midpoint = (a: Point, b: Point): Point => ({
	x: (a.x + b.x) / 2,
	y: (a.y + b.y) / 2
});
const text = (p: Point) => `${p.x.toFixed(3)},${p.y.toFixed(3)}`;
type ClearSegment = (a: Point, b: Point) => boolean;

/** Adaptive subdivision bounds the curve/chord error before checking clearance. */
function safeCurve(
	a: Point,
	b: Point,
	c: Point,
	d: Point,
	clear: ClearSegment,
	depth = 0
): boolean {
	const dx = d.x - a.x,
		dy = d.y - a.y,
		len = distance(a, d);
	const deviation =
		len < 1e-8
			? Math.max(distance(a, b), distance(a, c))
			: Math.max(
					Math.abs(dx * (b.y - a.y) - dy * (b.x - a.x)),
					Math.abs(dx * (c.y - a.y) - dy * (c.x - a.x))
				) / len;
	if (deviation < 0.025 || depth >= 14) {
		if (!clear(a, d)) return false;
		if (len < 1e-8) return true;
		// Cover the residual flattening error and three-decimal SVG serialization.
		const nx = (-dy / len) * 0.03,
			ny = (dx / len) * 0.03;
		return (
			clear({ x: a.x + nx, y: a.y + ny }, { x: d.x + nx, y: d.y + ny }) &&
			clear({ x: a.x - nx, y: a.y - ny }, { x: d.x - nx, y: d.y - ny })
		);
	}
	const ab = midpoint(a, b),
		bc = midpoint(b, c),
		cd = midpoint(c, d),
		abc = midpoint(ab, bc),
		bcd = midpoint(bc, cd),
		middle = midpoint(abc, bcd);
	return (
		safeCurve(a, ab, abc, middle, clear, depth + 1) &&
		safeCurve(middle, bcd, cd, d, clear, depth + 1)
	);
}

/** Fillet an existing route without moving its endpoints or choosing a different route. */
export function roundedPath(
	input: Point[],
	clear: ClearSegment,
	endTangent?: Point,
	wideArrival = true
): string {
	const points = input.filter(
		(p, i) => i === 0 || distance(p, input[i - 1]) > 0.001
	);
	if (points.length < 2) return '';
	let path = `M ${text(points[0])}`;
	let last = points[0];
	for (
		let i = 1;
		i < points.length - (endTangent && wideArrival ? 2 : 1);
		i++
	) {
		const a = points[i - 1],
			b = points[i],
			c = points[i + 1],
			incoming = distance(a, b),
			outgoing = distance(b, c);
		const u = { x: (b.x - a.x) / incoming, y: (b.y - a.y) / incoming },
			v = { x: (c.x - b.x) / outgoing, y: (c.y - b.y) / outgoing };
		const turn = Math.acos(
			Math.max(-1, Math.min(1, u.x * v.x + u.y * v.y))
		);
		if (turn < 0.005) {
			path += ` L ${text(b)}`;
			last = b;
			continue;
		}
		// Circular fillets distribute curvature more evenly than a quadratic pulled toward the corner.
		const ratio = ((4 / 3) * Math.tan(turn / 4)) / Math.tan(turn / 2);
		let reach = Math.min(110, incoming * 0.48, outgoing * 0.48),
			accepted = false;
		for (let attempt = 0; attempt < 10; attempt++) {
			const start = { x: b.x - u.x * reach, y: b.y - u.y * reach },
				end = { x: b.x + v.x * reach, y: b.y + v.y * reach };
			const handle = reach * ratio,
				cp1 = { x: start.x + u.x * handle, y: start.y + u.y * handle },
				cp2 = { x: end.x - v.x * handle, y: end.y - v.y * handle };
			if (safeCurve(start, cp1, cp2, end, clear)) {
				path += ` L ${text(start)} C ${text(cp1)} ${text(cp2)} ${text(end)}`;
				last = end;
				accepted = true;
				break;
			}
			reach *= 0.65;
		}
		if (!accepted) {
			path += ` L ${text(b)}`;
			last = b;
		}
	}
	const end = points[points.length - 1];
	if (endTangent && distance(last, end) > 0.01) {
		const length = distance(last, end),
			norm = Math.hypot(endTangent.x, endTangent.y);
		if (norm > 0.01) {
			const previous = points[Math.max(0, points.length - 3)];
			const corner = points[points.length - 2];
			const incoming = distance(previous, corner);
			const ux =
				incoming > 0.01 && wideArrival
					? (corner.x - previous.x) / incoming
					: (end.x - last.x) / length;
			const uy =
				incoming > 0.01 && wideArrival
					? (corner.y - previous.y) / incoming
					: (end.y - last.y) / length;
			for (let handle = length * 0.45; handle > 0.05; handle *= 0.65) {
				const c1 = {
					x: last.x + ux * handle,
					y: last.y + uy * handle
				};
				const c2 = {
					x: end.x - (endTangent.x * handle) / norm,
					y: end.y - (endTangent.y * handle) / norm
				};
				if (safeCurve(last, c1, c2, end, clear))
					return path + ` C ${text(c1)} ${text(c2)} ${text(end)}`;
			}
		}
	}
	if (endTangent)
		return wideArrival
			? roundedPath(input, clear, endTangent, false)
			: roundedPath(input, clear);
	return path + ` L ${text(end)}`;
}
