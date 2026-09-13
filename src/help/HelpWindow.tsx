import { BookOpen } from 'lucide-react';
import type { WindowProps } from '../workspace/types';
import { helpTopics, type HelpState, type HelpTopic } from './topics';
import ApiReference from '../traversal/ApiReference';
import TraversalGuide from './TraversalGuide';
import ExplorerGuide from './ExplorerGuide';
export default function HelpWindow({
	initialState,
	onOpenHelp
}: WindowProps<HelpState>) {
	const topic = initialState.topic;
	return (
		<div className="help-window">
			<header>
				<BookOpen size={18} />
				<span>Help & documentation</span>
			</header>
			<div className="help-layout">
				<nav aria-label="Help contents">
					<h2 className="help-contents-title">Contents</h2>
					{(
						Object.entries(helpTopics) as [
							HelpTopic,
							(typeof helpTopics)[HelpTopic]
						][]
					).map(([id, item]) => (
						<button
							key={id}
							aria-current={id === topic ? 'page' : undefined}
							onClick={() => onOpenHelp?.(id)}
						>
							{item.title}
						</button>
					))}
				</nav>
				<article key={topic}>
					<h1>{helpTopics[topic].title}</h1>
					<p className="help-intro">
						{helpTopics[topic].description}
					</p>
					{topic === 'api' && <ApiReference />}
					{topic === 'overview' && (
						<>
							<section>
								<h2>Open a graph</h2>
								<p>
									Use <strong>Graphs → Upload graph</strong>{' '}
									to add a file to your library. Then choose{' '}
									<strong>New window</strong>, select Explorer
									or Traversal Simulator, and choose a graph.
									You can open several independent simulators
									for the same graph.
								</p>
							</section>
							<section>
								<h2>Choose your workspace</h2>
								<dl className="help-feature-list">
									<dt>Explorer</dt>
									<dd>
										Inspect states and transitions, adjust
										graph appearance, and manage areas.
									</dd>
									<dt>Traversal Simulator</dt>
									<dd>
										Define a priority function, follow the
										queue and replay an exploration.
									</dd>
									<dt>Strategy editor</dt>
									<dd>
										Keep a reusable strategy library and
										edit multiple functions in tabs. Open it
										from New window → Traversal Simulator →
										Strategy editor, even without a graph.
									</dd>
									<dt>Help</dt>
									<dd>
										Documentation opens in a single Help
										tab. Choose a section from the contents
										to switch pages. Return to your graph by
										selecting its tab.
									</dd>
								</dl>
							</section>
							<div className="help-tour-grid">
								{(['explorer', 'traversal'] as const).map(
									(id) => (
										<button
											key={id}
											onClick={() => onOpenHelp?.(id)}
										>
											<img
												src={`${import.meta.env.BASE_URL}help/${id}.png`}
												alt=""
												loading="lazy"
											/>
											<strong>
												{helpTopics[id].title}
											</strong>
											<span>
												{helpTopics[id].description}
											</span>
										</button>
									)
								)}
							</div>
							<section>
								<h2>Save your work</h2>
								<p>
									The workspace saves locally in this browser,
									including open windows and simulator drafts.
									Use Explorer’s save and download actions to
									keep graph edits and export YAML. Browser
									storage is local to this browser profile;
									clearing site data removes the workspace.
								</p>
								<p>
									Saved strategies and recordings remain
									available after closing their windows. A
									recording includes its own graph snapshot.
								</p>
							</section>
						</>
					)}
					{topic === 'explorer' && <ExplorerGuide />}
					{topic === 'traversal' && (
						<TraversalGuide onOpenApi={() => onOpenHelp?.('api')} />
					)}
				</article>
			</div>
		</div>
	);
}
