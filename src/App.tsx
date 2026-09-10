import React, { useCallback, useRef, useState } from 'react';
import { Sparkles } from 'lucide-react';
import type { SelectionState, GraphArea, LabelPosition } from './types/graph';
import GraphViewer from './components/graphViewer';
import type {
	GraphViewerHandle,
	NodeColorOverride,
	AreaOverride
} from './components/graphViewer';
import { Toolbar } from './components/Toolbar';
import { Sidebar } from './components/Sidebar';
import { FileLoader } from './components/FileLoader';
import { Legend } from './components/Legend';
import { AreasList } from './components/AreasList';
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
	const [showLegend, setShowLegend] = useState(false);
	const [showAreas, setShowAreas] = useState(true);
	const [hiddenAreaIds, setHiddenAreaIds] = useState<Set<string>>(new Set());

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

	// Area overrides and selection
	const [areaOverrides, setAreaOverrides] = useState<
		Map<string, AreaOverride>
	>(new Map());
	const [selectedArea, setSelectedArea] = useState<GraphArea | null>(null);

	const handleAreaColorChange = useCallback(
		(
			fill?: string | null,
			border?: string | null,
			hatch?: 'single' | 'cross' | 'none' | null
		) => {
			if (!selectedArea) return;
			const areaId = selectedArea.id;
			setAreaOverrides((prev) => {
				const next = new Map(prev);
				const existing = { ...next.get(areaId) };
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
				if (Object.keys(existing).length === 0) next.delete(areaId);
				else next.set(areaId, existing);
				return next;
			});
		},
		[selectedArea]
	);

	const handleAreaLabelPositionChange = useCallback(
		(pos: LabelPosition) => {
			if (!selectedArea) return;
			const areaId = selectedArea.id;
			setAreaOverrides((prev) => {
				const next = new Map(prev);
				const existing = { ...next.get(areaId) };
				existing.labelPosition = pos;
				next.set(areaId, existing);
				return next;
			});
		},
		[selectedArea]
	);

	const handleAssignNodeToArea = useCallback(
		(nodeId: string, areaId: string | null) => {
			if (!graphData) return;
			setAreaOverrides((prev) => {
				const next = new Map(prev);
				for (const area of graphData.areas ?? []) {
					const ov = next.get(area.id);
					const currentNodes = ov?.nodes ?? area.nodeIds;
					if (currentNodes.includes(nodeId)) {
						const updated = currentNodes.filter(
							(id) => id !== nodeId
						);
						if (updated.length > 0 || ov) {
							next.set(area.id, { ...ov, nodes: updated });
						}
					}
				}
				if (areaId) {
					const targetArea = graphData.areas?.find(
						(a) => a.id === areaId
					);
					if (targetArea) {
						const ov = next.get(areaId);
						const currentNodes = ov?.nodes ?? targetArea.nodeIds;
						if (!currentNodes.includes(nodeId)) {
							next.set(areaId, {
								...ov,
								nodes: [...currentNodes, nodeId]
							});
						}
					}
				}
				return next;
			});
		},
		[graphData]
	);

	const handleAssignGroupToArea = useCallback(
		(nodeIds: string[], areaId: string | null) => {
			if (!graphData) return;
			setAreaOverrides((prev) => {
				const next = new Map(prev);
				// Remove all selected nodes from every area
				for (const area of graphData.areas ?? []) {
					const ov = next.get(area.id);
					const currentNodes = ov?.nodes ?? area.nodeIds;
					const updated = currentNodes.filter(
						(id) => !nodeIds.includes(id)
					);
					if (updated.length !== currentNodes.length || ov) {
						next.set(area.id, { ...ov, nodes: updated });
					}
				}
				// Add all to target area
				if (areaId) {
					const targetArea = graphData.areas?.find(
						(a) => a.id === areaId
					);
					if (targetArea) {
						const ov = next.get(areaId);
						const currentNodes = ov?.nodes ?? targetArea.nodeIds;
						const merged = [
							...currentNodes.filter(
								(id) => !nodeIds.includes(id)
							),
							...nodeIds
						];
						next.set(areaId, { ...ov, nodes: merged });
					}
				}
				return next;
			});
		},
		[graphData]
	);

	const handleAreaSelect = useCallback((area: GraphArea | null) => {
		setSelectedArea(area);
		if (area) {
			setSidebarOpen(false);
			viewerRef.current?.clearSelection();
		}
	}, []);

	const handleAreaLabelChange = useCallback(
		(label: string) => {
			if (!selectedArea) return;
			const id = selectedArea.id;
			setGraphData((prev) =>
				prev
					? {
							...prev,
							areas: prev.areas?.map((a) =>
								a.id === id
									? { ...a, label: label || undefined }
									: a
							)
						}
					: prev
			);
			setSelectedArea((prev) =>
				prev ? { ...prev, label: label || undefined } : null
			);
		},
		[selectedArea]
	);

	const handleDeleteArea = useCallback(() => {
		if (!selectedArea) return;
		const id = selectedArea.id;
		setGraphData((prev) =>
			prev
				? { ...prev, areas: prev.areas?.filter((a) => a.id !== id) }
				: prev
		);
		setAreaOverrides((prev) => {
			const next = new Map(prev);
			next.delete(id);
			return next;
		});
		setSelectedArea(null);
	}, [selectedArea]);

	const handleCreateArea = useCallback(
		(nodeIds: string[]) => {
			if (!graphData) return;
			const existingIds = new Set(
				graphData.areas?.map((a) => a.id) ?? []
			);
			let n = (graphData.areas?.length ?? 0) + 1;
			let newId = `area-${n}`;
			while (existingIds.has(newId)) {
				n += 1;
				newId = `area-${n}`;
			}
			const newArea = {
				id: newId,
				nodeIds,
				labelPosition: 'top-left' as const
			};
			setGraphData((prev) =>
				prev
					? { ...prev, areas: [...(prev.areas ?? []), newArea] }
					: prev
			);
			setSelectedArea(newArea);
			setSidebarOpen(false);
			viewerRef.current?.clearSelection();
		},
		[graphData]
	);

	const handleSelectAreaNodes = useCallback(() => {
		if (!selectedArea) return;
		const ov = areaOverrides.get(selectedArea.id);
		const nodeIds = ov?.nodes ?? selectedArea.nodeIds;
		viewerRef.current?.selectNodes(nodeIds);
		setSelectedArea(null);
	}, [selectedArea, areaOverrides]);

	const handleToggleAreaVisibility = useCallback((areaId: string) => {
		setHiddenAreaIds((prev) => {
			const next = new Set(prev);
			if (next.has(areaId)) next.delete(areaId);
			else next.add(areaId);
			return next;
		});
	}, []);

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
			setSelectedArea(null); // clear area selection when node selected
		}
	});

	const handleLoad = useRef((graph: GraphFile, name: string) => {
		setGraphData(graph);
		setFilename(name);
		setColorOverrides(new Map()); // reset overrides on new file
		setAreaOverrides(new Map());
		setSelectedArea(null);
		setHiddenAreaIds(new Set());
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
						<Sparkles
							size={14}
							strokeWidth={2}
							aria-hidden="true"
						/>
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
								showAreas={showAreas}
								onShowAreasChange={setShowAreas}
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
													colorOverrides,
													areaOverrides
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
								areaOverrides={areaOverrides}
								onAreaSelect={handleAreaSelect}
								showAreas={showAreas}
								hiddenAreaIds={hiddenAreaIds}
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
				<aside
					className="side-panels"
					style={{
						display:
							showLegend ||
							sidebarOpen ||
							selectedArea ||
							graphData?.areas?.length
								? undefined
								: 'none'
					}}
				>
					{showLegend && <Legend />}
					{graphData?.areas && graphData.areas.length > 0 && (
						<AreasList
							areas={graphData.areas}
							areaOverrides={areaOverrides}
							selectedAreaId={selectedArea?.id}
							hiddenAreaIds={hiddenAreaIds}
							onAreaSelect={handleAreaSelect}
							onToggleAreaVisibility={handleToggleAreaVisibility}
						/>
					)}
					{(sidebarOpen && selectionRef.current) || selectedArea ? (
						<Sidebar
							key={
								selectedArea
									? `area-${selectedArea.id}`
									: `node-${sidebarTick}`
							}
							selection={selectionRef.current ?? undefined}
							systemConfig={graphData?.system}
							graphData={graphData ?? undefined}
							onClose={() => {
								setSidebarOpen(false);
								setSelectedArea(null);
								viewerRef.current?.clearSelection();
							}}
							colorOverrides={colorOverrides}
							onColorChange={handleColorChange}
							selectedArea={selectedArea ?? undefined}
							areaOverride={
								selectedArea
									? areaOverrides.get(selectedArea.id)
									: undefined
							}
							allAreas={graphData?.areas}
							onAreaColorChange={handleAreaColorChange}
							onAreaLabelPositionChange={
								handleAreaLabelPositionChange
							}
							onSelectAreaNodes={
								selectedArea ? handleSelectAreaNodes : undefined
							}
							onAssignNodeToArea={
								selectionRef.current?.nodes.length === 1
									? (areaId) =>
											handleAssignNodeToArea(
												selectionRef.current!.nodes[0]
													.id,
												areaId
											)
									: undefined
							}
							onCreateArea={handleCreateArea}
							onAssignGroupToArea={
								selectionRef.current &&
								selectionRef.current.nodes.length > 1
									? handleAssignGroupToArea
									: undefined
							}
							onAreaLabelChange={handleAreaLabelChange}
							onDeleteArea={
								selectedArea ? handleDeleteArea : undefined
							}
						/>
					) : null}
				</aside>
			</div>
		</div>
	);
}
