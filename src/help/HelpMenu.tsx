import { useEffect, useRef } from 'react';
import { CircleHelp } from 'lucide-react';
import { helpTopics, type HelpTopic } from './topics';
export function HelpMenu({
	onOpen,
	onOpenStrategies
}: {
	onOpen: (topic: HelpTopic) => void;
	onOpenStrategies: () => void;
}) {
	const ref = useRef<HTMLDetailsElement>(null);
	useEffect(() => {
		const outside = (e: PointerEvent) => {
			if (ref.current && !ref.current.contains(e.target as Node))
				ref.current.open = false;
		};
		const escape = (e: KeyboardEvent) => {
			if (e.key === 'Escape' && ref.current?.open) {
				ref.current.open = false;
				ref.current.querySelector('summary')?.focus();
			}
		};
		document.addEventListener('pointerdown', outside);
		document.addEventListener('keydown', escape);
		return () => {
			document.removeEventListener('pointerdown', outside);
			document.removeEventListener('keydown', escape);
		};
	}, []);
	return (
		<details className="workspace-help-menu" ref={ref}>
			<summary aria-label="Help" title="Help">
				<CircleHelp size={17} />
			</summary>
			<div className="workspace-help-popover">
				<div className="library-caption">Help & documentation</div>
				{(
					Object.entries(helpTopics) as [
						HelpTopic,
						(typeof helpTopics)[HelpTopic]
					][]
				).map(([topic, item]) => (
					<button
						key={topic}
						onClick={() => {
							ref.current!.open = false;
							onOpen(topic);
						}}
					>
						<span>
							<strong>{item.title}</strong>
							<small>{item.description}</small>
						</span>
					</button>
				))}
				<button
					onClick={() => {
						ref.current!.open = false;
						onOpenStrategies();
					}}
				>
					<span>
						<strong>Strategy editor</strong>
						<small>Manage strategies and open code tabs</small>
					</span>
				</button>
			</div>
		</details>
	);
}
