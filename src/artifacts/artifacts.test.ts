import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vite-plus/test";
import {
	createBrowserCommonJsWrapper,
	discoverStaticRequires,
	loadPluginArtifacts,
	resolveArtifactDirectory,
} from "./index";

async function makeArtifacts() {
	const root = await mkdtemp(join(tmpdir(), "knapper-artifacts-"));
	await writeFile(
		join(root, "main.js"),
		'const x = require("obsidian"); require("./ignored"); module.exports = x;'
	);
	await writeFile(join(root, "styles.css"), ".workspace { color: red; }");
	await writeFile(
		join(root, "manifest.json"),
		JSON.stringify({
			id: "example",
			name: "Example",
			version: "1.0.0",
			minAppVersion: "1.0.0",
		})
	);
	return root;
}

describe("plugin artifacts", () => {
	it("resolves a directory and loads the required artifacts", async () => {
		const root = await makeArtifacts();
		const artifacts = await loadPluginArtifacts(root);
		expect(artifacts.rootDir).toBe(root);
		expect(artifacts.manifest.id).toBe("example");
		expect(artifacts.styles).toContain("color: red");
		expect(artifacts.requires).toEqual(["obsidian"]);
	});

	it("resolves a main.js path to its containing directory", async () => {
		const root = await makeArtifacts();
		expect(await resolveArtifactDirectory(join(root, "main.js"))).toBe(
			root
		);
	});

	it("reports missing required files", async () => {
		const root = await mkdtemp(join(tmpdir(), "knapper-artifacts-"));
		await mkdir(join(root, "nested"));
		await writeFile(join(root, "main.js"), "module.exports = {};");
		await expect(loadPluginArtifacts(root)).rejects.toThrow(
			/styles\.css|manifest\.json/
		);
	});

	it("discovers only static require calls", () => {
		expect(
			discoverStaticRequires(
				'require("obsidian"); require(name); require(`electron`);'
			)
		).toEqual(["obsidian"]);
	});

	it("creates an executable browser CommonJS wrapper", () => {
		const wrapper = createBrowserCommonJsWrapper(
			'module.exports = require("obsidian").value;'
		);
		expect(wrapper).toContain("module");
		expect(wrapper).toContain("require");
		expect(wrapper).toContain(
			'module.exports = require("obsidian").value;'
		);
	});
});
