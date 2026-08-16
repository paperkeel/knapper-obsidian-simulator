import { useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Moon, PanelRight, RotateCcw, Settings2, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ResetDialog } from "@/components/simulator/ResetDialog";
import { SettingsScreen } from "@/components/simulator/SettingsScreen";
import { SizeControls } from "@/components/simulator/SizeControls";
import { WorkspaceShell } from "@/components/simulator/WorkspaceShell";
import {
	createBrowserStorage,
	defaultSimulatorState,
	normalizeState,
} from "@/components/simulator/model";
import type {
	Screen,
	SimulatorState,
	SurfaceName,
} from "@/components/simulator/model";

export const Route = createFileRoute("/")({ component: App });

function App() {
	const storage = useMemo(() => createBrowserStorage(), []);
	const [state, setState] = useState<SimulatorState>(() =>
		normalizeState(storage.read())
	);
	const [resetOpen, setResetOpen] = useState(false);
	const [status, setStatus] = useState("Workspace ready.");

	useEffect(() => {
		storage.write(state);
		document.documentElement.classList.toggle(
			"dark",
			state.appearance === "dark"
		);
		document.documentElement.style.colorScheme = state.appearance;
	}, [state, storage]);

	useEffect(() => {
		const requested = new URLSearchParams(window.location.search).get(
			"theme"
		);
		if (requested === "light" || requested === "dark") {
			setState((current) => ({ ...current, appearance: requested }));
		}
	}, []);

	function updateState(patch: Partial<SimulatorState>) {
		setState((current) => ({ ...current, ...patch }));
	}

	function selectScreen(screen: Screen) {
		updateState({ screen });
		setStatus(
			screen === "workspace" ? "Workspace opened." : "Settings opened."
		);
	}

	function updateSize(
		surface: SurfaceName,
		size: SimulatorState["sizes"][SurfaceName]
	) {
		setState((current) => ({
			...current,
			sizes: { ...current.sizes, [surface]: size },
		}));
		setStatus(
			`${surface[0]?.toUpperCase()}${surface.slice(1)} size updated.`
		);
	}

	function addTab() {
		if (state.tabs.length >= 3) {
			setStatus("Three tabs is the maximum.");
			return;
		}
		const tab = `Plugin ${state.tabs.length + 1}`;
		setState((current) => ({
			...current,
			tabs: [...current.tabs, tab],
			activeTab: current.tabs.length,
		}));
		setStatus(`${tab} opened.`);
	}

	function closeTab(index: number) {
		if (state.tabs.length === 1) {
			setStatus("Keep one tab open to use the workspace.");
			return;
		}
		const tabs = state.tabs.filter((_, tabIndex) => tabIndex !== index);
		setState((current) => ({
			...current,
			tabs,
			activeTab: Math.min(current.activeTab, tabs.length - 1),
		}));
		setStatus("Tab closed.");
	}

	function reset() {
		void fetch("/api/vault/mutate", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ op: "reset" }),
		})
			.then((response) => {
				if (!response.ok) throw new Error("Vault reset failed");
				storage.clear();
				setState(normalizeState(defaultSimulatorState));
				setResetOpen(false);
				setStatus("Simulator data reset.");
			})
			.catch(() => setStatus("Simulator data could not be reset."));
	}

	return (
		<div className="isolate flex min-h-dvh flex-col bg-background text-foreground antialiased">
			<header className="flex min-h-14 shrink-0 flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-2 sm:px-6">
				<div className="flex min-w-0 items-center gap-3">
					<div
						className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-foreground text-background"
						aria-hidden="true"
					>
						<PanelRight className="size-4" />
					</div>
					<div className="min-w-0">
						<p className="truncate text-sm font-medium">
							Obsidian simulator
						</p>
						<p className="hidden truncate text-xs text-muted-foreground sm:block">
							Local plugin workspace
						</p>
					</div>
				</div>
				<nav
					className="order-3 flex w-full gap-1 sm:order-none sm:w-auto"
					aria-label="Simulator screens"
				>
					<Button
						type="button"
						variant={
							state.screen === "workspace" ? "secondary" : "ghost"
						}
						size="sm"
						onClick={() => selectScreen("workspace")}
					>
						<PanelRight />
						Workspace
					</Button>
					<Button
						type="button"
						variant={
							state.screen === "settings" ? "secondary" : "ghost"
						}
						size="sm"
						onClick={() => selectScreen("settings")}
					>
						<Settings2 />
						Settings
					</Button>
				</nav>
				<div className="flex shrink-0 items-center gap-1.5">
					{state.screen === "workspace" ? (
						<SizeControls
							sizes={state.sizes}
							onChange={updateSize}
						/>
					) : (
						<SizeControls
							sizes={state.sizes}
							onChange={updateSize}
						/>
					)}
					<Button
						type="button"
						variant="ghost"
						size="icon-sm"
						aria-label={`Switch to ${state.appearance === "light" ? "dark" : "light"} mode`}
						title={`Switch to ${state.appearance === "light" ? "dark" : "light"} mode`}
						onClick={() => {
							const appearance =
								state.appearance === "light" ? "dark" : "light";
							updateState({ appearance });
							setStatus(
								`${appearance[0]?.toUpperCase()}${appearance.slice(1)} mode enabled.`
							);
						}}
					>
						{state.appearance === "light" ? <Moon /> : <Sun />}
					</Button>
					<Button
						type="button"
						variant="ghost"
						size="icon-sm"
						aria-label="Reset simulator data"
						title="Reset simulator data"
						onClick={() => setResetOpen(true)}
					>
						<RotateCcw />
					</Button>
				</div>
			</header>
			<div className="sr-only" role="status" aria-live="polite">
				{status}
			</div>
			{state.screen === "workspace" ? (
				<WorkspaceShell
					tabs={state.tabs}
					activeTab={state.activeTab}
					sidebarSize={state.sizes.sidebar}
					tabsSize={state.sizes.tabs}
					onSelectTab={(activeTab) => {
						updateState({ activeTab });
						setStatus(
							`${state.tabs[activeTab] ?? "Tab"} selected.`
						);
					}}
					onAddTab={addTab}
					onCloseTab={closeTab}
					appearance={state.appearance}
				/>
			) : (
				<SettingsScreen
					size={state.sizes.settings}
					appearance={state.appearance}
				/>
			)}
			<ResetDialog
				open={resetOpen}
				onCancel={() => setResetOpen(false)}
				onConfirm={reset}
			/>
		</div>
	);
}
