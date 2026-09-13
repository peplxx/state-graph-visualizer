import { ConfirmStrategyDelete } from './ConfirmStrategyDelete';
import type { StrategyEditorInput } from './strategyWorkspace';
import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown, Code2, Pencil, Plus, Trash2 } from 'lucide-react';
import { PRESETS } from './api';
import { useTraversalLibrary } from './LibraryContext';

export default function StrategyPicker({
	id,
	source,
	onChange,
	onEdit
}: {
	onEdit: (input: StrategyEditorInput) => void;
	id: string;
	source: string;
	onChange: (id: string, source: string) => void;
}) {
	const { library, updateLibrary } = useTraversalLibrary();
	const [open, setOpen] = useState(false);
	const [deleting, setDeleting] = useState<{
		id: string;
		name: string;
	} | null>(null);
	const [position, setPosition] = useState({
		top: 0,
		left: 0,
		width: 300,
		maxHeight: 320
	});
	const trigger = useRef<HTMLButtonElement>(null);
	const menu = useRef<HTMLDivElement>(null);
	const menuId = useId();
	const saved = library.strategies.find((s) => s.id === id);
	const selected = saved;
	const close = () => {
		setOpen(false);
		trigger.current?.focus();
	};
	useEffect(() => {
		if (!open) return;
		const positionMenu = () => {
			const rect = trigger.current!.getBoundingClientRect();
			const width = Math.min(340, window.innerWidth - 24);
			const below = window.innerHeight - rect.bottom - 12;
			const height = Math.min(360, Math.max(below, rect.top - 12));
			setPosition({
				left: Math.max(
					12,
					Math.min(rect.left, window.innerWidth - width - 12)
				),
				top:
					below >= height
						? rect.bottom + 5
						: Math.max(12, rect.top - height - 5),
				width,
				maxHeight: height
			});
		};
		positionMenu();
		(
			menu.current?.querySelector<HTMLButtonElement>(
				'[aria-current="true"]'
			) ?? menu.current?.querySelector<HTMLButtonElement>('button')
		)?.focus();
		const outside = (event: PointerEvent) => {
			if (
				!menu.current?.contains(event.target as Node) &&
				!trigger.current?.contains(event.target as Node)
			)
				setOpen(false);
		};
		document.addEventListener('pointerdown', outside);
		window.addEventListener('resize', positionMenu);
		window.addEventListener('scroll', positionMenu, true);
		return () => {
			document.removeEventListener('pointerdown', outside);
			window.removeEventListener('resize', positionMenu);
			window.removeEventListener('scroll', positionMenu, true);
		};
	}, [open]);
	const edit = (
		strategy: { id: string; name: string; source: string },
		isSaved: boolean
	) => {
		close();
		onEdit({
			id: isSaved ? strategy.id : '',
			name: isSaved ? strategy.name : `${strategy.name} copy`,
			source: strategy.source
		});
	};
	return (
		<div className="strategy-picker">
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
						if (id === deleting.id) onChange('', source);
						setDeleting(null);
					}}
				/>
			)}
			<div className="strategy-picker-control">
				<button
					ref={trigger}
					aria-label="Priority strategy"
					aria-expanded={open}
					aria-haspopup="dialog"
					aria-controls={menuId}
					onClick={() => setOpen(!open)}
				>
					<Code2 size={15} />
					<span>{selected?.name ?? 'Custom strategy'}</span>
					<ChevronDown size={14} />
				</button>
				<button
					title="Save or edit strategy"
					aria-label="Save or edit strategy"
					onClick={() => {
						onEdit({
							id,
							name: selected?.name ?? 'My strategy',
							source
						});
					}}
				>
					<Pencil size={14} />
				</button>
			</div>
			{open &&
				createPortal(
					<div
						ref={menu}
						id={menuId}
						role="dialog"
						aria-label="Strategy library"
						className="strategy-popover"
						style={position}
						onKeyDown={(e) => {
							if (e.key === 'Escape') {
								e.preventDefault();
								close();
							}
							if (
								[
									'ArrowDown',
									'ArrowUp',
									'Home',
									'End',
									'Tab'
								].includes(e.key)
							) {
								const buttons = Array.from(
									menu.current!.querySelectorAll<HTMLButtonElement>(
										'button'
									)
								);
								const current = buttons.indexOf(
									document.activeElement as HTMLButtonElement
								);
								const next =
									e.key === 'Home'
										? 0
										: e.key === 'End'
											? buttons.length - 1
											: (current +
													(e.key === 'ArrowUp' ||
													(e.key === 'Tab' &&
														e.shiftKey)
														? -1
														: 1) +
													buttons.length) %
												buttons.length;
								e.preventDefault();
								buttons[next]?.focus();
							}
						}}
					>
						<div className="strategy-popover-list">
							{[
								{
									title: 'My strategies',
									items: library.strategies,
									saved: true
								}
							].map((group) => (
								<section key={group.title}>
									<h4>
										{group.title}
										<span>{group.items.length}</span>
									</h4>
									{group.items.map((s) => (
										<div
											className="strategy-option"
											key={s.id}
										>
											<button
												aria-current={
													id === s.id
														? 'true'
														: undefined
												}
												onClick={() => {
													onChange(s.id, s.source);

													close();
												}}
											>
												<span className="strategy-option-check">
													{id === s.id && (
														<Check size={14} />
													)}
												</span>
												<span>
													<strong>{s.name}</strong>
													<small>
														{group.saved
															? 'Saved strategy'
															: PRESETS.find(
																	(preset) =>
																		preset.id ===
																		s.id
																)?.description}
													</small>
												</span>
											</button>
											<button
												aria-label={`${group.saved ? 'Edit' : 'Customize'} ${s.name}`}
												title={
													group.saved
														? 'Edit strategy'
														: 'Customize a copy'
												}
												onClick={() =>
													edit(s, group.saved)
												}
											>
												<Pencil size={13} />
											</button>
											{group.saved && (
												<button
													aria-label={`Delete strategy ${s.name}`}
													title="Delete strategy"
													onClick={() => {
														close();
														setDeleting({
															id: s.id,
															name: s.name
														});
													}}
												>
													<Trash2 size={13} />
												</button>
											)}
										</div>
									))}
									{!group.items.length && (
										<p className="strategy-library-empty">
											Your saved strategies will appear
											here.
										</p>
									)}
								</section>
							))}
						</div>
						<button
							className="strategy-add"
							onClick={() => {
								onEdit({
									name: 'My strategy',
									source: PRESETS[0].source
								});
								close();
							}}
						>
							<Plus size={15} />
							New strategy
						</button>
					</div>,
					document.body
				)}
		</div>
	);
}
