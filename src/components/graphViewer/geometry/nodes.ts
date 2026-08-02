import type { NodeTaskDisplay } from '../../../types/graph';
import type { NodePos, Point } from '../types';

export function nodeCircleRadius(tasks: NodeTaskDisplay[]): number {
	const lines = Math.max(1, tasks.length);
	// Compact: enough space for the text lines
	return Math.max(20, lines * 9 + 12);
}

export function getBorderPoint(
	node: NodePos,
	tx: number,
	ty: number
): { x: number; y: number } {
	const dx = tx - node.x;
	const dy = ty - node.y;
	const len = Math.sqrt(dx * dx + dy * dy);
	if (len < 1) return { x: node.x, y: node.y };
	const nx = dx / len;
	const ny = dy / len;

	if (node.shape === 'circle') {
		const r = node.radius + 1;
		return { x: node.x + nx * r, y: node.y + ny * r };
	}

	const hw = node.width / 2 + 1;
	const hh = node.height / 2 + 1;
	const tr = nx !== 0 ? hw / Math.abs(nx) : Infinity;
	const tc = ny !== 0 ? hh / Math.abs(ny) : Infinity;
	const t = Math.min(tr, tc);
	return { x: node.x + nx * t, y: node.y + ny * t };
}

export function pointIntersectsNode(
	point: Point,
	node: NodePos,
	padding: number
): boolean {
	if (node.shape === 'circle') {
		const dx = point.x - node.x;
		const dy = point.y - node.y;
		const radius = node.radius + padding;
		return dx * dx + dy * dy <= radius * radius;
	}

	return (
		Math.abs(point.x - node.x) <= node.width / 2 + padding &&
		Math.abs(point.y - node.y) <= node.height / 2 + padding
	);
}

export function cubicPoint(
	start: Point,
	control1: Point,
	control2: Point,
	end: Point,
	t: number
): Point {
	const mt = 1 - t;
	return {
		x:
			mt * mt * mt * start.x +
			3 * mt * mt * t * control1.x +
			3 * mt * t * t * control2.x +
			t * t * t * end.x,
		y:
			mt * mt * mt * start.y +
			3 * mt * mt * t * control1.y +
			3 * mt * t * t * control2.y +
			t * t * t * end.y
	};
}
