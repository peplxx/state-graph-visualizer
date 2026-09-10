import React, { useEffect, useRef, useState } from 'react';

const DEFAULT_WIDTH = 320;

export function ResizableSidePanel({
	visible,
	children,
	preferredWidth,
	onWidthChange,
	initialScrollTop = 0,
	onScrollChange
}: {
	visible: boolean;
	preferredWidth: number;
	onWidthChange: (width: number) => void;
	initialScrollTop?: number;
	onScrollChange?: (scroll: number) => void;
	children: React.ReactNode;
}) {
	const panelRef = useRef<HTMLElement>(null);
	const dragRef = useRef<{ x: number; width: number } | null>(null);
	const setPreferredWidth = onWidthChange;
	const contentRef = useRef<HTMLDivElement>(null);
	const initialScrollRef = useRef(initialScrollTop);
	React.useLayoutEffect(() => {
		if (contentRef.current)
			contentRef.current.scrollTop = initialScrollRef.current;
	}, []);
	const [containerWidth, setContainerWidth] = useState(window.innerWidth);
	const [dragging, setDragging] = useState(false);
	const maxWidth = Math.min(
		640,
		Math.max(280, containerWidth / 2),
		Math.max(0, containerWidth - 48)
	);
	const minWidth = Math.min(280, maxWidth);
	const clamp = (width: number) =>
		Math.min(maxWidth, Math.max(minWidth, width));
	const width = clamp(preferredWidth);

	useEffect(() => {
		const parent = panelRef.current?.parentElement;
		if (!parent) return;
		const observer = new ResizeObserver(([entry]) =>
			setContainerWidth(entry.contentRect.width)
		);
		observer.observe(parent);
		return () => observer.disconnect();
	}, []);

	const stopDrag = () => {
		dragRef.current = null;
		setDragging(false);
	};

	return (
		<aside
			ref={panelRef}
			className={`side-panel-frame${dragging ? ' is-resizing' : ''}`}
			style={{ width, display: visible ? undefined : 'none' }}
		>
			<div
				className="side-panel-resizer"
				role="separator"
				aria-label="Resize sidebar"
				aria-orientation="vertical"
				aria-valuemin={Math.round(minWidth)}
				aria-valuemax={Math.round(maxWidth)}
				aria-valuenow={Math.round(width)}
				tabIndex={0}
				title="Drag to resize; double-click to reset"
				onDoubleClick={() => setPreferredWidth(DEFAULT_WIDTH)}
				onPointerDown={(event) => {
					if (event.button !== 0) return;
					event.preventDefault();
					event.currentTarget.setPointerCapture(event.pointerId);
					dragRef.current = { x: event.clientX, width };
					setDragging(true);
				}}
				onPointerMove={(event) => {
					const drag = dragRef.current;
					if (drag)
						setPreferredWidth(
							clamp(drag.width + drag.x - event.clientX)
						);
				}}
				onPointerUp={(event) => {
					if (event.currentTarget.hasPointerCapture(event.pointerId))
						event.currentTarget.releasePointerCapture(
							event.pointerId
						);
					stopDrag();
				}}
				onPointerCancel={stopDrag}
				onLostPointerCapture={stopDrag}
				onKeyDown={(event) => {
					const next = {
						ArrowLeft: width + 16,
						ArrowRight: width - 16,
						Home: minWidth,
						End: maxWidth
					}[event.key];
					if (next === undefined) return;
					event.preventDefault();
					setPreferredWidth(clamp(next));
				}}
			/>
			<div
				ref={contentRef}
				className="side-panels"
				onScroll={(event) =>
					onScrollChange?.(event.currentTarget.scrollTop)
				}
			>
				{children}
			</div>
		</aside>
	);
}
