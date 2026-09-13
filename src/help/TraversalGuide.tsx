import Screenshot from './Screenshot';

const sections = [
	['start', 'First run'],
	['step', 'What a step does'],
	['queue', 'Graph & queue'],
	['timeline', 'Timeline'],
	['strategies', 'Choose a strategy'],
	['edit', 'Write your own'],
	['branch', 'Change the order'],
	['records', 'Save & replay'],
	['errors', 'Fix a problem']
] as const;

export default function TraversalGuide({
	onOpenApi
}: {
	onOpenApi: () => void;
}) {
	return (
		<div className="traversal-guide">
			<p>
				The simulator answers one question:{' '}
				<strong>which state should we explore next?</strong> It keeps
				discovered states in a waiting queue, uses your strategy to put
				them in order, and explores one state per step. You can watch
				that order unfold, go back to any recorded step, and try a
				different strategy from there.
			</p>
			<p>
				The graph is already defined by your file. A run follows its
				existing transitions; it does not generate new states, change
				task values, or prune the graph. A traversal step counts a state
				expansion, not a unit of time in a task schedule.
			</p>
			<div
				className="explorer-guide-jumps"
				role="group"
				aria-label="Simulator guide sections"
			>
				{sections.map(([id, label]) => (
					<button
						key={id}
						onClick={() =>
							document
								.getElementById(`traversal-help-${id}`)
								?.scrollIntoView({ block: 'start' })
						}
					>
						{label}
					</button>
				))}
			</div>

			<section id="traversal-help-start">
				<h2>1. Start your first run</h2>
				<ol className="traversal-guide-steps">
					<li>
						<strong>Open a graph in the simulator.</strong> Choose
						New window → Traversal Simulator, then a graph from your
						library. Upload a graph first if the library is empty.
						Each simulator window has its own independent run.
					</li>
					<li>
						<strong>Choose BFS in Priority strategy.</strong> This
						is an ordinary first-in, first-out queue: the earliest
						discovered state is explored first. Selecting a strategy
						loads its code into the panel.
					</li>
					<li>
						<strong>Check Start nodes.</strong> All nodes marked as
						initial are selected by default, in file order. If none
						are marked, the first node is selected. You can choose
						one or several starts before running; at least one is
						required.
					</li>
					<li>
						<strong>Click Start traversal.</strong> The starts enter
						the queue and receive their priorities. You are now at
						step 0: nothing has been expanded yet. The node with
						badge #1 is next.
					</li>
					<li>
						<strong>Click Next step.</strong> Watch the first node
						leave the queue and its newly discovered neighbors join
						it. Repeat a few steps before trying Play or To end.
					</li>
				</ol>
				<Screenshot
					name="traversal"
					alt="A BFS run at step 1: the initial node is expanded and three discovered states wait in the priority queue"
				/>
			</section>

			<section id="traversal-help-step">
				<h2>2. Understand what happens in one step</h2>
				<p>
					The simulator removes the first state from the ordered queue
					and marks it as expanded. It then considers{' '}
					<strong>every outgoing transition</strong>, including
					loopback edges. A target that has never been discovered
					joins the queue. A target already waiting or already
					expanded is counted as a repeat and is not added again.
				</p>
				<p>
					The strategy evaluates the whole remaining queue, including
					new arrivals, so the displayed order is ready for the next
					step. Existing entries can move when a strategy depends on
					the current step or the set of expanded states.
				</p>
				<div className="traversal-guide-example">
					<h3>A small BFS walkthrough</h3>
					<p>
						Start at A. Its edges lead to B, then C. Both B and C
						lead to D, and D has an edge back to A.
					</p>
					<div className="traversal-guide-table-wrap">
						<table>
							<thead>
								<tr>
									<th scope="col">Step</th>
									<th scope="col">Expanded</th>
									<th scope="col">Queue, next first</th>
									<th scope="col">What changed</th>
								</tr>
							</thead>
							<tbody>
								<tr>
									<th scope="row">0</th>
									<td>—</td>
									<td>A</td>
									<td>The start is ready.</td>
								</tr>
								<tr>
									<th scope="row">1</th>
									<td>A</td>
									<td>B → C</td>
									<td>B and C are discovered.</td>
								</tr>
								<tr>
									<th scope="row">2</th>
									<td>B</td>
									<td>C → D</td>
									<td>D joins behind C.</td>
								</tr>
								<tr>
									<th scope="row">3</th>
									<td>C</td>
									<td>D</td>
									<td>
										D is already queued, so the repeat is
										skipped.
									</td>
								</tr>
								<tr>
									<th scope="row">4</th>
									<td>D</td>
									<td>Empty</td>
									<td>
										A is already expanded. The run is
										complete.
									</td>
								</tr>
							</tbody>
						</table>
					</div>
					<p>
						Each state is expanded once, even with a shared
						descendant and a cycle. A disconnected state E would
						stay unopened throughout.
					</p>
				</div>
			</section>

			<section id="traversal-help-queue">
				<h2>3. Read the graph and the queue together</h2>
				<dl className="api-field-list">
					<div>
						<dt>Unopened</dt>
						<dd>
							Very faint nodes have not been discovered from the
							chosen starts.
						</dd>
					</div>
					<div>
						<dt>Queued</dt>
						<dd>
							Partly transparent nodes are waiting. Their #1, #2,
							… badges match the rows in Inspect → Queue.
						</dd>
					</div>
					<div>
						<dt>Expanded</dt>
						<dd>
							Fully visible nodes have already had their outgoing
							transitions considered.
						</dd>
					</div>
					<div>
						<dt>Current</dt>
						<dd>
							The highlighted outline marks the state expanded in
							the selected step. It is different from #1, which is
							the next state to expand.
						</dd>
					</div>
				</dl>
				<p>
					Queue rows show the position, state ID and priority.{' '}
					<strong>Smaller values go first</strong>: −3 precedes 0,
					which precedes 2. For a tuple, compare the first numbers,
					then the next numbers if tied: [1, 9] precedes [2, 0]. Equal
					priorities keep discovery order. A priority is a sorting
					value; it is not a probability or the node’s position in the
					queue.
				</p>
				<p>
					Click a queue row to focus its node. Selecting or hovering
					over a node helps you inspect the graph; it does not move
					the timeline or choose the next expansion. Arrows become
					more visible as their states approach expansion. The graph
					layout stays stable as you step.
				</p>
				<p>
					Use Radial or Tree, zoom controls and Fit graph to adjust
					the view. The toolbar can hide and reopen the strategy and
					inspector panels. Drag either panel’s inner divider to
					resize it; a focused divider also accepts arrow keys.
					Double-click the divider to reset its width.
				</p>
				<Screenshot
					name="traversal-queue"
					alt="Two expanded states and four queued states: numbered graph badges match the ordered queue on the right"
				/>
			</section>

			<section id="traversal-help-timeline">
				<h2>4. Step, play and rewind</h2>
				<p>
					<strong>Step 3 of 8</strong> means you are viewing the third
					expansion out of eight already recorded expansions. It does
					not mean that the graph has eight nodes. The recorded length
					grows as you compute more steps.
				</p>
				<dl className="api-field-list">
					<div>
						<dt>Go to start / Previous</dt>
						<dd>
							Return to the initial queue or move back one
							recorded expansion. This pauses playback.
						</dd>
					</div>
					<div>
						<dt>Next step</dt>
						<dd>
							Move forward one recorded step. At the end of
							recorded history, compute one new expansion if the
							queue is not empty.
						</dd>
					</div>
					<div>
						<dt>Play / Pause</dt>
						<dd>
							Advance automatically at the chosen Speed, in steps
							per second. Pause to inspect the current queue and
							graph.
						</dd>
					</div>
					<div>
						<dt>To end / Cancel</dt>
						<dd>
							Advance through the remaining traversal without
							animating each step, keeping a replayable history.
							Cancel stops the operation.
						</dd>
					</div>
					<div>
						<dt>Slider / Step field</dt>
						<dd>
							Jump to any already recorded step. To reach a step
							that has not been computed, use Next step, Play or
							To end.
						</dd>
					</div>
				</dl>
				<p>
					Below the slider, read which node was expanded, how many
					states were added, and how many repeats were skipped. Open
					the transition details to see each edge’s result.{' '}
					<strong>Strategy at this step</strong> shows the applied
					code for that point in history.
				</p>
				<p>
					Rewinding restores the graph’s traversal shading, queue and
					actual priorities together. Replaying saved steps does not
					run the code again. Once you pass the last recorded step,
					new steps use the applied strategy. A run is{' '}
					<strong>Complete</strong> when its queue is empty;
					unreachable nodes can still be unopened. To replay a
					complete run, go back to the start and press Play.
				</p>
				<Screenshot
					name="traversal-timeline"
					alt="Replaying step 5 of a nine-step recording, with the three already-discovered loop targets shown below the timeline"
				/>
			</section>

			<section id="traversal-help-strategies">
				<h2>5. Choose what goes first</h2>
				<p>
					Your initial My strategies library contains six editable
					strategies. These descriptions refer to their original code;
					your saved edits can change their behavior.
				</p>
				<dl className="api-field-list">
					<div>
						<dt>BFS</dt>
						<dd>
							Explore states in the order they were discovered. A
							good starting point for understanding the graph.
						</dd>
					</div>
					<div>
						<dt>Hybrid Slack 1</dt>
						<dd>
							Combine the largest deadline value, weighted active
							jobs and weighted remaining work. Tasks later in the
							task list have larger weights.
						</dd>
					</div>
					<div>
						<dt>Hybrid Slack 2</dt>
						<dd>
							Use a similar weighted score, with extra emphasis on
							remaining work relative to the deadline.
						</dd>
					</div>
					<div>
						<dt>Slack 1</dt>
						<dd>
							Add each task’s value of 1 − c/d. A zero deadline
							contributes 1. States with a smaller total come
							first.
						</dd>
					</div>
					<div>
						<dt>Slack 2</dt>
						<dd>
							Divide the sum of deadlines by the sum of remaining
							work. States with no remaining work receive a very
							large priority and wait behind finite smaller
							scores.
						</dd>
					</div>
					<div>
						<dt>Burmuakov 2022</dt>
						<dd>
							Explore states with more unfinished jobs first: each
							task with c &gt; 0 counts as unfinished.
						</dd>
					</div>
				</dl>
				<p>
					Here c is remaining work and d is the deadline value stored
					in a state. The strategies change queue ordering only.
					Choosing a paper’s ordering criterion does not run its
					entire analysis or pruning algorithm.
				</p>
			</section>

			<section id="traversal-help-edit">
				<h2>6. Write and reuse your own strategy</h2>
				<p>
					For a quick experiment, edit the TypeScript function in the
					simulator’s Priority strategy panel. For library management
					and more editing space, choose{' '}
					<strong>Open strategy editor</strong> above the selector. It
					opens a separate workspace tab, so you can return to the
					simulator without losing your place.
				</p>
				<Screenshot
					name="strategies"
					alt="Strategy editor: saved strategies and drafts on the left, multiple strategy tabs and a TypeScript editor on the right"
				/>
				<ol className="traversal-guide-steps">
					<li>
						Select a saved strategy on the left, or choose{' '}
						<strong>New strategy</strong> and give it a name. Open
						several strategies and switch between their code tabs to
						compare them.
					</li>
					<li>
						Edit the function. Syntax highlighting, diagnostics and
						Ctrl+Space field hints help you use the state and
						context inputs.
					</li>
					<li>
						Save the strategy to make it available in the library.
						Return to the simulator, select the saved strategy to
						load its latest code, then choose Start traversal or
						Apply at step.
					</li>
				</ol>
				<p>
					Closing a code tab keeps its draft. Use the draft’s trash
					button to remove it. Deleting a saved strategy asks for
					confirmation. Saving code and applying it to a run are
					separate actions:
					<strong>
						{' '}
						editing or saving a function does not change an existing
						traversal by itself.
					</strong>
				</p>
				<button className="help-link" onClick={onOpenApi}>
					Read the priority function API: inputs, return values and
					examples
				</button>
			</section>

			<section id="traversal-help-branch">
				<h2>7. Try a different order from the middle</h2>
				<p>
					Suppose you have recorded eight steps and want to try
					another strategy after step 3. Pause, move the timeline to
					3, choose or edit the function, then click{' '}
					<strong>Apply at step 3</strong>.
				</p>
				<ol className="traversal-guide-steps">
					<li>The first three expansions remain unchanged.</li>
					<li>
						The waiting queue at step 3 receives new priorities. Its
						#1 can change immediately, without expanding a node.
					</li>
					<li>
						The old eight-step history is automatically kept as a
						separate recording. The new branch starts with the
						three-step prefix; its later steps will be computed
						using the newly applied code.
					</li>
				</ol>
				<p>
					Press Next step or Play to continue the new branch. If
					applying the code fails, the existing run remains intact. To
					start again with different start nodes, choose{' '}
					<strong>New run</strong>; this saves the previous run and
					returns to setup.
				</p>
			</section>

			<section id="traversal-help-records">
				<h2>8. Keep a strategy, save a recording</h2>
				<p>
					A <strong>strategy</strong> is reusable code that can order
					the queue on different graphs. A <strong>recording</strong>{' '}
					is what actually happened in one run: its graph snapshot,
					start nodes, code versions, computed steps and priorities.
					Save a strategy to use the same rule elsewhere; save a
					recording to revisit the same exploration.
				</p>
				<ol className="traversal-guide-steps">
					<li>
						Open <strong>Inspect → Records</strong>, enter a name
						and choose Save recording. You can save a partial run as
						well as a complete one.
					</li>
					<li>
						Use the scrollable saved recordings list to open, rename
						or delete a recording. You can also reach recordings
						from New window → Traversal Simulator → Open saved
						recordings.
					</li>
					<li>
						An opened recording starts paused at step 0. Replay its
						saved history, or continue a partial run beyond its last
						computed step.
					</li>
				</ol>
				<p>
					The browser also autosaves your open simulator, draft,
					timeline position and view settings. Refreshing restores
					your position on pause; saved code is not executed
					automatically. Named strategies and saved recordings survive
					closing their windows.
				</p>
				<p>
					Each recording keeps its own graph, so later Explorer edits
					or removing a graph from the library do not alter it. To
					compare the same strategy on another graph, open a new
					simulator for that graph and select the strategy. Storage
					belongs to this browser profile; clearing site data removes
					the saved workspace.
				</p>
				<Screenshot
					name="traversal-records"
					alt="The Records panel with a named BFS recording, its step count, and controls to open, rename or delete it"
				/>
			</section>

			<section id="traversal-help-errors">
				<h2>9. When something does not behave as expected</h2>
				<dl className="api-field-list">
					<div>
						<dt>The order did not change</dt>
						<dd>
							Check whether the edited code has been applied.
							Replaying old steps always shows their recorded
							priorities. Apply at the selected step to create a
							different continuation.
						</dd>
					</div>
					<div>
						<dt>A node stays faint</dt>
						<dd>
							It may not have been reached yet, or there may be no
							directed path to it from the chosen starts. A
							complete traversal only covers reachable nodes.
						</dd>
					</div>
					<div>
						<dt>A transition is skipped</dt>
						<dd>
							Its target was already discovered, possibly by
							another parent. The edge was considered; the
							simulator simply avoids queueing the same state
							twice.
						</dd>
					</div>
					<div>
						<dt>The function has an error</dt>
						<dd>
							Read the diagnostic and, for an evaluation error,
							the reported state. Return a finite number or a
							nonempty tuple of finite numbers. Keep the same
							result kind and tuple length throughout a run; NaN
							and infinity are invalid.
						</dd>
					</div>
					<div>
						<dt>Evaluation times out</dt>
						<dd>
							The function must finish synchronously. An
							evaluation that exceeds two seconds is stopped. Fix
							an endless loop or expensive calculation, then apply
							again. A failed evaluation does not commit an
							unfinished step.
						</dd>
					</div>
				</dl>
			</section>
		</div>
	);
}
