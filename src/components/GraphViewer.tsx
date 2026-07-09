import {
	useEffect,
	useRef,
	useState,
	forwardRef,
	useImperativeHandle
} from 'react';
import cytoscape from 'cytoscape';
import type { Core, NodeSingular } from 'cytoscape';
// @ts-ignore
import dagre from 'cytoscape-dagre';
// @ts-ignore
import fcose from 'cytoscape-fcose';

import { stylesheet } from '../core/cytoscapeConfig';
import {
	buildLayoutOptions,
	computeConcentricPositions
} from '../core/layoutConfig';
import type { LayoutName } from '../core/layoutConfig';
import { buildNodeLabel, estimateNodeSize } from '../core/labelBuilder';
import type { GraphFile, NodeTaskDisplay } from '../types/graph';

let registered = false;
function registerLayouts() {
	if (registered) return;
	registered = true;
	cytoscape.use(dagre);
	cytoscape.use(fcose);
}

interface ReleaseArc {
	srcId: string;
	tgtId: string;
}

interface Props {
	graphData: GraphFile | null;
	layout: LayoutName;
	onNodeClick?: (node: NodeSingular | null) => void;
	onStatsChange?: (stats: { nodes: number; edges: number }) => void;
}

export interface GraphViewerHandle {
	fit(): void;
	zoomIn(): void;
	zoomOut(): void;
	exportPNG(): string;
	focusNode(id: string): void;
	runLayout(name: LayoutName): void;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function clearSelection(cy: Core) {
	cy.elements().removeClass('dimmed selected-node neighbour');
}

/**
 * Dim everything, then highlight:
 *  - the selected node itself
 *  - its normal-edge neighbours (Cytoscape edges)
 *  - nodes connected to it via loop arcs (canvas-only edges)
 */
function applySelection(cy: Core, node: NodeSingular, arcs: ReleaseArc[]) {
	clearSelection(cy);
	cy.nodes().addClass('dimmed');
	cy.edges().addClass('dimmed');

	const id = node.id();

	// Selected node
	node.removeClass('dimmed');
	node.addClass('selected-node');

	// Normal-edge neighbourhood
	const nb = node.neighborhood();
	nb.nodes().removeClass('dimmed').addClass('neighbour');
	nb.edges().removeClass('dimmed').addClass('neighbour');

	// Loop-arc neighbourhood (canvas arcs have no Cytoscape edge)
	for (const arc of arcs) {
		if (arc.srcId === id || arc.tgtId === id) {
			const neighbourId = arc.srcId === id ? arc.tgtId : arc.srcId;
			const neighbour = cy.getElementById(neighbourId);
			if (neighbour.length) {
				neighbour.removeClass('dimmed').addClass('neighbour');
			}
		}
	}
}

/**
 * Pure BFS from roots — first-visit wins, so every node gets the
 * *shallowest* possible rank (= BFS depth).
 */
function computeBFSDepthRanks(
	nodes: GraphFile['nodes'],
	edges: GraphFile['edges']
): Map<string, number> {
	const children = new Map<string, string[]>();
	for (const n of nodes) children.set(n.id, []);

	const hasIncoming = new Set<string>();
	for (const e of edges) {
		if (e.type !== 'normal') continue;
		if (children.has(e.source)) children.get(e.source)!.push(e.target);
		hasIncoming.add(e.target);
	}

	const rank = new Map<string, number>();
	const queue: string[] = [];

	for (const n of nodes) {
		if (n.isInitial || !hasIncoming.has(n.id)) {
			rank.set(n.id, 0);
			queue.push(n.id);
		}
	}

	let head = 0;
	while (head < queue.length) {
		const id = queue[head++];
		const d = rank.get(id)!;
		for (const child of children.get(id) ?? []) {
			if (!rank.has(child)) {
				rank.set(child, d + 1);
				queue.push(child);
			}
		}
	}

	for (const n of nodes) {
		if (!rank.has(n.id)) rank.set(n.id, 0);
	}

	return rank;
}

function runGraphLayout(
	cy: Core,
	layoutName: LayoutName,
	graphData: GraphFile,
	onComplete: () => void
) {
	if (layoutName === 'concentric') {
		const ranks = computeBFSDepthRanks(graphData.nodes, graphData.edges);
		const positions = computeConcentricPositions(
			ranks,
			graphData.nodes.map((n) => n.id)
		);
		cy.nodes().forEach((node) => {
			const pos = positions.get(node.id());
			if (pos) node.position(pos);
		});
		cy.fit(undefined, 120);
		onComplete();
		return;
	}

	const layoutOpts = buildLayoutOptions(
		layoutName,
		graphData.nodes.length
	);
	const layoutEles = cy.elements().filter(
		(el) =>
			el.isNode() ||
			el.data('type') === 'normal' ||
			el.data('type') === 'virtual'
	);

	const lo = cy.layout({
		...layoutOpts,
		name: 'dagre',
		eles: layoutEles,
		ranker: 'network-simplex'
	} as any);

	lo.on('layoutstop', () => {
		cy.fit(undefined, 120);
		onComplete();
	});
	lo.run();
}

// ── Canvas arc drawing ────────────────────────────────────────────────────────
function drawArcs(canvas: HTMLCanvasElement, cy: Core, arcs: ReleaseArc[]) {
	const container = canvas.parentElement!;
	const w = container.clientWidth;
	const h = container.clientHeight;
	if (canvas.width !== w || canvas.height !== h) {
		canvas.width = w;
		canvas.height = h;
	}

	const ctx = canvas.getContext('2d')!;
	ctx.clearRect(0, 0, canvas.width, canvas.height);
	if (arcs.length === 0) return;

	const zoom = cy.zoom();
	const pan = cy.pan();

	const toCanvas = (gx: number, gy: number) => ({
		x: gx * zoom + pan.x,
		y: gy * zoom + pan.y
	});

	const nodeHalfH = (nodeId: string) =>
		(cy.getElementById(nodeId).height() * zoom) / 2;

	type ArcData = {
		sx: number;
		sy: number;
		tx: number;
		ty: number;
		span: number;
	};

	const arcData: ArcData[] = [];
	for (const arc of arcs) {
		const srcNode = cy.getElementById(arc.srcId);
		const tgtNode = cy.getElementById(arc.tgtId);
		if (!srcNode.length || !tgtNode.length) continue;

		const srcC = toCanvas(srcNode.position().x, srcNode.position().y);
		const tgtC = toCanvas(tgtNode.position().x, tgtNode.position().y);

		arcData.push({
			sx: srcC.x,
			sy: srcC.y + nodeHalfH(arc.srcId),
			tx: tgtC.x,
			ty: tgtC.y - nodeHalfH(arc.tgtId),
			span: Math.abs(srcC.y - tgtC.y)
		});
	}

	if (arcData.length === 0) return;

	arcData.sort((a, b) => b.span - a.span);

	let minX = Infinity;
	const allNodes = cy.nodes();
	for (let i = 0; i < allNodes.length; i++) {
		const n = allNodes[i];
		const p = toCanvas(n.position().x, n.position().y);
		const hw = (n.width() * zoom) / 2;
		if (p.x - hw < minX) minX = p.x - hw;
	}

	const INNER_MARGIN = 28 * zoom;
	const STEP = 16 * zoom;
	const RADIUS = Math.max(8, 14 * zoom);
	const TOP_CLEARANCE = Math.max(22, 32 * zoom);
	const SOURCE_DROP = Math.max(16, 22 * zoom);

	arcData.forEach((d, idx) => {
		const leftX = minX - INNER_MARGIN - idx * STEP;

		ctx.save();
		ctx.setLineDash([Math.max(6, 8 * zoom), Math.max(3, 5 * zoom)]);
		ctx.lineWidth = Math.max(1, 1.5 * zoom);
		ctx.strokeStyle = '#C0392B';

		ctx.beginPath();
		ctx.moveTo(d.sx, d.sy);

		const Y_drop = d.sy + SOURCE_DROP;
		const Y_approach = d.ty - TOP_CLEARANCE;

		const verticalSpan = Math.abs(Y_drop - Y_approach);
		const horizontalSpace = Math.min(d.sx - leftX, d.tx - leftX);

		if (verticalSpan < RADIUS * 3 || horizontalSpace < RADIUS * 3) {
			ctx.bezierCurveTo(d.sx, Y_drop, d.tx, Y_approach, d.tx, d.ty);
		} else {
			ctx.arcTo(d.sx, Y_drop, leftX, Y_drop, RADIUS);
			ctx.arcTo(leftX, Y_drop, leftX, Y_approach, RADIUS);
			ctx.arcTo(leftX, Y_approach, d.tx, Y_approach, RADIUS);
			ctx.arcTo(d.tx, Y_approach, d.tx, d.ty, RADIUS);
			ctx.lineTo(d.tx, d.ty);
		}

		ctx.stroke();
		ctx.restore();

		drawArrowhead(ctx, d.tx, d.ty - TOP_CLEARANCE / 2, d.tx, d.ty, zoom);
	});
}

function drawArrowhead(
	ctx: CanvasRenderingContext2D,
	fromX: number,
	fromY: number,
	toX: number,
	toY: number,
	zoom: number
) {
	const headLen = Math.max(6, 9 * zoom);
	const angle = Math.atan2(toY - fromY, toX - fromX);

	ctx.save();
	ctx.setLineDash([]);
	ctx.fillStyle = '#C0392B';
	ctx.strokeStyle = '#C0392B';
	ctx.lineWidth = Math.max(1, 1.5 * zoom);

	ctx.beginPath();
	ctx.moveTo(toX, toY);
	ctx.lineTo(
		toX - headLen * Math.cos(angle - Math.PI / 7),
		toY - headLen * Math.sin(angle - Math.PI / 7)
	);
	ctx.lineTo(
		toX - headLen * Math.cos(angle + Math.PI / 7),
		toY - headLen * Math.sin(angle + Math.PI / 7)
	);
	ctx.closePath();
	ctx.fill();
	ctx.restore();
}

// ── Component ─────────────────────────────────────────────────────────────────
const GraphViewer = forwardRef<GraphViewerHandle, Props>(
	({ graphData, layout, onNodeClick, onStatsChange }, ref) => {
		const containerRef = useRef<HTMLDivElement>(null);
		const canvasRef = useRef<HTMLCanvasElement>(null);
		const cyRef = useRef<Core | null>(null);
		const selectedIdRef = useRef<string | null>(null);
		const arcsRef = useRef<ReleaseArc[]>([]);
		const animFrameRef = useRef<number | null>(null);

		const onNodeClickRef = useRef<typeof onNodeClick>(undefined);
		const onStatsChangeRef = useRef<typeof onStatsChange>(undefined);
		const graphDataRef = useRef(graphData);
		onNodeClickRef.current = onNodeClick;
		onStatsChangeRef.current = onStatsChange;
		graphDataRef.current = graphData;

		const [tooltip, setTooltip] = useState<{
			x: number;
			y: number;
			lines: string[];
		} | null>(null);

		// ── Arc rendering ─────────────────────────────────────────────────────
		const redrawArcs = () => {
			const cy = cyRef.current;
			const canvas = canvasRef.current;
			if (!cy || !canvas) return;

			let arcsToDraw = arcsRef.current;
			const selectedId = selectedIdRef.current;

			// When a node is selected, only show arcs that touch it
			if (selectedId) {
				arcsToDraw = arcsToDraw.filter(
					(a) => a.srcId === selectedId || a.tgtId === selectedId
				);
			}

			drawArcs(canvas, cy, arcsToDraw);
		};

		const animateArcs = (durationMs: number) => {
			if (animFrameRef.current !== null)
				cancelAnimationFrame(animFrameRef.current);
			const start = performance.now();
			const tick = () => {
				redrawArcs();
				if (performance.now() - start < durationMs) {
					animFrameRef.current = requestAnimationFrame(tick);
				} else {
					animFrameRef.current = null;
					redrawArcs();
				}
			};
			animFrameRef.current = requestAnimationFrame(tick);
		};

		// ── Init Cytoscape (once) ─────────────────────────────────────────────
		useEffect(() => {
			if (!containerRef.current) return;
			registerLayouts();

			const cy = cytoscape({
				container: containerRef.current,
				elements: [],
				style: stylesheet as cytoscape.CytoscapeOptions['style'],
				wheelSensitivity: 0.3,
				minZoom: 0.01,
				maxZoom: 5
			});
			cyRef.current = cy;

			// Loop & virtual edges are invisible in Cytoscape
			cy.style()
				.selector('edge[type = "loop"]')
				.style({ display: 'none' })
				.update();
			cy.style()
				.selector('edge[type = "virtual"]')
				.style({ display: 'none' })
				.update();

			cy.on('render', redrawArcs);
			cy.on('pan zoom resize', redrawArcs);
			cy.on('position', 'node', redrawArcs);

			// Tooltip
			cy.on('mouseover', 'node', (evt) => {
				const node = evt.target as NodeSingular;
				const rp = evt.renderedPosition;
				const tasks = node.data('tasks') as
					| NodeTaskDisplay[]
					| undefined;
				const lines: string[] = [`ID: ${node.id()}`];
				tasks?.forEach((t, i) => {
					const rel =
						t.release === 'up'
							? ' ↑ released'
							: t.release === 'down'
								? ' ↓ completing'
								: '';
					lines.push(`τ${i + 1}: c=${t.task.c}  d=${t.task.d}${rel}`);
				});
				setTooltip({ x: rp.x + 14, y: rp.y - 8, lines });
			});
			cy.on('mouseout', 'node', () => setTooltip(null));

			// Node tap — pass arcsRef so applySelection can find loop neighbours
			cy.on('tap', 'node', (evt) => {
				const node = evt.target as NodeSingular;
				const id = node.id();

				if (selectedIdRef.current === id) {
					// Second tap on same node → deselect
					selectedIdRef.current = null;
					clearSelection(cy);
					onNodeClickRef.current?.(null);
					redrawArcs(); // restore all arcs
					return;
				}

				selectedIdRef.current = id;
				applySelection(cy, node, arcsRef.current);
				onNodeClickRef.current?.(node);
				redrawArcs(); // filter arcs to selection
			});

			// Tap on background → deselect
			cy.on('tap', (evt) => {
				if (evt.target === cy) {
					selectedIdRef.current = null;
					clearSelection(cy);
					onNodeClickRef.current?.(null);
					redrawArcs(); // restore all arcs
				}
			});

			const ro = new ResizeObserver(redrawArcs);
			ro.observe(containerRef.current);

			return () => {
				if (animFrameRef.current !== null) {
					cancelAnimationFrame(animFrameRef.current);
					animFrameRef.current = null;
				}
				ro.disconnect();
				cy.destroy();
				cyRef.current = null;
				selectedIdRef.current = null;
			};
		}, []); // eslint-disable-line react-hooks/exhaustive-deps

		// ── Load / reload graph ───────────────────────────────────────────────
		useEffect(() => {
			const cy = cyRef.current;
			if (!cy || !graphData) return;

			try {
				selectedIdRef.current = null;
				arcsRef.current = [];
				clearSelection(cy);
				setTooltip(null);

				if (canvasRef.current) {
					const ctx = canvasRef.current.getContext('2d');
					ctx?.clearRect(
						0,
						0,
						canvasRef.current.width,
						canvasRef.current.height
					);
				}

				cy.startBatch();
				cy.elements().remove();

				const ranks = computeBFSDepthRanks(
					graphData.nodes,
					graphData.edges
				);

				// ── Nodes ─────────────────────────────────────────────────────────
				const nodeElements: cytoscape.ElementDefinition[] = [];
				for (const node of graphData.nodes) {
					const label =
						node.label ?? buildNodeLabel(node.tasks);
					const { width, height } = estimateNodeSize(node.tasks);
					nodeElements.push({
						group: 'nodes',
						data: {
							id: node.id,
							label,
							tasks: node.tasks,
							isInitial: node.isInitial ?? false,
							borderColor: node.borderColor,
							fillColor: node.fillColor,
							width,
							height,
							rank: ranks.get(node.id) ?? 0
						}
					});
				}

				// ── Edges ─────────────────────────────────────────────────────────
				const normalEdgeDefs: cytoscape.ElementDefinition[] = [];
				const releaseArcList: ReleaseArc[] = [];

				const normalTargets = new Set<string>(
					graphData.edges
						.filter((e) => e.type === 'normal')
						.map((e) => e.target)
				);

				for (const edge of graphData.edges) {
					if (edge.type === 'loop') {
						releaseArcList.push({
							srcId: edge.source,
							tgtId: edge.target
						});
						normalEdgeDefs.push({
							group: 'edges',
							data: {
								id: edge.id ?? `${edge.source}-${edge.target}`,
								source: edge.source,
								target: edge.target,
								type: 'loop',
								label: edge.label ?? ''
							}
						});
						continue;
					}

					const srcRank = ranks.get(edge.source) ?? 0;
					const tgtRank = ranks.get(edge.target) ?? 0;
					const minLen = Math.max(1, tgtRank - srcRank);

					normalEdgeDefs.push({
						group: 'edges',
						data: {
							id: edge.id ?? `${edge.source}-${edge.target}`,
							source: edge.source,
							target: edge.target,
							type: edge.type,
							label: edge.label ?? '',
							minLen
						}
					});
				}

				arcsRef.current = releaseArcList;

				// ── Virtual edges to anchor parentless non-root nodes ─────────────
				const roots = graphData.nodes
					.filter((n) => n.isInitial || !normalTargets.has(n.id))
					.map((n) => n.id);

				const virtualEdgeDefs: cytoscape.ElementDefinition[] = [];

				for (const node of graphData.nodes) {
					if (!normalTargets.has(node.id)) {
						const nodeRank = ranks.get(node.id) ?? 0;
						if (nodeRank > 0 && roots.length > 0) {
							virtualEdgeDefs.push({
								group: 'edges',
								data: {
									id: `__virt__${roots[0]}-${node.id}`,
									source: roots[0],
									target: node.id,
									type: 'virtual',
									label: '',
									minLen: nodeRank
								}
							});
						}
					}
				}

				cy.add([
					...nodeElements,
					...normalEdgeDefs,
					...virtualEdgeDefs
				]);
				cy.endBatch();

				// ── Layout ────────────────────────────────────────────────────────
				const layoutName = (graphData.layout?.algorithm ??
					layout) as LayoutName;

				runGraphLayout(cy, layoutName, graphData, () => {
					requestAnimationFrame(redrawArcs);
				});

				onStatsChangeRef.current?.({
					nodes: graphData.nodes.length,
					edges: graphData.edges.length
				});
			} catch (error) {
				console.error('Failed to load graph into Cytoscape:', error);
				cy.elements().remove();
			}
		}, [graphData, layout]); // eslint-disable-line react-hooks/exhaustive-deps

		// ── Imperative handle ─────────────────────────────────────────────────
		useImperativeHandle(ref, () => ({
			fit() {
				cyRef.current?.fit(undefined, 120);
				animateArcs(300);
			},

			zoomIn() {
				const cy = cyRef.current;
				if (!cy) return;
				cy.zoom({
					level: cy.zoom() * 1.3,
					renderedPosition: { x: cy.width() / 2, y: cy.height() / 2 }
				});
				animateArcs(200);
			},

			zoomOut() {
				const cy = cyRef.current;
				if (!cy) return;
				cy.zoom({
					level: cy.zoom() * 0.77,
					renderedPosition: { x: cy.width() / 2, y: cy.height() / 2 }
				});
				animateArcs(200);
			},

			exportPNG() {
				return cyRef.current?.png({ full: true, scale: 2 }) ?? '';
			},

			focusNode(id: string) {
				const cy = cyRef.current;
				if (!cy) return;
				const node = cy.getElementById(id);
				if (!node.length) return;

				selectedIdRef.current = id;
				// Pass arcsRef so loop neighbours are also un-dimmed
				applySelection(cy, node as NodeSingular, arcsRef.current);
				onNodeClickRef.current?.(node as NodeSingular);

				cy.animate({
					fit: { eles: node.closedNeighborhood(), padding: 80 },
					duration: 450,
					complete: () => redrawArcs()
				});
				animateArcs(550);
			},

			runLayout(name: LayoutName) {
				const cy = cyRef.current;
				const data = graphDataRef.current;
				if (!cy || !data) return;

				runGraphLayout(cy, name, data, () => {
					redrawArcs();
					animateArcs(300);
				});
			}
		}));

		// ── Render ────────────────────────────────────────────────────────────
		return (
			<div className="graph-viewer-wrapper">
				<div ref={containerRef} className="graph-container" />
				<canvas ref={canvasRef} className="arc-overlay" />
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
