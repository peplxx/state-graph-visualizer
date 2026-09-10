import React from 'react';
import { Plus, X } from 'lucide-react';
import type { Workspace } from './types';
import { getWindowDefinition } from './registry';

interface Props {
	workspace: Workspace;
	onActivate: (id: string) => void;
	onClose: (id: string) => void;
	onRename: (id: string, title: string) => void;
	onMove: (from: string, to: string) => void;
	onAdd: (anchor: HTMLButtonElement) => void;
}
export function WorkspaceTabs({
	workspace,
	onActivate,
	onClose,
	onRename,
	onMove,
	onAdd
}: Props) {
	const [editing, setEditing] = React.useState<string | null>(null);
	const [draft, setDraft] = React.useState('');
	const [dragOver, setDragOver] = React.useState<string | null>(null);
	const dragRef = React.useRef<string | null>(null);
	const listRef = React.useRef<HTMLDivElement>(null);
	const navRef = React.useRef<HTMLElement>(null);
	const closingRef = React.useRef<string | null>(null);
	const renameFocusRef = React.useRef<string | null>(null);
	const close = (id: string) => {
		closingRef.current = id;
		onClose(id);
	};
	React.useEffect(() => {
		if (
			closingRef.current &&
			!workspace.tabs.some((tab) => tab.id === closingRef.current)
		) {
			closingRef.current = null;
			navRef.current
				?.querySelector<HTMLButtonElement>(
					'[aria-selected="true"], .workspace-add'
				)
				?.focus();
		}
	}, [workspace.tabs]);
	React.useEffect(() => {
		if (!editing && renameFocusRef.current) {
			document.getElementById(`tab-${renameFocusRef.current}`)?.focus();
			renameFocusRef.current = null;
		}
	}, [editing]);
	React.useEffect(() => {
		listRef.current
			?.querySelector('[aria-selected="true"]')
			?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
	}, [workspace.activeId]);
	const rename = () => {
		if (editing && draft.trim()) onRename(editing, draft.trim());
		setEditing(null);
	};
	return (
		<nav
			ref={navRef}
			className="workspace-tabs"
			aria-label="Workspace windows"
		>
			<div className="workspace-tab-list" role="tablist" ref={listRef}>
				{workspace.tabs.map((tab, index) => (
					<div
						key={tab.id}
						className={`workspace-tab${tab.id === workspace.activeId ? ' is-active' : ''}${dragOver === tab.id ? ' is-drop-target' : ''}`}
						draggable={!editing}
						onDragStart={(event) => {
							dragRef.current = tab.id;
							event.dataTransfer.effectAllowed = 'move';
							event.dataTransfer.setData('text/plain', tab.id);
						}}
						onDragOver={(event) => {
							if (dragRef.current) {
								event.preventDefault();
								event.dataTransfer.dropEffect = 'move';
								setDragOver(tab.id);
							}
						}}
						onDrop={(event) => {
							event.preventDefault();
							if (dragRef.current)
								onMove(dragRef.current, tab.id);
							dragRef.current = null;
							setDragOver(null);
						}}
						onDragEnd={() => {
							dragRef.current = null;
							setDragOver(null);
						}}
					>
						{editing === tab.id ? (
							<input
								className="tab-rename"
								aria-label="Tab name"
								autoFocus
								value={draft}
								onFocus={(event) =>
									event.currentTarget.select()
								}
								onChange={(event) =>
									setDraft(event.target.value)
								}
								onBlur={rename}
								onKeyDown={(event) => {
									if (event.key === 'Enter') {
										renameFocusRef.current = tab.id;
										event.preventDefault();
										rename();
									}
									if (event.key === 'Escape') {
										renameFocusRef.current = tab.id;
										event.preventDefault();
										setEditing(null);
									}
								}}
							/>
						) : (
							<button
								type="button"
								role="tab"
								id={`tab-${tab.id}`}
								aria-controls={`panel-${tab.id}`}
								aria-selected={tab.id === workspace.activeId}
								tabIndex={
									tab.id === workspace.activeId ||
									(workspace.activeId === null && index === 0)
										? 0
										: -1
								}
								className="workspace-tab-button"
								title={tab.title}
								onClick={() => onActivate(tab.id)}
								onDoubleClick={() => {
									setDraft(tab.title);
									setEditing(tab.id);
								}}
								onKeyDown={(event) => {
									if (event.key === 'F2') {
										event.preventDefault();
										setDraft(tab.title);
										setEditing(tab.id);
										return;
									}
									if (event.key === 'Delete') {
										event.preventDefault();
										close(tab.id);
										return;
									}
									const direction =
										event.key === 'ArrowRight'
											? 1
											: event.key === 'ArrowLeft'
												? -1
												: 0;
									if (direction && event.altKey) {
										event.preventDefault();
										const target =
											workspace.tabs[index + direction];
										if (target) onMove(tab.id, target.id);
										return;
									}
									const nextIndex =
										event.key === 'Home'
											? 0
											: event.key === 'End'
												? workspace.tabs.length - 1
												: direction
													? (index +
															direction +
															workspace.tabs
																.length) %
														workspace.tabs.length
													: -1;
									if (nextIndex >= 0) {
										event.preventDefault();
										const next = workspace.tabs[nextIndex];
										onActivate(next.id);
										listRef.current
											?.querySelector<HTMLButtonElement>(
												`#tab-${CSS.escape(next.id)}`
											)
											?.focus();
									}
								}}
							>
								<span>{tab.title}</span>
								{getWindowDefinition(tab.kind).dirty(
									tab.state
								) && (
									<span
										className="tab-dirty"
										aria-label="Unsaved changes"
									>
										●
									</span>
								)}
							</button>
						)}
						<button
							type="button"
							className="workspace-tab-close"
							aria-label={`Close ${tab.title}`}
							onClick={() => close(tab.id)}
						>
							<X size={13} />
						</button>
					</div>
				))}
			</div>
			<div className="workspace-add-actions">
				<button
					type="button"
					className="workspace-add"
					onClick={(event) => onAdd(event.currentTarget)}
					title="New window"
				>
					<Plus size={14} /> New window
				</button>
			</div>
		</nav>
	);
}
