import React from 'react';
import type { GraphNode, SystemConfig } from '../types/graph';

// ── Layout constants ──────────────────────────────────────────────────────────

const CW = 32; // cell width (px per time unit)
const CH = 30; // cell height per task row
const LW = 46; // left label column width
const AXH = 24; // bottom axis area height
const RPAD = 26; // right padding after last time mark
const VP = 4; // vertical padding inside task row (exec block inset)
const MIN_DISPLAY = 6; // minimum number of intervals to display
const LOOKAHEAD = 3; // extra "future" steps always shown when path is short

// ── Color palette (fill / stroke per task) ────────────────────────────────────

// Task identity is carried by the labelled rows; keep execution neutral,
// reserving the application accent for the selected time and deadlines.
const TASK_COLORS = [
	{ fill: '#e5e5e5', stroke: '#6b6b6b' },
	{ fill: '#f0f0f0', stroke: '#858585' }
];
const ARROW_COLOR = '#2c2c2c';
const DEADLINE_COLOR = '#9b2e23';
const GRID_LIGHT = '#e5e5e5';
const GRID_BORDER = '#b5b5b5';
const FUTURE_BG = '#f7f7f7';
const FUTURE_GRID = '#ebebeb';

// ── Helpers ───────────────────────────────────────────────────────────────────

const SUBS: Record<number, string> = {
	0: '₀',
	1: '₁',
	2: '₂',
	3: '₃',
	4: '₄',
	5: '₅',
	6: '₆',
	7: '₇',
	8: '₈',
	9: '₉'
};

function getLabel(tasks: SystemConfig['tasks'], idx: number): string {
	const name = tasks[idx]?.name;
	if (name) return name;
	const n = idx + 1;
	return 'τ' + (n <= 9 ? SUBS[n] : String(n));
}

function ptsUp(cx: number, cy: number): string {
	return `${cx},${cy} ${cx - 3.5},${cy + 6} ${cx + 3.5},${cy + 6}`;
}
function ptsDn(cx: number, cy: number): string {
	return `${cx},${cy} ${cx - 3.5},${cy - 6} ${cx + 3.5},${cy - 6}`;
}
function ptsRight(cx: number, cy: number): string {
	return `${cx},${cy} ${cx - 7},${cy - 3.5} ${cx - 7},${cy + 3.5}`;
}

// ── Component ─────────────────────────────────────────────────────────────────

interface Props {
	path: GraphNode[];
	systemConfig: SystemConfig;
	showDeadlines: boolean;
}

