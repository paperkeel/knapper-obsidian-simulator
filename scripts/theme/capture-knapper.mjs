#!/usr/bin/env node
import { spawn } from "node:child_process";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const scriptRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
async function main() {
	const options = parseOptions(process.argv.slice(2));
	const knapperRoot = resolve(options.knapperRoot);
	const knapperHome = await mkdtemp(join(tmpdir(), "knapper-theme-capture-"));
	const client = new McpClient(join(knapperRoot, "dist/cli.js"), {
		...process.env,
		KNAP_HOME: knapperHome,
	});
	try {
		await client.initialize();
		await client.call("obsidian_session_open", {
			target: "isolated",
			label: "simulator-theme-capture",
			timeoutMs: 90_000,
		});
		for (const mode of ["light", "dark"]) {
			const snapshot = await client.evaluate(
				captureExpression(mode, options.obsidianVersion ?? "unknown")
			);
			const output = resolve(options.output, `default-${mode}.json`);
			await writeFile(
				output,
				`${JSON.stringify(sortValue(snapshot), null, 2)}\n`,
				"utf8"
			);
			process.stdout.write(`Captured ${mode} theme: ${output}\n`);
		}
	} finally {
		client.close();
		await cleanupKnapperHome(knapperRoot, knapperHome);
	}
}

class McpClient {
	#buffer = "";
	#child;
	#nextId = 1;
	#pending = new Map();

	constructor(cli, env) {
		this.#child = spawn(process.execPath, [cli, "--toolsets", "all"], {
			env,
			stdio: ["pipe", "pipe", "pipe"],
		});
		this.#child.stdout.on("data", (chunk) => this.#onData(chunk));
		this.#child.stderr.on("data", (chunk) => process.stderr.write(chunk));
	}

	async initialize() {
		await this.#send("initialize", {
			protocolVersion: "2024-11-05",
			capabilities: {},
			clientInfo: {
				name: "knapper-obsidian-simulator-theme",
				version: "1",
			},
		});
		this.#notify("notifications/initialized");
	}

	async call(name, args = {}) {
		const response = await this.#send("tools/call", {
			name,
			arguments: args,
		});
		if (response.error)
			throw new Error(`${name}: ${response.error.message}`);
		if (response.result?.isError)
			throw new Error(textContent(response.result));
		return response.result;
	}

	async evaluate(code) {
		const result = await this.call("obsidian_eval", { code });
		return JSON.parse(textContent(result));
	}

	close() {
		this.#child.stdin.end();
	}

	#notify(method, params = {}) {
		this.#child.stdin.write(
			`${JSON.stringify({ jsonrpc: "2.0", method, params })}\n`
		);
	}

	#send(method, params = {}) {
		const id = this.#nextId++;
		const promise = new Promise((resolvePromise, reject) => {
			this.#pending.set(id, resolvePromise);
			setTimeout(() => {
				if (this.#pending.delete(id))
					reject(new Error(`Timed out during ${method}`));
			}, 120_000);
		});
		this.#child.stdin.write(
			`${JSON.stringify({ jsonrpc: "2.0", id, method, params })}\n`
		);
		return promise;
	}

	#onData(chunk) {
		this.#buffer += chunk.toString();
		for (;;) {
			const newline = this.#buffer.indexOf("\n");
			if (newline === -1) return;
			const line = this.#buffer.slice(0, newline).trim();
			this.#buffer = this.#buffer.slice(newline + 1);
			if (!line) continue;
			let message;
			try {
				message = JSON.parse(line);
			} catch {
				continue;
			}
			const resolvePromise = this.#pending.get(message.id);
			if (resolvePromise) {
				this.#pending.delete(message.id);
				resolvePromise(message);
			}
		}
	}
}

