import { defaultAppearance } from './state';
import React, {
	lazy,
	Suspense,
	useEffect,
	useId,
	useMemo,
	useRef,
	useState
} from 'react';
import {
	Play,
	Pause,
	SkipBack,
	ChevronLeft,
	ChevronRight,
	ChevronsRight,
	RotateCcw,
	ZoomIn,
	ZoomOut,
	Maximize,
	Code2,
	ListOrdered,
	Save,
	X,
	CheckCircle2
} from 'lucide-react';
import GraphViewer from '../components/graphViewer/GraphViewer';
import type { GraphViewerHandle } from '../components/graphViewer/types';
import type { WindowProps } from '../workspace/types';
import type { Run, SimulatorState } from './types';
import type { CodeDiagnostic } from './compiler';
import StrategyPicker from './StrategyPicker';
import { PanelResizeHandle } from './PanelResizeHandle';
import RecordingList from './RecordingList';
import {
	appendEvent,
	expand,
	finishEvent,
	forkRun,
	seed,
	snapshotAt,
	sourceAt
} from './engine';
import { TraversalRuntime } from './runtime';
import { useTraversalLibrary } from './LibraryContext';
const StrategyEditor = lazy(() => import('./StrategyEditor'));
const formatPriority = (priority: number | readonly number[]) =>
	typeof priority === 'number'
		? String(priority)
		: `[${priority.join(', ')}]`;

