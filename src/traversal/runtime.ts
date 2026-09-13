import type { GraphFile } from '../types/graph';
import type { Snapshot } from './types';
import type { CodeDiagnostic } from './compiler';
export class TraversalRuntime {
	private compiler: Worker | null = null;
	private evaluator: Worker | null = null;
	private nextId = 0;
	private pending = new Map<
		number,
		{
			resolve: (value: {
				js: string;
				diagnostics: CodeDiagnostic[];
			}) => void;
			reject: (reason: Error) => void;
		}
	>();
	private cancelEvaluation: (() => void) | null = null;
	compile(
		source: string
	): Promise<{ js: string; diagnostics: CodeDiagnostic[] }> {
		if (!this.compiler) {
			this.compiler = new Worker(
				new URL('./compiler.worker.ts', import.meta.url),
				{ type: 'module' }
			);
			this.compiler.onmessage = (event) => {
				const request = this.pending.get(event.data.id);
				if (!request) return;
				this.pending.delete(event.data.id);
				if (event.data.error)
					request.reject(new Error(event.data.error));
				else request.resolve(event.data);
			};
			this.compiler.onerror = () => {
				for (const request of this.pending.values())
					request.reject(
						new Error('Could not load the TypeScript compiler.')
					);
				this.pending.clear();
				this.compiler?.terminate();
				this.compiler = null;
			};
		}
		const id = this.nextId++;
		return new Promise((resolve, reject) => {
			this.pending.set(id, { resolve, reject });
			this.compiler!.postMessage({ id, source });
		});
	}
	evaluate(
		js: string,
		graph: GraphFile,
		snapshot: Snapshot
	): Promise<Snapshot> {
		this.cancelEvaluation?.();
		return new Promise((resolve, reject) => {
			const worker = new Worker(
				new URL('./evaluator.worker.ts', import.meta.url),
				{ type: 'module' }
			);
			this.evaluator = worker;
			let node = snapshot.queue[0]?.state.id ?? 'unknown';
			const cleanup = () => {
				clearTimeout(timer);
				worker.terminate();
				this.evaluator = null;
				this.cancelEvaluation = null;
			};
			const fail = (message: string) => {
				cleanup();
				reject(new Error(message));
			};
			const timer = setTimeout(
				() =>
					fail(
						`Node ${node}: priority computation exceeded 2 seconds.`
					),
				2000
			);
			this.cancelEvaluation = () => fail('Computation cancelled.');
			worker.onmessage = (event) => {
				if (event.data.node) {
					node = event.data.node;
					return;
				}
				if (event.data.error) fail(event.data.error);
				else {
					cleanup();
					resolve(event.data.result);
				}
			};
			worker.onerror = () =>
				fail(`Node ${node}: priority worker failed.`);
			worker.postMessage({ js, graph, snapshot });
		});
	}
	cancel() {
		this.cancelEvaluation?.();
	}
	dispose() {
		this.cancel();
		this.compiler?.terminate();
		this.compiler = null;
		for (const request of this.pending.values())
			request.reject(new Error('Compiler closed.'));
		this.pending.clear();
	}
}
