import { useEffect, useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { App, BrowserVaultAdapter } from "@/runtime";
import type { ObsidianManifest, Plugin } from "@/runtime";
import {
	createExternalModuleRegistry,
	executePluginBundle,
} from "@/runtime/module";
import { defaultDarkSnapshot, defaultLightSnapshot } from "@/theme/fixtures";
import "@/host.css";

export const Route = createFileRoute("/host")({ component: PluginHost });

type Surface = "settings" | "sidebar" | "tab";

interface ArtifactMetadata {
	manifest: ObsidianManifest;
	requires: Array<string>;
}

function PluginHost() {
	const rootRef = useRef<HTMLDivElement>(null);
	const [message, setMessage] = useState("Loading plugin…");

	useEffect(() => {
		const controller = new AbortController();
		const events = new EventSource("/api/events");
		const reload = () => window.location.reload();
		events.addEventListener("reload", reload);
		let plugin: Plugin | undefined;
		const load = async () => {
			const parameters = new URLSearchParams(window.location.search);
			const surface = normalizeSurface(parameters.get("surface"));
			const mode = parameters.get("theme") === "dark" ? "dark" : "light";
			applyTheme(mode);
			const pluginStyles = document.createElement("link");
			pluginStyles.rel = "stylesheet";
			pluginStyles.href = "/api/artifacts/styles.css";
			document.head.append(pluginStyles);
			const [metadataResponse, sourceResponse] = await Promise.all([
				fetch("/api/artifacts", { signal: controller.signal }),
				fetch("/api/artifacts/main.js", { signal: controller.signal }),
			]);
			if (!metadataResponse.ok || !sourceResponse.ok)
				throw new Error("Plugin artifacts are unavailable");
			const metadata =
				(await metadataResponse.json()) as ArtifactMetadata;
			const source = await sourceResponse.text();
			const registry = createExternalModuleRegistry();
			const unsupported = metadata.requires.filter(
				(name) => !(name in registry)
			);
			if (unsupported.length > 0)
				throw new Error(
					`Unsupported external modules: ${unsupported.join(", ")}`
				);
			const exports = executePluginBundle(source, registry);
			const PluginConstructor = resolvePluginConstructor(exports);
			const adapter = new BrowserVaultAdapter();
			await adapter.refresh();
			const app = new App({ adapter });
			plugin = new PluginConstructor(app, metadata.manifest);
			await plugin.onload();
			if (controller.signal.aborted || !rootRef.current) return;
			rootRef.current.replaceChildren();
			await renderSurface(rootRef.current, plugin, surface);
			setMessage("");
		};
		void load().catch((error: unknown) => {
			if (controller.signal.aborted) return;
			setMessage(error instanceof Error ? error.message : String(error));
		});
		return () => {
			controller.abort();
			events.removeEventListener("reload", reload);
			events.close();
			plugin?.unload();
		};
	}, []);

	return (
		<main className="obsidian-host app-container">
			<div ref={rootRef} className="workspace size-full" />
			{message ? (
				<div className="simulator-host-status" role="status">
					<p>{message}</p>
				</div>
			) : null}
		</main>
	);
}

function normalizeSurface(value: string | null): Surface {
	return value === "settings" || value === "sidebar" ? value : "tab";
}

function resolvePluginConstructor(
	exports: unknown
): new (app: App, manifest: ObsidianManifest) => Plugin {
	const candidate =
		typeof exports === "object" && exports !== null && "default" in exports
			? exports.default
			: exports;
	if (typeof candidate !== "function")
		throw new Error("main.js does not export an Obsidian Plugin class");
	return candidate as new (app: App, manifest: ObsidianManifest) => Plugin;
}

async function renderSurface(
	root: HTMLElement,
	plugin: Plugin,
	surface: Surface
): Promise<void> {
	if (surface === "settings") {
		const tab = plugin.settingTabs.at(0);
		if (!tab) throw new Error("The plugin did not register a settings tab");
		root.append(tab.containerEl);
		tab.display();
		return;
	}
	const registration =
		plugin.views.find((view) => view.viewType.includes("chat")) ??
		plugin.views.at(0);
	if (!registration)
		throw new Error("The plugin did not register a workspace view");
	const leaf =
		surface === "sidebar"
			? plugin.app.workspace.getRightLeaf(false)
			: plugin.app.workspace.getLeaf(true);
	if (!leaf) throw new Error("The three-tab workspace limit was reached");
	root.append(leaf.containerEl);
	await leaf.setViewState({ type: registration.viewType, active: true });
	plugin.app.workspace.setActiveLeaf(leaf);
}

function applyTheme(mode: "light" | "dark"): void {
	const snapshot =
		mode === "dark" ? defaultDarkSnapshot : defaultLightSnapshot;
	document.body.classList.remove("theme-light", "theme-dark");
	document.body.classList.add(`theme-${mode}`);
	document.documentElement.style.colorScheme = mode;
	for (const [name, value] of Object.entries(snapshot.variables)) {
		document.documentElement.style.setProperty(name, value);
	}
}
