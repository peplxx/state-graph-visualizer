import React from 'react';
import { Eye, EyeOff } from 'lucide-react';
import type { GraphArea } from '../types/graph';
import type { AreaOverride } from './graphViewer';

interface Props {
	areas: GraphArea[];
	areaOverrides: Map<string, AreaOverride>;
	selectedAreaId?: string;
	hiddenAreaIds?: Set<string>;
	onAreaSelect: (area: GraphArea) => void;
	onToggleAreaVisibility?: (areaId: string) => void;
}

export const AreasList: React.FC<Props> = ({
	areas,
	areaOverrides,
	selectedAreaId,
	hiddenAreaIds,
	onAreaSelect,
	onToggleAreaVisibility,
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
				const hidden = hiddenAreaIds?.has(area.id) ?? false;
				return (
					<div
						key={area.id}
						className={`areas-list-item${area.id === selectedAreaId ? ' is-selected' : ''}${hidden ? ' is-hidden' : ''}`}
					>
						<button
							className="areas-list-item-main"
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
						{onToggleAreaVisibility && (
							<button
								className="areas-list-eye"
								type="button"
								title={hidden ? 'Show area' : 'Hide area'}
								onClick={(e) => {
									e.stopPropagation();
									onToggleAreaVisibility(area.id);
								}}
							>
								{hidden ? <EyeOff size={12} /> : <Eye size={12} />}
							</button>
						)}
					</div>
				);
			})}
		</div>
	);
};
