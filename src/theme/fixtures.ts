import darkFixture from "./fixtures/default-dark.json";
import lightFixture from "./fixtures/default-light.json";
import { validateThemeSnapshot } from "./snapshot";
import type { ThemeSnapshot } from "./snapshot";

function loadFixture(value: unknown): ThemeSnapshot {
	const issues = validateThemeSnapshot(value);
	if (issues.length > 0) {
		throw new Error(
			`Invalid captured theme fixture: ${issues.map((issue) => issue.key).join(", ")}`
		);
	}
	return value as ThemeSnapshot;
}

/** Default Obsidian light values captured through an isolated Knapper session. */
export const defaultLightSnapshot = loadFixture(lightFixture);

/** Default Obsidian dark values captured through an isolated Knapper session. */
export const defaultDarkSnapshot = loadFixture(darkFixture);
