#!/usr/bin/env node
import { watch } from "node:fs";
import type { FSWatcher } from "node:fs";
import { access } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadPluginArtifacts } from "../artifacts";
import { createSimulatorServer } from "../server/simulator-server";
import { FileVault } from "../server/vault/vault";
import { parseProcessOptions } from "./options";

const HELP = `knapper-obsidian-simulator

Usage:
  pnpm exec knapper-obsidian-simulator --path <bundle-directory>

Options:
  --path <path>       Directory containing main.js, styles.css, and manifest.json
  --vault <path>      Persistent vault directory (default: ./.knapper_files)
  --host <host>       Listening host (default: 127.0.0.1)
  --port <port>       Listening port (default: an available port)
  --open              Open the simulator in the default browser
  --no-watch          Disable artifact reloads
  --theme <mode>      Initial light, dark, or system theme
  --help              Show this help
`;

async function main(): Promise<void> {
	if (process.argv.includes("--help") || process.argv.includes("-h")) {
		process.stdout.write(HELP);
		return;
	}
	const options = parseProcessOptions();
	const packageRoot = await findPackageRoot(
		dirname(fileURLToPath(import.meta.url))
	);
	let artifacts = await loadPluginArtifacts(options.path);
	const vaultRoot = resolve(
		options.vault ?? join(process.cwd(), ".knapper_files")
	);
	const vault = new FileVault(vaultRoot);
	await vault.initialize();
	const server = await createSimulatorServer({
		artifacts: () => artifacts,
		vault,
		packageRoot,
	});
	const address = await server.listen(options.port, options.host);
	const themeQuery =
		options.theme === "system" ? "" : `?theme=${options.theme}`;
	const url = `http://${address.host}:${address.port}/${themeQuery}`;
	process.stdout.write(`Obsidian simulator: ${url}\n`);
	process.stdout.write(`Plugin artifacts: ${artifacts.rootDir}\n`);
	process.stdout.write(`Persistent vault: ${vault.root}\n`);
	let watcher: FSWatcher | undefined;
	if (options.watch) {
		watcher = watch(artifacts.rootDir, { persistent: false }, () => {
			void loadPluginArtifacts(artifacts.rootDir)
				.then((next) => {
					artifacts = next;
					server.notifyReload();
					process.stdout.write("Plugin artifacts reloaded.\n");
				})
				.catch((error: unknown) => {
					process.stderr.write(
						`Artifact reload failed: ${String(error)}\n`
					);
				});
		});
	}
	if (options.open) await openBrowser(url);
	const close = async () => {
		watcher?.close();
		await server.close();
	};
	process.once("SIGINT", () => void close().finally(() => process.exit(0)));
	process.once("SIGTERM", () => void close().finally(() => process.exit(0)));
}

async function findPackageRoot(start: string): Promise<string> {
	let directory = resolve(start);
	for (;;) {
		if (
			await access(join(directory, "package.json"))
				.then(() => true)
				.catch(() => false)
		)
			return directory;
		const parent = dirname(directory);
		if (parent === directory)
			throw new Error("Could not locate the simulator package root");
		directory = parent;
	}
}

async function openBrowser(url: string): Promise<void> {
	const { spawn } = await import("node:child_process");
	const command =
		process.platform === "darwin"
			? "open"
			: process.platform === "win32"
				? "cmd"
				: "xdg-open";
	const args =
		process.platform === "win32" ? ["/c", "start", "", url] : [url];
	const child = spawn(command, args, { detached: true, stdio: "ignore" });
	child.unref();
}

void main().catch((error: unknown) => {
	process.stderr.write(
		`${error instanceof Error ? error.message : String(error)}\n`
	);
	process.exitCode = 1;
});
