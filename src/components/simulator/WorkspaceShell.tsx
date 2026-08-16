import { useEffect, useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import { Button } from "@/components/ui/button";
import { PluginHostFrame } from "./PluginHostFrame";
import type { SurfaceSize } from "./model";

interface WorkspaceShellProps {
	tabs: Array<string>;
	activeTab: number;
	sidebarSize: SurfaceSize;
	tabsSize: SurfaceSize;
	onSelectTab: (index: number) => void;
	onAddTab: () => void;
	onCloseTab: (index: number) => void;
	appearance: "light" | "dark";
}

export function WorkspaceShell({
	tabs,
	activeTab,
	sidebarSize,
	tabsSize,
	onSelectTab,
	onAddTab,
	onCloseTab,
	appearance,
}: WorkspaceShellProps) {
	const [sidebarOpen, setSidebarOpen] = useState(false);
	const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);

	useEffect(() => {
		tabRefs.current[activeTab]?.scrollIntoView({
			block: "nearest",
			inline: "nearest",
		});
	}, [activeTab]);

	function handleTabKeyDown(
		event: KeyboardEvent<HTMLButtonElement>,
		index: number
	) {
		let next: number | undefined;
		if (event.key === "ArrowRight") next = (index + 1) % tabs.length;
		if (event.key === "ArrowLeft")
			next = (index - 1 + tabs.length) % tabs.length;
		if (event.key === "Home") next = 0;
		if (event.key === "End") next = tabs.length - 1;
		if (event.key === "Delete" || event.key === "Backspace") {
			event.preventDefault();
			onCloseTab(index);
			return;
		}
		if (next !== undefined) {
			event.preventDefault();
			onSelectTab(next);
			tabRefs.current[next]?.focus();
		}
	}

	return (
		<main
			className="flex min-h-0 flex-1 flex-col overflow-hidden p-3 sm:p-5"
			aria-label="Workspace"
		>
			<div className="mb-3 flex items-center justify-between gap-3 lg:hidden">
				<p className="text-sm font-medium">Workspace</p>
				<Button
					type="button"
					size="sm"
					variant="outline"
					aria-expanded={sidebarOpen}
					aria-controls="simulator-sidebar"
					onClick={() => setSidebarOpen(!sidebarOpen)}
				>
					{sidebarOpen ? "Hide sidebar" : "Show sidebar"}
				</Button>
			</div>
			<div className="flex min-h-0 flex-1 flex-col gap-3 lg:flex-row">
				<aside
					id="simulator-sidebar"
					className={`${sidebarOpen ? "flex" : "hidden"} min-h-0 shrink-0 flex-col overflow-hidden rounded-xl border border-border bg-card lg:flex`}
					style={{
						width: `min(${sidebarSize.width}px, 100%)`,
						height: `min(${sidebarSize.height}px, 100%)`,
					}}
					aria-label="Sidebar"
				>
					<div className="flex items-center justify-between border-b border-border px-4 py-3">
						<p className="text-sm font-medium">Sidebar</p>
						<span className="text-xs text-muted-foreground">
							{sidebarSize.width} × {sidebarSize.height}
						</span>
					</div>
					<div className="min-h-0 flex-1 overflow-auto p-3">
						<PluginHostFrame
							title="Sidebar plugin host"
							src={`/host?surface=sidebar&theme=${appearance}`}
						/>
					</div>
				</aside>
				<section
					className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-xl border border-border bg-card"
					style={{
						maxWidth: `${tabsSize.width}px`,
						minHeight: `min(${tabsSize.height}px, 100%)`,
					}}
					aria-label="Open tabs"
				>
					<div className="flex min-w-0 items-center border-b border-border px-2">
						<div
							className="flex min-w-0 flex-1 overflow-x-auto"
							role="tablist"
							aria-label="Open plugin tabs"
						>
							{tabs.map((tab, index) => (
								<button
									key={`${tab}-${index}`}
									ref={(element) => {
										tabRefs.current[index] = element;
									}}
									type="button"
									role="tab"
									aria-selected={activeTab === index}
									tabIndex={activeTab === index ? 0 : -1}
									className="relative min-w-28 shrink-0 border-b-2 border-transparent px-3 py-3 text-start text-sm text-muted-foreground outline-none focus-visible:bg-accent focus-visible:text-foreground aria-selected:border-foreground aria-selected:text-foreground"
									onClick={() => onSelectTab(index)}
									onKeyDown={(event) =>
										handleTabKeyDown(event, index)
									}
								>
									{tab}
									<span className="sr-only">
										{activeTab === index
											? ", selected"
											: ""}
									</span>
								</button>
							))}
						</div>
						<Button
							type="button"
							variant="ghost"
							size="icon-sm"
							aria-label="Open a new tab"
							title="Open a new tab"
							disabled={tabs.length >= 3}
							onClick={onAddTab}
						>
							+
						</Button>
					</div>
					<div className="flex min-h-0 flex-1 flex-col p-3 sm:p-5">
						<div className="min-h-0 flex-1 overflow-hidden rounded-lg bg-muted/40 ring-1 ring-black/5 dark:ring-white/10">
							<PluginHostFrame
								title={`${tabs[activeTab] ?? "Plugin"} plugin host`}
								src={`/host?surface=tab&instance=${activeTab}&theme=${appearance}`}
							/>
						</div>
					</div>
				</section>
			</div>
			<p className="sr-only" role="status" aria-live="polite">
				{tabs[activeTab] ?? "Workspace"} tab selected.
			</p>
		</main>
	);
}
