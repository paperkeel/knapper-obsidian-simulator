import type { SurfaceSize } from "./model";

interface SettingsScreenProps {
	size: SurfaceSize;
	appearance: "light" | "dark";
}

export function SettingsScreen({ size, appearance }: SettingsScreenProps) {
	return (
		<main
			className="flex min-h-0 flex-1 justify-center overflow-auto p-4 sm:p-8"
			aria-labelledby="settings-title"
		>
			<section
				className="flex w-full min-w-0 flex-col overflow-hidden rounded-xl border border-border bg-card"
				style={{
					maxWidth: `${size.width}px`,
					minHeight: `${size.height}px`,
				}}
			>
				<div className="border-b border-border px-5 py-4 sm:px-7">
					<p className="text-xs font-medium tracking-wide text-muted-foreground">
						Simulator settings
					</p>
					<h1
						id="settings-title"
						className="mt-1 text-xl font-medium text-balance"
					>
						Settings
					</h1>
				</div>
				<div className="min-h-0 flex-1">
					<iframe
						className="size-full min-h-[32rem] border-0 bg-background"
						title="Plugin settings"
						src={`/host?surface=settings&theme=${appearance}`}
					/>
				</div>
				<div className="flex flex-col gap-7 border-t border-border p-5 sm:p-7">
					<section className="flex flex-col gap-2">
						<h2 className="text-base font-medium">
							About this simulator
						</h2>
						<dl className="grid gap-3 text-sm sm:grid-cols-[10rem_1fr]">
							<dt className="text-muted-foreground">
								Compatibility target
							</dt>
							<dd>Obsidian desktop</dd>
							<dt className="text-muted-foreground">Open tabs</dt>
							<dd>Up to three</dd>
							<dt className="text-muted-foreground">Vault</dt>
							<dd className="font-mono text-xs break-all">
								.knapper_files
							</dd>
						</dl>
					</section>
				</div>
			</section>
		</main>
	);
}
