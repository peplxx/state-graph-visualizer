import { useRef } from 'react';
export function PanelResizeHandle({
	side,
	width,
	onChange
}: {
	side: 'strategy' | 'inspector';
	width: number;
	onChange: (width: number) => void;
}) {
	const drag = useRef<{ x: number; width: number } | null>(null);
	const maxWidth = () =>
		Math.min(
			640,
			window.innerWidth <= 900
				? window.innerWidth - 32
				: window.innerWidth * 0.42
		);
	const setWidth = (value: number) =>
		onChange(Math.round(Math.max(240, Math.min(maxWidth(), value))));
	const direction = side === 'strategy' ? 1 : -1;
	return (
		<div
			role="separator"
			aria-label={`Resize ${side} panel`}
			aria-orientation="vertical"
			aria-valuemin={240}
			aria-valuemax={Math.floor(maxWidth())}
			aria-valuenow={width}
			tabIndex={0}
			className={`traversal-resize-handle is-${side}`}
			title="Drag to resize · Double-click to reset"
			onPointerDown={(event) => {
				if (event.button !== 0) return;
				event.preventDefault();
				event.currentTarget.focus();
				drag.current = {
					x: event.clientX,
					width: event.currentTarget.parentElement!.getBoundingClientRect()
						.width
				};
				event.currentTarget.setPointerCapture(event.pointerId);
			}}
			onPointerMove={(event) => {
				if (drag.current)
					setWidth(
						drag.current.width +
							direction * (event.clientX - drag.current.x)
					);
			}}
			onPointerUp={(event) => {
				drag.current = null;
				if (event.currentTarget.hasPointerCapture(event.pointerId))
					event.currentTarget.releasePointerCapture(event.pointerId);
			}}
			onLostPointerCapture={() => {
				drag.current = null;
			}}
			onDoubleClick={() => onChange(side === 'strategy' ? 320 : 276)}
			onKeyDown={(event) => {
				if (
					['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(
						event.key
					)
				) {
					event.preventDefault();
					setWidth(
						event.key === 'Home'
							? 240
							: event.key === 'End'
								? maxWidth()
								: width +
									(event.key === 'ArrowRight' ? 1 : -1) *
										direction *
										(event.shiftKey ? 40 : 10)
					);
				}
			}}
		>
			<span />
		</div>
	);
}
