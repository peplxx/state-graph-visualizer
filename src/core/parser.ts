import * as yaml from 'js-yaml';
import { GraphFileYamlSchema, formatZodErrors } from '../schema/graphSchema';
import type { GraphNodeYaml } from '../schema/graphSchema';
import type { GraphFile, GraphEdge, GraphNode } from '../types/graph';
import { toNodeTaskDisplay } from '../types/graph';

function synthesizeEdges(nodes: GraphNodeYaml[]): GraphEdge[] {
	const edges: GraphEdge[] = [];
	let edgeIdx = 0;

	for (const node of nodes) {
		for (const targetId of node.children) {
			edges.push({
				id: `e${edgeIdx++}`,
				source: node.id,
				target: targetId,
				type: 'normal'
			});
		}
		for (const targetId of node.loopback) {
			edges.push({
				id: `e${edgeIdx++}`,
				source: node.id,
				target: targetId,
				type: 'loop'
			});
		}
	}

	return edges;
}

function toGraphNode(node: GraphNodeYaml): GraphNode {
	return {
		id: node.id,
		label: node.label,
		tasks: node.tasks.map(toNodeTaskDisplay),
		isInitial: Boolean(node.initial ?? node.isInitial ?? false),
		borderColor: node.borderColor,
		fillColor: node.fillColor,
		hatch: node.hatch,
		metadata: node.metadata
	};
}

export function parseYAML(content: string): GraphFile {
	let raw: unknown;
	try {
		raw = yaml.load(content);
	} catch (err) {
		throw new Error(`Invalid YAML: ${(err as Error).message}`);
	}

	const result = GraphFileYamlSchema.safeParse(raw);
	if (!result.success) {
		throw new Error(formatZodErrors(result.error));
	}

	const parsed = result.data;

	return {
		schemaVersion: parsed.schemaVersion,
		system: parsed.system,
		nodes: parsed.nodes.map(toGraphNode),
		edges: synthesizeEdges(parsed.nodes),
		layout: parsed.layout ?? { algorithm: 'dagre' }
	};
}

export function parseFile(content: string): GraphFile {
	return parseYAML(content);
}

// ── Serializer ────────────────────────────────────────────────────────────────

/**
 * Serialize a GraphFile back to YAML, merging optional color overrides into
 * the node borderColor / fillColor fields.
 */
export function serializeToYAML(
	graphFile: GraphFile,
	colorOverrides?: Map<string, { fill?: string; border?: string; hatch?: string }>
): string {
	// Reconstruct children / loopback edge lists per node
	const childrenMap = new Map<string, string[]>();
	const loopbackMap = new Map<string, string[]>();
	for (const node of graphFile.nodes) {
		childrenMap.set(node.id, []);
		loopbackMap.set(node.id, []);
	}
	for (const edge of graphFile.edges) {
		if (edge.type === 'normal') {
			childrenMap.get(edge.source)?.push(edge.target);
		} else {
			loopbackMap.get(edge.source)?.push(edge.target);
		}
	}

	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	const out: Record<string, any> = {
		schemaVersion: graphFile.schemaVersion ?? 1
	};

	if (graphFile.system) {
		const sys = graphFile.system;
		out.system = {
			...(sys.description ? { description: sys.description } : {}),
			...(sys.m !== undefined ? { m: sys.m } : {}),
			tasks: sys.tasks.map((t) => ({
				c: t.c,
				d: t.d,
				...(t.name ? { name: t.name } : {})
			}))
		};
	}

	out.nodes = graphFile.nodes.map((node) => {
		const override = colorOverrides?.get(node.id);
		const effectiveFill = override?.fill ?? node.fillColor;
		const effectiveBorder = override?.border ?? node.borderColor;

		const effectiveHatch = (() => {
			const ov = colorOverrides?.get(node.id)?.hatch;
			if (ov === 'none') return undefined;
			if (ov === 'single' || ov === 'cross') return ov;
			return node.hatch;
		})();

		return {
			id: node.id,
			...(node.isInitial ? { initial: true } : {}),
			...(effectiveFill ? { fillColor: effectiveFill } : {}),
			...(effectiveBorder ? { borderColor: effectiveBorder } : {}),
			...(effectiveHatch ? { hatch: effectiveHatch } : {}),
			...(node.label ? { label: node.label } : {}),
			tasks: node.tasks.map((t) => ({
				c: t.task.c,
				d: t.task.d,
				...(t.release !== 'none' ? { release: t.release } : {})
			})),
			children: childrenMap.get(node.id) ?? [],
			loopback: loopbackMap.get(node.id) ?? [],
			...(node.metadata ? { metadata: node.metadata } : {})
		};
	});

	if (graphFile.layout?.algorithm) {
		out.layout = { algorithm: graphFile.layout.algorithm };
	}

	return yaml.dump(out, { indent: 2, lineWidth: -1, noRefs: true });
}