function captureExpression(mode, obsidianVersion) {
	return `(async () => {
		const mode = ${JSON.stringify(mode)};
		const variables = ${JSON.stringify([
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
		])};
		document.body.classList.remove("theme-light", "theme-dark");
		document.body.classList.add("theme-" + mode);
		app.workspace.rightSplit?.expand?.();
		app.setting?.open?.();
		await new Promise((resolve) => setTimeout(resolve, 250));
		const rect = (element, fallback) => {
			const value = element?.getBoundingClientRect();
			return value && value.width > 0 ? {
				width: Math.round(value.width), height: Math.round(value.height),
				x: Math.round(value.x), y: Math.round(value.y),
			} : fallback;
		};
		const selectorNames = [
			".app-container", ".workspace", ".workspace-tabs",
			".workspace-tab-header-container", ".workspace-split.mod-right-split",
			".workspace-leaf-content", ".modal",
		];
		const selectors = Object.fromEntries(selectorNames.map((selector) => {
			const element = document.querySelector(selector);
			return [selector, {
				classes: element ? [...element.classList] : selector.split(/[. ]/).filter(Boolean),
				...(element ? { geometry: rect(element, undefined) } : {}),
			}];
		}));
		const style = getComputedStyle(document.body);
		const icon = document.querySelector('[aria-label*="Settings" i] svg, .clickable-icon svg');
		const snapshot = {
			schemaVersion: 1,
			mode,
			provenance: {
				source: "knapper",
				capturedAt: new Date().toISOString(),
				obsidianVersion: ${JSON.stringify(obsidianVersion)},
				platform: navigator.platform,
			},
			documentClasses: [...document.body.classList].sort(),
			variables: Object.fromEntries(variables.map((name) => [name, style.getPropertyValue(name).trim()])),
			selectors,
			geometry: {
				sidebar: rect(document.querySelector('.workspace-split.mod-right-split'), { width: 300, height: 720, x: 980, y: 0 }),
				tabs: rect(document.querySelector('.workspace-split.mod-vertical:not(.mod-right-split)'), { width: 980, height: 720, x: 0, y: 0 }),
				settings: rect(document.querySelector('.modal'), { width: 900, height: 700, x: 190, y: 10 }),
			},
			icons: icon ? {
				settings: {
					name: "settings", viewBox: icon.getAttribute("viewBox") ?? "0 0 24 24",
					svg: icon.outerHTML,
				},
			} : {},
		};
		app.setting?.close?.();
		return snapshot;
	})()`;
}

async function cleanupKnapperHome(knapperRoot, home) {
	const target = resolve(home);
	if (!target.startsWith(`${resolve(tmpdir())}${sep}`)) {
		throw new Error(
			`Refusing to clean non-temporary Knapper home: ${target}`
		);
	}
	const registry = await import(
		pathToFileURL(join(knapperRoot, "dist/session/registry.js")).href
	);
	const descriptor = await import(
		pathToFileURL(join(knapperRoot, "dist/session/descriptor.js")).href
	);
	const { readdir, rm } = await import("node:fs/promises");
	for (const key of await readdir(join(home, "sessions")).catch(() => [])) {
		if (
			!(await descriptor.readDescriptor(key, {
				...process.env,
				KNAP_HOME: home,
			}))
		)
			continue;
		const stopped = await registry.stopSession(key, {
			env: { ...process.env, KNAP_HOME: home },
		});
		if (stopped.state === "quitFailed")
			throw new Error(`Knapper session ${key} did not stop`);
		await registry.quarantineSession(key, {
			env: { ...process.env, KNAP_HOME: home },
		});
	}
	await rm(home, { recursive: true, force: true });
}

function textContent(result) {
	return (result.content ?? [])
		.filter((entry) => entry.type === "text")
		.map((entry) => entry.text ?? "")
		.join("\n");
}

function sortValue(value) {
	if (Array.isArray(value)) return value.map(sortValue);
	if (!value || typeof value !== "object") return value;
	return Object.fromEntries(
		Object.keys(value)
			.sort()
			.map((key) => [key, sortValue(value[key])])
	);
}

function parseOptions(args) {
	const values = { output: join(scriptRoot, "src/theme/fixtures") };
	for (let index = 0; index < args.length; index += 1) {
		const key = args[index];
		const value = args[++index];
		if (!value) throw new Error(`Missing value for ${key}`);
		if (key === "--knapper-root") values.knapperRoot = value;
		else if (key === "--output") values.output = value;
		else if (key === "--obsidian-version") values.obsidianVersion = value;
		else throw new Error(`Unknown option: ${key}`);
	}
	if (!values.knapperRoot) throw new Error("--knapper-root is required");
	return values;
}

await main();
