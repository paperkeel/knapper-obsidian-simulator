import { describe, expect, it } from "vite-plus/test";
import { defaultSimulatorState, normalizeState } from "./model";

describe("simulator state", () => {
	it("restores safe defaults and caps persisted tabs", () => {
		const state = normalizeState({
			...defaultSimulatorState,
			tabs: ["One", "Two", "Three", "Four"],
		});
		expect(state.tabs).toEqual(["One", "Two", "Three"]);
		expect(normalizeState(null).sizes.sidebar.width).toBe(280);
	});
});
