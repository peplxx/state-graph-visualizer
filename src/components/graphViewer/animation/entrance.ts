import * as d3 from 'd3';
import type { GraphEdge } from '../../../types/graph';
import type { LoopBundle, NodePos } from '../types';
import {
	ENTRANCE_DURATION_MS,
	ENTRANCE_EDGE_JITTER_MS,
	ENTRANCE_EDGE_LAG_MS,
	ENTRANCE_LAYER_JITTER_MS,
	ENTRANCE_LAYER_STEP_MS
} from '../constants';
import { edgeId } from '../geometry/edges';

export function prefersReducedMotion(): boolean {
	return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export function buildNodeEntranceDelays(
	depths: Map<string, number>
): Map<string, number> {
	const byLayer = new Map<number, string[]>();

	for (const [id, depth] of depths) {
		const layer = byLayer.get(depth);
		if (layer) layer.push(id);
		else byLayer.set(depth, [id]);
	}

	const delays = new Map<string, number>();
	for (const [depth, ids] of byLayer) {
		for (const id of ids) {
			delays.set(
				id,
				depth * ENTRANCE_LAYER_STEP_MS +
					Math.random() * ENTRANCE_LAYER_JITTER_MS
			);
		}
	}

	return delays;
}

export function buildEdgeEntranceDelays(
	edges: Iterable<GraphEdge>,
	nodeDelays: Map<string, number>
): Map<string, number> {
	const delays = new Map<string, number>();
	for (const edge of edges) {
		const id = edgeId(edge);
		const base = nodeDelays.get(edge.target) ?? 0;
		delays.set(
			id,
			base +
				ENTRANCE_EDGE_LAG_MS +
				Math.random() * ENTRANCE_EDGE_JITTER_MS
		);
	}
	return delays;
}

export function buildLoopEdgeEntranceDelays(
	edges: Iterable<GraphEdge>,
	nodeDelays: Map<string, number>
): Map<string, number> {
	const delays = new Map<string, number>();
	for (const edge of edges) {
		const id = edgeId(edge);
		const nodeShownAt =
			(nodeDelays.get(edge.source) ?? 0) + ENTRANCE_DURATION_MS;
		delays.set(
			id,
			nodeShownAt +
				ENTRANCE_EDGE_LAG_MS +
				Math.random() * ENTRANCE_EDGE_JITTER_MS
		);
	}
	return delays;
}

export function buildBundleTrunkEntranceDelays(
	bundles: LoopBundle[],
	nodeDelays: Map<string, number>
): Map<string, number> {
	const delays = new Map<string, number>();
	for (const bundle of bundles) {
		let latestBranchEnd = 0;
		for (const edge of bundle.edges) {
			const branchStart =
				(nodeDelays.get(edge.source) ?? 0) +
				ENTRANCE_DURATION_MS +
				ENTRANCE_EDGE_LAG_MS;
			latestBranchEnd = Math.max(
				latestBranchEnd,
				branchStart + ENTRANCE_DURATION_MS
			);
		}
		delays.set(
			bundle.id,
			latestBranchEnd +
				ENTRANCE_EDGE_LAG_MS +
				Math.random() * ENTRANCE_EDGE_JITTER_MS
		);
	}
	return delays;
}

export function animateNodeEntrance<P extends d3.BaseType>(
	nodeGroups: d3.Selection<SVGGElement, NodePos, P, unknown>,
	delays: Map<string, number>
) {
	if (prefersReducedMotion()) {
		nodeGroups.style('opacity', 1);
		return;
	}

	nodeGroups.interrupt('node-entrance');
	nodeGroups
		.style('opacity', 0)
		.transition('node-entrance')
		.delay((d) => delays.get(d.id) ?? 0)
		.duration(ENTRANCE_DURATION_MS)
		.ease(d3.easeCubicOut)
		.style('opacity', 1);
}

export function animateStrokeDrawEntrance<T, P extends d3.BaseType>(
	paths: d3.Selection<SVGPathElement, T, P, unknown>,
	delays: Map<string, number>,
	idOf: (datum: T) => string,
	finishedDasharray?: string | null
) {
	if (paths.empty()) return;

	if (prefersReducedMotion()) {
		paths.attr('opacity', 1);
		if (finishedDasharray !== undefined) {
			paths
				.attr('stroke-dasharray', finishedDasharray)
				.attr('stroke-dashoffset', null);
		}
		return;
	}

	paths.interrupt('edge-entrance');
	paths.each(function () {
		const length = (this as SVGPathElement).getTotalLength();
		const path = d3.select(this);
		const markerEnd = path.attr('marker-end');
		if (markerEnd) {
			path.attr('data-marker-end', markerEnd).attr('marker-end', null);
		}
		path.attr('opacity', 1)
			.attr('stroke-dasharray', `${length} ${length}`)
			.attr('stroke-dashoffset', length);
	});

	paths
		.transition('edge-entrance')
		.delay((d) => delays.get(idOf(d)) ?? 0)
		.duration(ENTRANCE_DURATION_MS)
		.ease(d3.easeQuadOut)
		.attr('stroke-dashoffset', 0)
		.on('end', function () {
			const path = d3.select(this);
			const markerEnd = path.attr('data-marker-end');
			path.attr('stroke-dasharray', finishedDasharray ?? null).attr(
				'stroke-dashoffset',
				null
			);
			if (markerEnd) {
				path.attr('marker-end', markerEnd).attr(
					'data-marker-end',
					null
				);
			}
		});
}
