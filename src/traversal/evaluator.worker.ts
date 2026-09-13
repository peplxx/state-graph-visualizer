import { evaluate } from './engine';
import type { PriorityFunction, Snapshot } from './types';
import type { GraphFile } from '../types/graph';
function freeze(value: unknown, seen = new WeakSet<object>()) {
	if (
		value &&
		typeof value === 'object' &&
		!Object.isFrozen(value) &&
		!seen.has(value)
	) {
		seen.add(value);
		for (const child of Object.values(value)) freeze(child, seen);
		Object.freeze(value);
	}
}
self.onmessage = (
	event: MessageEvent<{ js: string; graph: GraphFile; snapshot: Snapshot }>
) => {
	try {
		const { js, graph, snapshot } = event.data;
		freeze(graph);
		freeze(snapshot);
		const fn = new Function(
			`"use strict";\n${js}\nreturn priority;`
		)() as PriorityFunction;
		const result = evaluate(graph, snapshot, (state, context) => {
			self.postMessage({ node: state.id });
			freeze(context);
			return fn(state, context);
		});
		self.postMessage({ result });
	} catch (error) {
		self.postMessage({
			error: error instanceof Error ? error.message : String(error)
		});
	}
};
