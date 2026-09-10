import { z } from 'zod';
import type { GraphFile } from '../types/graph';
import { parseFile, serializeToYAML } from '../core/parser';

export const graphSchema = z.custom<GraphFile>((value) => {
	try {
		const graph = value as GraphFile;
		if (!Array.isArray(graph.nodes) || !Array.isArray(graph.edges))
			return false;
		parseFile(serializeToYAML(graph));
		return true;
	} catch {
		return false;
	}
});
const overrideSchema = z.object({
	fill: z.string().optional(),
	border: z.string().optional(),
	hatch: z.enum(['none', 'single', 'cross']).optional()
});
export const explorerStateSchema = z.object({
	graphData: graphSchema.nullable(),
	filename: z.string(),
	documentId: z.string(),
	baselineYaml: z.string().nullable(),
	layout: z.enum(['radial', 'tree']),
	showLoopbacks: z.boolean(),
	showNormalEdges: z.boolean(),
	enableAnimation: z.boolean(),
	showLegend: z.boolean(),
	showSystemConfig: z.boolean().default(false),
	showDeadlineBadges: z.boolean(),
	showAreas: z.boolean(),
	hiddenAreaIds: z.set(z.string()),
	colorOverrides: z.map(z.string(), overrideSchema),
	areaOverrides: z.map(
		z.string(),
		overrideSchema.extend({
			labelPosition: z
				.enum([
					'top-left',
					'top-center',
					'top-right',
					'center',
					'bottom-left',
					'bottom-center',
					'bottom-right'
				])
				.optional(),
			nodes: z.array(z.string()).optional()
		})
	),
	selectedIds: z.array(z.string()),
	selectedAreaId: z.string().nullable(),
	sidebarOpen: z.boolean(),
	appearanceOpen: z.boolean(),
	scheduleOpen: z.boolean().default(true),
	sidebarWidth: z.number().finite().min(0).max(640),
	showDeadlines: z.boolean(),
	showRemainingWork: z.boolean(),
	view: z
		.object({
			x: z.number().finite(),
			y: z.number().finite(),
			k: z.number().finite().positive().max(10)
		})
		.nullable(),
	sidebarScroll: z.number().finite().nonnegative(),
	scheduleScroll: z.number().finite().nonnegative()
});
export type ExplorerState = z.infer<typeof explorerStateSchema>;
export function createExplorerState(): ExplorerState {
	return {
		graphData: null,
		filename: '',
		documentId: crypto.randomUUID(),
		baselineYaml: null,
		layout: 'radial',
		showLoopbacks: true,
		showNormalEdges: true,
		enableAnimation: true,
		showLegend: false,
		showSystemConfig: false,
		showDeadlineBadges: true,
		showAreas: true,
		hiddenAreaIds: new Set(),
		colorOverrides: new Map(),
		areaOverrides: new Map(),
		selectedIds: [],
		selectedAreaId: null,
		sidebarOpen: false,
		appearanceOpen: false,
		scheduleOpen: true,
		sidebarWidth: 320,
		showDeadlines: true,
		showRemainingWork: true,
		view: null,
		sidebarScroll: 0,
		scheduleScroll: 0
	};
}
// Documents and override maps are immutable; panning should not reserialize every graph.
const yamlCache = new WeakMap<
	GraphFile,
	WeakMap<
		ExplorerState['colorOverrides'],
		WeakMap<ExplorerState['areaOverrides'], string>
	>
>();
export function explorerYaml(state: ExplorerState): string | null {
	if (!state.graphData) return null;
	let colors = yamlCache.get(state.graphData);
	if (!colors) {
		colors = new WeakMap();
		yamlCache.set(state.graphData, colors);
	}
	let areas = colors.get(state.colorOverrides);
	if (!areas) {
		areas = new WeakMap();
		colors.set(state.colorOverrides, areas);
	}
	let yaml = areas.get(state.areaOverrides);
	if (yaml === undefined) {
		yaml = serializeToYAML(
			state.graphData,
			state.colorOverrides,
			state.areaOverrides
		);
		areas.set(state.areaOverrides, yaml);
	}
	return yaml;
}
export function explorerDirty(state: ExplorerState): boolean {
	return explorerYaml(state) !== state.baselineYaml;
}
export function downloadExplorer(state: ExplorerState): void {
	const yaml = explorerYaml(state);
	if (yaml === null) return;
	const url = URL.createObjectURL(new Blob([yaml], { type: 'text/yaml' }));
	const a = document.createElement('a');
	a.href = url;
	a.download = (state.filename.replace(/\.\w+$/, '') || 'graph') + '.yaml';
	a.click();
	setTimeout(() => URL.revokeObjectURL(url), 1000);
}
