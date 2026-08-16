import { access, readFile, stat } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";

export interface PluginManifest {
	id: string;
	name: string;
	version: string;
	minAppVersion?: string;
	[key: string]: unknown;
}

export interface PluginArtifacts {
	rootDir: string;
	mainPath: string;
	stylesPath: string;
	manifestPath: string;
	main: string;
	styles: string;
	manifest: PluginManifest;
	requires: Array<string>;
}

/** Resolves a plugin directory or its main.js file to an artifact directory. */
export async function resolveArtifactDirectory(input: string): Promise<string> {
	const path = resolve(input);
	const details = await stat(path).catch(() => undefined);
	if (!details) throw new Error(`Artifact path does not exist: ${input}`);
	return details.isDirectory()
		? path
		: basename(path) === "main.js"
			? dirname(path)
			: (() => {
					throw new Error(
						`Artifact path must be a directory or main.js: ${input}`
					);
				})();
}

/** Finds static CommonJS dependencies in a bundled plugin. */
export function discoverStaticRequires(source: string): Array<string> {
	const found = new Set<string>();
	const pattern = /\brequire\s*\(\s*(["'])([^"'\n]+)\1\s*\)/g;
	for (const match of source.matchAll(pattern)) {
		if (match[2] && !match[2].startsWith(".")) found.add(match[2]);
	}
	return [...found];
}

/** Produces the function source used to execute a CommonJS bundle in a browser. */
export function createBrowserCommonJsWrapper(source: string): string {
	return `(function (module, exports, require) {\n${source}\n})`;
}

/** Loads and validates the three Obsidian plugin release artifacts. */
export async function loadPluginArtifacts(
	input: string
): Promise<PluginArtifacts> {
	const rootDir = await resolveArtifactDirectory(input);
	const mainPath = join(rootDir, "main.js");
	const stylesPath = join(rootDir, "styles.css");
	const manifestPath = join(rootDir, "manifest.json");
	await Promise.all(
		[mainPath, stylesPath, manifestPath].map(async (path) => {
			await access(path).catch(() => {
				throw new Error(
					`Missing required plugin artifact: ${basename(path)}`
				);
			});
		})
	);
	const [main, styles, manifestSource] = await Promise.all([
		readFile(mainPath, "utf8"),
		readFile(stylesPath, "utf8"),
		readFile(manifestPath, "utf8"),
	]);
	let manifest: PluginManifest;
	try {
		manifest = JSON.parse(manifestSource) as PluginManifest;
	} catch {
		throw new Error("Invalid manifest.json: expected JSON");
	}
	if (!manifest.id || !manifest.name || !manifest.version)
		throw new Error(
			"Invalid manifest.json: id, name, and version are required"
		);
	return {
		rootDir,
		mainPath,
		stylesPath,
		manifestPath,
		main,
		styles,
		manifest,
		requires: discoverStaticRequires(main),
	};
}
