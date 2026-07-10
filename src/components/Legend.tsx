import React from 'react';

export const Legend: React.FC = () => (
	<div className="legend">
		<h4 className="legend-title">Legend</h4>
		<div className="legend-item">
			<span className="legend-line solid" />
			<span>State transition</span>
		</div>
		<div className="legend-item">
			<span className="legend-line dashed-gray" />
			<span>Cyclic transition</span>
		</div>
		<div className="legend-item">
			<span className="legend-arrow-up">↑</span>
			<span>Job released</span>
		</div>
		<div className="legend-item">
			<span className="legend-arrow-down">↓</span>
			<span>Job completing</span>
		</div>
		<div className="legend-item">
			<span className="legend-node-border thick" />
			<span>Initial state</span>
		</div>
	</div>
);
