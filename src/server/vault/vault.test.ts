import { mkdtemp, readFile, symlink, writeFile } from "node:fs/promises";
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

async function createVault() {
	const root = await mkdtemp(join(tmpdir(), "knapper-vault-"));
	roots.push(root);
	const vault = new FileVault(root);
	await vault.initialize();
	return { root, vault };
}

describe("FileVault", () => {
	it("persists text and binary files and returns stable metadata", async () => {
		const { vault } = await createVault();
		await vault.write("folder/data.txt", "hello");
		const first = await vault.stat("folder/data.txt");
		const second = await vault.stat("folder/data.txt");

		expect(await vault.read("folder/data.txt")).toBe("hello");
		expect(first.id).toBe(second.id);
		expect(await vault.readBinary("folder/data.txt")).toEqual(
			Buffer.from("hello")
		);
	});

	it("rejects traversal, absolute paths, null bytes, and encoded traversal", async () => {
		const { vault } = await createVault();
		for (const path of [
			"../outside",
			"/outside",
			"C:\\outside",
			"..%2foutside",
			"bad\0path",
		]) {
			await expect(vault.read(path)).rejects.toThrow();
		}
	});

	it("does not follow a symlink outside the vault", async () => {
		const { root, vault } = await createVault();
		const outside = await mkdtemp(join(tmpdir(), "knapper-outside-"));
		roots.push(outside);
		await writeFile(join(outside, "secret.txt"), "secret");
		await symlink(outside, join(root, "escape"));

		await expect(vault.read("escape/secret.txt")).rejects.toThrow();
		expect((await vault.snapshot()).map((entry) => entry.path)).toEqual([
			"escape",
		]);
	});

	it("orders mutation events and supports recursive listing", async () => {
		const { vault } = await createVault();
		const events: Array<string> = [];
		vault.on((event) => events.push(`${event.type}:${event.path}`));
		await Promise.all([
			vault.write("a.txt", "a"),
			vault.write("b.txt", "b"),
			vault.mkdir("nested"),
		]);

		expect(events).toEqual([
			"create:a.txt",
			"create:b.txt",
			"create:nested",
		]);
		expect(
			(await vault.list("", { recursive: true })).map(
				(entry) => entry.path
			)
		).toEqual(["a.txt", "b.txt", "nested"]);
	});

	it("renames, removes, and resets through recoverable trash", async () => {
		const { root, vault } = await createVault();
		await vault.write("one.txt", "one");
		await vault.rename("one.txt", "two.txt");
		expect(await vault.exists("two.txt")).toBe(true);
		await vault.remove("two.txt");
		expect(await vault.exists("two.txt")).toBe(false);

		await vault.write("keep.txt", "keep");
		const reset = await vault.reset();
		expect(await vault.list("", { recursive: true })).toEqual([]);
		expect(reset.trashPath).toContain(".knapper-simulator-trash");
		expect(await readFile(join(reset.trashPath, "keep.txt"), "utf8")).toBe(
			"keep"
		);
		expect(
			await readFile(join(root, ".keep"), { encoding: "utf8" }).catch(
				() => undefined
			)
		).toBeUndefined();
	});
});
