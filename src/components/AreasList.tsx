import React from 'react';
import type { GraphArea } from '../types/graph';
import type { AreaOverride } from './GraphViewer';

interface Props {
	areas: GraphArea[];
	areaOverrides: Map<string, AreaOverride>;
	selectedAreaId?: string;
	onAreaSelect: (area: GraphArea) => void;
}

export const AreasList: React.FC<Props> = ({
	areas,
	areaOverrides,
	selectedAreaId,
	onAreaSelect,
}) => {
	if (areas.length === 0) return null;
	return (
		<div className="areas-list">
			<div className="areas-list-header">
				<span className="legend-title">Areas</span>
				<span className="badge badge-group">{areas.length}</span>
			</div>
			{areas.map((area) => {
				const ov = areaOverrides.get(area.id);
				const fill = ov?.fill ?? area.fillColor ?? '#E8EBF0';
				const border = ov?.border ?? area.borderColor ?? '#374151';
				return (
					<button
						key={area.id}
						className={`areas-list-item${area.id === selectedAreaId ? ' is-selected' : ''}`}
						type="button"
						onClick={() => onAreaSelect(area)}
					>
						<span
							className="areas-list-swatch"
							style={{ background: fill, borderColor: border }}
						/>
						<span className="areas-list-label">
							{area.label ?? area.id}
						</span>
					</button>
				);
			})}
		</div>
	);
};
