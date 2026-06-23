import {
  useEffect,
  useRef,
  useState,
  forwardRef,
  useImperativeHandle,
} from 'react';
import cytoscape from 'cytoscape';
import type { Core, NodeSingular } from 'cytoscape';
// @ts-ignore
import dagre from 'cytoscape-dagre';
// @ts-ignore
import fcose from 'cytoscape-fcose';

import { stylesheet } from '../core/cytoscapeConfig';
import { buildLayoutOptions } from '../core/layoutConfig';
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

function clearSelection(cy: Core) {
  cy.elements().removeClass('dimmed selected-node neighbour');
}

function applySelection(cy: Core, node: NodeSingular) {
  clearSelection(cy);
  cy.nodes().addClass('dimmed');
  cy.edges().addClass('dimmed');
  node.removeClass('dimmed');
  node.addClass('selected-node');
  const nb = node.neighborhood();
  nb.nodes().removeClass('dimmed').addClass('neighbour');
  nb.edges().removeClass('dimmed').addClass('neighbour');
}

function computeBFSRanks(
  nodes: GraphFile['nodes'],
  edges: GraphFile['edges']
): Map<string, number> {
  const children    = new Map<string, string[]>();
  const parentCount = new Map<string, number>();
  for (const n of nodes) { children.set(n.id, []); parentCount.set(n.id, 0); }
  for (const e of edges) {
    if (e.type !== 'normal') continue;
    children.get(e.source)?.push(e.target);
    parentCount.set(e.target, (parentCount.get(e.target) ?? 0) + 1);
  }
  const roots = nodes
    .filter(n => n.isInitial || parentCount.get(n.id) === 0)
    .map(n => n.id);
  const rank  = new Map<string, number>();
  const queue: string[] = [];
  for (const r of roots) { rank.set(r, 0); queue.push(r); }
  let i = 0;
  while (i < queue.length) {
    const id = queue[i++];
    const d  = rank.get(id) ?? 0;
    for (const child of (children.get(id) ?? [])) {
      const ex = rank.get(child);
      if (ex === undefined || ex < d + 1) { rank.set(child, d + 1); queue.push(child); }
    }
  }
  return rank;
}

