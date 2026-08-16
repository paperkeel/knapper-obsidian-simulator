/* oxlint-disable import/no-commonjs, typescript/no-implied-eval -- executes Obsidian CommonJS bundles */
import * as obsidian from "./index";

/** Build the external module registry used by browser-executed CommonJS bundles. */
export function createExternalModuleRegistry(): Record<string, unknown> {
	const codeMirror = createPermissiveStub();
	return {
		obsidian,
		"@codemirror/state": codeMirror,
		"@codemirror/view": codeMirror,
		path: {
			basename: (path: string) =>
				path.replaceAll("\\", "/").split("/").at(-1) ?? "",
			dirname: (path: string) =>
				path.replaceAll("\\", "/").split("/").slice(0, -1).join("/"),
			join: (...parts: Array<string>) =>
				obsidian.normalizePath(parts.join("/")),
			sep: "/",
		},
		"fs/promises": createPermissiveStub(),
	};
}

/** Execute one bundled Obsidian plugin with a controlled CommonJS require. */
export function executePluginBundle(
	source: string,
	registry: Record<string, unknown>
): unknown {
	const module = { exports: {} as unknown };
	const requireModule = (name: string): unknown => {
		if (!(name in registry))
			throw new Error(`Unsupported external module: ${name}`);
		return registry[name];
	};
	const factory = new Function(
		"module",
		"exports",
		"require",
		`${source}\n//# sourceURL=obsidian-plugin-main.js`
	);
	factory(module, module.exports, requireModule);
	return module.exports;
}

function createPermissiveStub(): unknown {
	const callable = function () {};
	const proxy: unknown = new Proxy(callable, {
		apply: () => proxy,
		construct: () => proxy as object,
		get: (target, property) => {
			if (property === "prototype") return target.prototype;
			if (property === Symbol.iterator) return function* empty() {};
			if (property === "then") return undefined;
			if (property === "length") return 0;
			return proxy;
		},
	});
	return proxy;
}
