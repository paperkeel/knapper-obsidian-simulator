import { readFile } from "node:fs/promises";
import process from "node:process";

const requiredVariables = [
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
];
const requiredSelectors = [
	".app-container",
	".workspace",
	".workspace-tabs",
	".workspace-tab-header-container",
	".workspace-split.mod-right-split",
	".workspace-leaf-content",
	".modal",
];

const path = process.argv[2];
if (!path) {
	console.error(
		"Usage: node scripts/theme/validate-theme.mjs <snapshot.json>"
	);
	process.exitCode = 2;
} else {
	try {
		const snapshot = JSON.parse(await readFile(path, "utf8"));
		const issues = [];
		if (snapshot.schemaVersion !== 1)
			issues.push("schemaVersion must be 1");
		if (snapshot.mode !== "light" && snapshot.mode !== "dark")
			issues.push("mode must be light or dark");
		for (const name of requiredVariables) {
			if (typeof snapshot.variables?.[name] !== "string")
				issues.push(`missing variable ${name}`);
		}
		for (const selector of requiredSelectors) {
			if (!snapshot.selectors?.[selector])
				issues.push(`missing selector ${selector}`);
		}
		if (!Array.isArray(snapshot.documentClasses))
			issues.push("documentClasses must be an array");
		if (!snapshot.geometry || !snapshot.provenance)
			issues.push("geometry and provenance are required");
		if (issues.length > 0) {
			console.error(issues.join("\n"));
			process.exitCode = 1;
		} else {
			console.log(`Valid theme snapshot: ${path}`);
		}
	} catch (error) {
		console.error(error instanceof Error ? error.message : String(error));
		process.exitCode = 1;
	}
}
