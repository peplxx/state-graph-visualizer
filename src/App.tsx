import React from 'react';
import { CheckCircle2, Info, X } from 'lucide-react';
import {
	DuplicateGraphError,
	findIdenticalGraph
} from './workspace/graphIdentity';
import {
	createExplorerState,
	downloadExplorer
} from './workspace/explorerState';
import { House } from 'lucide-react';
import {
	GraphLibraryMenu,
	WorkspaceHome,
	ExplorerPicker
} from './workspace/GraphLibrary';
import { parseFile } from './core/parser';
import { getWindowDefinition } from './workspace/registry';
import {
	importGraph,
	unloadGraph,
	openGraph,
	closeWindow,
	emptyWorkspace,
	moveWindow,
	restoreWorkspace
} from './workspace/model';
import type { Workspace, WindowTab } from './workspace/types';
import {
	backupWorkspace,
	createWorkspaceWriter,
	readWorkspace,
	writeWorkspace
} from './workspace/storage';
import { WorkspaceTabs } from './workspace/WorkspaceTabs';
import { UnsavedDialog } from './workspace/UnsavedDialog';

export default function App() {
	const [workspace, setWorkspace] = React.useState<Workspace>(emptyWorkspace);
	const current = React.useRef(workspace);
	const uploadRef = React.useRef<HTMLInputElement>(null);
	const pickerAnchor = React.useRef<HTMLElement | null>(null);
	const showPicker = (anchor: HTMLButtonElement) => {
		pickerAnchor.current = anchor;
		setPickerOpen((open) => !open);
	};
	const [pickerOpen, setPickerOpen] = React.useState(false);
	const [uploading, setUploading] = React.useState(false);
	const [ready, setReady] = React.useState(false);
	const [error, setError] = React.useState('');
	const [notice, setNotice] = React.useState<{
		text: string;
		success: boolean;
	} | null>(null);
	const [pending, setPending] = React.useState<{
		id: string;
		action: () => void;
	} | null>(null);
	const persistenceEnabled = React.useRef(false);
	const writer = React.useMemo(
		() =>
			createWorkspaceWriter(writeWorkspace, (cause) => {
				setError(
					`Could not save the workspace locally. Your open tabs are still available. ${cause instanceof Error ? cause.message : ''}`
				);
			}),
		[]
	);

	React.useEffect(() => {
		let disposed = false;
		readWorkspace()
			.then(async (raw) => {
				const result = restoreWorkspace(raw);
				if (disposed) return;
				current.current = result.workspace;
				setWorkspace(result.workspace);
				setError(result.warnings.join(' '));
				try {
					if (result.warnings.length) await backupWorkspace(raw);
					if (!disposed) persistenceEnabled.current = true;
				} catch {
					if (!disposed)
						setError(
							`${result.warnings.join(' ')} Could not back up the damaged session. Local saving is disabled; your recovered tabs remain available.`
						);
				}
			})
			.catch((cause) => {
				if (!disposed)
					setError(
						`Could not restore the workspace. You can keep working in this session. ${cause instanceof Error ? cause.message : ''}`
					);
			})
			.finally(() => {
				if (!disposed) setReady(true);
			});
		const flush = () => void writer.flush();
		const visibility = () => {
			if (document.visibilityState === 'hidden') flush();
		};
		window.addEventListener('pagehide', flush);
		document.addEventListener('visibilitychange', visibility);
		return () => {
			disposed = true;
			writer.dispose();
			window.removeEventListener('pagehide', flush);
			document.removeEventListener('visibilitychange', visibility);
		};
	}, [writer]);

	const commit = (next: Workspace, immediate = true) => {
		current.current = next;
		setWorkspace(next);
		if (persistenceEnabled.current) writer.push(next, immediate);
	};
	const updateWindow = (id: string, state: WindowTab['state']) => {
		const old = current.current.tabs.find((tab) => tab.id === id);
		if (!old || old.state === state) return;
		const definition = getWindowDefinition(old.kind);
		const changedDocument = definition.documentChanged(old.state, state);
		let graphs = current.current.graphs;
		let graphId = old.graphId;
		if (
			state.graphData &&
			(!graphId || old.state.documentId !== state.documentId)
		) {
			const existing = findIdenticalGraph(graphs, state.graphData);
			if (existing) {
				graphId = existing.id;
				setNotice({
					text: `This graph is already in your library as “${existing.filename}”.`,
					success: false
				});
			} else {
				graphId = crypto.randomUUID();
				graphs = [
					...graphs,
					{
						id: graphId,
						filename: state.filename,
						graph: state.graphData
					}
				];
				setNotice({
					text: `“${state.filename}” is ready to explore.`,
					success: true
				});
			}
		} else if (
			graphId &&
			state.baselineYaml &&
			old.state.baselineYaml !== state.baselineYaml
		) {
			const graph = parseFile(state.baselineYaml);
			graphs = graphs.map((item) =>
				item.id === graphId
					? { ...item, graph, filename: state.filename }
					: item
			);
		}
		const title = old.customTitle
			? old.title
			: (definition.fileTitle(state) ?? old.title);
		commit(
			{
				...current.current,
				graphs,
				tabs: current.current.tabs.map((tab) =>
					tab.id === id
						? ({ ...tab, state, title, graphId } as WindowTab)
						: tab
				)
			},
			changedDocument
		);
	};
	const guard = (id: string, action: () => void) => {
		const tab = current.current.tabs.find((item) => item.id === id);
		if (tab && getWindowDefinition(tab.kind).dirty(tab.state))
			setPending({ id, action });
		else action();
	};
	const download = (graphId: string) => {
		const graph = current.current.graphs.find(
			(item) => item.id === graphId
		);
		if (!graph) return;
		const tab = current.current.tabs.find(
			(item) => item.graphId === graphId
		);
		downloadExplorer(
			tab?.state ?? {
				...createExplorerState(),
				graphData: graph.graph,
				filename: graph.filename
			}
		);
	};
	const unload = (graphId: string) => {
		// Close the picker before showing the unsaved-changes dialog.
		setPickerOpen(false);
		const tab = current.current.tabs.find(
			(item) => item.graphId === graphId
		);
		const action = () => commit(unloadGraph(current.current, graphId));
		if (tab) guard(tab.id, action);
		else action();
	};
	const open = (id: string) => {
		commit(openGraph(current.current, id));
		setPickerOpen(false);
	};
	const upload = () => uploadRef.current?.click();
	const loadFiles = async (files: File[]) => {
		setUploading(true);
		const failures: string[] = [];
		const duplicates: string[] = [];
		const added: string[] = [];
		setNotice(null);
		setError('');
		for (const file of files) {
			try {
				const graph = parseFile(await file.text());
				commit(importGraph(current.current, graph, file.name));
				added.push(file.name);
			} catch (cause) {
				if (cause instanceof DuplicateGraphError) {
					duplicates.push(
						`“${file.name}” is already in your library as “${cause.existing.filename}”.`
					);
					continue;
				}
				failures.push(
					`${file.name}: ${cause instanceof Error ? cause.message : 'Could not load graph.'}`
				);
			}
		}
		if (failures.length) setError(failures.join(' '));
		const summary =
			added.length === 1
				? `“${added[0]}” is ready to explore.`
				: added.length > 1
					? `${added.length} graphs loaded and ready to explore.`
					: '';
		if (summary || duplicates.length)
			setNotice({
				text: [summary, ...duplicates].filter(Boolean).join(' '),
				success: added.length > 0
			});
		setUploading(false);
	};
	const active = workspace.tabs.find((tab) => tab.id === workspace.activeId);
	const Component = active
		? getWindowDefinition(active.kind).Component
		: null;
	return (
		<div className="app-root">
			<header className="app-header">
				<span className="app-title">
					State Transition Graph Visualizer
				</span>
				{ready && (
					<GraphLibraryMenu
						onUnload={unload}
						onDownload={download}
						graphs={workspace.graphs}
						onOpen={open}
						onUpload={upload}
						onFiles={(files) => void loadFiles(files)}
					/>
				)}
				<button
					type="button"
					className="workspace-home-button"
					aria-label="Workspace home"
					onClick={() =>
						commit({ ...current.current, activeId: null })
					}
				>
					<House size={17} />
				</button>
			</header>
			<input
				ref={uploadRef}
				type="file"
				multiple
				accept=".yaml,.yml,.json,.toml"
				hidden
				onChange={(event) => {
					const files = Array.from(event.target.files ?? []);
					event.target.value = '';
					void loadFiles(files);
				}}
			/>
			{uploading && (
				<div className="workspace-upload-status" role="status">
					Loading graphs…
				</div>
			)}
			{notice && (
				<div
					className={`workspace-notice${notice.success ? ' is-success' : ''}`}
					role="status"
				>
					{notice.success ? (
						<CheckCircle2 size={16} />
					) : (
						<Info size={16} />
					)}
					<span>{notice.text}</span>
					<button
						type="button"
						aria-label="Dismiss notification"
						onClick={() => setNotice(null)}
					>
						<X size={15} />
					</button>
				</div>
			)}
			{error && (
				<div className="workspace-error" role="alert">
					<span>{error}</span>
					<button
						type="button"
						onClick={() => setError('')}
						aria-label="Dismiss storage message"
					>
						×
					</button>
				</div>
			)}
			{!ready ? (
				<main className="workspace-welcome">Restoring workspace…</main>
			) : (
				<>
					<WorkspaceTabs
						workspace={workspace}
						onActivate={(id) =>
							commit({ ...current.current, activeId: id })
						}
						onAdd={showPicker}
						onClose={(id) =>
							guard(id, () =>
								commit(closeWindow(current.current, id))
							)
						}
						onRename={(id, title) =>
							commit({
								...current.current,
								tabs: current.current.tabs.map((tab) =>
									tab.id === id
										? { ...tab, title, customTitle: true }
										: tab
								)
							})
						}
						onMove={(from, to) =>
							commit(moveWindow(current.current, from, to))
						}
					/>
					{active && Component ? (
						<div
							className="workspace-panel"
							role="tabpanel"
							id={`panel-${active.id}`}
							aria-labelledby={`tab-${active.id}`}
						>
							<React.Suspense
								fallback={
									<div className="workspace-welcome">
										Opening window…
									</div>
								}
							>
								<Component
									key={active.id}
									initialState={active.state}
									onChange={(state) =>
										updateWindow(active.id, state)
									}
									confirmDiscard={(action) =>
										guard(active.id, action)
									}
								/>
							</React.Suspense>
						</div>
					) : (
						<WorkspaceHome
							graphs={workspace.graphs}
							onUpload={upload}
							onFiles={(files) => void loadFiles(files)}
							onExplorer={showPicker}
						/>
					)}
				</>
			)}
			{pickerOpen && (
				<ExplorerPicker
					anchor={pickerAnchor.current}
					onUnload={unload}
					onDownload={download}
					graphs={workspace.graphs}
					onUpload={upload}
					onFiles={(files) => void loadFiles(files)}
					onOpen={open}
					onClose={() => setPickerOpen(false)}
				/>
			)}
			{pending && (
				<UnsavedDialog
					title={
						workspace.tabs.find((tab) => tab.id === pending.id)
							?.title ?? 'Explorer'
					}
					onCancel={() => setPending(null)}
					onDiscard={() => {
						const action = pending.action;
						setPending(null);
						action();
					}}
					onSave={() => {
						try {
							const tab = current.current.tabs.find(
								(item) => item.id === pending.id
							);
							if (tab)
								updateWindow(
									tab.id,
									getWindowDefinition(tab.kind).save(
										tab.state
									)
								);
							const action = pending.action;
							setPending(null);
							action();
						} catch (cause) {
							setError(
								`Could not save the graph. ${cause instanceof Error ? cause.message : ''}`
							);
						}
					}}
				/>
			)}
		</div>
	);
}
