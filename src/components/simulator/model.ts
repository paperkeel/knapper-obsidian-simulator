export type Screen = "workspace" | "settings";
export type Appearance = "light" | "dark";

export type SurfaceName = "sidebar" | "tabs" | "settings";

export interface SurfaceSize {
	width: number;
	height: number;
}

export interface SimulatorState {
	screen: Screen;
	appearance: Appearance;
	activeTab: number;
	tabs: Array<string>;
	sizes: Record<SurfaceName, SurfaceSize>;
}

export interface SimulatorStorage {
	read: () => SimulatorState | null;
	write: (state: SimulatorState) => void;
	clear: () => void;
}

export const defaultSimulatorState: SimulatorState = {
	screen: "workspace",
	appearance: "light",
	activeTab: 0,
	tabs: ["Welcome"],
	sizes: {
		sidebar: { width: 280, height: 560 },
		tabs: { width: 720, height: 560 },
		settings: { width: 760, height: 600 },
	},
};

export function createBrowserStorage(
	key = "knapper-obsidian-simulator"
): SimulatorStorage {
	return {
		read() {
			try {
				const value = window.localStorage.getItem(key);
				return value ? (JSON.parse(value) as SimulatorState) : null;
			} catch {
				return null;
			}
		},
		write(state) {
			window.localStorage.setItem(key, JSON.stringify(state));
		},
		clear() {
			window.localStorage.removeItem(key);
		},
	};
}

export function normalizeState(state: SimulatorState | null): SimulatorState {
	if (!state) return structuredClone(defaultSimulatorState);
	return {
		...defaultSimulatorState,
		...state,
		tabs: state.tabs.slice(0, 3).length
			? state.tabs.slice(0, 3)
			: ["Welcome"],
		sizes: {
			...defaultSimulatorState.sizes,
			...state.sizes,
		},
	};
}
