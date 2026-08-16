import { describe, expect, it } from "vite-plus/test";
import {
	classifyThemeDrift,
	serializeThemeSnapshot,
	validateThemeSnapshot,
} from "./snapshot";
import type { ThemeSelectorEvidence, ThemeSnapshot } from "./snapshot";
import { defaultDarkSnapshot, defaultLightSnapshot } from "./fixtures";

describe("theme snapshots", () => {
	type MutableSnapshot = Omit<
		ThemeSnapshot,
		"variables" | "selectors" | "geometry"
	> & {
		variables: Record<string, string>;
		selectors: Record<string, ThemeSelectorEvidence>;
		geometry: {
			sidebar: { width: number; height: number; x: number; y: number };
			tabs: { width: number; height: number; x: number; y: number };
			settings: { width: number; height: number; x: number; y: number };
		};
	};

	it("validates the bootstrap light and dark fixtures", () => {
		expect(validateThemeSnapshot(defaultLightSnapshot)).toEqual([]);
		expect(validateThemeSnapshot(defaultDarkSnapshot)).toEqual([]);
	});

	it("serializes keys in deterministic order", () => {
		const first = serializeThemeSnapshot({ ...defaultLightSnapshot });
		const second = serializeThemeSnapshot({
			...defaultLightSnapshot,
			variables: Object.fromEntries(
				Object.entries(defaultLightSnapshot.variables).reverse()
			),
		});
		expect(first).toBe(second);
	});

	it("reports missing selectors and variables as errors", () => {
		const changed = structuredClone(
			defaultLightSnapshot
		) as unknown as MutableSnapshot;
		delete changed.selectors[".workspace-tab-header-container"];
		delete changed.variables["--background-primary"];
		const drift = classifyThemeDrift(defaultLightSnapshot, changed);
		expect(drift.errors.map((entry) => entry.key)).toEqual([
			"selector:.workspace-tab-header-container",
			"variable:--background-primary",
		]);
	});

	it("reports changed values and geometry as warnings", () => {
		const changed = structuredClone(
			defaultLightSnapshot
		) as unknown as MutableSnapshot;
		changed.variables["--text-normal"] = "#111111";
		changed.geometry.sidebar.width = 401;
		const drift = classifyThemeDrift(defaultLightSnapshot, changed);
		expect(drift.errors).toHaveLength(0);
		expect(drift.warnings.map((entry) => entry.key)).toEqual([
			"variable:--text-normal",
			"geometry:sidebar.width",
		]);
	});
});
