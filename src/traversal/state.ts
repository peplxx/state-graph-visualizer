import { z } from 'zod';
import { graphSchema } from '../workspace/explorerState';
import { PRESETS } from './api';
import { expand, replayEvent, seed } from './engine';
import type { Run, SimulatorState, TraversalLibrary } from './types';
const prioritySchema = z.union([
	z.number().finite(),
	z.array(z.number().finite()).min(1)
]);
const nodeSchema = z.object({
	id: z.string(),
	label: z.string().optional(),
	metadata: z.record(z.string(), z.unknown()).optional(),
	tasks: z.array(
		z.object({
			c: z.number(),
			d: z.number(),
			release: z.enum(['up', 'down', 'none'])
		})
	),
	depth: z.number().int().nonnegative(),
	parentId: z.string().nullable(),
	insertionOrder: z.number().int().nonnegative()
});
const shapeSchema = z.number().int().nonnegative().nullable();
const snapshotSchema = z.object({
	step: z.number().int().nonnegative(),
	queue: z.array(z.object({ state: nodeSchema, priority: prioritySchema })),
	discovered: z.array(nodeSchema),
	expandedIds: z.array(z.string()),
	currentId: z.string().nullable(),
	shape: shapeSchema
});
const eventSchema = z.object({
	nodeId: z.string(),
	edges: z.array(
		z.object({
			source: z.string(),
			target: z.string(),
			type: z.enum(['normal', 'loop']),
			added: z.boolean()
		})
	),
	added: z.array(nodeSchema),
	priorities: z.array(z.object({ id: z.string(), priority: prioritySchema })),
	shape: shapeSchema
});
export const strategySchema = z.object({
	id: z.string().min(1),
	name: z.string().trim().min(1),
	source: z.string()
});
const appearanceSchema = z.object({
	showAreas: z.boolean(),
	hiddenAreaIds: z.array(z.string()),
	showDeadlineBadges: z.boolean()
});
export function defaultAppearance() {
	return { showAreas: true, hiddenAreaIds: [], showDeadlineBadges: true };
}
export const runSchema = z
	.object({
		id: z.string().min(1),
		name: z.string().trim().min(1),
		createdAt: z.string(),
		graph: graphSchema,
		appearance: appearanceSchema.optional(),
		filename: z.string(),
		starts: z.array(z.string()).min(1),
		initial: snapshotSchema,
		events: z.array(eventSchema),
		checkpoints: z.array(
			z.object({
				at: z.number().int().positive(),
				snapshot: snapshotSchema
			})
		),
		revisions: z
			.array(
				z.object({
					at: z.number().int().nonnegative(),
					source: z.string()
				})
			)
			.min(1)
	})
	.superRefine((run, ctx) => {
		try {
			let current = run.initial as import('./types').Snapshot;
			const initial = seed(run.graph, run.starts);
			if (
				JSON.stringify(initial.discovered) !==
					JSON.stringify(current.discovered) ||
				current.step !== 0 ||
				current.expandedIds.length ||
				current.currentId !== null ||
				current.queue.length !== initial.queue.length ||
				new Set(current.queue.map((e) => e.state.id)).size !==
					initial.queue.length
			)
				throw new Error();
			const check = () => {
				const known = new Map(current.discovered.map((s) => [s.id, s]));
				if (
					current.queue.some(
						(e) =>
							JSON.stringify(known.get(e.state.id)) !==
								JSON.stringify(e.state) ||
							(typeof e.priority === 'number'
								? 0
								: e.priority.length) !== current.shape
					)
				)
					throw new Error();
			};
			check();
			if (
				run.revisions[0].at !== 0 ||
				run.revisions.some(
					(r, i) =>
						r.at > run.events.length ||
						(i > 0 && r.at <= run.revisions[i - 1].at)
				)
			)
				throw new Error();
			for (const event of run.events) {
				if (current.queue[0]?.state.id !== event.nodeId)
					throw new Error();
				const expected = expand(run.graph, current);
				if (
					JSON.stringify(expected.event.added) !==
						JSON.stringify(event.added) ||
					JSON.stringify(expected.event.edges) !==
						JSON.stringify(event.edges)
				)
					throw new Error();
				current = replayEvent(
					current,
					event as import('./types').StepEvent
				);
				check();
			}
		} catch {
			ctx.addIssue({
				code: 'custom',
				message: 'Damaged traversal history.'
			});
		}
	});
export function validateRun(value: unknown): Run {
	const run = runSchema.parse(value) as Run;
	// Checkpoints are derived caches: rebuild from the authoritative event log.
	let snapshot = run.initial;
	run.checkpoints = [];
	run.events.forEach((event, i) => {
		snapshot = replayEvent(snapshot, event);
		if ((i + 1) % 64 === 0) run.checkpoints.push({ at: i + 1, snapshot });
	});
	return run;
}
const simulatorSchema = z.object({
	panelWidths: z
		.object({
			strategy: z.number().min(240).max(640),
			inspector: z.number().min(240).max(640)
		})
		.default({ strategy: 320, inspector: 276 }),
	appearance: appearanceSchema.default(defaultAppearance),
	graphData: graphSchema.nullable(),
	filename: z.string(),
	draft: z.string(),
	strategyId: z.string(),
	starts: z.array(z.string()),
	run: z.unknown().nullable(),
	cursor: z.number().int().nonnegative(),
	layout: z.enum(['radial', 'tree']),
	view: z
		.object({
			x: z.number().finite(),
			y: z.number().finite(),
			k: z.number().positive().max(10)
		})
		.nullable(),
	selectedIds: z.array(z.string()),
	speed: z.number().positive().max(20)
});
export function validateSimulator(value: unknown): SimulatorState {
	const parsed = simulatorSchema.parse(value);
	const run = parsed.run ? validateRun(parsed.run) : null;
	const state = {
		...parsed,
		run,
		cursor: Math.min(parsed.cursor, run?.events.length ?? 0)
	} as SimulatorState;
	if (run) {
		state.graphData = run.graph;
		state.filename = run.filename;
		state.appearance = run.appearance ?? state.appearance;
	}
	if (
		state.graphData &&
		state.starts.some(
			(id) => !state.graphData!.nodes.some((n) => n.id === id)
		)
	)
		throw new Error('Unknown traversal start node.');
	return state;
}
export function createSimulatorState(): SimulatorState {
	return {
		panelWidths: { strategy: 320, inspector: 276 },
		graphData: null,
		appearance: defaultAppearance(),
		filename: '',
		draft: PRESETS[0].source,
		strategyId: PRESETS[0].id,
		starts: [],
		run: null,
		cursor: 0,
		layout: 'radial',
		view: null,
		selectedIds: [],
		speed: 2
	};
}
export function emptyTraversalLibrary(seedDefaults = true): TraversalLibrary {
	return {
		defaultsInitialized: seedDefaults,
		strategies: seedDefaults
			? PRESETS.map(({ id, name, source }) => ({ id, name, source }))
			: [],
		records: []
	};
}
