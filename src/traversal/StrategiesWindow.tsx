import { ConfirmStrategyDelete } from './ConfirmStrategyDelete';
import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import {
	Code2,
	Plus,
	Save,
	Copy,
	Trash2,
	X,
	CircleHelp,
	Check
} from 'lucide-react';
import type { WindowProps } from '../workspace/types';
import { useTraversalLibrary } from './LibraryContext';
import { TraversalRuntime } from './runtime';
import type { CodeDiagnostic } from './compiler';
import { PanelResizeHandle } from './PanelResizeHandle';
import {
	closeStrategyDocument,
	deleteStrategyDocument,
	openStrategyDocument,
	type StrategyDocument,
	type StrategyEditorInput,
	type StrategyWorkspaceState
} from './strategyWorkspace';
const StrategyEditor = lazy(() => import('./StrategyEditor'));
export default function StrategiesWindow({
	initialState,
	onChange,
	onOpenHelp
}: WindowProps<StrategyWorkspaceState>) {
	const [state, setState] = useState(initialState);
	const stateRef = useRef(state);
	const update = (next: StrategyWorkspaceState) => {
		stateRef.current = next;
		setState(next);
		onChange(next);
	};
	const { library, updateLibrary } = useTraversalLibrary();
	const runtime = useMemo(() => new TraversalRuntime(), []);
	const [diagnostics, setDiagnostics] = useState<CodeDiagnostic[]>([]);
	const [checking, setChecking] = useState(false);
	const [error, setError] = useState('');
	const [notice, setNotice] = useState('');
	const [deleting, setDeleting] = useState<{
		id: string;
		name: string;
	} | null>(null);
	const active = state.documents.find(
		(doc) => doc.id === state.activeId && doc.open
	);
	const opened = state.documents.filter((doc) => doc.open);
	const savedFor = (doc: StrategyDocument) =>
		library.strategies.find((s) => s.id === doc.strategyId);
	const modified = (doc: StrategyDocument) => {
		const saved = savedFor(doc);
		return !saved || saved.source !== doc.source || saved.name !== doc.name;
	};
	useEffect(() => () => runtime.dispose(), [runtime]);
	useEffect(() => {
		let stale = false;
		setDiagnostics([]);
		setError('');
		setNotice('');
		if (!active) return;
		setChecking(true);
		const timer = setTimeout(() => {
			runtime
				.compile(active.source)
				.then((result) => {
					if (!stale) setDiagnostics(result.diagnostics);
				})
				.catch((cause) => {
					if (!stale) setError(String(cause));
				})
				.finally(() => {
					if (!stale) setChecking(false);
				});
		}, 400);
		return () => {
			stale = true;
			clearTimeout(timer);
		};
	}, [runtime, active]);
	const patch = (id: string, values: Partial<StrategyDocument>) =>
		update({
			...stateRef.current,
			documents: stateRef.current.documents.map((doc) =>
				doc.id === id ? { ...doc, ...values } : doc
			)
		});
	const open = (input?: StrategyEditorInput) => {
		const existing =
			input?.id &&
			state.documents.find((doc) => doc.strategyId === input.id);
		if (existing)
			update({
				...state,
				activeId: existing.id,
				documents: state.documents.map((doc) =>
					doc.id === existing.id ? { ...doc, open: true } : doc
				)
			});
		else update(openStrategyDocument(state, input));
	};
	const save = (copy: boolean) => {
		if (!active || !active.name.trim()) return;
		const id =
			!copy && savedFor(active) ? active.strategyId : crypto.randomUUID();
		const name = copy ? `${active.name.trim()} copy` : active.name.trim();
		updateLibrary((current) => ({
			...current,
			strategies: [
				...current.strategies.filter((s) => s.id !== id),
				{ id, name, source: active.source }
			]
		}));
		if (copy)
			update(
				openStrategyDocument(state, { id, name, source: active.source })
			);
		else patch(active.id, { strategyId: id, name });
		setNotice(
			'Saved to the strategy library. Select it in a simulator to apply it.'
		);
	};
	return (
		<div
			className="strategies-window traversal-window"
			style={
				{
					'--library-width': `${state.sidebarWidth}px`
				} as React.CSSProperties
			}
		>
			{deleting && (
				<ConfirmStrategyDelete
					name={deleting.name}
					onCancel={() => setDeleting(null)}
					onConfirm={() => {
						updateLibrary((current) => ({
							...current,
							strategies: current.strategies.filter(
								(s) => s.id !== deleting.id
							)
						}));
						update({
							...state,
							documents: state.documents.map((doc) =>
								doc.strategyId === deleting.id
									? { ...doc, strategyId: '' }
									: doc
							)
						});
						setDeleting(null);
					}}
				/>
			)}
			<header className="strategies-header">
				<Code2 size={18} />
				<div>
					<strong>Strategy editor</strong>
					<small>
						Manage your library and edit priority functions
					</small>
				</div>
				<button onClick={() => onOpenHelp?.('api')}>
					<CircleHelp size={15} />
					Function API
				</button>
			</header>
			<div className="strategies-layout">
				<aside className="strategies-library">
					<button
						className="traversal-primary"
						onClick={() => open()}
					>
						<Plus size={14} />
						New strategy
					</button>
					<div className="strategies-library-scroll">
						<h3>
							My strategies{' '}
							<span>{library.strategies.length}</span>
						</h3>
						{library.strategies.map((strategy) => (
							<div
								className="strategies-library-row"
								key={strategy.id}
							>
								<button
									aria-current={
										active?.strategyId === strategy.id
											? 'true'
											: undefined
									}
									onClick={() => open(strategy)}
								>
									<Code2 size={14} />
									<span>{strategy.name}</span>
								</button>
								<button
									aria-label={`Delete strategy ${strategy.name}`}
									title="Delete from library"
									onClick={() =>
										setDeleting({
											id: strategy.id,
											name: strategy.name
										})
									}
								>
									<Trash2 size={13} />
								</button>
							</div>
						))}
						{!library.strategies.length && (
							<p className="traversal-hint">
								Save a function to reuse it on any graph.
							</p>
						)}
						<h3>Drafts</h3>
						{state.documents.filter(modified).map((doc) => (
							<div
								className="strategies-library-row"
								key={doc.id}
							>
								<button
									aria-current={
										active?.id === doc.id
											? 'true'
											: undefined
									}
									onClick={() =>
										update({
											...state,
											activeId: doc.id,
											documents: state.documents.map(
												(item) =>
													item.id === doc.id
														? {
																...item,
																open: true
															}
														: item
											)
										})
									}
								>
									<span className="strategy-draft-dot" />
									<span>
										{doc.name || 'Untitled strategy'}
									</span>
								</button>
								<button
									aria-label={`Delete draft ${doc.name || 'Untitled strategy'}`}
									title="Delete draft"
									onClick={() =>
										update(
											deleteStrategyDocument(
												state,
												doc.id
											)
										)
									}
								>
									<Trash2 size={13} />
								</button>
							</div>
						))}
						{!state.documents.some(modified) && (
							<p className="traversal-hint">
								No unsaved changes.
							</p>
						)}
					</div>
					<p className="traversal-hint">
						Drafts stay in this browser, even when you close an
						editor tab.
					</p>
					<PanelResizeHandle
						side="strategy"
						width={state.sidebarWidth}
						onChange={(sidebarWidth) =>
							update({ ...state, sidebarWidth })
						}
					/>
				</aside>
				<main className="strategies-main">
					<div
						className="strategy-document-tabs"
						role="tablist"
						aria-label="Open strategies"
					>
						{opened.map((doc) => (
							<div
								className={
									active?.id === doc.id ? 'is-active' : ''
								}
								key={doc.id}
							>
								<button
									role="tab"
									id={`strategy-tab-${doc.id}`}
									aria-controls={`strategy-code-${doc.id}`}
									aria-selected={active?.id === doc.id}
									tabIndex={active?.id === doc.id ? 0 : -1}
									onClick={() =>
										update({ ...state, activeId: doc.id })
									}
									onKeyDown={(event) => {
										if (
											[
												'ArrowLeft',
												'ArrowRight',
												'Home',
												'End'
											].includes(event.key)
										) {
											event.preventDefault();
											const index = opened.findIndex(
												(item) => item.id === doc.id
											);
											const next =
												event.key === 'Home'
													? opened[0]
													: event.key === 'End'
														? opened[
																opened.length -
																	1
															]
														: opened[
																(index +
																	(event.key ===
																	'ArrowRight'
																		? 1
																		: -1) +
																	opened.length) %
																	opened.length
															];
											update({
												...state,
												activeId: next.id
											});
											document
												.getElementById(
													`strategy-tab-${next.id}`
												)
												?.focus();
										}
									}}
								>
									<Code2 size={13} />
									<span>
										{doc.name || 'Untitled strategy'}
									</span>
									{modified(doc) && (
										<span
											className="strategy-draft-dot"
											aria-label="Unsaved changes"
										/>
									)}
								</button>
								<button
									aria-label={`Close editor ${doc.name}`}
									onClick={() =>
										update(
											closeStrategyDocument(state, doc.id)
										)
									}
								>
									<X size={12} />
								</button>
							</div>
						))}
						<button
							aria-label="New strategy tab"
							onClick={() => open()}
						>
							<Plus size={14} />
						</button>
					</div>
					{active ? (
						<>
							<div className="strategy-document-toolbar">
								<label>
									Name
									<input
										aria-label="Strategy name"
										value={active.name}
										onChange={(event) =>
											patch(active.id, {
												name: event.target.value
											})
										}
									/>
								</label>
								<button
									className="traversal-primary"
									disabled={!active.name.trim()}
									onClick={() => save(false)}
								>
									<Save size={14} />
									{savedFor(active)
										? 'Save changes'
										: 'Save strategy'}
								</button>
								<button
									disabled={!active.name.trim()}
									onClick={() => save(true)}
								>
									<Copy size={14} />
									Save copy
								</button>
							</div>
							<div className="strategy-document-code">
								{opened.map((doc) => (
									<section
										key={doc.id}
										id={`strategy-code-${doc.id}`}
										role="tabpanel"
										aria-labelledby={`strategy-tab-${doc.id}`}
										hidden={doc.id !== active.id}
									>
										<Suspense
											fallback={<p>Loading editor…</p>}
										>
											<StrategyEditor
												value={doc.source}
												onChange={(source) =>
													patch(doc.id, { source })
												}
												diagnostics={
													doc.id === active.id
														? diagnostics
														: []
												}
											/>
										</Suspense>
									</section>
								))}
							</div>
							<div
								className="strategy-document-status"
								role="status"
							>
								<span>
									{checking ? (
										'Checking TypeScript…'
									) : diagnostics.length ? (
										`${diagnostics.length} ${diagnostics.length === 1 ? 'error' : 'errors'}`
									) : error ? (
										'Compiler unavailable'
									) : (
										<>
											<Check size={13} />
											No type errors
										</>
									)}
								</span>
								<span>
									TypeScript · Synchronous priority function
								</span>
							</div>
							{(diagnostics.length > 0 || error || notice) && (
								<div className="strategy-document-messages">
									{error && <p>{error}</p>}
									{diagnostics.map((item, index) => (
										<p key={index}>{item.message}</p>
									))}
									{notice && <p>{notice}</p>}
								</div>
							)}
						</>
					) : (
						<div className="strategies-welcome">
							<Code2 size={32} />
							<h2>Open a strategy to begin</h2>
							<p>
								Select a saved strategy, customize an example or
								create a new function.
							</p>
							<button onClick={() => open()}>
								<Plus size={14} />
								New strategy
							</button>
						</div>
					)}
				</main>
			</div>
		</div>
	);
}
