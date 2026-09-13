export default function Screenshot({
	name,
	alt
}: {
	name: string;
	alt: string;
}) {
	const src = `${import.meta.env.BASE_URL}help/${name}.png`;
	return (
		<figure className="help-screenshot">
			<a
				href={src}
				target="_blank"
				rel="noreferrer"
				aria-label={`Enlarge screenshot: ${alt}`}
			>
				<img
					src={src}
					alt={alt}
					loading="lazy"
					width="1280"
					height="720"
				/>
			</a>
		</figure>
	);
}