// ── Canvas arc drawing ────────────────────────────────────────────────────────
function drawArcs(
  canvas: HTMLCanvasElement,
  cy: Core,
  arcs: ReleaseArc[]
) {
  const container = canvas.parentElement!;
  const w = container.clientWidth;
  const h = container.clientHeight;
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width  = w;
    canvas.height = h;
  }

  const ctx = canvas.getContext('2d')!;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  if (arcs.length === 0) return;

  const zoom = cy.zoom();
  const pan  = cy.pan();

  const toCanvas = (gx: number, gy: number) => ({
    x: gx * zoom + pan.x,
    y: gy * zoom + pan.y,
  });

  const nodeHalfW = (nodeId: string) => (cy.getElementById(nodeId).width()  * zoom) / 2;
  const nodeHalfH = (nodeId: string) => (cy.getElementById(nodeId).height() * zoom) / 2;

  type ArcData = {
    sx: number; sy: number;
    tx: number; ty: number;
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
      span: Math.abs(srcC.y - tgtC.y),
    });
  }

  if (arcData.length === 0) return;

  arcData.sort((a, b) => b.span - a.span);

  // KEY FIX: Calculate left boundary based on ALL nodes in the graph
  let minX = Infinity;
  const allNodes = cy.nodes();
  for (let i = 0; i < allNodes.length; i++) {
    const n = allNodes[i];
    const p = toCanvas(n.position().x, n.position().y);
    const hw = (n.width() * zoom) / 2;
    if (p.x - hw < minX) minX = p.x - hw;
  }

  const INNER_MARGIN  = 28 * zoom;
  const STEP          = 16 * zoom;
  const RADIUS        = Math.max(8, 14 * zoom);
  const TOP_CLEARANCE = Math.max(22, 32 * zoom);
  const SOURCE_DROP   = Math.max(16, 22 * zoom);

  arcData.forEach((d, idx) => {
    const leftX = minX - INNER_MARGIN - idx * STEP;

    ctx.save();
    ctx.setLineDash([Math.max(6, 8 * zoom), Math.max(3, 5 * zoom)]);
    ctx.lineWidth   = Math.max(1, 1.5 * zoom);
    ctx.strokeStyle = '#C0392B';

    ctx.beginPath();
    ctx.moveTo(d.sx, d.sy);

    const Y_drop = d.sy + SOURCE_DROP;
    const Y_approach = d.ty - TOP_CLEARANCE;

    const verticalSpan = Math.abs(Y_drop - Y_approach);
    const horizontalSpace = Math.min(d.sx - leftX, d.tx - leftX);

    if (verticalSpan < RADIUS * 3 || horizontalSpace < RADIUS * 3) {
      ctx.bezierCurveTo(
        d.sx, Y_drop,
        d.tx, Y_approach,
        d.tx, d.ty
      );
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
  const angle   = Math.atan2(toY - fromY, toX - fromX);

  ctx.save();
  ctx.setLineDash([]);
  ctx.fillStyle   = '#C0392B';
  ctx.strokeStyle = '#C0392B';
  ctx.lineWidth   = Math.max(1, 1.5 * zoom);

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
    const containerRef  = useRef<HTMLDivElement>(null);
    const canvasRef     = useRef<HTMLCanvasElement>(null);
    const cyRef         = useRef<Core | null>(null);
    const selectedIdRef = useRef<string | null>(null);
    const arcsRef       = useRef<ReleaseArc[]>([]);
    const animFrameRef  = useRef<number | null>(null);

    const onNodeClickRef   = useRef<typeof onNodeClick>(undefined);
    const onStatsChangeRef = useRef<typeof onStatsChange>(undefined);
    onNodeClickRef.current   = onNodeClick;
    onStatsChangeRef.current = onStatsChange;

    const [tooltip, setTooltip] = useState<{
      x: number; y: number; lines: string[];
    } | null>(null);

    const redrawArcs = () => {
      const cy     = cyRef.current;
      const canvas = canvasRef.current;
      if (!cy || !canvas) return;
      
      let arcsToDraw = arcsRef.current;
      const selectedId = selectedIdRef.current;
      if (selectedId) {
        arcsToDraw = arcsToDraw.filter(a => a.srcId === selectedId || a.tgtId === selectedId);
      }
      
      drawArcs(canvas, cy, arcsToDraw);
    };

    const animateArcs = (durationMs: number) => {
      if (animFrameRef.current !== null) {
        cancelAnimationFrame(animFrameRef.current);
      }
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

    // ── Init Cytoscape once ───────────────────────────────────────────────────
    useEffect(() => {
      if (!containerRef.current) return;
      registerLayouts();

      const cy = cytoscape({
        container: containerRef.current,
        elements:  [],
        style:     stylesheet as cytoscape.CytoscapeOptions['style'],
        wheelSensitivity: 0.3,
        minZoom: 0.01,
        maxZoom: 5,
      });
      cyRef.current = cy;

      // Hide job-release edges in Cytoscape, but keep them in the graph 
      cy.style()
        .selector('edge[type = "job-release"]')
        .style({ 'display': 'none' })
        .update();

      cy.on('render', redrawArcs);
      cy.on('pan zoom resize', redrawArcs);
      
      // KEY FIX: Redraw immediately when any node is dragged or repositioned
      cy.on('position', 'node', redrawArcs);

      cy.on('mouseover', 'node', (evt) => {
        const node  = evt.target as NodeSingular;
        const rp    = evt.renderedPosition;
        const tasks = node.data('tasks') as NodeTaskDisplay[] | undefined;
        const lines: string[] = [`ID: ${node.id()}`];
        tasks?.forEach((t, i) => {
          const rel =
            t.release === 'up'   ? ' ↑ released'  :
            t.release === 'down' ? ' ↓ completing' : '';
          lines.push(`τ${i + 1}: c=${t.task.c}  d=${t.task.d}${rel}`);
        });
        setTooltip({ x: rp.x + 14, y: rp.y - 8, lines });
      });
      cy.on('mouseout', 'node', () => setTooltip(null));

      cy.on('tap', 'node', (evt) => {
        const node = evt.target as NodeSingular;
        const id   = node.id();
        if (selectedIdRef.current === id) {
          selectedIdRef.current = null;
          clearSelection(cy);
          onNodeClickRef.current?.(null);
          return;
        }
        selectedIdRef.current = id;
        applySelection(cy, node);
        onNodeClickRef.current?.(node);
      });

      cy.on('tap', (evt) => {
        if (evt.target === cy) {
          selectedIdRef.current = null;
          clearSelection(cy);
          onNodeClickRef.current?.(null);
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
    }, []);

    // ── Load graph ────────────────────────────────────────────────────────────
    useEffect(() => {
      const cy = cyRef.current;
      if (!cy || !graphData) return;

      selectedIdRef.current = null;
      arcsRef.current       = [];
      clearSelection(cy);

      if (canvasRef.current) {
        const ctx = canvasRef.current.getContext('2d');
        ctx?.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
      }

      cy.startBatch();
      cy.elements().remove();

      const ranks = computeBFSRanks(graphData.nodes, graphData.edges);

      const nodeElements: cytoscape.ElementDefinition[] = [];
      for (const node of graphData.nodes) {
        const label             = buildNodeLabel(node.tasks);
        const { width, height } = estimateNodeSize(node.tasks);
        nodeElements.push({
          group: 'nodes',
          data: {
            id: node.id, label,
            tasks: node.tasks,
            isInitial: node.isInitial ?? false,
            width, height,
            rank: ranks.get(node.id) ?? 0,
          },
        });
      }

      const allEdgeDefs: cytoscape.ElementDefinition[] = [];
      const releaseArcList: ReleaseArc[] = [];

      for (const edge of graphData.edges) {
        allEdgeDefs.push({
          group: 'edges',
          data: {
            id:     edge.id ?? `${edge.source}-${edge.target}`,
            source: edge.source,
            target: edge.target,
            type:   edge.type,
            label:  edge.label ?? '',
          },
        });
        if (edge.type === 'job-release') {
          releaseArcList.push({ srcId: edge.source, tgtId: edge.target });
        }
      }

      arcsRef.current = releaseArcList;

      cy.add([...nodeElements, ...allEdgeDefs]);
      cy.endBatch();

      const layoutName = (graphData.layout?.name ?? layout) as LayoutName;
      const layoutOpts = buildLayoutOptions(
        layoutName, graphData.nodes.length, graphData.layout?.options
      );

      const layoutEles = cy.elements().filter(el => el.isNode() || el.data('type') !== 'job-release');

      const lo = cy.layout(
        layoutName === 'dagre'
          ? { ...layoutOpts, name: 'dagre', eles: layoutEles, ranker: 'longest-path', rank: (n: any) => n.data('rank') }
          : { ...layoutOpts, name: layoutName, eles: layoutEles }
      );

      lo.on('layoutstop', () => {
        cy.fit(undefined, 120);
        requestAnimationFrame(redrawArcs);
      });

      lo.run();

      onStatsChangeRef.current?.({
        nodes: graphData.nodes.length,
        edges: graphData.edges.length,
      });
    }, [graphData, layout]);

    // ── Imperative handle ─────────────────────────────────────────────────────
    useImperativeHandle(ref, () => ({
      fit() {
        cyRef.current?.fit(undefined, 120);
        animateArcs(300);
      },
      zoomIn() {
        const cy = cyRef.current; if (!cy) return;
        cy.zoom({ level: cy.zoom() * 1.3, renderedPosition: { x: cy.width() / 2, y: cy.height() / 2 } });
        animateArcs(200);
      },
      zoomOut() {
        const cy = cyRef.current; if (!cy) return;
        cy.zoom({ level: cy.zoom() * 0.77, renderedPosition: { x: cy.width() / 2, y: cy.height() / 2 } });
        animateArcs(200);
      },
      exportPNG() {
        const cyPng = cyRef.current?.png({ full: true, scale: 2 }) ?? '';
        return cyPng;
      },
      focusNode(id: string) {
        const cy = cyRef.current; if (!cy) return;
        const node = cy.getElementById(id);
        if (!node.length) return;
        
        selectedIdRef.current = id;
        applySelection(cy, node as NodeSingular);
        onNodeClickRef.current?.(node as NodeSingular);

        const focusEles = node.closedNeighborhood();

        cy.animate({
          fit: { eles: focusEles, padding: 80 },
          duration: 450,
          complete: () => redrawArcs(),
        });

        animateArcs(550);
      },
      runLayout(name: LayoutName) {
        const cy = cyRef.current; if (!cy) return;
        
        const layoutEles = cy.elements().filter(el => el.isNode() || el.data('type') !== 'job-release');
        const lo = cy.layout({ ...buildLayoutOptions(name, cy.nodes().length), name, eles: layoutEles });
        
        lo.on('layoutstop', () => {
          redrawArcs();
          animateArcs(300);
        });
        lo.run();
      },
    }));

    return (
      <div className="graph-viewer-wrapper">
        {/* Cytoscape canvas */}
        <div ref={containerRef} className="graph-container" />
        {/* Arc overlay — pointer-events none so clicks pass through to cytoscape */}
        <canvas
          ref={canvasRef}
          className="arc-overlay"
        />
        {tooltip && (
          <div className="node-tooltip" style={{ left: tooltip.x, top: tooltip.y }}>
            {tooltip.lines.map((line, i) => <div key={i}>{line}</div>)}
          </div>
        )}
      </div>
    );
  }
);

GraphViewer.displayName = 'GraphViewer';
export default GraphViewer;