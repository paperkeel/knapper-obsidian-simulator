export {
	classifyThemeDrift,
	REQUIRED_THEME_SELECTORS,
	REQUIRED_THEME_VARIABLES,
	serializeThemeSnapshot,
	validateThemeSnapshot,
} from "./snapshot";
export type {
	ThemeDrift,
	ThemeIconData,
	ThemeProvenance,
	ThemeSelectorEvidence,
	ThemeSnapshot,
	ThemeSnapshotIssue,
	ThemeSurfaceGeometry,
} from "./snapshot";
export { defaultDarkSnapshot, defaultLightSnapshot } from "./fixtures";
