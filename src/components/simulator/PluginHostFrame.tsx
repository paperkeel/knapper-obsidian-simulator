interface PluginHostFrameProps {
	/** URL of the plugin host entry point. The server can replace this placeholder. */
	src?: string;
	title?: string;
}

/** Renders the isolated plugin host boundary used by the simulator. */
export function PluginHostFrame({
	src,
	title = "Plugin host",
}: PluginHostFrameProps) {
	return src ? (
		<iframe
			className="size-full border-0 bg-background"
			title={title}
			src={src}
		/>
	) : (
		<div className="flex size-full flex-col items-center justify-center gap-3 bg-background p-6 text-center">
			<div className="flex size-11 items-center justify-center rounded-xl bg-accent text-xl text-accent-foreground ring-1 ring-black/5 dark:ring-white/10">
				◇
			</div>
			<div>
				<h2 className="text-base font-medium">Plugin host ready</h2>
				<p className="mt-1 max-w-[34ch] text-sm text-pretty text-muted-foreground">
					The built plugin bundle will render here when the host is
					connected.
				</p>
			</div>
		</div>
	);
}
