import { lazy, Suspense } from 'react';
import { API_TYPES } from './api';
const CodeBlock = lazy(() => import('../help/CodeBlock'));

function definition(name: string) {
	const start = API_TYPES.indexOf(`interface ${name} {`);
	const end = API_TYPES.indexOf('\ninterface ', start + 1);
	return API_TYPES.slice(start, end < 0 ? undefined : end).trim();
}
function Code({ source, title }: { source: string; title: string }) {
	return (
		<Suspense fallback={<pre>{source}</pre>}>
			<CodeBlock source={source} title={title} />
		</Suspense>
	);
}
export default function ApiReference() {
	return (
		<div className="api-guide">
			<section>
				<h2>1. Write a priority function</h2>
				<p>
					The simulator calls <code>priority</code> for each candidate
					in the queue. Your function returns its score; the candidate
					with the lowest score is expanded next. You control the
					order of exploration, while the simulator follows the
					transitions already present in the graph.
				</p>
				<Code
					title="priority.ts · A working BFS strategy"
					source={`function priority(
  state: TraversalState,
  context: TraversalContext
): Priority {
  return state.insertionOrder;
}`}
				/>
				<p>
					This example implements an ordinary FIFO queue: an earlier
					discovery has a smaller insertion number and is expanded
					first. Save it in Strategy editor, select it in the
					simulator, then click <strong>Start traversal</strong>.
				</p>
				<div className="api-note">
					A step expands one state and considers all its outgoing
					transitions, including loops. Each state is discovered once,
					so cycles never create repeated expansions.
				</div>
			</section>
			<section>
				<h2>2. Read the candidate state</h2>
				<p>
					<code>state</code> describes the candidate being scored. Its
					graph data stays fixed, and its discovery fields are
					assigned when it first enters the queue.
				</p>
				<Code
					title="TraversalState · The candidate"
					source={definition('TraversalState')}
				/>
				<dl className="api-field-list">
					<div>
						<dt>
							<code>id</code> and <code>label</code>
						</dt>
						<dd>
							The node’s unique ID and optional display label. Use
							the ID to look up a node in{' '}
							<code>context.graph.nodes</code>.
						</dd>
					</div>
					<div>
						<dt>
							<code>depth</code>
						</dt>
						<dd>
							Number of discovery edges from a start node. Starts
							have depth 0. This is the depth of the first
							discovery; a later, shorter route does not replace
							it.
						</dd>
					</div>
					<div>
						<dt>
							<code>parentId</code>
						</dt>
						<dd>
							The state that first discovered this candidate, or{' '}
							<code>null</code> for a start node.
						</dd>
					</div>
					<div>
						<dt>
							<code>insertionOrder</code>
						</dt>
						<dd>
							A growing number assigned on first discovery. The
							simulator also uses this number to break
							equal-priority ties.
						</dd>
					</div>
					<div>
						<dt>
							<code>metadata</code>
						</dt>
						<dd>
							Optional custom graph properties. Their values have
							type <code>unknown</code>; check their type before
							using them in arithmetic.
						</dd>
					</div>
				</dl>
				<h3>Tasks and unfinished work</h3>
				<p>
					<code>state.tasks</code> exposes a flat list of task values.{' '}
					<code>c</code> is remaining work, <code>d</code> is the
					state’s deadline value, and <code>release</code> preserves
					the graph’s release marker. A task with{' '}
					<code>c &gt; 0</code> is unfinished.
				</p>
				<Code
					title="TraversalTask · One task in the state"
					source={definition('TraversalTask')}
				/>
				<Code
					title="priority.ts · More unfinished tasks first"
					source={`function priority(state: TraversalState): Priority {
  const pending = state.tasks.filter(task => task.c > 0).length;
  return -pending;
}`}
				/>
				<p>
					Three unfinished tasks produce −3 and one produces −1. Since
					−3 is smaller, the state with more unfinished tasks goes
					first. This is the ordering used by the default Burmuakov
					2022 strategy.
				</p>
			</section>
			<section>
				<h2>3. Read the traversal context</h2>
				<p>
					<code>context</code> describes the run at evaluation time.
					All candidates in one evaluation receive the same context.
					It can support a priority that changes as exploration
					progresses.
				</p>
				<Code
					title="TraversalContext · Graph and run information"
					source={definition('TraversalContext')}
				/>
				<dl className="api-field-list">
					<div>
						<dt>
							<code>step</code>
						</dt>
						<dd>
							Number of completed expansions. It is 0 for the
							initial queue.
						</dd>
					</div>
					<div>
						<dt>
							<code>expandedIds</code>
						</dt>
						<dd>IDs of states already expanded at this moment.</dd>
					</div>
					<div>
						<dt>
							<code>queueIds</code>
						</dt>
						<dd>
							Candidate IDs in insertion order. This is not the
							sorted queue: scores are still being calculated, so
							the context does not include their priorities.
						</dd>
					</div>
					<div>
						<dt>
							<code>graph</code>
						</dt>
						<dd>
							The immutable graph snapshot attached to the run. It
							includes all nodes and edges, even unreachable
							nodes.
						</dd>
					</div>
					<div>
						<dt>
							<code>system</code>
						</dt>
						<dd>
							The optional system configuration, also available at{' '}
							<code>context.graph.system</code>. Check that it
							exists before reading it.
						</dd>
					</div>
				</dl>
				<p>
					The initial queue is evaluated before the first step. The
					queue is scored again as traversal proceeds, so the next
					state can change when the context changes. Moving backward
					or replaying recorded steps uses saved priorities and does
					not call your function again.
				</p>
			</section>
			<section>
				<h2>4. Combine several criteria</h2>
				<Code
					title="Priority · The return value"
					source="type Priority = number | readonly number[];"
				/>
				<p>
					Return a number for one criterion, or a nonempty tuple for
					several. Tuples are compared from left to right: the first
					unequal component decides the order.
				</p>
				<Code
					title="priority.ts · Depth, then unfinished tasks"
					source={`function priority(state: TraversalState): Priority {
  const pending = state.tasks.filter(task => task.c > 0).length;
  return [state.depth, -pending];
}`}
				/>
				<p>
					Here depth comes first. At the same depth, more unfinished
					tasks win. For example, <code>[1, -3]</code> goes before{' '}
					<code>[1, -1]</code>, and both go before{' '}
					<code>[2, -5]</code>. Equal tuples keep discovery order.
				</p>
				<div className="api-note">
					Use one return shape throughout a run: all numbers, or all
					tuples with the same length. Every component must be finite.
					Empty tuples, NaN and infinity are rejected.
				</div>
			</section>
			<section>
				<h2>5. Apply code and handle errors</h2>
				<p>
					Functions are synchronous TypeScript without imports. Inputs
					are read-only. Keep functions pure: use their arguments
					instead of random values or the current time to make new
					runs reproducible. The editor offers type diagnostics and{' '}
					<kbd>Ctrl</kbd> + <kbd>Space</kbd> field hints.
				</p>
				<p>
					<strong>Apply at step</strong> uses your code from the
					selected timeline position. The existing prefix is kept, the
					queue is recalculated and future steps form a new branch.
					The previous branch remains a saved recording.
				</p>
				<p>
					A type error, exception or invalid score stops the operation
					without committing an unfinished step. Check the reported
					node and diagnostics, fix the function, then apply again. An
					evaluation that exceeds 2 seconds is terminated so the
					interface stays responsive.
				</p>
				<p>
					Guard arithmetic explicitly. For example, a ratio needs a
					defined result when its denominator is zero; use a finite
					fallback rather than infinity.
				</p>
			</section>
			<section>
				<h2>6. Inspect graph and system data</h2>
				<p>
					These types describe <code>context.graph</code>. They retain
					the graph’s original structure and formatting. In
					particular, <code>GraphNode.tasks</code> uses nested task
					objects; <code>state.tasks</code> provides the flat form
					shown earlier for convenient scoring.
				</p>
				<Code
					title="GraphNode · Original node data"
					source={definition('GraphNode')}
				/>
				<p>
					Edges identify their endpoints by node ID. Their{' '}
					<code>type</code> distinguishes normal transitions from
					loopbacks; both are considered during expansion.
				</p>
				<Code
					title="GraphEdge · One transition"
					source={definition('GraphEdge')}
				/>
				<p>
					The system configuration holds the processor count, when
					supplied, and task parameters defined for the graph. These
					are separate from the changing task values stored on each
					state.
				</p>
				<Code
					title="SystemConfig · Graph-wide task parameters"
					source={definition('SystemConfig')}
				/>
				<p>
					Areas group nodes by ID and retain their labels and
					appearance. They are available to inspect, but do not change
					traversal on their own.
				</p>
				<Code
					title="GraphArea · Groups and appearance"
					source={definition('GraphArea')}
				/>
			</section>
		</div>
	);
}
