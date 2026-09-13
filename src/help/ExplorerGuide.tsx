import {
	Keyboard,
	Move,
	MousePointer2,
	Mouse,
	Scan,
	Layers,
	X
} from 'lucide-react';
import Screenshot from './Screenshot';

const sections = [
	['navigate', 'Navigate'],
	['inspect', 'Inspect states'],
	['schedule', 'Read schedules'],
	['selection', 'Compare & select'],
	['appearance', 'Style nodes'],
	['areas', 'Manage areas'],
	['view', 'View options'],
	['save', 'Save & export']
] as const;

export default function ExplorerGuide() {
	return (
		<div className="explorer-guide">
			<section
				className="explorer-shortcuts"
				aria-label="Explorer keyboard and mouse shortcuts"
			>
				<div className="shortcut-banner-heading">
					<div>
						<span>QUICK CONTROLS</span>
						<h2>Your graph, at your fingertips.</h2>
					</div>
					<Keyboard size={32} strokeWidth={1.3} />
				</div>
				<div className="shortcut-grid">
					<div>
						<Move size={17} />
						<span>
							<strong>Move the canvas</strong>
							<span>
								<kbd>Space</kbd> + drag
							</span>
							<small>Or drag with the middle mouse button</small>
						</span>
					</div>
					<div>
						<Mouse size={17} />
						<span>
							<strong>Zoom in or out</strong>
							<span>
								<kbd>Scroll wheel</kbd>
							</span>
							<small>Use Fit all to return to an overview</small>
						</span>
					</div>
					<div>
						<MousePointer2 size={17} />
						<span>
							<strong>Inspect a state</strong>
							<span>
								<kbd>Click</kbd> a node
							</span>
							<small>Hover for task values and a root path</small>
						</span>
					</div>
					<div>
						<Layers size={17} />
						<span>
							<strong>Add or remove a node</strong>
							<span>
								<kbd>Ctrl</kbd> / <kbd>⌘</kbd> + click
							</span>
							<small>
								Build a selection without losing other nodes
							</small>
						</span>
					</div>
					<div>
						<Scan size={17} />
						<span>
							<strong>Draw a lasso</strong>
							<span>
								<kbd>Shift</kbd> + drag
							</span>
							<small>
								Also hold Ctrl / ⌘ to add to the selection
							</small>
						</span>
					</div>
					<div>
						<X size={17} />
						<span>
							<strong>Clear the selection</strong>
							<span>
								<kbd>Esc</kbd>
							</span>
							<small>Or click an empty part of the canvas</small>
						</span>
					</div>
				</div>
			</section>
			<div
				className="explorer-guide-jumps"
				aria-label="Explorer guide sections"
			>
				{sections.map(([id, label]) => (
					<button
						key={id}
						onClick={() =>
							document
								.getElementById(`explorer-help-${id}`)
								?.scrollIntoView({ block: 'start' })
						}
					>
						{label}
					</button>
				))}
			</div>
			<section id="explorer-help-navigate">
				<h2>Navigate the state space</h2>
				<p>
					Open <strong>New window → Explorer</strong> and choose a
					loaded graph. Each Explorer keeps its own selection, layout
					and view. Return to it using its workspace tab.
				</p>
				<p>
					<strong>Tree</strong> arranges the graph in levels;{' '}
					<strong>Radial</strong> places those levels around the
					centre. Change the layout in the toolbar, use the zoom
					buttons or scroll wheel, and choose <strong>Fit all</strong>{' '}
					to bring the whole graph into view.
				</p>
				<p>
					Type an exact node ID, such as <code>n8</code>, into{' '}
					<strong>Find node by ID…</strong> to centre and select that
					node. The search locates a state without filtering the
					graph. Hold <kbd>Space</kbd> while dragging to move the
					canvas.
				</p>
				<Screenshot
					name="explorer-radial"
					alt="Radial layout of the example graph, with the layout and navigation controls visible"
				/>
			</section>
			<section id="explorer-help-inspect">
				<h2>Inspect a state and its connections</h2>
				<p>
					Hover over a node for its ID and task values. When nothing
					is selected, hovering highlights a path from the initial
					state through normal transitions. Click a node to keep it
					selected and open <strong>Node Details</strong>.
				</p>
				<dl className="api-field-list">
					<div>
						<dt>Task States</dt>
						<dd>
							Each row shows remaining work <code>c</code>, the
							deadline value <code>d</code> and the release
							marker. <strong>↑</strong> marks a released job;{' '}
							<strong>↓</strong> marks a completing job.
						</dd>
					</div>
					<div>
						<dt>Deadline warnings</dt>
						<dd>
							A task with <code>c &gt; d</code> is highlighted
							because its remaining work exceeds the time
							available. Optional warning badges flag such states
							on the graph.
						</dd>
					</div>
					<div>
						<dt>Connectivity</dt>
						<dd>
							In-degree counts incoming edges; out-degree counts
							outgoing edges. Selecting a node also emphasizes its
							immediate connections on the canvas.
						</dd>
					</div>
				</dl>
				<Screenshot
					name="explorer-inspect"
					alt="Selected node n8 with task states, a scheduling diagram and connectivity details"
				/>
				<p>
					Drag the inner edge of the sidebar to resize it, or
					double-click the divider to restore its default width. When
					the divider has keyboard focus, the left and right arrows
					adjust its width. Scroll the panel to see further details;
					the close button clears the selection.
				</p>
			</section>
			<section id="explorer-help-schedule">
				<h2>Read the execution history</h2>
				<p>
					When the graph includes a system configuration, expand{' '}
					<strong>Schedule</strong> in Node Details. The diagram
					reconstructs an execution history along a shortest path from
					the first initial state to the selected node. It uses the
					loaded states and transitions; it does not run the traversal
					strategy.
				</p>
				<ul>
					<li>
						<strong>Deadlines</strong> shows or hides the deadline
						markers associated with released jobs.
					</li>
					<li>
						<strong>Remaining work</strong> shows an estimate after
						the selected state, assuming continuous execution.
						Deadline violations remain visible even when this
						estimate is hidden.
					</li>
					<li>
						<strong>SVG</strong> exports the individual diagram.
						Scroll horizontally when the time axis extends beyond
						the panel.
					</li>
				</ul>
				<p>
					An initial state has no execution history yet. If no path is
					available, the panel says so instead of showing a diagram.
					System task parameters and the processor count can be viewed
					separately through{' '}
					<strong>View → Show system config</strong>.
				</p>
			</section>
			<section id="explorer-help-selection">
				<h2>Select a group and compare schedules</h2>
				<p>
					Hold <kbd>Ctrl</kbd> or <kbd>⌘</kbd> while clicking to add
					or remove individual nodes. For a larger group, hold{' '}
					<kbd>Shift</kbd> and drag a lasso around the nodes. Add{' '}
					<kbd>Ctrl</kbd> / <kbd>⌘</kbd> to retain the previous
					selection.
				</p>
				<p>
					The <strong>Selection</strong> panel lists the selected IDs
					and counts internal edges, incoming edges from outside the
					group, outgoing edges to the rest of the graph, and the sum
					of node degrees. You can apply one appearance to the whole
					selection or turn it into an area.
				</p>
				<p>
					With system data present, expand <strong>Schedules</strong>{' '}
					to compare execution histories. Each selected node has its
					own diagram, with a shared time range and synchronized
					horizontal scrolling.
				</p>
				<Screenshot
					name="explorer-selection"
					alt="Two selected states with their schedules aligned in the Selection panel"
				/>
			</section>
			<section id="explorer-help-appearance">
				<h2>Give nodes a visual meaning</h2>
				<p>
					Expand <strong>Appearance</strong> for one node or a group.
					Choose a <strong>Fill</strong> and <strong>Border</strong>{' '}
					colour, then add <strong>Diagonal</strong> or{' '}
					<strong>Cross</strong> hatching, or choose{' '}
					<strong>None</strong>. A group edit applies to every
					selected node.
				</p>
				<p>
					Use <strong>Reset</strong> beside a property to remove that
					override and return to the graph’s original value.
					Formatting helps distinguish states without changing their
					task values or transitions.
				</p>
				<Screenshot
					name="explorer-appearance"
					alt="Appearance controls with fill and border palettes and hatching, applied to node n8"
				/>
			</section>
			<section id="explorer-help-areas">
				<h2>Group related states into areas</h2>
				<ol>
					<li>
						Select one or more nodes and choose{' '}
						<strong>Create area from selection</strong>.
					</li>
					<li>
						Enter a label in the Area panel. Leave the field to
						apply it, then use the position picker to place the
						label around or inside the area.
					</li>
					<li>
						Set the area’s fill, border and hatch in{' '}
						<strong>Appearance</strong>. Area styling is independent
						of the nodes’ own colours.
					</li>
				</ol>
				<Screenshot
					name="explorer-areas"
					alt="A labelled area around two nodes with area appearance and label position controls"
				/>
				<p>
					To move nodes to an existing area, select them and choose it
					in <strong>Area</strong> or <strong>Assign to Area</strong>.
					Choosing <strong>None</strong> removes the selected nodes
					from their areas. Assigning nodes to a new area removes
					their previous memberships.
				</p>
				<p>
					Enable <strong>View → Show areas list</strong> to browse
					areas. Select an area for editing, use its node-selection
					button to select all members, or toggle its eye icon to hide
					its overlay. The toolbar’s <strong>Areas</strong> toggle
					controls all area overlays at once; hidden overlays do not
					hide their nodes.
				</p>
				<p>
					Deleting an area asks for confirmation and removes the
					grouping and its appearance. Its nodes and graph transitions
					remain in place.
				</p>
			</section>
			<section id="explorer-help-view">
				<h2>Choose what stays visible</h2>
				<p>
					The toolbar toggles <strong>Transitions</strong>,{' '}
					<strong>Returns</strong> and <strong>Areas</strong>{' '}
					independently. Normal transitions use solid arrows; return
					transitions use dashed arrows. Hide a layer temporarily to
					read a dense graph more easily.
				</p>
				<Screenshot
					name="explorer-view"
					alt="View menu with animation, legend, system configuration, areas list and deadline warning options"
				/>
				<dl className="api-field-list">
					<div>
						<dt>Animation</dt>
						<dd>
							Animate the graph’s appearance when it is drawn or
							its layout changes.
						</dd>
					</div>
					<div>
						<dt>Show legend</dt>
						<dd>
							Explain edge styles, release markers and the thicker
							initial-state border.
						</dd>
					</div>
					<div>
						<dt>Show system config</dt>
						<dd>
							Display the original task parameters and processor
							count, when the graph provides them.
						</dd>
					</div>
					<div>
						<dt>Show areas list</dt>
						<dd>
							Show the area browser when the graph contains areas.
						</dd>
					</div>
					<div>
						<dt>Deadline warning badges</dt>
						<dd>
							Show or hide the warning markers on states with a
							task whose remaining work exceeds its deadline
							value.
						</dd>
					</div>
				</dl>
			</section>
			<section id="explorer-help-save">
				<h2>Save, export and continue in the simulator</h2>
				<dl className="api-field-list">
					<div>
						<dt>Save</dt>
						<dd>
							Commit the current graph edits to your browser’s
							graph library. A dot on the tab indicates unsaved
							document changes.
						</dd>
					</div>
					<div>
						<dt>Download YAML</dt>
						<dd>
							Download the current graph, including its formatting
							and area edits, as a reusable YAML file.
						</dd>
					</div>
					<div>
						<dt>Export</dt>
						<dd>
							Download the graph as SVG for use in documents and
							presentations. The Schedule panel has a separate SVG
							export for its diagram.
						</dd>
					</div>
				</dl>
				<p>
					The workspace restores your tabs, view, selection and panel
					settings in this browser. Closing an Explorer with unsaved
					graph edits asks you to save or discard them. Download YAML
					when you need a portable file outside browser storage.
				</p>
				<p>
					Choose <strong>New window → Traversal Simulator</strong> and
					select the same graph to explore it with a priority
					strategy. The new run captures the graph’s formatting from
					its open Explorer, including unsaved appearance edits. Later
					Explorer changes do not alter an existing run.
				</p>
			</section>
		</div>
	);
}
