import { expect, test } from 'bun:test';
import ts from 'typescript';
import { PRESETS } from '../src/traversal/api';
import type { TraversalState } from '../src/traversal/types';
const functions = Object.fromEntries(
	PRESETS.map((preset) => [
		preset.id,
		new Function(`${ts.transpile(preset.source)}; return priority;`)()
	])
);
const state = (jobs: number[][], insertionOrder = 0): TraversalState => ({
	id: 'test',
	tasks: jobs.map(([c, d]) => ({ c, d, release: 'none' })),
	depth: 99,
	parentId: null,
	insertionOrder
});
test('built-in library has the six requested strategies and no DFS', () => {
	expect(PRESETS.map((preset) => preset.id)).toEqual([
		'bfs',
		'myslack1',
		'myslack2',
		'slack1',
		'slack2',
		'pending'
	]);
});
test('Slack functions match the attached C++ equations and one-based job weights', () => {
	const input = state([
		[2, 5],
		[0, 0],
		[3, 7]
	]);
	expect(functions.myslack1(input, {})).toBe(0);
	expect(functions.myslack2(input, {})).toBeCloseTo(-26.65714285714286, 10);
	expect(functions.slack1(input, {})).toBeCloseTo(2.1714285714285713, 10);
	expect(functions.slack2(input, {})).toBe(2.4);
	expect(functions.pending(input, {})).toBe(-2);
});
test('zero deadlines and no remaining work preserve the C++ branches without Infinity', () => {
	expect(functions.slack1(state([[2, 0]]), {})).toBe(1);
	expect(functions.myslack2(state([[2, 0]]), {})).toBe(-7);
	expect(
		functions.slack2(
			state([
				[0, 5],
				[0, 7]
			]),
			{}
		)
	).toBe(Number.MAX_VALUE);
	for (const priority of Object.values(functions))
		expect(Number.isFinite(priority(state([]), {}))).toBe(true);
});
test('BFS uses FIFO insertion order independently of graph depth', () => {
	expect(functions.bfs(state([], 7), {})).toBe(7);
	expect(functions.bfs({ ...state([], 8), depth: 0 }, {})).toBe(8);
});
