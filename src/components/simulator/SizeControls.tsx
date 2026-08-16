import { useState } from "react";
import { Button } from "@/components/ui/button";
import type { SurfaceName, SurfaceSize } from "./model";

const presets: Record<
	SurfaceName,
	Array<{ label: string; size: SurfaceSize }>
> = {
	sidebar: [
		{ label: "Compact", size: { width: 240, height: 480 } },
		{ label: "Default", size: { width: 280, height: 560 } },
		{ label: "Wide", size: { width: 360, height: 680 } },
	],
	tabs: [
		{ label: "Compact", size: { width: 520, height: 480 } },
		{ label: "Default", size: { width: 720, height: 560 } },
		{ label: "Wide", size: { width: 960, height: 680 } },
	],
	settings: [
		{ label: "Compact", size: { width: 600, height: 520 } },
		{ label: "Default", size: { width: 760, height: 600 } },
		{ label: "Wide", size: { width: 960, height: 760 } },
	],
};

interface SizeControlsProps {
	sizes: Record<SurfaceName, SurfaceSize>;
	onChange: (surface: SurfaceName, size: SurfaceSize) => void;
}

export function SizeControls({ sizes, onChange }: SizeControlsProps) {
	const [open, setOpen] = useState(false);
	return (
		<div className="relative">
			<Button
				type="button"
				variant="outline"
				size="sm"
				aria-expanded={open}
				onClick={() => setOpen(!open)}
			>
				Simulation size
			</Button>
			{open ? (
				<div className="absolute end-0 top-[calc(100%+0.5rem)] z-20 w-[min(20rem,calc(100vw-2rem))] rounded-xl border border-border bg-popover p-4 text-popover-foreground shadow-lg dark:shadow-none">
					<div className="flex flex-col gap-4">
						{(Object.keys(presets) as Array<SurfaceName>).map(
							(surface) => (
								<fieldset
									key={surface}
									className="flex flex-col gap-2"
								>
									<legend className="text-sm font-medium capitalize">
										{surface} size
									</legend>
									<div
										className="flex flex-wrap gap-1.5"
										role="group"
										aria-label={`${surface} size presets`}
									>
										{presets[surface].map((preset) => (
											<Button
												key={preset.label}
												type="button"
												size="xs"
												variant={
													sizes[surface].width ===
														preset.size.width &&
													sizes[surface].height ===
														preset.size.height
														? "secondary"
														: "ghost"
												}
												onClick={() =>
													onChange(
														surface,
														preset.size
													)
												}
											>
												{preset.label}
											</Button>
										))}
									</div>
									<div className="grid grid-cols-2 gap-2">
										{(["width", "height"] as const).map(
											(dimension) => (
												<label
													key={dimension}
													className="flex min-w-0 flex-col gap-1 text-xs text-muted-foreground"
												>
													{dimension}
													<input
														className="h-8 min-w-0 rounded-md border border-input bg-background px-2 text-base text-foreground outline-none focus-visible:border-ring focus-visible:ring-1 focus-visible:ring-ring/50 sm:text-sm"
														type="number"
														name={`${surface}-${dimension}`}
														min={160}
														max={1600}
														value={
															sizes[surface][
																dimension
															]
														}
														onChange={(event) =>
															onChange(surface, {
																...sizes[
																	surface
																],
																[dimension]:
																	Math.max(
																		160,
																		Number(
																			event
																				.target
																				.value
																		) || 160
																	),
															})
														}
													/>
												</label>
											)
										)}
									</div>
								</fieldset>
							)
						)}
					</div>
				</div>
			) : null}
		</div>
	);
}