export function SimulatorWindow({
	initialState,
	onChange,
	onOpenHelp,
	onOpenStrategies
}: WindowProps<SimulatorState>) {
	const [state, setState] = useState(() => ({
		...initialState,
		panelWidths: initialState.panelWidths ?? {
			strategy: 320,
			inspector: 276
		},
		appearance:
			initialState.appearance ??
			initialState.run?.appearance ??
			defaultAppearance()
	}));
	const stateRef = useRef(state);
	const onChangeRef = useRef(onChange);
	onChangeRef.current = onChange;
	const { library, updateLibrary } = useTraversalLibrary();
	const libraryUpdateRef = useRef(updateLibrary);
	libraryUpdateRef.current = updateLibrary;
	const runtime = useMemo(() => new TraversalRuntime(), []);
	const graphRef = useRef<GraphViewerHandle>(null);
	const [diagnostics, setDiagnostics] = useState<CodeDiagnostic[]>([]);
	const [error, setError] = useState('');
	const [notice, setNotice] = useState('');
	useEffect(() => {
		if (!notice) return;
		const timer = setTimeout(() => setNotice(''), 5000);
		return () => clearTimeout(timer);
	}, [notice]);
	const [busy, setBusy] = useState(false);
	const [mode, setMode] = useState<'play' | 'all' | null>(null);
	const token = useRef(0);
	const locked = useRef(false);
	const mounted = useRef(true);
	const [recordName, setRecordName] = useState(
		initialState.run?.name ?? 'My traversal'
	);
	const recordNameId = useId();
	const [graphEpoch, setGraphEpoch] = useState(0);
	const [showStrategy, setShowStrategy] = useState(
		() => window.innerWidth > 900
	);
	const [showInspector, setShowInspector] = useState(
		() => window.innerWidth > 900
	);
	const [inspectorTab, setInspectorTab] = useState<'queue' | 'records'>(
		initialState.graphData ? 'queue' : 'records'
	);
	useEffect(() => {
		const narrow = window.matchMedia('(max-width: 900px)');
		const resize = () => {
			if (narrow.matches) {
				setShowStrategy(false);
				setShowInspector(false);
			}
		};
		narrow.addEventListener('change', resize);
		return () => narrow.removeEventListener('change', resize);
	}, []);
	const togglePanel = (panel: 'strategy' | 'inspector') => {
		if (panel === 'strategy') {
			setShowStrategy((value) => !value);
			if (window.innerWidth <= 900) setShowInspector(false);
		} else {
			setShowInspector((value) => !value);
			if (window.innerWidth <= 900) setShowStrategy(false);
		}
	};

	const update = (patch: Partial<SimulatorState>) => {
		const next = { ...stateRef.current, ...patch };
		stateRef.current = next;
		if (mounted.current) {
			setState(next);
			onChangeRef.current(next);
		}
	};
	useEffect(() => {
		mounted.current = true;
		return () => {
			mounted.current = false;
			// Invalidate asynchronous work; this counter is not a DOM ref.
			// eslint-disable-next-line react-hooks/exhaustive-deps
			token.current++;
			runtime.dispose();
		};
	}, [runtime]);
	useEffect(() => {
		let cancelled = false;
		setDiagnostics([]);
		const timer = setTimeout(() => {
			runtime
				.compile(state.draft)
				.then((result) => {
					if (!cancelled) setDiagnostics(result.diagnostics);
				})
				.catch((cause) => {
					if (!cancelled) setError(String(cause));
				});
		}, 500);
		return () => {
			cancelled = true;
			clearTimeout(timer);
		};
	}, [runtime, state.draft]);
	const snapshot = useMemo(
		() => (state.run ? snapshotAt(state.run, state.cursor) : null),
		[state.run, state.cursor]
	);
	const overlay = useMemo(
		() => ({
			expandedIds: snapshot?.expandedIds ?? [],
			queueIds: snapshot?.queue.map((e) => e.state.id) ?? [],
			currentId: snapshot?.currentId ?? null
		}),
		[snapshot]
	);
	const hiddenAreas = useMemo(
		() => new Set(state.appearance.hiddenAreaIds),
		[state.appearance.hiddenAreaIds]
	);
	const selected =
		state.graphData?.nodes.filter((n) =>
			state.selectedIds.includes(n.id)
		) ?? [];
	const saveRun = (run: Run) =>
		libraryUpdateRef.current((current) => ({
			...current,
			records: [...current.records.filter((r) => r.id !== run.id), run]
		}));
	const cancel = () => {
		token.current++;
		runtime.cancel();
		locked.current = false;
		setBusy(false);
		setMode(null);
	};
	const checkedCode = async (source: string) => {
		const result = await runtime.compile(source);
		if (result.diagnostics.length) {
			setDiagnostics(result.diagnostics);
			throw new Error(
				result.diagnostics.map((d) => d.message).join('\n')
			);
		}
		return result.js;
	};
	const apply = async () => {
		if (locked.current || !stateRef.current.graphData) return;
		locked.current = true;
		setBusy(true);
		setError('');
		setNotice('');
		const operation = ++token.current;
		const before = stateRef.current;
		try {
			const js = await checkedCode(before.draft);
			if (token.current !== operation) return;
			const base = before.run
				? snapshotAt(before.run, before.cursor)
				: seed(before.graphData!, before.starts);
			const evaluated = await runtime.evaluate(
				js,
				before.graphData!,
				base
			);
			if (token.current !== operation) return;
			let run: Run;
			if (before.run) {
				run = forkRun(
					before.run,
					before.cursor,
					before.draft,
					evaluated,
					crypto.randomUUID()
				);
				saveRun(before.run);
				setNotice(
					'Previous branch saved in Records. New priorities applied at this step.'
				);
			} else {
				run = {
					id: crypto.randomUUID(),
					name: recordName.trim() || 'Traversal',
					createdAt: new Date().toISOString(),
					graph: before.graphData!,
					appearance: structuredClone(before.appearance),
					filename: before.filename,
					starts: [...before.starts],
					initial: evaluated,
					events: [],
					checkpoints: [],
					revisions: [{ at: 0, source: before.draft }]
				};
			}
			update({ run, cursor: base.step });
		} catch (cause) {
			if (token.current === operation)
				setError(
					cause instanceof Error ? cause.message : String(cause)
				);
		} finally {
			if (token.current === operation) {
				locked.current = false;
				setBusy(false);
			}
		}
	};
	const advance = async (playback: 'step' | 'play' | 'all') => {
		if (locked.current || !stateRef.current.run) return;
		locked.current = true;
		setBusy(true);
		setMode(playback === 'step' ? null : playback);
		setError('');
		const operation = ++token.current;
		let run = stateRef.current.run!;
		let cursor = stateRef.current.cursor;
		let currentSnapshot = snapshotAt(run, cursor);
		let compiled: string | null = null;
		let lastPublish = performance.now();
		try {
			do {
				if (cursor < run.events.length) {
					cursor++;
					currentSnapshot = snapshotAt(run, cursor);
				} else {
					if (!currentSnapshot.queue.length) break;
					if (compiled === null)
						compiled = await checkedCode(sourceAt(run, cursor));
					if (token.current !== operation) return;
					const next = expand(run.graph, currentSnapshot);
					const evaluated = next.snapshot.queue.length
						? await runtime.evaluate(
								compiled,
								run.graph,
								next.snapshot
							)
						: next.snapshot;
					if (token.current !== operation) return;
					const event = finishEvent(
						currentSnapshot,
						evaluated,
						next.event
					);
					run = appendEvent(run, event, evaluated);
					currentSnapshot = evaluated;
					cursor++;
				}
				if (
					playback !== 'all' ||
					performance.now() - lastPublish > 100
				) {
					update({ run, cursor });
					lastPublish = performance.now();
				}
				if (playback === 'step') break;
				if (playback === 'play')
					await new Promise((resolve) =>
						setTimeout(resolve, 1000 / stateRef.current.speed)
					);
				else await new Promise((resolve) => setTimeout(resolve, 0));
			} while (
				token.current === operation &&
				(cursor < run.events.length || currentSnapshot.queue.length)
			);
			if (token.current === operation) update({ run, cursor });
		} catch (cause) {
			if (token.current === operation) {
				update({ run, cursor });
				setError(
					cause instanceof Error ? cause.message : String(cause)
				);
			}
		} finally {
			if (token.current === operation) {
				locked.current = false;
				setBusy(false);
				setMode(null);
			}
		}
	};
	const seek = (cursor: number) => {
		cancel();
		update({
			cursor: Math.max(
				0,
				Math.min(stateRef.current.run?.events.length ?? 0, cursor)
			)
		});
	};
	const reset = () => {
		cancel();
		if (stateRef.current.run) saveRun(stateRef.current.run);
		update({ run: null, cursor: 0 });
		setNotice(
			'Previous run saved. Choose start nodes, then start a new run.'
		);
	};
	const openRecord = (id: string) => {
		const record = library.records.find((r) => r.id === id);
		if (!record) return;
		cancel();
		if (stateRef.current.run && stateRef.current.run.id !== record.id)
			saveRun(stateRef.current.run);
		update({
			run: record,
			graphData: record.graph,
			appearance: record.appearance ?? defaultAppearance(),
			filename: record.filename,
			starts: record.starts,
			cursor: 0,
			draft: sourceAt(record, 0),
			strategyId: '',
			view: null,
			selectedIds: []
		});
		setGraphEpoch((epoch) => epoch + 1);
		setInspectorTab('queue');
		setRecordName(record.name);
		setNotice(
			'Recording opened at the start. Replay uses recorded priorities.'
		);
		setError('');
	};
	const openCurrentStrategy = () =>
		onOpenStrategies?.({
			id: state.strategyId,
			name:
				library.strategies.find(
					(strategy) => strategy.id === state.strategyId
				)?.name ?? 'Current strategy',
			source: state.draft
		});
	const lastEvent =
		state.run && state.cursor ? state.run.events[state.cursor - 1] : null;
	const complete = snapshot && !snapshot.queue.length;
	return (
		<div
			style={
				{
					'--strategy-width': `${state.panelWidths.strategy}px`,
					'--inspector-width': `${state.panelWidths.inspector}px`
				} as React.CSSProperties
			}
			className={`traversal-window${showStrategy ? ' has-strategy' : ''}${showInspector ? ' has-inspector' : ''}`}
		>
			<header className="traversal-toolbar">
				<div>
					<strong>Traversal Simulator</strong>
					<small>
						{state.filename ||
							'Open a saved record, or choose a graph from New window'}
					</small>
				</div>
				<span
					className={`traversal-status${busy ? ' is-running' : complete ? ' is-complete' : ''}`}
				>
					<i aria-hidden="true" />
					{busy
						? mode === 'all'
							? 'Computing…'
							: 'Running…'
						: complete
							? 'Complete'
							: state.run
								? 'Paused'
								: 'Ready'}
				</span>

				<div className="traversal-panel-switches">
					<button
						aria-label="Open strategy editor"
						onClick={openCurrentStrategy}
					>
						<Code2 size={15} />
						<span>Strategy editor</span>
					</button>
					<button
						id="traversal-strategy-toggle"
						aria-label="Toggle strategy panel"
						aria-expanded={showStrategy}
						aria-controls="traversal-strategy-panel"
						onClick={() => togglePanel('strategy')}
					>
						<Code2 size={15} />
						<span>Setup</span>
					</button>
					<button
						id="traversal-inspector-toggle"
						aria-label="Toggle queue and records panel"
						aria-expanded={showInspector}
						aria-controls="traversal-inspector-panel"
						onClick={() => togglePanel('inspector')}
					>
						<ListOrdered size={15} />
						<span>Inspect</span>
					</button>
				</div>
				<div className="traversal-view-controls">
					<select
						aria-label="Graph layout"
						value={state.layout}
						onChange={(e) =>
							update({
								layout: e.target
									.value as SimulatorState['layout']
							})
						}
					>
						<option value="radial">Radial</option>
						<option value="tree">Tree</option>
					</select>
					<button
						title="Zoom in"
						aria-label="Zoom in"
						onClick={() => graphRef.current?.zoomIn()}
					>
						<ZoomIn size={16} />
					</button>
					<button
						title="Zoom out"
						aria-label="Zoom out"
						onClick={() => graphRef.current?.zoomOut()}
					>
						<ZoomOut size={16} />
					</button>
					<button
						title="Fit graph"
						aria-label="Fit graph"
						onClick={() => graphRef.current?.fit()}
					>
						<Maximize size={16} />
					</button>
				</div>
				<button disabled={!state.run || busy} onClick={reset}>
					<RotateCcw size={14} /> New run
				</button>
			</header>
			<div className="traversal-messages">
				{error && (
					<div className="traversal-error" role="alert">
						{error}
						<button
							aria-label="Dismiss error"
							onClick={() => setError('')}
						>
							×
						</button>
					</div>
				)}
				{notice && (
					<div className="traversal-notice" role="status">
						{notice}
						<button
							aria-label="Dismiss notice"
							onClick={() => setNotice('')}
						>
							×
						</button>
					</div>
				)}
			</div>
			<div className="traversal-body">
				<aside
					id="traversal-strategy-panel"
					className="traversal-strategy"
					aria-label="Strategy panel"
					hidden={!showStrategy}
				>
					<div className="traversal-panel-heading">
						<h3>
							<Code2 size={15} /> Priority strategy
						</h3>
						<button
							aria-label="Hide strategy panel"
							onClick={() => {
								setShowStrategy(false);
								document
									.getElementById('traversal-strategy-toggle')
									?.focus();
							}}
						>
							<X size={14} />
						</button>
					</div>
					<div className="traversal-panel-content">
						<button
							type="button"
							className="traversal-editor-link"
							onClick={openCurrentStrategy}
						>
							Open strategy editor <ChevronRight size={13} />
						</button>
						<StrategyPicker
							onEdit={(input) => onOpenStrategies?.(input)}
							id={state.strategyId}
							source={state.draft}
							onChange={(strategyId, draft) =>
								update({ strategyId, draft })
							}
						/>
						<p className="traversal-hint">
							Lowest priority first · recalculated each step
						</p>
						<div className="traversal-editor-caption">
							<span>priority.ts</span>
							<span>TypeScript</span>
						</div>
						<Suspense fallback={<p>Loading TypeScript editor…</p>}>
							<StrategyEditor
								value={state.draft}
								onChange={(draft) => update({ draft })}
								diagnostics={diagnostics}
							/>
						</Suspense>
						{diagnostics.length > 0 && (
							<div
								className="traversal-diagnostics"
								role="status"
							>
								{diagnostics.map((d, i) => (
									<p key={i}>{d.message}</p>
								))}
							</div>
						)}
						<button
							className="traversal-primary"
							disabled={busy || !state.graphData}
							onClick={() => void apply()}
						>
							{state.run
								? `Apply at step ${state.cursor}`
								: 'Start traversal'}
						</button>
						{state.run &&
							state.draft !==
								sourceAt(state.run, state.cursor) && (
								<p className="traversal-hint">
									Unapplied draft.{' '}
									<button
										className="traversal-text-button"
										onClick={() =>
											update({
												draft: sourceAt(
													state.run!,
													state.cursor
												)
											})
										}
									>
										Load this step’s code
									</button>
								</p>
							)}
						<button
							className="traversal-help-link"
							onClick={() => onOpenHelp?.('api')}
						>
							Function API & examples <ChevronRight size={14} />
						</button>
						<details>
							<summary>
								Start nodes · {state.starts.length}
							</summary>
							<select
								multiple
								aria-label="Start nodes"
								disabled={!!state.run || busy}
								value={state.starts}
								onChange={(e) =>
									update({
										starts: Array.from(
											e.target.selectedOptions,
											(o) => o.value
										)
									})
								}
							>
								{state.graphData?.nodes.map((n) => (
									<option key={n.id} value={n.id}>
										{n.id}
										{n.isInitial ? ' (initial)' : ''}
									</option>
								))}
							</select>
							<p className="traversal-hint">
								Choose before starting. Only reachable nodes are
								expanded.
							</p>
						</details>
					</div>
					<PanelResizeHandle
						side="strategy"
						width={state.panelWidths.strategy}
						onChange={(strategy) =>
							update({
								panelWidths: { ...state.panelWidths, strategy }
							})
						}
					/>
				</aside>
				<main className="traversal-graph">
					<div className="traversal-canvas-caption">
						<span>STATE SPACE</span>
						<span>
							{state.graphData?.nodes.length ?? 0} states ·{' '}
							{state.graphData?.edges.length ?? 0} transitions
						</span>
					</div>
					{state.graphData ? (
						<GraphViewer
							key={graphEpoch}
							ref={graphRef}
							graphData={state.graphData}
							layout={state.layout}
							showLoopbacks
							showNormalEdges
							enableAnimation={false}
							showAreas={state.appearance.showAreas}
							hiddenAreaIds={hiddenAreas}
							showDeadlineBadges={
								state.appearance.showDeadlineBadges
							}
							initialView={state.view}
							initialSelectedIds={state.selectedIds}
							onViewChange={(view) => update({ view })}
							onSelectionChange={(selection) =>
								update({
									selectedIds:
										selection?.nodes.map((n) => n.id) ?? []
								})
							}
							traversal={overlay}
						/>
					) : (
						<div className="traversal-empty">
							Choose a graph with New window → Traversal
							Simulator,
							<br />
							or open a saved record on the right.
						</div>
					)}
					<div className="traversal-legend">
						<span>
							<i className="is-unopened" />
							Unopened
						</span>
						<span>
							<i className="is-queued" />
							Queued
						</span>
						<span>
							<i className="is-expanded" />
							Expanded
						</span>
						<span>
							<i className="is-current" />
							Current
						</span>
					</div>
				</main>
				<aside
					id="traversal-inspector-panel"
					className="traversal-inspector"
					aria-label="Inspector panel"
					hidden={!showInspector}
				>
					<div className="traversal-panel-heading">
						<div
							className="traversal-inspector-tabs"
							role="tablist"
							aria-label="Inspector sections"
							onKeyDown={(event) => {
								if (
									![
										'ArrowLeft',
										'ArrowRight',
										'Home',
										'End'
									].includes(event.key)
								)
									return;
								event.preventDefault();
								const next =
									event.key === 'Home'
										? 'queue'
										: event.key === 'End'
											? 'records'
											: inspectorTab === 'queue'
												? 'records'
												: 'queue';
								setInspectorTab(next);
								document
									.getElementById(`traversal-${next}-tab`)
									?.focus();
							}}
						>
							<button
								role="tab"
								id="traversal-queue-tab"
								tabIndex={inspectorTab === 'queue' ? 0 : -1}
								aria-controls="traversal-queue-panel"
								aria-selected={inspectorTab === 'queue'}
								onClick={() => setInspectorTab('queue')}
							>
								Queue <span>{snapshot?.queue.length ?? 0}</span>
							</button>
							<button
								role="tab"
								id="traversal-records-tab"
								tabIndex={inspectorTab === 'records' ? 0 : -1}
								aria-controls="traversal-records-panel"
								aria-selected={inspectorTab === 'records'}
								onClick={() => setInspectorTab('records')}
							>
								Records <span>{library.records.length}</span>
							</button>
						</div>
						<button
							aria-label="Hide inspector panel"
							onClick={() => {
								setShowInspector(false);
								document
									.getElementById(
										'traversal-inspector-toggle'
									)
									?.focus();
							}}
						>
							<X size={14} />
						</button>
					</div>
					<div
						id="traversal-queue-panel"
						role="tabpanel"
						aria-labelledby="traversal-queue-tab"
						className="traversal-panel-content traversal-records-content"
						hidden={inspectorTab !== 'queue'}
					>
						<div className="traversal-metrics">
							<div>
								<strong>
									{snapshot?.expandedIds.length ?? 0}
								</strong>
								<span>Expanded</span>
							</div>
							<div>
								<strong>{snapshot?.queue.length ?? 0}</strong>
								<span>Queued</span>
							</div>
							<div>
								<strong>
									{(state.graphData?.nodes.length ?? 0) -
										(snapshot?.discovered.length ?? 0)}
								</strong>
								<span>Unopened</span>
							</div>
						</div>
						{snapshot?.queue[0] && (
							<div className="traversal-next">
								<span>UP NEXT</span>
								<strong>{snapshot.queue[0].state.id}</strong>
								<code>
									{formatPriority(snapshot.queue[0].priority)}
								</code>
							</div>
						)}

						<div
							className="traversal-queue"
							aria-label="Priority queue"
						>
							{snapshot?.queue.length ? (
								<table>
									<thead>
										<tr>
											<th>#</th>
											<th>State</th>
											<th>Priority</th>
										</tr>
									</thead>
									<tbody>
										{snapshot.queue.map((entry, i) => (
											<tr key={entry.state.id}>
												<td>
													<span className="traversal-rank">
														{i + 1}
													</span>
												</td>
												<td>
													<button
														onClick={() => {
															graphRef.current?.focusNode(
																entry.state.id
															);
															graphRef.current?.selectNodes(
																[entry.state.id]
															);
														}}
													>
														{entry.state.id}
													</button>
												</td>
												<td>
													<code>
														{formatPriority(
															entry.priority
														)}
													</code>
												</td>
											</tr>
										))}
									</tbody>
								</table>
							) : (
								<p className="traversal-empty">
									{complete
										? 'Queue exhausted'
										: 'Start to evaluate the queue'}
								</p>
							)}
						</div>
						{selected.length > 0 && (
							<details open>
								<summary>
									Selected ·{' '}
									{selected.map((n) => n.id).join(', ')}
								</summary>
								{selected.map((n) => (
									<div key={n.id}>
										<strong>{n.id}</strong>
										<p className="traversal-hint">
											{n.tasks
												.map(
													(t, i) =>
														`τ${i + 1}: c=${t.task.c}, d=${t.task.d}`
												)
												.join(' · ') || 'No task data'}
										</p>
									</div>
								))}
							</details>
						)}
					</div>
					<div
						id="traversal-records-panel"
						role="tabpanel"
						aria-labelledby="traversal-records-tab"
						className="traversal-panel-content traversal-records-content"
						hidden={inspectorTab !== 'records'}
					>
						<label
							className="recording-save-label"
							htmlFor={recordNameId}
						>
							Save current run
						</label>
						<input
							id={recordNameId}
							aria-label="Record name"
							value={recordName}
							onChange={(e) => setRecordName(e.target.value)}
						/>
						<button
							disabled={!state.run || busy || !recordName.trim()}
							onClick={() => {
								const run = {
									...state.run!,
									name: recordName.trim()
								};
								saveRun(run);
								update({ run });
								setNotice(
									'Recording saved, including every computed step.'
								);
							}}
						>
							<Save size={14} /> Save recording
						</button>
						<RecordingList
							records={library.records}
							activeId={state.run?.id}
							busy={busy}
							onOpen={openRecord}
							onRename={(id, name) => {
								updateLibrary((current) => ({
									...current,
									records: current.records.map((r) =>
										r.id === id ? { ...r, name } : r
									)
								}));
								if (state.run?.id === id) {
									update({ run: { ...state.run, name } });
									setRecordName(name);
								}
							}}
							onDelete={(id) =>
								updateLibrary((current) => ({
									...current,
									records: current.records.filter(
										(r) => r.id !== id
									)
								}))
							}
						/>
						<p className="traversal-hint">
							Each recording keeps its graph and priorities.
							Replay always opens paused.
						</p>
					</div>
					<PanelResizeHandle
						side="inspector"
						width={state.panelWidths.inspector}
						onChange={(inspector) =>
							update({
								panelWidths: { ...state.panelWidths, inspector }
							})
						}
					/>
				</aside>
			</div>
			<footer className="traversal-timeline">
				<div className="traversal-timeline-heading">
					<h3>
						Traversal timeline{' '}
						<span className="timeline-step-badge">
							Step {state.cursor} of{' '}
							{state.run?.events.length ?? 0}
						</span>
					</h3>
					<span>
						<CheckCircle2 size={12} /> Local workspace
					</span>
				</div>
				<div className="traversal-controls">
					<div
						className="timeline-transport"
						role="group"
						aria-label="Playback controls"
					>
						<button
							aria-label="Go to start"
							title="Go to start"
							disabled={!state.run || !state.cursor}
							onClick={() => seek(0)}
						>
							<SkipBack size={16} />
						</button>
						<button
							aria-label="Previous step"
							title="Previous step"
							disabled={!state.cursor}
							onClick={() => seek(state.cursor - 1)}
						>
							<ChevronLeft size={16} />
						</button>
						<button
							aria-label="Next step"
							title="Next step"
							disabled={
								busy ||
								!state.run ||
								(!!complete &&
									state.cursor === state.run.events.length)
							}
							onClick={() => void advance('step')}
						>
							<ChevronRight size={16} />
						</button>
						<button
							className="traversal-play"
							disabled={!state.run || (!busy && !!complete)}
							onClick={() =>
								busy ? cancel() : void advance('play')
							}
						>
							{busy ? <Pause size={16} /> : <Play size={16} />}{' '}
							{busy ? 'Pause' : 'Play'}
						</button>
						<button
							disabled={!state.run || busy || !!complete}
							onClick={() => void advance('all')}
						>
							<ChevronsRight size={16} /> To end
						</button>
						{busy && <button onClick={cancel}>Cancel</button>}
					</div>
					<label>
						Speed{' '}
						<select
							aria-label="Playback speed"
							value={state.speed}
							onChange={(e) =>
								update({ speed: Number(e.target.value) })
							}
						>
							{[0.5, 1, 2, 5, 10, 20].map((n) => (
								<option key={n} value={n}>
									{n} steps/s
								</option>
							))}
						</select>
					</label>
					<label>
						Step{' '}
						<input
							aria-label="Timeline step"
							type="number"
							min={0}
							max={state.run?.events.length ?? 0}
							value={state.cursor}
							onChange={(e) => seek(Number(e.target.value) || 0)}
						/>
					</label>
					<span>/ {state.run?.events.length ?? 0}</span>
				</div>
				<div className="timeline-progress">
					<span>0</span>
					<input
						className="traversal-scrubber"
						style={
							{
								'--timeline-progress': `${state.run?.events.length ? (state.cursor / state.run.events.length) * 100 : 0}%`
							} as React.CSSProperties
						}
						disabled={!state.run?.events.length}
						aria-label="Traversal timeline"
						type="range"
						min={0}
						max={state.run?.events.length ?? 0}
						value={state.cursor}
						onChange={(e) => seek(Number(e.target.value))}
					/>
					<span>{state.run?.events.length ?? 0}</span>
				</div>
				<div className="traversal-step-detail">
					{lastEvent ? (
						<>
							<strong>Expanded {lastEvent.nodeId}</strong>
							<span>
								{lastEvent.added.length} added ·{' '}
								{lastEvent.edges.filter((e) => !e.added).length}{' '}
								repeats skipped
							</span>
							<details className="timeline-transitions">
								<summary>
									{lastEvent.edges.length}{' '}
									{lastEvent.edges.length === 1
										? 'transition'
										: 'transitions'}
								</summary>
								<div className="traversal-edge-log">
									{lastEvent.edges.map((edge, i) => (
										<span
											key={i}
											className={
												edge.added ? 'is-added' : ''
											}
										>
											{edge.source} → {edge.target} ·{' '}
											{edge.added
												? 'queued'
												: 'already discovered'}
											{edge.type === 'loop'
												? ' (loop)'
												: ''}
										</span>
									))}
								</div>
							</details>
						</>
					) : (
						<>
							<strong>Initial queue</strong>
							<span>
								{snapshot
									? 'Priorities evaluated. The first entry will be expanded next.'
									: 'Select a strategy and start traversal.'}
							</span>
						</>
					)}
					{state.run && (
						<details>
							<summary>Strategy at this step</summary>
							<pre>{sourceAt(state.run, state.cursor)}</pre>
						</details>
					)}
				</div>
			</footer>
		</div>
	);
}
