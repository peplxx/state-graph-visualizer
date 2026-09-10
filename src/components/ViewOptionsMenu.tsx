import React from 'react';
import { Check, ChevronDown, SlidersHorizontal } from 'lucide-react';

interface Props {
	animation: boolean;
	legend: boolean;
	systemConfig: boolean;
	onSystemConfigChange: () => void;
	deadlineBadges: boolean;
	onAnimationChange: () => void;
	onLegendChange: () => void;
	onDeadlineBadgesChange: () => void;
}

export function ViewOptionsMenu(props: Props) {
	const [open, setOpen] = React.useState(false);
	const rootRef = React.useRef<HTMLDivElement>(null);
	const triggerRef = React.useRef<HTMLButtonElement>(null);
	const id = React.useId();
	React.useEffect(() => {
		if (!open) return;
		rootRef.current
			?.querySelector<HTMLButtonElement>('[role="menuitemcheckbox"]')
			?.focus();
		const dismiss = (event: PointerEvent) => {
			if (!rootRef.current?.contains(event.target as Node))
				setOpen(false);
		};
		document.addEventListener('pointerdown', dismiss);
		return () => document.removeEventListener('pointerdown', dismiss);
	}, [open]);
	const options = [
		{
			label: 'Animation',
			checked: props.animation,
			toggle: props.onAnimationChange
		},
		{
			label: 'Show legend',
			checked: props.legend,
			toggle: props.onLegendChange
		},
		{
			label: 'Show system config',
			checked: props.systemConfig,
			toggle: props.onSystemConfigChange
		},
		{
			label: 'Deadline warning badges',
			checked: props.deadlineBadges,
			toggle: props.onDeadlineBadgesChange
		}
	];
	return (
		<div
			className="view-options"
			ref={rootRef}
			onBlur={(event) => {
				if (!event.currentTarget.contains(event.relatedTarget as Node))
					setOpen(false);
			}}
		>
			<button
				ref={triggerRef}
				type="button"
				className="header-toggle"
				aria-haspopup="menu"
				aria-expanded={open}
				aria-controls={id}
				onClick={() => setOpen((value) => !value)}
				onKeyDown={(event) => {
					if (event.key === 'ArrowDown') {
						event.preventDefault();
						setOpen(true);
					}
				}}
			>
				<SlidersHorizontal size={14} />
				View
				<ChevronDown size={13} />
			</button>
			{open && (
				<div
					id={id}
					className="view-options-menu"
					role="menu"
					aria-label="View options"
					onKeyDown={(event) => {
						if (event.key === 'Escape') {
							event.preventDefault();
							setOpen(false);
							triggerRef.current?.focus();
							return;
						}
						const items = Array.from(
							event.currentTarget.querySelectorAll<HTMLButtonElement>(
								'[role="menuitemcheckbox"]'
							)
						);
						const current = items.indexOf(
							document.activeElement as HTMLButtonElement
						);
						const index = {
							ArrowDown: (current + 1) % items.length,
							ArrowUp:
								(current - 1 + items.length) % items.length,
							Home: 0,
							End: items.length - 1
						}[event.key];
						if (index !== undefined) {
							event.preventDefault();
							items[index].focus();
						}
					}}
				>
					{options.map(({ label, checked, toggle }) => (
						<button
							key={label}
							type="button"
							role="menuitemcheckbox"
							aria-checked={checked}
							className="view-options-item"
							onClick={toggle}
						>
							<span
								className={`view-options-check${checked ? ' is-checked' : ''}`}
								aria-hidden="true"
							>
								{checked && (
									<Check size={11} strokeWidth={2.5} />
								)}
							</span>
							{label}
						</button>
					))}
				</div>
			)}
		</div>
	);
}
