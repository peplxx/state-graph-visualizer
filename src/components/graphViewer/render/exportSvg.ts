import { EXPORT_FONT_CSS, SVG_NS } from '../constants';

export function prepareExportSvg(svg: SVGSVGElement): SVGSVGElement {
	const w = svg.clientWidth;
	const h = svg.clientHeight;
	const clone = svg.cloneNode(true) as SVGSVGElement;

	clone.setAttribute('xmlns', SVG_NS);
	clone.setAttribute('xmlns:xlink', 'http://www.w3.org/1999/xlink');
	clone.setAttribute('width', String(w));
	clone.setAttribute('height', String(h));
	clone.setAttribute('viewBox', `0 0 ${w} ${h}`);
	clone.removeAttribute('class');
	clone.style.removeProperty('width');
	clone.style.removeProperty('height');

	let defs = clone.querySelector('defs');
	if (!defs) {
		defs = document.createElementNS(SVG_NS, 'defs');
		clone.insertBefore(defs, clone.firstChild);
	}
	const style = document.createElementNS(SVG_NS, 'style');
	style.setAttribute('type', 'text/css');
	style.textContent = EXPORT_FONT_CSS;
	defs.insertBefore(style, defs.firstChild);

	clone.querySelectorAll('.node-group').forEach((node) => {
		// Preserve the inline opacity set by D3 (selection dimming is 0.1,
		// normal is 1). Only force 1 if the value is falsy / stuck at 0 from
		// a mid-animation state (entrance animation completes before export in
		// practice, but guard against it anyway).
		const inlineOpacity = (node as SVGGElement).style.opacity;
		const opacityNum = inlineOpacity ? parseFloat(inlineOpacity) : 1;
		const exportOpacity = opacityNum > 0 ? opacityNum : 1;
		node.removeAttribute('opacity');
		(node as SVGGElement).style.opacity = String(exportOpacity);

		const transform = node.getAttribute('transform');
		if (transform) {
			const match = transform.match(/translate\(([-\d.]+),([-\d.]+)\)/);
			if (match) {
				node.setAttribute(
					'transform',
					`translate(${match[1]},${match[2]})`
				);
			}
		}
		node.classList.remove('is-lasso-preview');

		// Bake selection-ring visibility as SVG attributes so it renders
		// correctly in the exported file without the app's stylesheet.
		const isSelected = node.classList.contains('is-selected');
		const ring = node.querySelector('.selection-ring');
		if (ring) {
			ring.setAttribute('fill', 'none');
			if (isSelected) {
				ring.setAttribute('stroke', '#9b2e23');
				ring.setAttribute('stroke-width', '2.5');
				ring.setAttribute('visibility', 'visible');
			} else {
				ring.setAttribute('visibility', 'hidden');
			}
		}
	});

	clone.querySelectorAll('path').forEach((path) => {
		// Preserve edge dimming opacity (set inline by D3 during selection);
		// only reset paths stuck at 0 from entrance animation.
		const inlineOp = (path as SVGPathElement).style.opacity;
		const opNum = inlineOp ? parseFloat(inlineOp) : 1;
		(path as SVGPathElement).style.opacity = String(opNum > 0 ? opNum : 1);

		// Arc paths (loopback arcs) carry intentional stroke-dasharray '7,6'.
		// Only wipe stroke-dasharray on normal edge paths (where the animation
		// sets it temporarily and removes it on completion anyway).
		const isArc =
			path.classList.contains('arc-path') ||
			path.classList.contains('arc-trunk');
		if (!isArc) {
			path.removeAttribute('stroke-dasharray');
		}
		path.removeAttribute('stroke-dashoffset');
	});

	clone.querySelectorAll('text, tspan').forEach((el) => {
		const fontSize = el.getAttribute('font-size');
		if (fontSize?.endsWith('px')) {
			el.setAttribute('font-size', fontSize.slice(0, -2));
		}
		if (el.tagName === 'text' && !el.getAttribute('fill')) {
			el.setAttribute('fill', '#1A1A1A');
		}
	});

	return clone;
}

export function svgToDataUrl(svg: SVGSVGElement): string {
	const prepared = prepareExportSvg(svg);
	const svgStr = new XMLSerializer().serializeToString(prepared);
	return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgStr)}`;
}
