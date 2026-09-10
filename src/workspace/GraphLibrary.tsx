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
	FolderOpen
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
	onExplorer
}: Omit<Props, 'onOpen' | 'onUnload' | 'onDownload'> & {
	onExplorer: (anchor: HTMLButtonElement) => void;
}) {
	return (
		<main className="workspace-home">
			<div className="workspace-home-content">
				<h1>Your workspace</h1>
				<p>Load a graph, then open it in an Explorer.</p>
				<div className="workspace-bento">
					<UploadTarget
						onFiles={onFiles}
						className="bento-card bento-upload"
						onUpload={onUpload}
					>
						<span className="bento-icon">
							<Upload size={21} />
						</span>
						<span className="bento-copy">
							<strong>Upload graph</strong>
							<span>Drop files here or click to browse.</span>
						</span>
						<ArrowUpRight className="bento-arrow" size={20} />
					</UploadTarget>
					<button
						type="button"
						className="bento-card bento-explorer"
						onClick={(event) => onExplorer(event.currentTarget)}
					>
						<span className="bento-icon">
							<PanelsTopLeft size={21} />
						</span>
						<span className="bento-copy">
							<strong>Open Explorer</strong>
							<span>
								Inspect states, transitions, and schedules.
							</span>
						</span>
						<ArrowUpRight className="bento-arrow" size={20} />
					</button>
					<div className="bento-library">
						<button
							type="button"
							className="loaded-graphs-button"
							title="Browse loaded graphs"
							aria-haspopup="dialog"
							onClick={(event) => onExplorer(event.currentTarget)}
						>
							<Network size={14} />
							<span>
								{graphs.length}{' '}
								{graphs.length === 1
									? 'graph loaded'
									: 'graphs loaded'}
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
	onClose,
	anchor,
	...props
}: Props & { onClose: () => void; anchor: HTMLElement | null }) {
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
		ref.current?.querySelector<HTMLButtonElement>('button')?.focus();
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
	}, [anchor]);
	return createPortal(
		<div
			ref={ref}
			role="dialog"
			aria-label="Open Explorer"
			className="explorer-picker"
			style={position}
		>
			<div className="library-caption">Open Explorer</div>
			{props.graphs.length ? (
				<GraphList
					graphs={props.graphs}
					onOpen={props.onOpen}
					onUnload={props.onUnload}
					onDownload={props.onDownload}
				/>
			) : (
				<p className="library-empty">
					Upload a graph to open an Explorer.
				</p>
			)}
			<UploadTarget
				onFiles={props.onFiles}
				className="library-upload"
				onUpload={props.onUpload}
			>
				<Upload size={15} /> Upload graph
			</UploadTarget>
		</div>,
		document.body
	);
}
