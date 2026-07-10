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
