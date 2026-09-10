import * as d3 from 'd3';
import type { NodePos, Point } from '../types';

export function pointInPolygon(
	x: number,
	y: number,
	polygon: Point[]
): boolean {
	if (polygon.length < 3) return false;
	let inside = false;
	for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
		const xi = polygon[i].x;
		const yi = polygon[i].y;
		const xj = polygon[j].x;
		const yj = polygon[j].y;
		const intersects =
			yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;
		if (intersects) inside = !inside;
	}
	return inside;
}

export function isLassoModifier(
	shiftKeyRef: { current: boolean },
	event: { shiftKey: boolean }
): boolean {
	return shiftKeyRef.current || event.shiftKey;
}

export function graphToWrapper(
	wrapper: HTMLElement,
	svg: SVGSVGElement,
	point: Point
): Point {
	const wrapperRect = wrapper.getBoundingClientRect();
	const svgRect = svg.getBoundingClientRect();
	const transform = d3.zoomTransform(svg);
	const [sx, sy] = transform.apply([point.x, point.y]);
	return {
		x: sx + (svgRect.left - wrapperRect.left),
		y: sy + (svgRect.top - wrapperRect.top)
	};
}

export function nodeHitsLassoRegion(
	node: NodePos,
	wrapper: HTMLElement,
	svg: SVGSVGElement,
	wrapperRegion: Point[]
): boolean {
	if (wrapperRegion.length < 2) return false;

	const hw = node.width / 2;
	const hh = node.height / 2;
	const graphSamples = [
		{ x: node.x, y: node.y },
		{ x: node.x - hw, y: node.y - hh },
		{ x: node.x + hw, y: node.y - hh },
		{ x: node.x + hw, y: node.y + hh },
		{ x: node.x - hw, y: node.y + hh }
	];
	const samples = graphSamples.map((sample) =>
		graphToWrapper(wrapper, svg, sample)
	);

	if (wrapperRegion.length >= 3) {
		return samples.some((sample) =>
			pointInPolygon(sample.x, sample.y, wrapperRegion)
		);
	}

	const xs = wrapperRegion.map((point) => point.x);
	const ys = wrapperRegion.map((point) => point.y);
	const minX = Math.min(...xs);
	const maxX = Math.max(...xs);
	const minY = Math.min(...ys);
	const maxY = Math.max(...ys);

	return samples.some(
		(sample) =>
			sample.x >= minX &&
			sample.x <= maxX &&
			sample.y >= minY &&
			sample.y <= maxY
	);
}

export function computeLassoHits(
	wrapperPoints: Point[],
	wrapper: HTMLElement,
	svg: SVGSVGElement,
	nodeMap: Map<string, NodePos>,
	gRoot: SVGGElement | null
): Set<string> {
	if (wrapperPoints.length < 2) return new Set();

	const hitIds = new Set<string>();
	if (nodeMap.size > 0) {
		for (const [id, node] of nodeMap) {
			if (nodeHitsLassoRegion(node, wrapper, svg, wrapperPoints)) {
				hitIds.add(id);
			}
		}
	} else if (gRoot) {
		d3.select(gRoot)
			.selectAll<SVGGElement, NodePos>('.node-group')
			.each((node) => {
				if (nodeHitsLassoRegion(node, wrapper, svg, wrapperPoints)) {
					hitIds.add(node.id);
				}
			});
	}

	return hitIds;
}
