import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vite-plus/test";
import { FileVault } from "./vault";

const roots: Array<string> = [];

afterEach(async () => {
	const { rm } = await import("node:fs/promises");
	await Promise.all(
		roots
			.splice(0)
			.map((root) => rm(root, { recursive: true, force: true }))
	);
});

describe("vault HTTP contract", () => {
	it("persists text through the vault implementation", async () => {
		const root = await mkdtemp(join(tmpdir(), "simulator-vault-handler-"));
		roots.push(root);
		const vault = new FileVault(join(root, ".knapper_files"));
		await vault.initialize();
		await vault.write("notes/example.md", "persistent");
		expect(await vault.read("notes/example.md")).toBe("persistent");
	});
});
