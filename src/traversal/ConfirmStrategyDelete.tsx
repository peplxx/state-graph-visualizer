import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
export function ConfirmStrategyDelete({
	name,
	onCancel,
	onConfirm
}: {
	name: string;
	onCancel: () => void;
	onConfirm: () => void;
}) {
	const cancel = useRef<HTMLButtonElement>(null);
	useEffect(() => {
		const previous = document.activeElement as HTMLElement;
		cancel.current?.focus();
		return () => {
			if (previous?.isConnected) previous.focus();
		};
	}, []);
	return createPortal(
		<div className="strategy-delete-backdrop">
			<div
				role="alertdialog"
				aria-modal="true"
				aria-label={`Delete strategy ${name}?`}
				className="strategy-delete-dialog"
				onKeyDown={(event) => {
					if (event.key === 'Escape') {
						event.preventDefault();
						onCancel();
					}
					if (event.key === 'Tab') {
						const buttons = Array.from(
							event.currentTarget.querySelectorAll<HTMLButtonElement>(
								'button'
							)
						);
						const index = buttons.indexOf(
							document.activeElement as HTMLButtonElement
						);
						event.preventDefault();
						buttons[
							(index +
								(event.shiftKey ? -1 : 1) +
								buttons.length) %
								buttons.length
						]?.focus();
					}
				}}
			>
				<h2>Delete strategy?</h2>
				<p>
					<strong>{name}</strong> will be removed from your library.
					Existing recordings and editor drafts will stay available.
				</p>
				<div>
					<button ref={cancel} onClick={onCancel}>
						Cancel
					</button>
					<button className="is-destructive" onClick={onConfirm}>
						Delete strategy
					</button>
				</div>
			</div>
		</div>,
		document.body
	);
}
