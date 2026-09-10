import {
	useEffect,
	useRef,
	useState,
	forwardRef,
	useImperativeHandle,
	useCallback
} from 'react';
import * as d3 from 'd3';
import { buildNodeLabel, estimateNodeSize } from '../../core/labelBuilder';
import type {
	GraphFile,
	GraphEdge,
	SelectedNodeData,
	SelectionState
} from '../../types/graph';
import type { LayoutName } from '../../core/layoutConfig';
import { SELECTION_STROKE, ENTRANCE_DURATION_MS } from './constants';
import type {
	NodePos,
	LoopBundle,
	Point,
	GraphViewerProps,
	GraphViewerHandle
} from './types';
import { computeBFSDepths } from './layout/bfs';
import { computeRadialPositions } from './layout/radial';
import { computeTreePositions } from './layout/tree';
import {
	animateNodeEntrance,
	animateStrokeDrawEntrance,
	buildBundleTrunkEntranceDelays,
	buildEdgeEntranceDelays,
	buildLoopEdgeEntranceDelays,
	buildNodeEntranceDelays
} from './animation/entrance';
import { svgToDataUrl } from './render/exportSvg';
import { findRootPath } from './interaction/pathHighlight';
import { nodeCircleRadius } from './geometry/nodes';
import {
	buildLoopBundles,
	edgeId,
	loopbackColor,
	routeBundleBranch,
	routeBundleTrunk,
	routeLoopEdge,
	routeNormalEdge
} from './geometry/edges';
import { computeHull, getLabelTransform, hullToPath } from './geometry/hull';
import {
	computeGroupConnectivity,
	isAdditiveSelect
} from './interaction/selection';
import { computeLassoHits, isLassoModifier } from './interaction/lasso';
import {
	buildAreaHatchOverlay,
	darkenColor,
	sanitizePatternId,
	upsertHatchPattern
} from './render/hatch';

export type {
	NodeColorOverride,
	AreaOverride,
	GraphViewerHandle,
	GraphViewerProps
} from './types';

