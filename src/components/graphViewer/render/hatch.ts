import * as d3 from 'd3';
import { HATCH_STRIDE } from '../constants';

export function sanitizePatternId(nodeId: string): string {
	return `hatch-${nodeId.replace(/[^a-zA-Z0-9-]/g, '_')}`;
}

/** Darken a hex colour by `amount` (0–1). */
export function darkenColor(hex: string, amount = 0.35): string {
	const c = hex.replace('#', '');
	if (c.length !== 6) return hex;
	const r = Math.round(parseInt(c.slice(0, 2), 16) * (1 - amount));
	const g = Math.round(parseInt(c.slice(2, 4), 16) * (1 - amount));
	const b = Math.round(parseInt(c.slice(4, 6), 16) * (1 - amount));
	return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}

/**
 * Create or update an SVG hatch pattern in `<defs>`.
 * Returns the pattern id (use as `url(#id)` for fill).
 *
 * Draws diagonal lines directly (no patternTransform) for reliable rendering.
 * Tile is 10×10; lines extend 1px past each edge to avoid tiling gaps.
 */
export function upsertHatchPattern(
	defsEl: SVGDefsElement,
	nodeId: string,
	hatch: 'single' | 'cross',
	fillColor: string,
	stripeColor: string
): string {
	const id = sanitizePatternId(nodeId);
	const N = 16;
	const defs = d3.select(defsEl);
	let pat = defs.select<SVGPatternElement>(`#${id}`);
	if (pat.empty()) {
		pat = defs
			.append<SVGPatternElement>('pattern')
			.attr('id', id)
			.attr('patternUnits', 'userSpaceOnUse')
			.attr('width', N)
			.attr('height', N);
	}
	// Update size (in case it was previously set differently)
	pat.attr('width', N).attr('height', N);
	// Rebuild contents to handle hatch-type / color changes
	pat.selectAll('*').remove();
	// Background fill rect
	pat.append('rect')
		.attr('width', N)
		.attr('height', N)
		.attr('fill', fillColor);
	// "/" diagonal: from bottom-left to top-right, extended 1px past tile edges
	pat.append('line')
		.attr('x1', -1)
		.attr('y1', N + 1)
		.attr('x2', N + 1)
		.attr('y2', -1)
		.attr('stroke', stripeColor)
		.attr('stroke-width', 1.8);
	if (hatch === 'cross') {
		// "\" diagonal: from top-left to bottom-right
		pat.append('line')
			.attr('x1', -1)
			.attr('y1', -1)
			.attr('x2', N + 1)
			.attr('y2', N + 1)
			.attr('stroke', stripeColor)
			.attr('stroke-width', 1.8);
	}
	return id;
}

/**
 * Draw hatch lines into `group`, clipped to the hull bounding box.
 * The group must already have a clip-path set.
 */
export function drawHatchLines(
	group: d3.Selection<SVGGElement, unknown, null, undefined>,
	hull: [number, number][],
	hatch: 'single' | 'cross',
	color: string
): void {
	const xs = hull.map((p) => p[0]);
	const ys = hull.map((p) => p[1]);
	const pad = HATCH_STRIDE;
	const bx1 = Math.min(...xs) - pad;
	const bx2 = Math.max(...xs) + pad;
	const by1 = Math.min(...ys) - pad;
	const by2 = Math.max(...ys) + pad;
	// '/' lines: y = c − x
	for (let c = bx1 + by1; c <= bx2 + by2; c += HATCH_STRIDE) {
		group
			.append('line')
			.attr('x1', bx1)
			.attr('y1', c - bx1)
			.attr('x2', bx2)
			.attr('y2', c - bx2)
			.attr('stroke', color)
			.attr('stroke-width', 1.5);
	}
	if (hatch === 'cross') {
		// '\' lines: y = x + c
		for (let c = by1 - bx2; c <= by2 - bx1; c += HATCH_STRIDE) {
			group
				.append('line')
				.attr('x1', bx1)
				.attr('y1', bx1 + c)
				.attr('x2', bx2)
				.attr('y2', bx2 + c)
				.attr('stroke', color)
				.attr('stroke-width', 1.5);
		}
	}
}

/**
 * Build (or rebuild) the hatch overlay group for one area in `areasHatchLayer`.
 * Creates a <clipPath> in defs and draws explicit lines clipped to the hull —
 * avoids SVG pattern rendering issues entirely.
 */
export function buildAreaHatchOverlay(
	hatchLayer: d3.Selection<d3.BaseType, unknown, null, undefined>,
	defsEl: SVGDefsElement,
	areaId: string,
	hull: [number, number][],
	hullPath: string,
	hatch: 'single' | 'cross',
	color: string
): void {
	const safeId = areaId.replace(/[^a-zA-Z0-9-]/g, '_');
	const clipId = `clip-hatch-${safeId}`;
	const defs = d3.select(defsEl);

	// Remove any stale clip-path + group for this area
	defs.select(`#${clipId}`).remove();
	hatchLayer.select(`.area-hatch[data-area-id="${areaId}"]`).remove();

	// Create clip path from the hull outline
	defs.append('clipPath').attr('id', clipId).append('path').attr('d', hullPath);

	// Create the hatch group — lines inside will be clipped to hull
	const group = hatchLayer
		.append<SVGGElement>('g')
		.attr('class', 'area-hatch')
		.attr('data-area-id', areaId)
		.attr('clip-path', `url(#${clipId})`)
		.attr('pointer-events', 'none');

	drawHatchLines(group, hull, hatch, color);
}

/** Remove hatch overlay + its clip-path for one area. */
export function removeAreaHatchOverlay(
	hatchLayer: d3.Selection<d3.BaseType, unknown, null, undefined>,
	defsEl: SVGDefsElement,
	areaId: string
): void {
	const safeId = areaId.replace(/[^a-zA-Z0-9-]/g, '_');
	hatchLayer.select(`.area-hatch[data-area-id="${areaId}"]`).remove();
	d3.select(defsEl).select(`#clip-hatch-${safeId}`).remove();
}
