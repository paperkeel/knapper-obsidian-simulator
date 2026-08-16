/** The source used to produce a theme snapshot. */
export interface ThemeProvenance {
	readonly source: "bootstrap" | "knapper";
	readonly capturedAt: string;
	readonly obsidianVersion: string;
	readonly platform: string;
	readonly bundleHash?: string;
}

/** A measured shell surface in CSS pixels. */
export interface ThemeSurfaceGeometry {
	readonly width: number;
	readonly height: number;
	readonly x: number;
	readonly y: number;
}

/** A captured selector with its class evidence and measured geometry. */
export interface ThemeSelectorEvidence {
	readonly classes: ReadonlyArray<string>;
	readonly geometry?: ThemeSurfaceGeometry;
}

/** Captured icon data from the Obsidian shell. */
export interface ThemeIconData {
	readonly name: string;
	readonly viewBox: string;
	readonly svg: string;
}

/** A versioned set of theme values and shell evidence. */
export interface ThemeSnapshot {
	readonly schemaVersion: 1;
	readonly mode: "light" | "dark";
	readonly provenance: ThemeProvenance;
	readonly documentClasses: ReadonlyArray<string>;
	readonly variables: Readonly<Record<string, string>>;
	readonly selectors: Readonly<Record<string, ThemeSelectorEvidence>>;
	readonly geometry: Readonly<{
		readonly sidebar: ThemeSurfaceGeometry;
		readonly tabs: ThemeSurfaceGeometry;
		readonly settings: ThemeSurfaceGeometry;
	}>;
	readonly icons: Readonly<Record<string, ThemeIconData>>;
}

/** A validation problem found in a theme snapshot. */
export interface ThemeSnapshotIssue {
	readonly key: string;
	readonly message: string;
}

/** The result of comparing two snapshots. */
export interface ThemeDrift {
	readonly errors: ReadonlyArray<ThemeSnapshotIssue>;
	readonly warnings: ReadonlyArray<ThemeSnapshotIssue>;
}

export const REQUIRED_THEME_VARIABLES = [
	"--background-primary",
	"--background-secondary",
	"--background-modifier-border",
	"--text-normal",
	"--text-muted",
	"--text-faint",
	"--text-on-accent",
	"--interactive-accent",
	"--interactive-accent-hover",
	"--font-interface",
	"--font-text",
	"--font-monospace",
	"--radius-s",
	"--radius-m",
	"--radius-l",
] as const;

export const REQUIRED_THEME_SELECTORS = [
	".app-container",
	".workspace",
	".workspace-tabs",
	".workspace-tab-header-container",
	".workspace-split.mod-right-split",
	".workspace-leaf-content",
	".modal",
] as const;

/** Validate the structure and required evidence in a theme snapshot. */
export function validateThemeSnapshot(
	value: unknown
): ReadonlyArray<ThemeSnapshotIssue> {
	if (!isRecord(value))
		return [{ key: "snapshot", message: "Snapshot must be an object" }];
	const issues: Array<ThemeSnapshotIssue> = [];
	if (value.schemaVersion !== 1) {
		issues.push({
			key: "schemaVersion",
			message: "Snapshot schemaVersion must be 1",
		});
	}
	if (value.mode !== "light" && value.mode !== "dark") {
		issues.push({
			key: "mode",
			message: "Snapshot mode must be light or dark",
		});
	}
	if (!isRecord(value.variables)) {
		issues.push({
			key: "variables",
			message: "Snapshot variables must be an object",
		});
	} else {
		for (const name of REQUIRED_THEME_VARIABLES) {
			if (typeof value.variables[name] !== "string") {
				issues.push({
					key: `variable:${name}`,
					message: "Required variable is missing",
				});
			}
		}
	}
	if (!isRecord(value.selectors)) {
		issues.push({
			key: "selectors",
			message: "Snapshot selectors must be an object",
		});
	} else {
		for (const selector of REQUIRED_THEME_SELECTORS) {
			if (!isRecord(value.selectors[selector])) {
				issues.push({
					key: `selector:${selector}`,
					message: "Required selector is missing",
				});
			}
		}
	}
	if (!Array.isArray(value.documentClasses)) {
		issues.push({
			key: "documentClasses",
			message: "Document classes must be an array",
		});
	}
	if (!isRecord(value.geometry)) {
		issues.push({ key: "geometry", message: "Geometry must be an object" });
	}
	if (!isRecord(value.provenance)) {
		issues.push({
			key: "provenance",
			message: "Provenance must be an object",
		});
	}
	return issues;
}

/** Serialize a snapshot with stable key ordering for source control. */
export function serializeThemeSnapshot(snapshot: ThemeSnapshot): string {
	return `${JSON.stringify(sortValue(snapshot), null, 2)}\n`;
}

/** Classify missing evidence as errors and changed captures as warnings. */
export function classifyThemeDrift(
	expected: ThemeSnapshot,
	actual: ThemeSnapshot
): ThemeDrift {
	const errors: Array<ThemeSnapshotIssue> = [];
	const warnings: Array<ThemeSnapshotIssue> = [];
	for (const name of REQUIRED_THEME_SELECTORS) {
		if (!(name in actual.selectors))
			errors.push({
				key: `selector:${name}`,
				message: "Required selector is missing",
			});
	}
	for (const name of REQUIRED_THEME_VARIABLES) {
		if (!(name in actual.variables))
			errors.push({
				key: `variable:${name}`,
				message: "Required variable is missing",
			});
		else if (expected.variables[name] !== actual.variables[name])
			warnings.push({
				key: `variable:${name}`,
				message: "Variable value changed",
			});
	}
	for (const surface of ["sidebar", "tabs", "settings"] as const) {
		for (const dimension of ["width", "height"] as const) {
			if (
				expected.geometry[surface][dimension] !==
				actual.geometry[surface][dimension]
			)
				warnings.push({
					key: `geometry:${surface}.${dimension}`,
					message: "Geometry changed",
				});
		}
	}
	return { errors, warnings };
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function sortValue(value: unknown): unknown {
	if (Array.isArray(value)) return value.map(sortValue);
	if (!isRecord(value)) return value;
	return Object.fromEntries(
		Object.keys(value)
			.sort()
			.map((key) => [key, sortValue(value[key])])
	);
}
