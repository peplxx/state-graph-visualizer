import React from 'react';
import { UploadTarget } from './UploadTarget';
import { createPortal } from 'react-dom';
import {
	Download,
	Trash2,
	Upload,
	Network,
	ArrowUpRight,
	PanelsTopLeft,
	ChevronDown,
	FolderOpen,
	Route,
	Code2,
	BookOpen,
	ArrowLeft,
	ChevronRight
} from 'lucide-react';
import type { LibraryGraph } from './types';

interface Props {
	graphs: LibraryGraph[];
	onUpload: () => void;
	onFiles: (files: File[]) => void;
	onOpen: (id: string) => void;
	onUnload: (id: string) => void;
	onDownload: (id: string) => void;
}
export function GraphList({
	graphs,
	onOpen,
	onUnload,
	onDownload
}: Pick<Props, 'graphs' | 'onOpen' | 'onUnload' | 'onDownload'>) {
	return (
		<div className="library-list">
			{graphs.map((graph, index) => (
				<div className="library-row" key={graph.id}>
					<button
						type="button"
						onClick={() => onOpen(graph.id)}
						className="library-graph"
					>
						<Network size={17} />
						<span>
							<strong>{graph.filename}</strong>
							<small>
								#{index + 1} · {graph.graph.nodes.length} nodes
								· {graph.graph.edges.length} edges
							</small>
						</span>
						<ArrowUpRight size={15} />
					</button>
					<button
						type="button"
						className="library-unload"
						title="Download YAML"
						aria-label={`Download ${graph.filename}`}
						onClick={() => onDownload(graph.id)}
					>
						<Download size={15} />
					</button>
					<button
						type="button"
						className="library-unload"
						aria-label={`Unload ${graph.filename}`}
						title="Unload graph"
						onClick={() => onUnload(graph.id)}
					>
						<Trash2 size={15} />
					</button>
				</div>
			))}
		</div>
	);
}
export function GraphLibraryMenu(props: Props) {
	const ref = React.useRef<HTMLDetailsElement>(null);
	React.useEffect(() => {
		const outside = (e: PointerEvent) => {
			if (!ref.current?.contains(e.target as Node) && ref.current)
				ref.current.open = false;
		};
		const escape = (e: KeyboardEvent) => {
			if (e.key === 'Escape' && ref.current?.open) {
				ref.current.open = false;
				ref.current.querySelector('summary')?.focus();
			}
		};
		document.addEventListener('pointerdown', outside);
		document.addEventListener('keydown', escape);
		return () => {
			document.removeEventListener('pointerdown', outside);
			document.removeEventListener('keydown', escape);
		};
	}, []);
	const close = () => {
		if (ref.current) ref.current.open = false;
	};
	return (
		<details ref={ref} className="library-menu">
			<summary>
				<FolderOpen size={16} /> Graphs{' '}
				<span className="library-count">{props.graphs.length}</span>
				<ChevronDown size={13} />
			</summary>
			<div className="library-popover">
				<div className="library-caption">Loaded graphs</div>
				{props.graphs.length ? (
					<GraphList
						graphs={props.graphs}
						onUnload={props.onUnload}
						onDownload={props.onDownload}
						onOpen={(id) => {
							close();
							props.onOpen(id);
						}}
					/>
				) : (
					<p className="library-empty">
						Your loaded graphs will appear here.
					</p>
				)}
				<UploadTarget
					onFiles={props.onFiles}
					className="library-upload"
					onUpload={() => {
						close();
						props.onUpload();
					}}
				>
					<Upload size={15} /> Upload graph
				</UploadTarget>
			</div>
		</details>
	);
}
export function WorkspaceHome({
	graphs,
	onUpload,
	onFiles,
	onOpenWindow,
	onHelp
}: Omit<Props, 'onOpen' | 'onUnload' | 'onDownload'> & {
	onOpenWindow: (
		anchor: HTMLButtonElement,
		kind: 'explorer' | 'traversal'
	) => void;
	onHelp: () => void;
}) {
	return (
		<main className="workspace-home">
			<div className="workspace-home-content">
				<h1>Your workspace</h1>
				<p>Explore graphs and try your own traversal strategies.</p>
				<div className="workspace-bento">
					<UploadTarget
						onFiles={onFiles}
						onUpload={onUpload}
						className="bento-card bento-upload"
					>
						<span className="bento-icon">
							<Upload size={21} />
						</span>
						<span className="bento-copy">
							<strong>Upload graph</strong>
							<span>Drop YAML files or browse.</span>
						</span>
						<ArrowUpRight className="bento-arrow" size={20} />
					</UploadTarget>
					<button
						className="bento-card"
						onClick={(event) =>
							onOpenWindow(event.currentTarget, 'explorer')
						}
					>
						<span className="bento-icon">
							<PanelsTopLeft size={21} />
						</span>
						<span className="bento-copy">
							<strong>Explorer</strong>
							<span>Inspect states and style your graph.</span>
						</span>
						<ArrowUpRight className="bento-arrow" size={20} />
					</button>
					<button
						className="bento-card"
						onClick={(event) =>
							onOpenWindow(event.currentTarget, 'traversal')
						}
					>
						<span className="bento-icon">
							<Route size={21} />
						</span>
						<span className="bento-copy">
							<strong>Traversal Simulator</strong>
							<span>
								Set priorities, step through and replay.
							</span>
						</span>
						<ArrowUpRight className="bento-arrow" size={20} />
					</button>
					<button className="bento-card" onClick={onHelp}>
						<span className="bento-icon">
							<BookOpen size={21} />
						</span>
						<span className="bento-copy">
							<strong>Help & guides</strong>
							<span>Learn the tools and strategy API.</span>
						</span>
						<ArrowUpRight className="bento-arrow" size={20} />
					</button>
					<div className="bento-library">
						<button
							className="loaded-graphs-button"
							aria-haspopup="dialog"
							onClick={(event) =>
								onOpenWindow(event.currentTarget, 'explorer')
							}
						>
							<Network size={14} />
							<span>
								{graphs.length}{' '}
								{graphs.length === 1 ? 'graph' : 'graphs'}{' '}
								loaded
							</span>
							<ChevronDown size={12} />
						</button>
						<small>Stored locally in this browser</small>
					</div>
				</div>
			</div>
		</main>
	);
}
export function ExplorerPicker({
	kind,
	onKindChange,
	onSavedTraversals,
	onStrategies,
	onClose,
	anchor,
	...props
}: Props & {
	onSavedTraversals: () => void;
	onStrategies: () => void;
	kind: 'explorer' | 'traversal' | null;
	onKindChange: (kind: 'explorer' | 'traversal' | null) => void;
	onClose: () => void;
	anchor: HTMLElement | null;
}) {
	const ref = React.useRef<HTMLDivElement>(null);
	const closeRef = React.useRef(onClose);
	closeRef.current = onClose;
	const [position, setPosition] = React.useState({
		left: 12,
		top: 90,
		maxHeight: 320
	});
	React.useLayoutEffect(() => {
		const place = () => {
			const rect = anchor?.getBoundingClientRect();
			const width = Math.min(320, window.innerWidth - 24);
			const top = rect ? rect.bottom + 6 : 90;
			const height = Math.min(ref.current?.scrollHeight ?? 320, 360);
			const y =
				window.innerHeight - top < Math.min(height, 160) && rect
					? Math.max(12, rect.top - height - 6)
					: top;
			setPosition({
				left: Math.max(
					12,
					Math.min(rect?.left ?? 12, window.innerWidth - width - 12)
				),
				top: y,
				maxHeight: Math.max(80, window.innerHeight - y - 12)
			});
		};
		place();
		ref.current
			?.querySelector<HTMLButtonElement>(
				kind && props.graphs.length ? '.library-graph' : 'button'
			)
			?.focus();
		const outside = (event: PointerEvent) => {
			if (
				!ref.current?.contains(event.target as Node) &&
				!anchor?.contains(event.target as Node)
			)
				closeRef.current();
		};
		const key = (event: KeyboardEvent) => {
			if (event.key === 'Escape') {
				event.preventDefault();
				event.stopPropagation();
				closeRef.current();
				anchor?.focus();
			}
			if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
				const buttons = Array.from(
					ref.current?.querySelectorAll<HTMLButtonElement>(
						'button'
					) ?? []
				);
				const index = buttons.indexOf(
					document.activeElement as HTMLButtonElement
				);
				if (index >= 0) {
					event.preventDefault();
					buttons[
						(index +
							(event.key === 'ArrowDown' ? 1 : -1) +
							buttons.length) %
							buttons.length
					]?.focus();
				}
			}
		};
		window.addEventListener('resize', place);
		document.addEventListener('pointerdown', outside);
		document.addEventListener('keydown', key, true);
		return () => {
			window.removeEventListener('resize', place);
			document.removeEventListener('pointerdown', outside);
			document.removeEventListener('keydown', key, true);
		};
	}, [anchor, kind, props.graphs.length]);
	return createPortal(
		<div
			ref={ref}
			role="dialog"
			aria-label="New window"
			className="explorer-picker"
			style={position}
		>
			{kind === null ? (
				<>
					<div className="library-caption">New window</div>
					<div className="window-type-choices">
						<button
							type="button"
							className="window-type-choice"
							onClick={() => onKindChange('explorer')}
						>
							<span className="window-type-icon">
								<PanelsTopLeft size={17} />
							</span>
							<span>
								<strong>Explorer</strong>
								<small>Inspect and style a graph</small>
							</span>
							<ChevronRight size={16} />
						</button>
						<button
							type="button"
							className="window-type-choice"
							onClick={() => onKindChange('traversal')}
						>
							<span className="window-type-icon">
								<Route size={17} />
							</span>
							<span>
								<strong>Traversal Simulator</strong>
								<small>Define and replay an exploration</small>
							</span>
							<ChevronRight size={16} />
						</button>
					</div>
				</>
			) : (
				<>
					<div className="window-picker-heading">
						<button
							type="button"
							aria-label="Back to window types"
							title="Back to window types"
							onClick={() => onKindChange(null)}
						>
							<ArrowLeft size={16} />
						</button>
						<div>
							<strong>
								{kind === 'explorer'
									? 'Explorer'
									: 'Traversal Simulator'}
							</strong>
							<small>Choose a graph</small>
						</div>
					</div>
					{kind === 'traversal' && (
						<button
							type="button"
							className="saved-traversals-button"
							onClick={onStrategies}
						>
							<Code2 size={15} />
							Strategy editor
						</button>
					)}
					{props.graphs.length ? (
						<GraphList
							graphs={props.graphs}
							onOpen={props.onOpen}
							onUnload={props.onUnload}
							onDownload={props.onDownload}
						/>
					) : (
						<p className="library-empty">
							Upload a graph to open this window.
						</p>
					)}
					<UploadTarget
						onFiles={props.onFiles}
						className="library-upload"
						onUpload={props.onUpload}
					>
						<Upload size={15} /> Upload graph
					</UploadTarget>
					{kind === 'traversal' && (
						<>
							<button
								type="button"
								className="saved-traversals-button"
								onClick={onSavedTraversals}
							>
								<FolderOpen size={15} /> Open saved recordings
							</button>
						</>
					)}
				</>
			)}
		</div>,
		document.body
	);
}