export const SchedulingDiagram = React.forwardRef<SVGSVGElement, Props>(
	({ path, systemConfig, showDeadlines }, ref) => {
		const nT = systemConfig.tasks.length;
		const nInt = path.length - 1; // actual execution intervals
		const nTP = path.length; // actual time points

		// Minimum display columns: always extend at least to MIN_DISPLAY,
		// and always show LOOKAHEAD future steps beyond actual path.
		const displayCols = Math.max(nInt + LOOKAHEAD, MIN_DISPLAY);

		if (nT === 0 || nTP === 0) return null;

		// ── Execution intervals ───────────────────────────────────────────────

		const executes = (taskIdx: number, t: number): boolean => {
			if (t >= nInt) return false;
			const prevC = path[t].tasks[taskIdx]?.task.c ?? 0;
			const nextC = path[t + 1].tasks[taskIdx]?.task.c ?? 0;
			return prevC > nextC;
		};

		// ── Deadline markers ──────────────────────────────────────────────────

		// release='up' at time t with d > 0 → deadline at t + d
		const deadlineMap = new Map<number, number[]>(); // taskIdx → abs times
		if (showDeadlines) {
			for (let i = 0; i < nT; i++) {
				for (let t = 0; t < nTP; t++) {
					const td = path[t].tasks[i];
					if (td?.release === 'up' && td.task.d > 0) {
						const absT = t + td.task.d;
						const arr = deadlineMap.get(i) ?? [];
						arr.push(absT);
						deadlineMap.set(i, arr);
					}
				}
			}
		}

		// SVG must be wide enough to show deadlines that fall beyond displayCols
		let maxT = displayCols;
		for (const times of deadlineMap.values())
			for (const t of times) if (t > maxT) maxT = t;

		// ── SVG geometry ──────────────────────────────────────────────────────

		const svgW = LW + maxT * CW + RPAD + 14;
		const svgH = nT * CH + AXH;

		const ty = (i: number) => i * CH;
		const tx = (t: number) => LW + t * CW;

		// ── Render ────────────────────────────────────────────────────────────

		return (
			<div className="sched-diagram-scroll">
				<svg
					ref={ref}
					width={svgW}
					height={svgH}
					style={{ display: 'block', overflow: 'visible' }}
					aria-label="Scheduling diagram"
				>
					{/* White background for clean export */}
					<rect x={0} y={0} width={svgW} height={svgH} fill="white" />

					{/* ── Future (lookahead) region background ── */}
					{displayCols > nInt && (
						<rect
							x={tx(nInt)}
							y={0}
							width={(displayCols - nInt) * CW}
							height={nT * CH}
							fill={FUTURE_BG}
						/>
					)}

					{/* ── Path region: alternating row backgrounds ── */}
					{Array.from({ length: nT }, (_, i) => (
						<rect
							key={`bg-${i}`}
							x={LW}
							y={ty(i)}
							width={Math.max(nInt, 0) * CW}
							height={CH}
							fill={i % 2 === 0 ? '#FFFFFF' : '#fafafa'}
						/>
					))}

					{/* Highlight column of selected state (last path node) */}
					{nInt > 0 && (
						<rect
							x={tx(nInt) - CW * 0.5}
							y={0}
							width={CW * 0.5}
							height={nT * CH}
							fill="rgba(155, 46, 35, 0.08)"
						/>
					)}

					{/* ── Vertical grid lines ── */}
					{Array.from({ length: maxT + 1 }, (_, t) => (
						<line
							key={`vg-${t}`}
							x1={tx(t)}
							y1={0}
							x2={tx(t)}
							y2={nT * CH}
							stroke={t <= nInt ? GRID_LIGHT : FUTURE_GRID}
							strokeWidth={1}
						/>
					))}

					{/* ── Horizontal row borders ── */}
					{Array.from({ length: nT + 1 }, (_, i) => (
						<line
							key={`hg-${i}`}
							x1={LW}
							y1={i * CH}
							x2={LW + maxT * CW}
							y2={i * CH}
							stroke={
								i === 0 || i === nT ? GRID_BORDER : GRID_LIGHT
							}
							strokeWidth={i === 0 || i === nT ? 1 : 0.75}
						/>
					))}

					{/* Left border */}
					<line
						x1={LW}
						y1={0}
						x2={LW}
						y2={nT * CH}
						stroke={GRID_BORDER}
						strokeWidth={1}
					/>

					{/* ── Task labels ── */}
					{Array.from({ length: nT }, (_, i) => (
						<text
							key={`lbl-${i}`}
							x={LW - 7}
							y={ty(i) + CH / 2}
							textAnchor="end"
							dominantBaseline="middle"
							fontSize={11}
							fontWeight={600}
							fill="#2c2c2c"
							fontFamily="var(--font-mono)"
						>
							{getLabel(systemConfig.tasks, i)}
						</text>
					))}

					{/* ── Execution blocks ── */}
					{Array.from({ length: nT }, (_, i) =>
						Array.from({ length: nInt }, (_, t) => {
							if (!executes(i, t)) return null;
							const { fill, stroke } =
								TASK_COLORS[i % TASK_COLORS.length];
							return (
								<rect
									key={`ex-${i}-${t}`}
									x={tx(t) + 1}
									y={ty(i) + VP}
									width={CW - 2}
									height={CH - VP * 2}
									fill={fill}
									stroke={stroke}
									strokeWidth={1}
									rx={2}
								/>
							);
						})
					)}

					{/* ── Release & completion arrows ── */}
					{Array.from({ length: nT }, (_, i) =>
						Array.from({ length: nTP }, (_, t) => {
							const rel = path[t].tasks[i]?.release;
							if (!rel || rel === 'none') return null;
							const x = tx(t);
							const yTop = ty(i) + 1;
							const yBot = ty(i) + CH - 1;
							if (rel === 'up') {
								return (
									<g key={`up-${i}-${t}`}>
										<line
											x1={x}
											y1={yBot}
											x2={x}
											y2={yTop + 7}
											stroke={ARROW_COLOR}
											strokeWidth={1}
										/>
										<polygon
											points={ptsUp(x, yTop)}
											fill={ARROW_COLOR}
										/>
									</g>
								);
							}
							return (
								<g key={`dn-${i}-${t}`}>
									<line
										x1={x}
										y1={yTop}
										x2={x}
										y2={yBot - 7}
										stroke={ARROW_COLOR}
										strokeWidth={1}
									/>
									<polygon
										points={ptsDn(x, yBot)}
										fill={ARROW_COLOR}
									/>
								</g>
							);
						})
					)}

					{/* ── Deadline markers ── */}
					{showDeadlines &&
						Array.from(deadlineMap.entries()).flatMap(
							([i, times]) =>
								times.map((absT, ki) => {
									const x = tx(absT);
									const yTop = ty(i) + 2;
									const yBot = ty(i) + CH - 2;
									return (
										<g key={`dl-${i}-${absT}-${ki}`}>
											<line
												x1={x}
												y1={yTop + 6}
												x2={x}
												y2={yBot}
												stroke={DEADLINE_COLOR}
												strokeWidth={1}
												strokeDasharray="3,2"
											/>
											<polygon
												points={ptsUp(x, yTop)}
												fill={DEADLINE_COLOR}
											/>
											<line
												x1={x}
												y1={yTop + 6}
												x2={x + 7}
												y2={yTop + 6}
												stroke={DEADLINE_COLOR}
												strokeWidth={1}
											/>
										</g>
									);
								})
						)}

					{/* ── Bottom axis ── */}
					<line
						x1={LW}
						y1={nT * CH}
						x2={tx(maxT) + 8}
						y2={nT * CH}
						stroke="#2c2c2c"
						strokeWidth={1}
					/>
					<polygon
						points={ptsRight(tx(maxT) + 14, nT * CH)}
						fill="#2c2c2c"
					/>
					<text
						x={tx(maxT) + 18}
						y={nT * CH + 1}
						dominantBaseline="middle"
						fontSize={11}
						fontStyle="italic"
						fill="#2c2c2c"
						fontFamily="var(--font-ui)"
					>
						t
					</text>

					{/* ── Tick marks & labels — start from 1, skip t=0 ── */}
					{Array.from({ length: maxT }, (_, idx) => {
						const t = idx + 1; // labels: 1, 2, 3, …
						const x = tx(t);
						const y = nT * CH;
						const isFuture = t > nInt;
						const isDeadlineTick =
							showDeadlines &&
							t > displayCols &&
							Array.from(deadlineMap.values()).some((times) =>
								times.includes(t)
							);
						const tickColor = isDeadlineTick
							? DEADLINE_COLOR
							: isFuture
								? '#C9CDD2'
								: '#2c2c2c';
						const labelColor = isDeadlineTick
							? DEADLINE_COLOR
							: isFuture
								? '#C9CDD2'
								: '#6B7280';
						return (
							<g key={`tick-${t}`}>
								<line
									x1={x}
									y1={y}
									x2={x}
									y2={y + 5}
									stroke={tickColor}
									strokeWidth={1}
								/>
								<text
									x={x}
									y={y + 16}
									textAnchor="middle"
									fontSize={9}
									fill={labelColor}
									fontFamily="var(--font-mono)"
								>
									{t}
								</text>
							</g>
						);
					})}

					{/* Processor count badge (top-left of grid) */}
					{systemConfig.m !== undefined && (
						<text
							x={LW + 4}
							y={4}
							fontSize={9}
							fill="#9CA3AF"
							fontFamily="var(--font-mono)"
							dominantBaseline="hanging"
						>
							m={systemConfig.m}
						</text>
					)}

					{/* Future region separator — light dashed vertical line */}
					{displayCols > nInt && nInt > 0 && (
						<line
							x1={tx(nInt)}
							y1={0}
							x2={tx(nInt)}
							y2={nT * CH}
							stroke="#C9CDD2"
							strokeWidth={1}
							strokeDasharray="4,3"
						/>
					)}
				</svg>
			</div>
		);
	}
);

SchedulingDiagram.displayName = 'SchedulingDiagram';