const GraphViewer = forwardRef<GraphViewerHandle, GraphViewerProps>(
	(
		{
			initialView,
			initialSelectedIds = [],
			initialSelectedAreaId,
			onViewChange,
			graphData,
			layout,
			showLoopbacks,
			showNormalEdges,
			enableAnimation,
			showDeadlineBadges = true,
			onSelectionChange,
			onStatsChange,
			colorOverrides,
			areaOverrides,
			onAreaSelect,
			showAreas = true,
			hiddenAreaIds
		},
		ref
	) => {
		const initialMountViewRef = useRef(initialView);
		const restoreViewRef = useRef(initialView);
		const onViewChangeRef = useRef(onViewChange);
		onViewChangeRef.current = onViewChange;
		const svgRef = useRef<SVGSVGElement>(null);
		const wrapperRef = useRef<HTMLDivElement>(null);
		const gRef = useRef<SVGGElement | null>(null);
		const defsRef = useRef<SVGDefsElement | null>(null);
		const zoomRef = useRef<d3.ZoomBehavior<SVGSVGElement, unknown> | null>(
			null
		);
		const deadlineBadgesVisibleRef = useRef(showDeadlineBadges);
		deadlineBadgesVisibleRef.current = showDeadlineBadges;
		useEffect(() => {
			if (gRef.current)
				d3.select(gRef.current)
					.selectAll('.deadline-badge')
					.style('display', showDeadlineBadges ? null : 'none');
		}, [showDeadlineBadges]);
		const selectedIdsRef = useRef<Set<string>>(new Set(initialSelectedIds));
		const nodePosRef = useRef<Map<string, NodePos>>(new Map());
		const indegreeMapRef = useRef<Map<string, number>>(new Map());
		const outdegreeMapRef = useRef<Map<string, number>>(new Map());
		const routeCacheRef = useRef<{
			graph: GraphFile;
			layout: LayoutName;
			bundles: LoopBundle[];
			paths: Map<GraphEdge, string>;
		} | null>(null);

		const graphDataRef = useRef(graphData);
		graphDataRef.current = graphData;
		const onSelectionChangeRef = useRef(onSelectionChange);
		onSelectionChangeRef.current = onSelectionChange;
		const spaceKeyRef = useRef(false);
		const shiftKeyRef = useRef(false);
		const suppressClickRef = useRef(false);
		const lassoActiveRef = useRef(false);
		const entranceGraphRef = useRef<GraphFile | null>(null);
		const entranceLayoutRef = useRef<LayoutName | null>(null);
		const onStatsChangeRef = useRef(onStatsChange);
		onStatsChangeRef.current = onStatsChange;
		// Always-current ref to colorOverrides for use inside D3 callbacks
		const colorOverridesRef = useRef(colorOverrides);
		colorOverridesRef.current = colorOverrides;
		const areaOverridesRef = useRef(areaOverrides);
		areaOverridesRef.current = areaOverrides;
		const hiddenAreaIdsRef = useRef(hiddenAreaIds);
		hiddenAreaIdsRef.current = hiddenAreaIds;
		const onAreaSelectRef = useRef(onAreaSelect);
		onAreaSelectRef.current = onAreaSelect;
		// Track which area is currently highlighted as selected
		const selectedAreaIdRef = useRef<string | null>(
			initialSelectedAreaId ?? null
		);

		const [activeLayout, setActiveLayout] = useState<LayoutName>(layout);
		useEffect(() => {
			setActiveLayout(layout);
		}, [layout]);

		const [tooltip, setTooltip] = useState<{
			x: number;
			y: number;
			lines: string[];
		} | null>(null);
		const [lassoPoints, setLassoPoints] = useState<Point[]>([]);
		const [panHeld, setPanHeld] = useState(false);
		const [panDragging, setPanDragging] = useState(false);
		const [shiftHeld, setShiftHeld] = useState(false);

		const buildSelectionState = useCallback(
			(ids: Set<string>): SelectionState | null => {
				if (ids.size === 0) return null;
				const data = graphDataRef.current;
				if (!data) return null;

				const nodes = [...ids]
					.map((id): SelectedNodeData | null => {
						const d = nodePosRef.current.get(id);
						if (!d) return null;
						return {
							id: d.id,
							label: d.label,
							tasks: d.tasks,
							isInitial: d.isInitial,
							borderColor: d.borderColor,
							fillColor: d.fillColor,
							hatch: d.hatch,
							indegree: indegreeMapRef.current.get(id) ?? 0,
							outdegree: outdegreeMapRef.current.get(id) ?? 0
						} satisfies SelectedNodeData;
					})
					.filter((node): node is SelectedNodeData => node !== null)
					.sort((a, b) => a.id.localeCompare(b.id));

				if (nodes.length === 0) return null;
				if (nodes.length === 1) return { nodes };

				const group = computeGroupConnectivity(ids, data.edges);
				group.totalIndegree = nodes.reduce(
					(sum, node) => sum + node.indegree,
					0
				);
				group.totalOutdegree = nodes.reduce(
					(sum, node) => sum + node.outdegree,
					0
				);
				return { nodes, group };
			},
			[]
		);

		const emitSelection = useCallback(
			(ids: Set<string>) => {
				onSelectionChangeRef.current?.(buildSelectionState(ids));
			},
			[buildSelectionState]
		);

		// ── Highlight: click selection ─────────────────────────────────────
		const clearSelection = useCallback(() => {
			if (!gRef.current) return;
			const g = d3.select(gRef.current);
			g.selectAll<SVGGElement, NodePos>('.node-group')
				.style('opacity', 1)
				.classed('is-selected', false)
				.classed('is-lasso-preview', false);
			g.selectAll<SVGPathElement, GraphEdge>('.edge-path')
				.style('opacity', 1)
				.attr('stroke', '#2C2C2C')
				.attr('stroke-width', 1.4);
			g.selectAll<SVGPathElement, GraphEdge>('.arc-path').style(
				'opacity',
				1
			);
			g.selectAll<SVGPathElement, LoopBundle>('.arc-trunk').style(
				'opacity',
				1
			);
		}, []);

		// ── Area selection helpers ─────────────────────────────────────────
		const clearAreaSelection = useCallback(() => {
			if (!gRef.current) return;
			d3.select(gRef.current)
				.selectAll<SVGRectElement, unknown>('.area-shape')
				.attr('stroke-width', 1.5)
				.attr('stroke', function () {
					return this.getAttribute('data-base-stroke') ?? '#374151';
				});
			selectedAreaIdRef.current = null;
		}, []);

		const applyAreaSelection = useCallback(
			(areaId: string) => {
				if (!gRef.current) return;
				clearAreaSelection();
				d3.select(gRef.current)
					.selectAll<SVGRectElement, unknown>('.area-shape')
					.filter(function () {
						const group = (this as Element).closest('.area-group');
						return group?.getAttribute('data-area-id') === areaId;
					})
					.attr('stroke', '#9b2e23')
					.attr('stroke-width', 2.5);
				selectedAreaIdRef.current = areaId;
			},
			[clearAreaSelection]
		);

		const applySelection = useCallback(
			(ids: Set<string>, data: GraphFile) => {
				if (!gRef.current || ids.size === 0) return;
				const g = d3.select(gRef.current);
				const connected = new Set(ids);
				const connectedEdgeIds = new Set<string>();
				for (const e of data.edges) {
					if (ids.has(e.source) || ids.has(e.target)) {
						connected.add(e.source);
						connected.add(e.target);
						connectedEdgeIds.add(edgeId(e));
					}
				}
				// Toggle selection class — CSS ring handles the visual indicator
				g.selectAll<SVGGElement, NodePos>('.node-group')
					.style('opacity', (d) => (connected.has(d.id) ? 1 : 0.1))
					.classed('is-selected', (d) => ids.has(d.id))
					.classed('is-lasso-preview', false);
				g.selectAll<SVGPathElement, GraphEdge>('.edge-path').style(
					'opacity',
					(d) => (connectedEdgeIds.has(edgeId(d)) ? 1 : 0.05)
				);
				g.selectAll<SVGPathElement, GraphEdge>('.arc-path').style(
					'opacity',
					(d) => (connectedEdgeIds.has(edgeId(d)) ? 1 : 0.05)
				);
				g.selectAll<SVGPathElement, LoopBundle>('.arc-trunk').style(
					'opacity',
					(bundle) =>
						bundle.edges.some((edge) =>
							connectedEdgeIds.has(edgeId(edge))
						)
							? 1
							: 0.05
				);
			},
			[]
		);

		const applySelectionRef = useRef(applySelection);
		applySelectionRef.current = applySelection;
		const clearSelectionRef = useRef(clearSelection);
		clearSelectionRef.current = clearSelection;
		const clearAreaSelectionRef = useRef(clearAreaSelection);
		clearAreaSelectionRef.current = clearAreaSelection;
		const applyAreaSelectionRef = useRef(applyAreaSelection);
		applyAreaSelectionRef.current = applyAreaSelection;
		const emitSelectionRef = useRef(emitSelection);
		emitSelectionRef.current = emitSelection;

		const applyLassoPreview = useCallback(
			(hitIds: Set<string>, additive: boolean) => {
				if (!gRef.current) return;
				const g = d3.select(gRef.current);

				// CSS ring handles the visual indicator via is-selected /
				// is-lasso-preview classes — no stroke manipulation needed
				g.selectAll<SVGGElement, NodePos>('.node-group').each(
					function (d) {
						const group = d3.select(this);
						const inPreview = hitIds.has(d.id);
						const isSelected =
							additive && selectedIdsRef.current.has(d.id);
						group
							.style('opacity', 1)
							.classed('is-selected', isSelected)
							.classed(
								'is-lasso-preview',
								inPreview && !isSelected
							);
					}
				);
				g.selectAll<SVGPathElement, GraphEdge>('.edge-path').style(
					'opacity',
					1
				);
				g.selectAll<SVGPathElement, GraphEdge>('.arc-path').style(
					'opacity',
					1
				);
				g.selectAll<SVGPathElement, LoopBundle>('.arc-trunk').style(
					'opacity',
					1
				);
			},
			[]
		);

		const clearLassoPreview = useCallback(() => {
			if (!gRef.current) return;
			const g = d3.select(gRef.current);
			g.selectAll<SVGGElement, NodePos>('.node-group').classed(
				'is-lasso-preview',
				false
			);

			const data = graphDataRef.current;
			if (selectedIdsRef.current.size > 0 && data) {
				applySelectionRef.current(selectedIdsRef.current, data);
				return;
			}

			g.selectAll<SVGGElement, NodePos>('.node-group').style(
				'opacity',
				1
			);
			g.selectAll<SVGPathElement, GraphEdge>('.edge-path').style(
				'opacity',
				1
			);
			g.selectAll<SVGPathElement, GraphEdge>('.arc-path').style(
				'opacity',
				1
			);
			g.selectAll<SVGPathElement, LoopBundle>('.arc-trunk').style(
				'opacity',
				1
			);
		}, []);

		const applyLassoPreviewRef = useRef(applyLassoPreview);
		applyLassoPreviewRef.current = applyLassoPreview;
		const clearLassoPreviewRef = useRef(clearLassoPreview);
		clearLassoPreviewRef.current = clearLassoPreview;

		// ── Highlight: hover path from root ───────────────────────────────
		const applyHoverPath = useCallback((id: string, data: GraphFile) => {
			if (!gRef.current) return;
			const g = d3.select(gRef.current);
			const { nodes: pathNodes, edgeIds: pathEdges } = findRootPath(
				id,
				data
			);

			g.selectAll<SVGGElement, NodePos>('.node-group').style(
				'opacity',
				(d) => (pathNodes.has(d.id) ? 1 : 0.35)
			);
			g.selectAll<SVGPathElement, GraphEdge>('.edge-path')
				.style('opacity', (d) => {
					const eid = d.id ?? `${d.source}--${d.target}`;
					return pathEdges.has(eid) ? 1 : 0.08;
				})
				.attr('stroke', (d) => {
					const eid = d.id ?? `${d.source}--${d.target}`;
					return pathEdges.has(eid) ? SELECTION_STROKE : '#2C2C2C';
				})
				.attr('stroke-width', (d) => {
					const eid = d.id ?? `${d.source}--${d.target}`;
					return pathEdges.has(eid) ? 2.2 : 1.4;
				})
				.attr('marker-end', (d) => {
					const eid = d.id ?? `${d.source}--${d.target}`;
					return pathEdges.has(eid)
						? 'url(#arrow-normal-blue)'
						: 'url(#arrow-normal)';
				});
			g.selectAll<SVGPathElement, GraphEdge>('.arc-path').style(
				'opacity',
				0.08
			);
			g.selectAll<SVGPathElement, LoopBundle>('.arc-trunk').style(
				'opacity',
				0.08
			);
			g.select('.areas-layer').style('opacity', 0.2);
			g.select('.areas-hatch-layer').style('opacity', 0.2);
		}, []);

		const clearHoverPath = useCallback(() => {
			if (!gRef.current) return;
			const g = d3.select(gRef.current);
			g.selectAll('.node-group').style('opacity', 1);
			g.selectAll<SVGPathElement, GraphEdge>('.edge-path')
				.style('opacity', 1)
				.attr('stroke', '#2C2C2C')
				.attr('stroke-width', 1.4)
				.attr('marker-end', 'url(#arrow-normal)');
			g.selectAll('.arc-path').style('opacity', 1);
			g.selectAll('.arc-trunk').style('opacity', 1);
			g.select('.areas-layer').style('opacity', null);
			g.select('.areas-hatch-layer').style('opacity', null);
		}, []);

		// ── Fit view ──────────────────────────────────────────────────────
		const fitView = useCallback((animated = true) => {
			const svg = svgRef.current;
			const g = gRef.current;
			const zoom = zoomRef.current;
			if (!svg || !g || !zoom) return;

			const bounds = g.getBBox();
			if (bounds.width < 1 || bounds.height < 1) return;

			const w = svg.clientWidth || svg.getBoundingClientRect().width;
			const h = svg.clientHeight || svg.getBoundingClientRect().height;
			if (w < 1 || h < 1) return;

			const scale = Math.min(
				(0.88 * w) / bounds.width,
				(0.88 * h) / bounds.height,
				3
			);
			const tx = w / 2 - scale * (bounds.x + bounds.width / 2);
			const ty = h / 2 - scale * (bounds.y + bounds.height / 2);

			const sel = d3.select(svg);
			const transform = d3.zoomIdentity.translate(tx, ty).scale(scale);
			if (animated) {
				sel.transition().duration(450).call(zoom.transform, transform);
			} else {
				sel.call(zoom.transform, transform);
			}
		}, []);

		// ── Init SVG + zoom (once) ────────────────────────────────────────
		useEffect(() => {
			restoreViewRef.current = initialMountViewRef.current;
			if (!svgRef.current) return;
			const svg = d3.select(svgRef.current);
			svg.selectAll('*').remove();

			const defs = svg.append('defs');
			defsRef.current = defs.node();
			const addMarker = (id: string, color: string) => {
				defs.append('marker')
					.attr('id', id)
					.attr('viewBox', '0 0 10 10')
					.attr('refX', 9)
					.attr('refY', 5)
					.attr('markerWidth', 6)
					.attr('markerHeight', 6)
					.attr('orient', 'auto')
					.append('path')
					.attr('d', 'M 0 1 L 10 5 L 0 9 Z')
					.attr('fill', color);
			};
			addMarker('arrow-normal', '#2C2C2C');
			addMarker('arrow-normal-blue', SELECTION_STROKE);
			addMarker('arrow-loop', 'context-stroke');

			const g = svg.append('g').attr('class', 'zoom-group');
			gRef.current = g.node();

			g.append('g').attr('class', 'areas-layer');
			g.append('g').attr('class', 'rings-layer');
			g.append('g').attr('class', 'loopback-layer');
			g.append('g').attr('class', 'edges-layer');
			g.append('g').attr('class', 'nodes-layer');
			g.append('g').attr('class', 'areas-hatch-layer'); // hatch overlay — above nodes

			const zoom = d3
				.zoom<SVGSVGElement, unknown>()
				.scaleExtent([0.02, 10])
				.filter((event) => {
					if (event.type === 'wheel' || event.button === 1)
						return true;
					if (spaceKeyRef.current) {
						return (
							!event.ctrlKey &&
							!event.metaKey &&
							event.button !== 2
						);
					}
					return false;
				})
				.on('start', () => {
					if (spaceKeyRef.current) setPanDragging(true);
				})
				.on('end', () => setPanDragging(false))
				.on('zoom', (event) => {
					g.attr('transform', event.transform);
					const { x, y, k } = event.transform;
					onViewChangeRef.current?.({ x, y, k });
				});

			svg.call(zoom);
			zoomRef.current = zoom;

			return () => {
				svg.interrupt().on('.zoom', null);
				svg.selectAll('*')
					.interrupt()
					.interrupt('node-entrance')
					.interrupt('edge-entrance')
					.interrupt('area-entrance')
					.remove();
				gRef.current = null;
				defsRef.current = null;
				zoomRef.current = null;
			};
		}, []); // eslint-disable-line react-hooks/exhaustive-deps

		useEffect(() => {
			const zoom = zoomRef.current;
			const svg = svgRef.current;
			if (!zoom || !svg) return;
			zoom.filter((event) => {
				if (event.type === 'wheel' || event.button === 1) return true;
				if (spaceKeyRef.current) {
					return (
						!event.ctrlKey && !event.metaKey && event.button !== 2
					);
				}
				return false;
			});
			d3.select(svg).call(zoom);
		}, [panHeld]);

		useEffect(() => {
			const isTypingTarget = (target: EventTarget | null) =>
				target instanceof HTMLInputElement ||
				target instanceof HTMLTextAreaElement ||
				target instanceof HTMLSelectElement;

			const onKeyDown = (event: KeyboardEvent) => {
				if (isTypingTarget(event.target)) return;

				if (event.key === 'Shift' && !event.repeat) {
					shiftKeyRef.current = true;
					setShiftHeld(true);
				}

				if (event.code === 'Space' && !event.repeat) {
					event.preventDefault();
					spaceKeyRef.current = true;
					setPanHeld(true);
				}
			};

			const onKeyUp = (event: KeyboardEvent) => {
				if (event.key === 'Shift') {
					shiftKeyRef.current = false;
					setShiftHeld(false);
				}

				if (event.code === 'Space') {
					spaceKeyRef.current = false;
					setPanHeld(false);
					setPanDragging(false);
				}
			};

			const onBlur = () => {
				shiftKeyRef.current = false;
				setShiftHeld(false);
				spaceKeyRef.current = false;
				setPanHeld(false);
				setPanDragging(false);
			};

			window.addEventListener('keydown', onKeyDown);
			window.addEventListener('keyup', onKeyUp);
			window.addEventListener('blur', onBlur);
			return () => {
				window.removeEventListener('keydown', onKeyDown);
				window.removeEventListener('keyup', onKeyUp);
				window.removeEventListener('blur', onBlur);
			};
		}, []);

		useEffect(() => {
			const svg = svgRef.current;
			const wrapper = wrapperRef.current;
			if (!svg || !wrapper) return;

			const DRAG_THRESHOLD = 4;
			let pendingPointer = false;
			let drawing = false;
			let pointerId = -1;
			let startClient = { x: 0, y: 0 };
			let wrapperPoints: Point[] = [];
			let additiveAtStart = false;

			const wrapperPoint = (clientX: number, clientY: number): Point => {
				const rect = wrapper.getBoundingClientRect();
				return {
					x: clientX - rect.left,
					y: clientY - rect.top
				};
			};

			const clearGraphSelection = () => {
				selectedIdsRef.current = new Set();
				clearSelectionRef.current();
				onSelectionChangeRef.current?.(null);
				clearAreaSelectionRef.current?.();
				onAreaSelectRef.current?.(null);
			};

			const cleanupWindowListeners = () => {
				window.removeEventListener('pointermove', onWindowPointerMove);
				window.removeEventListener('pointerup', onWindowPointerUp);
				window.removeEventListener('pointercancel', onWindowPointerUp);
			};

			const finishLasso = () => {
				setLassoPoints([]);
				clearLassoPreviewRef.current();

				if (wrapperPoints.length < 2) return;

				const hitIds = computeLassoHits(
					wrapperPoints,
					wrapper,
					svg,
					nodePosRef.current,
					gRef.current
				);

				const next = additiveAtStart
					? new Set([...selectedIdsRef.current, ...hitIds])
					: hitIds;
				selectedIdsRef.current = next;

				const data = graphDataRef.current;
				if (!data) return;
				if (next.size === 0) {
					if (!additiveAtStart) clearGraphSelection();
					return;
				}

				applySelectionRef.current(next, data);
				emitSelectionRef.current(next);
			};

			const updateLassoPreview = () => {
				if (wrapperPoints.length < 2) return;
				const hitIds = computeLassoHits(
					wrapperPoints,
					wrapper,
					svg,
					nodePosRef.current,
					gRef.current
				);
				applyLassoPreviewRef.current(hitIds, additiveAtStart);
			};

			const onWindowPointerMove = (event: PointerEvent) => {
				if (event.pointerId !== pointerId) return;

				const point = wrapperPoint(event.clientX, event.clientY);

				if (pendingPointer && !drawing) {
					const moved = Math.hypot(
						event.clientX - startClient.x,
						event.clientY - startClient.y
					);
					if (moved < DRAG_THRESHOLD) return;

					event.preventDefault();
					pendingPointer = false;
					drawing = true;
					wrapperPoints.push(point);
					setLassoPoints([...wrapperPoints]);
					updateLassoPreview();
					return;
				}

				if (!drawing) return;

				event.preventDefault();
				const last = wrapperPoints[wrapperPoints.length - 1];
				if (Math.hypot(point.x - last.x, point.y - last.y) < 2) return;
				wrapperPoints.push(point);
				setLassoPoints([...wrapperPoints]);
				updateLassoPreview();
			};

			const onWindowPointerUp = (event: PointerEvent) => {
				if (event.pointerId !== pointerId) return;

				cleanupWindowListeners();
				lassoActiveRef.current = false;

				if (wrapper.hasPointerCapture(event.pointerId)) {
					wrapper.releasePointerCapture(event.pointerId);
				}

				if (drawing) {
					drawing = false;
					finishLasso();
					suppressClickRef.current = true;
				} else {
					clearLassoPreviewRef.current();
					setLassoPoints([]);
				}

				pendingPointer = false;
				pointerId = -1;
			};

			const onPointerDown = (event: PointerEvent) => {
				if (spaceKeyRef.current || event.button !== 0) return;
				if (!isLassoModifier(shiftKeyRef, event)) return;

				event.preventDefault();
				event.stopPropagation();

				lassoActiveRef.current = true;
				setTooltip(null);

				pendingPointer = true;
				drawing = false;
				pointerId = event.pointerId;
				additiveAtStart = isAdditiveSelect(event);
				startClient = { x: event.clientX, y: event.clientY };
				wrapperPoints = [wrapperPoint(event.clientX, event.clientY)];
				wrapper.setPointerCapture(event.pointerId);

				window.addEventListener('pointermove', onWindowPointerMove, {
					passive: false
				});
				window.addEventListener('pointerup', onWindowPointerUp);
				window.addEventListener('pointercancel', onWindowPointerUp);
			};

			const onBackgroundClick = (event: MouseEvent) => {
				if (suppressClickRef.current) {
					suppressClickRef.current = false;
					event.stopPropagation();
					return;
				}
				if ((event.target as Element).closest('.node-group')) return;
				if (isAdditiveSelect(event)) return;
				clearGraphSelection();
			};

			const onClickCapture = (event: MouseEvent) => {
				if (!suppressClickRef.current) return;
				suppressClickRef.current = false;
				event.stopPropagation();
				event.preventDefault();
			};

			const onSelectStart = (event: Event) => {
				if (isLassoModifier(shiftKeyRef, event as PointerEvent)) {
					event.preventDefault();
				}
			};

			const onKeyDown = (event: KeyboardEvent) => {
				if (event.code === 'Escape') {
					if (
						event.target instanceof HTMLInputElement ||
						event.target instanceof HTMLTextAreaElement
					) {
						return;
					}
					clearLassoPreviewRef.current();
					setLassoPoints([]);
					lassoActiveRef.current = false;
					clearGraphSelection();
					return;
				}
			};

			wrapper.addEventListener('pointerdown', onPointerDown, true);
			svg.addEventListener('click', onBackgroundClick);
			wrapper.addEventListener('click', onClickCapture, true);
			wrapper.addEventListener('selectstart', onSelectStart);
			window.addEventListener('keydown', onKeyDown);

			return () => {
				cleanupWindowListeners();
				wrapper.removeEventListener('pointerdown', onPointerDown, true);
				svg.removeEventListener('click', onBackgroundClick);
				wrapper.removeEventListener('click', onClickCapture, true);
				wrapper.removeEventListener('selectstart', onSelectStart);
				window.removeEventListener('keydown', onKeyDown);
			};
		}, []);

		const drawnAreasRef = useRef<{
			areas: GraphFile['areas'];
			overrides: typeof areaOverrides;
		} | null>(null);
		const drawAreas = useCallback((shouldAnimateEntrance = false) => {
			const graphData = graphDataRef.current;
			if (!graphData || !gRef.current) return;
			const g = d3.select(gRef.current);
			const nodeMap = nodePosRef.current;
			// ── Areas ─────────────────────────────────────────────────────
			const areasLayer = g.select('.areas-layer');
			const areasHatchLayer = g.select('.areas-hatch-layer');
			areasLayer.selectAll('*').remove();
			areasHatchLayer.selectAll('*').remove();

			for (const area of graphData.areas ?? []) {
				const ov = areaOverridesRef.current?.get(area.id);
				const effectiveNodeIds = ov?.nodes ?? area.nodeIds;
				const memberNodes = effectiveNodeIds
					.map((id) => nodeMap.get(id))
					.filter((n): n is NodePos => n !== undefined);
				if (memberNodes.length === 0) continue;

				const fill = ov?.fill ?? area.fillColor ?? '#F5F5F5';
				const border = ov?.border ?? area.borderColor ?? '#374151';
				const rawHatch =
					ov?.hatch !== undefined ? ov.hatch : area.hatch;
				const effectiveHatch =
					rawHatch === 'none' ? undefined : rawHatch;
				const labelPos =
					ov?.labelPosition ?? area.labelPosition ?? 'top-left';

				const areaGroup = areasLayer
					.append('g')
					.attr('class', 'area-group')
					.attr('data-area-id', area.id)
					.style('cursor', 'pointer');

				// Per-element animation initial state
				if (shouldAnimateEntrance) areaGroup.style('opacity', 0);
				// Preserve per-area hidden state across layout switches
				if (hiddenAreaIdsRef.current?.has(area.id))
					areaGroup.style('display', 'none');

				// Compute hull once for both shape and label
				const hull = computeHull(effectiveNodeIds, nodeMap);
				const hullPath = hull ? hullToPath(hull) : null;

				// Shape — always solid fill; hatch goes to overlay layer above nodes
				const isSelectedArea = selectedAreaIdRef.current === area.id;
				areaGroup
					.append('path')
					.attr('class', 'area-shape')
					.attr('data-base-stroke', border)
					.attr('d', hullPath ?? '')
					.attr('fill', fill)
					.attr('stroke', isSelectedArea ? '#9b2e23' : border)
					.attr('stroke-width', isSelectedArea ? 2.5 : 1.5)
					.attr('stroke-dasharray', null);

				// Hatch overlay — rendered above nodes in areas-hatch-layer
				if (effectiveHatch && defsRef.current && hull && hullPath) {
					buildAreaHatchOverlay(
						areasHatchLayer,
						defsRef.current,
						area.id,
						hull,
						hullPath,
						effectiveHatch,
						darkenColor(border, 0.35)
					);
					const hatchEl = areasHatchLayer.select(
						`.area-hatch[data-area-id="${area.id}"]`
					);
					if (shouldAnimateEntrance) hatchEl.style('opacity', 0);
					if (hiddenAreaIdsRef.current?.has(area.id))
						hatchEl.style('display', 'none');
				}

				// Label — sits on the hull edge, rotated to follow it
				if (area.label && hull) {
					const lt = getLabelTransform(hull, labelPos);
					areaGroup
						.append('text')
						.attr('class', 'area-label')
						.attr(
							'transform',
							`translate(${lt.x},${lt.y}) rotate(${lt.rotate})`
						)
						.attr('text-anchor', lt.anchor)
						.attr('dominant-baseline', 'central')
						.attr('font-size', '12px')
						.attr('font-weight', '600')
						.attr('font-style', 'italic')
						.attr('fill', border)
						.attr('pointer-events', 'none')
						.text(area.label);
				}

				// Click handler
				areaGroup.on('click', function (event) {
					event.stopPropagation();
					// Clear node selection
					selectedIdsRef.current = new Set();
					clearSelectionRef.current();
					onSelectionChangeRef.current?.(null);
					// Apply area selection
					applyAreaSelectionRef.current(area.id);
					onAreaSelectRef.current?.(area);
				});
			}

			drawnAreasRef.current = {
				areas: graphData.areas,
				overrides: areaOverridesRef.current
			};
		}, []);

		// ── Draw graph ────────────────────────────────────────────────────
		useEffect(() => {
			const graphData = graphDataRef.current;
			if (!graphData || !gRef.current) return;

			const g = d3.select(gRef.current);
			setTooltip(null);

			const isRadial = activeLayout === 'radial';

			const shouldAnimateEntrance =
				!restoreViewRef.current &&
				enableAnimation &&
				(entranceGraphRef.current !== graphData ||
					entranceLayoutRef.current !== activeLayout);
			entranceGraphRef.current = graphData;
			entranceLayoutRef.current = activeLayout;
			const entranceDelays = shouldAnimateEntrance
				? buildNodeEntranceDelays(
						computeBFSDepths(graphData.nodes, graphData.edges)
					)
				: null;

			const sampleSize =
				graphData.nodes.length > 0
					? estimateNodeSize(graphData.nodes[0].tasks)
					: { width: 80, height: 36 };

			let positions: Map<string, { x: number; y: number }>;
			let ringRadii: number[] = [];
			let treeLevelYs: number[] = [];

			if (isRadial) {
				const result = computeRadialPositions(
					graphData.nodes,
					graphData.edges
				);
				positions = result.positions;
				ringRadii = result.ringRadii;
			} else {
				const result = computeTreePositions(
					graphData.nodes,
					graphData.edges,
					sampleSize.width
				);
				positions = result.positions;
				treeLevelYs = result.levelYs;
			}

			// ── Node map
			const nodeMap = new Map<string, NodePos>();
			for (const node of graphData.nodes) {
				const { width: wFull, height: hFull } = estimateNodeSize(
					node.tasks
				);
				const width = isRadial ? Math.round(wFull * 0.72) : wFull;
				const height = isRadial ? Math.round(hFull * 0.72) : hFull;
				const pos = positions.get(node.id) ?? { x: 0, y: 0 };
				nodeMap.set(node.id, {
					id: node.id,
					x: pos.x,
					y: pos.y,
					width,
					height,
					radius: nodeCircleRadius(node.tasks),
					shape: 'rect',
					label: node.label ?? buildNodeLabel(node.tasks),
					tasks: node.tasks,
					isInitial: node.isInitial ?? false,
					borderColor: node.borderColor,
					fillColor: node.fillColor,
					hatch: node.hatch
				});
			}
			nodePosRef.current = nodeMap;

			selectedIdsRef.current = new Set(
				[...selectedIdsRef.current].filter((id) => nodeMap.has(id))
			);
			if (selectedIdsRef.current.size === 0) {
				onSelectionChangeRef.current?.(null);
			}

			// ── Degree maps
			const indegreeMap = new Map<string, number>();
			const outdegreeMap = new Map<string, number>();
			for (const n of graphData.nodes) {
				indegreeMap.set(n.id, 0);
				outdegreeMap.set(n.id, 0);
			}
			for (const e of graphData.edges) {
				indegreeMap.set(e.target, (indegreeMap.get(e.target) ?? 0) + 1);
				outdegreeMap.set(
					e.source,
					(outdegreeMap.get(e.source) ?? 0) + 1
				);
			}
			indegreeMapRef.current = indegreeMap;
			outdegreeMapRef.current = outdegreeMap;

			const normalEdges = graphData.edges.filter(
				(e) => e.type === 'normal'
			);
			const loopEdges = graphData.edges.filter((e) => e.type === 'loop');
			const loopIncoming = new Map<string, number>();
			for (const edge of loopEdges) {
				loopIncoming.set(
					edge.target,
					(loopIncoming.get(edge.target) ?? 0) + 1
				);
			}
			const maxLoopIncoming = Math.max(1, ...loopIncoming.values());
			const colorForTarget = (targetId: string) =>
				loopbackColor(loopIncoming.get(targetId) ?? 1, maxLoopIncoming);

			// ── Depth guides (radial rings / tree levels) ─────────────────
			const ringsLayer = g.select('.rings-layer');
			ringsLayer.selectAll('*').remove();

			if (isRadial) {
				ringRadii.forEach((r, i) => {
					ringsLayer
						.append('circle')
						.attr('r', r)
						.attr('fill', 'none')
						.attr('stroke', '#BBBBBB')
						.attr('stroke-width', 0.6)
						.attr('stroke-dasharray', '5,5');

					ringsLayer
						.append('text')
						.attr('x', r + 6)
						.attr('y', 4)
						.attr('font-size', '10px')
						.attr('fill', '#AAAAAA')
						.attr('font-family', 'Inter, sans-serif')
						.attr('pointer-events', 'none')
						.text(`L${i + 1}`);
				});
			} else if (treeLevelYs.length > 0) {
				let minX = Infinity;
				let maxX = -Infinity;
				for (const node of nodeMap.values()) {
					minX = Math.min(minX, node.x - node.width / 2);
					maxX = Math.max(maxX, node.x + node.width / 2);
				}
				const padX = 48;
				minX -= padX;
				maxX += padX;

				treeLevelYs.forEach((y, i) => {
					ringsLayer
						.append('line')
						.attr('x1', minX)
						.attr('y1', y)
						.attr('x2', maxX)
						.attr('y2', y)
						.attr('stroke', '#BBBBBB')
						.attr('stroke-width', 0.6)
						.attr('stroke-dasharray', '5,5');

					const label = `L${i + 1}`;
					for (const [x, anchor] of [
						[minX - 8, 'end'],
						[maxX + 8, 'start']
					] as const) {
						ringsLayer
							.append('text')
							.attr('x', x)
							.attr('y', y + 4)
							.attr('text-anchor', anchor)
							.attr('font-size', '10px')
							.attr('fill', '#AAAAAA')
							.attr('font-family', 'Inter, sans-serif')
							.attr('pointer-events', 'none')
							.text(label);
					}
				});
			}

			drawAreas(shouldAnimateEntrance);
			const areasLayer = g.select('.areas-layer');
			const areasHatchLayer = g.select('.areas-hatch-layer');

			// ── Loopback arcs ──────────────────────────────────────────────
			const loopbackLayer = g.select('.loopback-layer');
			loopbackLayer.style('display', showLoopbacks ? null : 'none');
			loopbackLayer.selectAll('*').remove();

			// Visibility and animation toggles reuse geometry for this layout.
			let routeCache = routeCacheRef.current;
			if (
				!routeCache ||
				routeCache.graph !== graphData ||
				routeCache.layout !== activeLayout
			) {
				const bundles = buildLoopBundles(loopEdges, nodeMap, isRadial);
				const byEdge = new Map(
					bundles.flatMap((bundle) =>
						bundle.edges.map(
							(edge) => [edgeId(edge), bundle] as const
						)
					)
				);
				const paths = new Map<GraphEdge, string>();
				loopEdges.forEach((edge, index) => {
					const source = nodeMap.get(edge.source),
						target = nodeMap.get(edge.target);
					if (!source || !target) return;
					const bundle = byEdge.get(edgeId(edge));
					paths.set(
						edge,
						bundle
							? routeBundleBranch(source, bundle, target)
							: routeLoopEdge(
									source,
									target,
									nodeMap.values(),
									index
								)
					);
				});
				routeCache = {
					graph: graphData,
					layout: activeLayout,
					bundles,
					paths
				};
				routeCacheRef.current = routeCache;
			}
			const loopBundles = routeCache.bundles;
			const bundleByEdge = new Map<string, LoopBundle>();
			for (const bundle of loopBundles) {
				for (const edge of bundle.edges) {
					bundleByEdge.set(edgeId(edge), bundle);
				}
			}

			// One shared arrow-bearing trunk per bundle.
			const arcTrunkPaths = loopbackLayer
				.selectAll<SVGPathElement, LoopBundle>('path.arc-trunk')
				.data(loopBundles, (bundle) => bundle.id)
				.join('path')
				.attr('class', 'arc-trunk')
				.attr('fill', 'none')
				.attr('stroke', (bundle) => colorForTarget(bundle.target))
				.attr('stroke-width', 1.8)
				.attr('stroke-linecap', 'round')
				.attr('stroke-linejoin', 'round')
				.attr('stroke-dasharray', '7,6')
				.attr('marker-end', 'url(#arrow-loop)')
				.attr('d', (bundle) => {
					const target = nodeMap.get(bundle.target);
					if (!target) return '';
					return routeBundleTrunk(bundle, target);
				});

			// Individual branches converge on the shared collector. Only
			// unbundled edges keep their own arrowhead.
			const arcBranchPaths = loopbackLayer
				.selectAll<SVGPathElement, GraphEdge>('path.arc-path')
				.data(loopEdges, edgeId)
				.join('path')
				.attr('class', 'arc-path')
				.attr('fill', 'none')
				.attr('stroke', (edge) => colorForTarget(edge.target))
				.attr('stroke-width', 1.5)
				.attr('stroke-linecap', 'round')
				.attr('stroke-linejoin', 'round')
				.attr('stroke-dasharray', '7,6')
				.attr('marker-end', (edge) =>
					bundleByEdge.has(edgeId(edge)) ? null : 'url(#arrow-loop)'
				)
				.attr('d', (edge) => routeCache.paths.get(edge) ?? '');

			// ── Normal edges ───────────────────────────────────────────────
			const edgesLayer = g.select('.edges-layer');
			edgesLayer.style('display', showNormalEdges ? null : 'none');
			edgesLayer.selectAll('*').remove();

			const normalEdgePaths = edgesLayer
				.selectAll<SVGPathElement, GraphEdge>('path.edge-path')
				.data(normalEdges, (d) => d.id ?? `${d.source}--${d.target}`)
				.join('path')
				.attr('class', 'edge-path')
				.attr('fill', 'none')
				.attr('stroke', '#2C2C2C')
				.attr('stroke-width', 1.4)
				.attr('marker-end', 'url(#arrow-normal)')
				.attr('d', (edge) => {
					const src = nodeMap.get(edge.source);
					const tgt = nodeMap.get(edge.target);
					if (!src || !tgt) return '';
					return routeNormalEdge(src, tgt, isRadial);
				});

			// ── Nodes ─────────────────────────────────────────────────────
			const nodesLayer = g.select('.nodes-layer');
			nodesLayer.selectAll('*').remove();

			const nodeGroups = nodesLayer
				.selectAll<SVGGElement, NodePos>('g.node-group')
				.data([...nodeMap.values()], (d) => d.id)
				.join('g')
				.attr('class', 'node-group')
				.attr('transform', (d) => `translate(${d.x},${d.y})`)
				.style('cursor', 'pointer');

			// Initial state arrow
			nodeGroups
				.filter((d) => d.isInitial)
				.append('line')
				.attr('x1', 0)
				.attr(
					'y1',
					(d) =>
						-(d.shape === 'circle' ? d.radius : d.height / 2) - 22
				)
				.attr('x2', 0)
				.attr(
					'y2',
					(d) => -(d.shape === 'circle' ? d.radius : d.height / 2) - 4
				)
				.attr('stroke', '#1A1A1A')
				.attr('stroke-width', 1.8)
				.attr('marker-end', 'url(#arrow-normal)');

			// Selection rings — sit behind the main shape; CSS shows/hides
			// them via .is-selected / .is-lasso-preview on the parent group
			nodeGroups
				.filter((d) => d.shape === 'circle')
				.append('circle')
				.attr('class', 'selection-ring')
				.attr('r', (d) => d.radius + 4);

			nodeGroups
				.filter((d) => d.shape === 'rect')
				.append('rect')
				.attr('class', 'selection-ring')
				.attr('x', (d) => -d.width / 2 - 4)
				.attr('y', (d) => -d.height / 2 - 4)
				.attr('width', (d) => d.width + 8)
				.attr('height', (d) => d.height + 8)
				.attr('rx', 9)
				.attr('ry', 9);

			// Helper: compute effective fill value (plain colour or url pattern)
			const effectiveNodeFill = (d: NodePos): string => {
				const ov = colorOverridesRef.current?.get(d.id);
				const fill = ov?.fill ?? d.fillColor ?? '#FFFFFF';
				const border = ov?.border ?? d.borderColor ?? '#1A1A1A';
				const rawHatch = ov?.hatch !== undefined ? ov.hatch : d.hatch;
				const hatch = rawHatch === 'none' ? undefined : rawHatch;
				if (hatch && defsRef.current) {
					const stripe = darkenColor(border, 0.35);
					const pid = upsertHatchPattern(
						defsRef.current,
						d.id,
						hatch,
						fill,
						stripe
					);
					return `url(#${pid})`;
				}
				return fill;
			};

			// Circle shape
			nodeGroups
				.filter((d) => d.shape === 'circle')
				.append('circle')
				.attr('class', 'node-shape')
				.attr('r', (d) => d.radius)
				.attr('fill', effectiveNodeFill)
				.attr(
					'stroke',
					(d) =>
						colorOverridesRef.current?.get(d.id)?.border ??
						d.borderColor ??
						'#1A1A1A'
				)
				.attr('stroke-width', (d) => (d.isInitial ? 2 : 1.2));

			// Rect shape
			nodeGroups
				.filter((d) => d.shape === 'rect')
				.append('rect')
				.attr('class', 'node-shape')
				.attr('x', (d) => -d.width / 2)
				.attr('y', (d) => -d.height / 2)
				.attr('width', (d) => d.width)
				.attr('height', (d) => d.height)
				.attr('rx', 6)
				.attr('ry', 6)
				.attr('fill', effectiveNodeFill)
				.attr(
					'stroke',
					(d) =>
						colorOverridesRef.current?.get(d.id)?.border ??
						d.borderColor ??
						'#1A1A1A'
				)
				.attr('stroke-width', (d) => (d.isInitial ? 2 : 1.2));

			// Labels
			nodeGroups.each(function (d) {
				const group = d3.select(this);
				const lines = d.label.split('\n');
				const fontSize = isRadial ? 8 : 11;
				const lineH = fontSize + 3;
				const totalH = lines.length * lineH;
				const startY = -totalH / 2 + lineH * 0.72;

				const textEl = group
					.append('text')
					.attr('text-anchor', 'middle')
					.attr(
						'font-family',
						'"JetBrains Mono", "Fira Mono", monospace'
					)
					.attr('font-size', `${fontSize}px`)
					.attr('fill', '#1A1A1A')
					.attr('pointer-events', 'none');

				lines.forEach((line, i) => {
					textEl
						.append('tspan')
						.attr('x', 0)
						.attr('y', startY + i * lineH)
						.text(line);
				});
			});

			// Keep the warning attached to the node in every layout and SVG export.
			const deadlineBadges = nodeGroups
				.filter((d) => d.tasks.some(({ task }) => task.c > task.d))
				.append('g')
				.attr('class', 'deadline-badge')
				.style(
					'display',
					deadlineBadgesVisibleRef.current ? null : 'none'
				)
				.attr('role', 'img')
				.attr('aria-label', 'Deadline cannot be met')
				.attr('transform', (d) => {
					const x =
						d.shape === 'circle'
							? d.radius * Math.SQRT1_2
							: d.width / 2;
					const y =
						d.shape === 'circle'
							? -d.radius * Math.SQRT1_2
							: -d.height / 2;
					return `translate(${x},${y})`;
				});

			deadlineBadges
				.append('title')
				.text(
					'Deadline cannot be met: remaining work exceeds time to deadline'
				);
			deadlineBadges
				.append('circle')
				.attr('r', 8)
				.attr('fill', '#FFFFFF')
				.attr('stroke', '#9b2e23')
				.attr('stroke-width', 1.5);
			deadlineBadges
				.append('line')
				.attr('x1', 0)
				.attr('x2', 0)
				.attr('y1', -3.5)
				.attr('y2', 0.5)
				.attr('stroke', '#9b2e23')
				.attr('stroke-width', 1.7)
				.attr('stroke-linecap', 'round');
			deadlineBadges
				.append('circle')
				.attr('cy', 3.2)
				.attr('r', 0.9)
				.attr('fill', '#9b2e23');

			if (shouldAnimateEntrance && entranceDelays) {
				fitView(false);

				animateNodeEntrance(nodeGroups, entranceDelays);

				const edgeDelays = buildEdgeEntranceDelays(
					normalEdges,
					entranceDelays
				);
				const loopDelays = buildLoopEdgeEntranceDelays(
					loopEdges,
					entranceDelays
				);
				const bundleDelays = buildBundleTrunkEntranceDelays(
					loopBundles,
					entranceDelays
				);

				animateStrokeDrawEntrance(normalEdgePaths, edgeDelays, (edge) =>
					edgeId(edge)
				);
				animateStrokeDrawEntrance(
					arcBranchPaths,
					loopDelays,
					(edge) => edgeId(edge),
					'7,6'
				);
				animateStrokeDrawEntrance(
					arcTrunkPaths,
					bundleDelays,
					(bundle) => bundle.id,
					'7,6'
				);

				// Areas fade in after nodes are mostly visible
				areasLayer
					.selectAll<SVGGElement, unknown>('.area-group')
					.interrupt('area-entrance')
					.transition('area-entrance')
					.delay(80)
					.duration(ENTRANCE_DURATION_MS)
					.ease(d3.easeCubicOut)
					.style('opacity', 1);
				areasHatchLayer
					.selectAll<SVGGElement, unknown>('.area-hatch')
					.interrupt('area-entrance')
					.transition('area-entrance')
					.delay(80)
					.duration(ENTRANCE_DURATION_MS)
					.ease(d3.easeCubicOut)
					.style('opacity', 1);
			} else {
				nodeGroups.interrupt('node-entrance');
				nodeGroups.style('opacity', 1);
				normalEdgePaths.interrupt('edge-entrance').attr('opacity', 1);
				arcTrunkPaths
					.interrupt('edge-entrance')
					.attr('opacity', 1)
					.attr('stroke-dasharray', '7,6')
					.attr('stroke-dashoffset', null);
				arcBranchPaths
					.interrupt('edge-entrance')
					.attr('opacity', 1)
					.attr('stroke-dasharray', '7,6')
					.attr('stroke-dashoffset', null);
				areasLayer
					.selectAll('.area-group')
					.interrupt('area-entrance')
					.style('opacity', null);
				areasHatchLayer
					.selectAll('.area-hatch')
					.interrupt('area-entrance')
					.style('opacity', null);
			}

			// ── Events ────────────────────────────────────────────────────
			nodeGroups.on('mouseenter', function (_evt, d) {
				if (!svgRef.current) return;
				if (lassoActiveRef.current) return;

				// Tooltip
				const transform = d3.zoomTransform(svgRef.current);
				const [px, py] = transform.apply([d.x, d.y]);
				const lines: string[] = [`ID: ${d.id}`];
				d.tasks.forEach((t, i) => {
					const rel =
						t.release === 'up'
							? ' ↑ released'
							: t.release === 'down'
								? ' ↓ completing'
								: '';
					lines.push(`τ${i + 1}: c=${t.task.c}  d=${t.task.d}${rel}`);
				});
				setTooltip({ x: px + 14, y: py - 8, lines });

				// Hover path highlight only when nothing is selected
				if (selectedIdsRef.current.size === 0) {
					applyHoverPath(d.id, graphData);
				}
			});

			nodeGroups.on('mouseleave', () => {
				if (lassoActiveRef.current) return;
				setTooltip(null);
				if (selectedIdsRef.current.size === 0) {
					clearHoverPath();
				}
			});

			nodeGroups.on('click', function (event, d) {
				event.stopPropagation();

				if (suppressClickRef.current) {
					suppressClickRef.current = false;
					return;
				}

				// Clear area selection when a node is clicked
				clearAreaSelectionRef.current();
				onAreaSelectRef.current?.(null);

				let next: Set<string>;
				if (isAdditiveSelect(event)) {
					next = new Set(selectedIdsRef.current);
					if (next.has(d.id)) next.delete(d.id);
					else next.add(d.id);
				} else {
					next = new Set([d.id]);
				}

				selectedIdsRef.current = next;
				if (next.size === 0) {
					clearSelection();
					onSelectionChangeRef.current?.(null);
					return;
				}

				applySelection(next, graphData);
				emitSelection(next);
			});

			if (selectedIdsRef.current.size > 0) {
				applySelection(selectedIdsRef.current, graphData);
				emitSelection(selectedIdsRef.current);
			}

			onStatsChangeRef.current?.({
				nodes: graphData.nodes.length,
				edges: graphData.edges.length
			});
			if (restoreViewRef.current && svgRef.current && zoomRef.current) {
				const { x, y, k } = restoreViewRef.current;
				restoreViewRef.current = null;
				d3.select(svgRef.current).call(
					zoomRef.current.transform,
					d3.zoomIdentity.translate(x, y).scale(k)
				);
			} else if (!shouldAnimateEntrance) {
				fitView(false);
			}
		}, [
			graphData.nodes,
			graphData.edges,
			drawAreas,
			activeLayout,
			showLoopbacks,
			showNormalEdges,
			enableAnimation,
			clearSelection,
			clearAreaSelection,
			applySelection,
			applyAreaSelection,
			applyHoverPath,
			clearHoverPath,
			fitView,
			emitSelection
		]);

		// ── Apply color overrides without full redraw ────────────────────
		useEffect(() => {
			if (!gRef.current) return;
			const g = d3.select(gRef.current);
			g.selectAll<SVGGElement, NodePos>('.node-group').each(function (d) {
				const override = colorOverrides?.get(d.id);
				const effectiveFill =
					override?.fill ?? d.fillColor ?? '#FFFFFF';
				const effectiveBorder =
					override?.border ?? d.borderColor ?? '#1A1A1A';
				const rawHatch =
					override?.hatch !== undefined ? override.hatch : d.hatch;
				const effectiveHatch =
					rawHatch === 'none' ? undefined : rawHatch;

				// Use .node-shape to avoid accidentally targeting the
				// .selection-ring element which is also a rect/circle
				const shape = d3.select(this).select<SVGElement>('.node-shape');
				if (shape.empty()) return;

				shape.attr('stroke', effectiveBorder);

				if (effectiveHatch && defsRef.current) {
					const stripe = darkenColor(effectiveBorder, 0.35);
					const pid = upsertHatchPattern(
						defsRef.current,
						d.id,
						effectiveHatch,
						effectiveFill,
						stripe
					);
					shape.attr('fill', `url(#${pid})`);
				} else {
					// Remove stale pattern if it exists
					if (defsRef.current) {
						d3.select(defsRef.current)
							.select(`#${sanitizePatternId(d.id)}`)
							.remove();
					}
					shape.attr('fill', effectiveFill);
				}
			});
		}, [colorOverrides]);

		// Area edits update their own SVG layers without rebuilding nodes or fitting the view.
		useEffect(() => {
			if (
				drawnAreasRef.current?.areas !== graphData.areas ||
				drawnAreasRef.current?.overrides !== areaOverrides
			)
				drawAreas();
		}, [graphData.areas, areaOverrides, drawAreas]);

		// ── Areas visibility ──────────────────────────────────────────────
		useEffect(() => {
			if (!gRef.current) return;
			const g = d3.select(gRef.current);
			g.select('.areas-layer').style(
				'display',
				showAreas ? null : 'none'
			);
			g.select('.areas-hatch-layer').style(
				'display',
				showAreas ? null : 'none'
			);
		}, [showAreas]);

		// ── Per-area visibility ───────────────────────────────────────────
		useEffect(() => {
			if (!gRef.current) return;
			const g = d3.select(gRef.current);
			g.selectAll<SVGGElement, unknown>('.area-group').each(function () {
				const areaId =
					(this as Element).getAttribute('data-area-id') ?? '';
				const hidden = hiddenAreaIds?.has(areaId) ?? false;
				d3.select(this).style('display', hidden ? 'none' : null);
				g.select(`.area-hatch[data-area-id="${areaId}"]`).style(
					'display',
					hidden ? 'none' : null
				);
			});
		}, [hiddenAreaIds]);

		// ── Imperative handle ─────────────────────────────────────────────
		useImperativeHandle(ref, () => ({
			fit() {
				fitView(true);
			},

			zoomIn() {
				const svg = svgRef.current;
				const zoom = zoomRef.current;
				if (!svg || !zoom) return;
				d3.select(svg)
					.transition()
					.duration(200)
					.call(zoom.scaleBy, 1.3);
			},

			getViewState() {
				if (!svgRef.current) return null;
				const { x, y, k } = d3.zoomTransform(svgRef.current);
				return { x, y, k };
			},

			zoomOut() {
				const svg = svgRef.current;
				const zoom = zoomRef.current;
				if (!svg || !zoom) return;
				d3.select(svg)
					.transition()
					.duration(200)
					.call(zoom.scaleBy, 0.77);
			},

			exportPNG() {
				const svg = svgRef.current;
				if (!svg) return '';
				return svgToDataUrl(svg);
			},

			focusNode(id: string) {
				const nodeData = nodePosRef.current.get(id);
				const data = graphDataRef.current;
				if (!nodeData || !data || !svgRef.current || !zoomRef.current)
					return;

				const next = new Set([id]);
				selectedIdsRef.current = next;
				applySelection(next, data);
				emitSelection(next);

				const svg = svgRef.current;
				const zoom = zoomRef.current;
				const w = svg.clientWidth || svg.getBoundingClientRect().width;
				const h =
					svg.clientHeight || svg.getBoundingClientRect().height;
				d3.select(svg)
					.transition()
					.duration(450)
					.call(
						zoom.transform,
						d3.zoomIdentity
							.translate(
								w / 2 - 2 * nodeData.x,
								h / 2 - 2 * nodeData.y
							)
							.scale(2)
					);
			},

			runLayout(name: LayoutName) {
				setActiveLayout(name);
			},

			clearSelection() {
				selectedIdsRef.current = new Set();
				clearSelectionRef.current();
				onSelectionChangeRef.current?.(null);
			},

			selectNodes(nodeIds: string[]) {
				const data = graphDataRef.current;
				if (!data || nodeIds.length === 0) return;
				const next = new Set(
					nodeIds.filter((id) => nodePosRef.current.has(id))
				);
				if (next.size === 0) return;
				selectedIdsRef.current = next;
				clearAreaSelectionRef.current();
				applySelection(next, data);
				emitSelection(next);
			}
		}));

		return (
			<div
				ref={wrapperRef}
				className={`graph-viewer-wrapper${shiftHeld || lassoPoints.length > 0 ? ' lasso-mode' : ''}${panHeld ? ' pan-mode' : ''}${panDragging ? ' pan-dragging' : ''}`}
			>
				<svg
					ref={svgRef}
					className="graph-svg"
					style={{ width: '100%', height: '100%' }}
				/>
				{lassoPoints.length > 1 && (
					<svg className="lasso-overlay" aria-hidden="true">
						<path
							className="lasso-path"
							d={`M ${lassoPoints.map((p) => `${p.x},${p.y}`).join(' L ')} Z`}
						/>
					</svg>
				)}
				{tooltip && (
					<div
						className="node-tooltip"
						style={{ left: tooltip.x, top: tooltip.y }}
					>
						{tooltip.lines.map((line, i) => (
							<div key={i}>{line}</div>
						))}
					</div>
				)}
			</div>
		);
	}
);

GraphViewer.displayName = 'GraphViewer';
export default GraphViewer;
