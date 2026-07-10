import React, { useCallback, useRef, useState } from 'react';
import { Sparkles } from 'lucide-react';
import type { SelectionState } from './types/graph';
import GraphViewer from './components/GraphViewer';
import type { GraphViewerHandle, NodeColorOverride } from './components/GraphViewer';
import { Toolbar } from './components/Toolbar';
import { Sidebar } from './components/Sidebar';
import { FileLoader } from './components/FileLoader';
import { Legend } from './components/Legend';
import { parseFile, serializeToYAML } from './core/parser';
import type { GraphFile } from './types/graph';
import type { LayoutName } from './core/layoutConfig';
import { normalizeLayoutName } from './core/layoutConfig';

export default function App() {
	const viewerRef = useRef<GraphViewerHandle>(null);

	const [graphData, setGraphData] = useState<GraphFile | null>(null);
	const [filename, setFilename] = useState('');
	const [layout, setLayout] = useState<LayoutName>('radial');
	const [showLoopbacks, setShowLoopbacks] = useState(true);
	const [showNormalEdges, setShowNormalEdges] = useState(true);
	const [enableAnimation, setEnableAnimation] = useState(true);
	const [stats, setStats] = useState<{ nodes: number; edges: number } | null>(
		null
	);
	const [error, setError] = useState<string | null>(null);
	const [showLegend, setShowLegend] = useState(true);

	// Color overrides: user-applied node colors on top of YAML data
	const [colorOverrides, setColorOverrides] = useState<
		Map<string, NodeColorOverride>
	>(new Map());

	const handleColorChange = useCallback(
		(
			nodeIds: string[],
			fill?: string | null,
			border?: string | null,
			hatch?: 'single' | 'cross' | 'none' | null
		) => {
			setColorOverrides((prev) => {
				const next = new Map(prev);
				for (const id of nodeIds) {
					const existing = { ...next.get(id) };
					if (fill !== undefined) {
						if (fill === null) delete existing.fill;
						else existing.fill = fill;
					}
					if (border !== undefined) {
						if (border === null) delete existing.border;
						else existing.border = border;
					}
					if (hatch !== undefined) {
						if (hatch === null) delete existing.hatch;
						else existing.hatch = hatch;
					}
					if (Object.keys(existing).length === 0) next.delete(id);
					else next.set(id, existing);
				}
				return next;
			});
		},
		[]
	);

	// Sidebar state
	const [sidebarTick, setSidebarTick] = useState(0);
	const [sidebarOpen, setSidebarOpen] = useState(false);

	const selectionRef = useRef<SelectionState | null>(null);

	const onSelectionChangeRef = useRef((selection: SelectionState | null) => {
		selectionRef.current = selection;
		if (selection === null) {
			setSidebarOpen(false);
		} else {
			setSidebarOpen(true);
			setSidebarTick((t) => t + 1);
		}
	});

	const handleLoad = useRef((graph: GraphFile, name: string) => {
		setGraphData(graph);
		setFilename(name);
		setColorOverrides(new Map()); // reset overrides on new file
		selectionRef.current = null;
		setSidebarOpen(false);
		setError(null);
		if (graph.layout?.algorithm) {
			setLayout(normalizeLayoutName(graph.layout.algorithm));
		}
	});

	const handleFileInput = useRef((file: File) => {
		const reader = new FileReader();
		reader.onload = (ev) => {
			try {
				const graph = parseFile(ev.target!.result as string);
				handleLoad.current(graph, file.name);
			} catch (err) {
				setError((err as Error).message);
			}
		};
		reader.readAsText(file);
	});

	return (
		<div className="app-root">
			{/* ── Header ── */}
			<header className="app-header">
				<div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
					<span className="app-title">
						State Transition Graph Visualizer
					</span>
					{filename && (
						<span className="filename-badge">{filename}</span>
					)}
				</div>
				<div className="header-actions">
					<button
						className={`header-toggle${enableAnimation ? ' is-active' : ''}`}
						type="button"
						aria-pressed={enableAnimation}
						onClick={() => setEnableAnimation((v) => !v)}
						title="Enable or disable entrance animation"
					>
						<Sparkles size={14} strokeWidth={2} aria-hidden="true" />
						Animation
					</button>
					<button
						className="header-toggle"
						type="button"
						onClick={() => setShowLegend((v) => !v)}
					>
						{showLegend ? 'Hide' : 'Show'} Legend
					</button>
				</div>
			</header>

			{/* ── Error banner ── */}
			{error && (
				<div className="error-banner" onClick={() => setError(null)}>
					⚠ {error} &nbsp;<strong>×</strong>
				</div>
			)}

			{/* ── Body ── */}
			<div className="app-body">
				{/* ── Canvas ── */}
				<main className="canvas-area">
					{!graphData ? (
						<div className="empty-state">
							<FileLoader
								onLoad={handleLoad.current}
								onError={setError}
							/>
						</div>
					) : (
						<>
							<Toolbar
								layout={layout}
								onLayoutChange={setLayout}
								showLoopbacks={showLoopbacks}
								onShowLoopbacksChange={setShowLoopbacks}
								showNormalEdges={showNormalEdges}
								onShowNormalEdgesChange={setShowNormalEdges}
								onFit={() => viewerRef.current?.fit()}
								onZoomIn={() => viewerRef.current?.zoomIn()}
								onZoomOut={() => viewerRef.current?.zoomOut()}
								onExport={() => {
									const url = viewerRef.current?.exportPNG();
									if (!url) return;
									const a = document.createElement('a');
									a.href = url;
									a.download =
										(filename.replace(/\.\w+$/, '') ||
											'graph') + '.svg';
									a.click();
								}}
								onSave={
									graphData
										? () => {
												const yaml = serializeToYAML(
													graphData,
													colorOverrides
												);
												const blob = new Blob([yaml], {
													type: 'text/yaml'
												});
												const url =
													URL.createObjectURL(blob);
												const a =
													document.createElement('a');
												a.href = url;
												a.download =
													(filename.replace(
														/\.\w+$/,
														''
													) || 'graph') + '.yaml';
												a.click();
												URL.revokeObjectURL(url);
											}
										: undefined
								}
								onSearch={(q) => {
									if (q.trim())
										viewerRef.current?.focusNode(q.trim());
								}}
								stats={stats}
							/>

							<GraphViewer
								ref={viewerRef}
								graphData={graphData}
								layout={layout}
								showLoopbacks={showLoopbacks}
								showNormalEdges={showNormalEdges}
								enableAnimation={enableAnimation}
								onSelectionChange={onSelectionChangeRef.current}
								onStatsChange={setStats}
								colorOverrides={colorOverrides}
							/>

							<label className="reload-btn">
								<input
									type="file"
									accept=".yaml,.yml,.json"
									style={{ display: 'none' }}
									onChange={(e) => {
										const f = e.target.files?.[0];
										if (f) handleFileInput.current(f);
									}}
								/>
								↺ Load new file
							</label>
						</>
					)}
				</main>

				{/* ── Side panels ── */}
				<aside className="side-panels">
					{showLegend && <Legend />}
					{sidebarOpen && selectionRef.current && (
						<Sidebar
							key={sidebarTick}
							selection={selectionRef.current}
							systemConfig={graphData?.system}
							onClose={() => setSidebarOpen(false)}
							colorOverrides={colorOverrides}
							onColorChange={handleColorChange}
						/>
					)}
				</aside>
			</div>
		</div>
	);
}
