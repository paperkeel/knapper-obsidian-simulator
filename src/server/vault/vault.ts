import { randomUUID } from "node:crypto";
import { EventEmitter } from "node:events";
import {
	access,
	lstat,
	mkdir as makeDirectory,
	mkdtemp,
	readFile as readFileAsync,
	readdir,
	rename as renamePath,
	rm,
	writeFile as writeFileAsync,
} from "node:fs/promises";
import { dirname, isAbsolute, join, posix, resolve, win32 } from "node:path";

export type VaultEntryType = "file" | "folder" | "symlink";

export interface VaultEntry {
	id: string;
	name: string;
	path: string;
	type: VaultEntryType;
	size: number;
	mtimeMs: number;
}

export interface VaultEvent {
	type: "create" | "modify" | "delete" | "rename" | "reset";
	path: string;
	oldPath?: string;
}

export interface VaultResetResult {
	trashPath: string;
}

export interface VaultListOptions {
	recursive?: boolean;
}

type Listener = (event: VaultEvent) => void;

/** Provides a persistent, path-contained filesystem for a simulator vault. */
export class FileVault {
	readonly root: string;
	private readonly metadata = new Map<string, string>();
	private readonly events = new EventEmitter();
	private mutation: Promise<unknown> = Promise.resolve();

	constructor(root: string) {
		if (!isAbsolute(root)) {
			throw new Error("Vault root must be an absolute path");
		}
		this.root = resolve(root);
	}

	/** Creates the vault root when it does not exist. */
	async initialize(): Promise<void> {
		await makeDirectory(this.root, { recursive: true });
		await this.assertContained(this.root, true);
	}

	/** Subscribes to ordered vault mutations and returns an unsubscribe function. */
	on(listener: Listener): () => void {
		this.events.on("event", listener);
		return () => this.events.off("event", listener);
	}

	/** Tests whether a contained path exists. */
	async exists(path: string): Promise<boolean> {
		const target = await this.pathFor(path, true);
		try {
			await lstat(target);
			await this.assertContained(target, true);
			return true;
		} catch (error) {
			if (isMissing(error)) return false;
			throw error;
		}
	}

	/** Reads a UTF-8 file from the vault. */
	async read(path: string): Promise<string> {
		await this.assertFile(path);
		return readFileAsync(await this.pathFor(path, false), "utf8");
	}

	/** Reads a binary file from the vault. */
	async readBinary(path: string): Promise<Buffer> {
		await this.assertFile(path);
		return readFileAsync(await this.pathFor(path, false));
	}

	/** Writes UTF-8 content with an atomic replacement. */
	async write(path: string, value: string): Promise<void> {
		return this.enqueue(() =>
			this.atomicWrite(path, Buffer.from(value), "utf8")
		);
	}

	/** Writes binary content with an atomic replacement. */
	async writeBinary(path: string, value: Uint8Array): Promise<void> {
		return this.enqueue(() => this.atomicWrite(path, Buffer.from(value)));
	}

	/** Creates a directory and its missing parents. */
	async mkdir(path: string): Promise<void> {
		return this.enqueue(async () => {
			const normalized = this.normalize(path);
			const target = await this.pathFor(normalized, true);
			const existed = await this.exists(normalized);
			await makeDirectory(target, { recursive: true });
			if (!existed) this.emit({ type: "create", path: normalized });
		});
	}

	/** Lists direct or recursive entries in stable lexical order. */
	async list(
		path = "",
		options: VaultListOptions = {}
	): Promise<Array<VaultEntry>> {
		const normalized = this.normalize(path);
		const base = await this.pathFor(normalized, false);
		const output: Array<VaultEntry> = [];
		await this.walk(base, normalized, Boolean(options.recursive), output);
		return output.sort((a, b) => a.path.localeCompare(b.path));
	}

	/** Returns stable metadata for a file, folder, or symlink. */
	async stat(path: string): Promise<VaultEntry> {
		const normalized = this.normalize(path);
		const target = join(this.root, normalized);
		const info = await lstat(target);
		await this.assertContained(
			info.isSymbolicLink() ? dirname(target) : target,
			false
		);
		const type = info.isDirectory()
			? "folder"
			: info.isSymbolicLink()
				? "symlink"
				: "file";
		return {
			id: this.idFor(normalized),
			name: posix.basename(normalized),
			path: normalized,
			type,
			size: info.size,
			mtimeMs: info.mtimeMs,
		};
	}

	/** Renames a contained file or folder. */
	async rename(from: string, to: string): Promise<void> {
		return this.enqueue(async () => {
			const oldPath = this.normalize(from);
			const newPath = this.normalize(to);
			const source = await this.pathFor(oldPath, false);
			const target = await this.pathFor(newPath, true);
			await this.assertContained(source, true);
			await makeDirectory(dirname(target), { recursive: true });
			await renamePath(source, target);
			for (const [key, id] of this.metadata) {
				if (key === oldPath || key.startsWith(`${oldPath}/`)) {
					const next =
						key === oldPath
							? newPath
							: `${newPath}${key.slice(oldPath.length)}`;
					this.metadata.set(next, id);
					this.metadata.delete(key);
				}
			}
			this.emit({ type: "rename", path: newPath, oldPath });
		});
	}

	/** Removes a file or empty directory. */
	async remove(path: string): Promise<void> {
		return this.enqueue(() => this.deletePath(path, false));
	}

	/** Removes a directory and its contents. */
	async rmdir(path: string): Promise<void> {
		return this.enqueue(() => this.deletePath(path, true));
	}

	/** Returns a recursive snapshot without following symlinks. */
	async snapshot(): Promise<Array<VaultEntry>> {
		return this.list("", { recursive: true });
	}

	/** Moves the active vault to timestamped sibling trash and creates a new root. */
	async reset(): Promise<VaultResetResult> {
		return this.enqueue(async () => {
			await this.initialize();
			const trashRoot = join(
				dirname(this.root),
				".knapper-simulator-trash"
			);
			await makeDirectory(trashRoot, { recursive: true });
			const trashPath = await this.uniqueTrashPath(trashRoot);
			await renamePath(this.root, trashPath);
			await makeDirectory(this.root, { recursive: true });
			this.metadata.clear();
			this.emit({ type: "reset", path: "" });
			return { trashPath };
		});
	}

	private async atomicWrite(
		path: string,
		value: Buffer,
		encoding?: BufferEncoding
	): Promise<void> {
		const normalized = this.normalize(path);
		const target = await this.pathFor(normalized, true);
		const existed = await this.exists(normalized);
		await makeDirectory(dirname(target), { recursive: true });
		const temporary = await mkdtemp(
			join(dirname(target), ".knapper-write-")
		);
		const temporaryPath = join(temporary, "value");
		try {
			await writeFileAsync(
				temporaryPath,
				value,
				encoding ? { encoding } : undefined
			);
			await renamePath(temporaryPath, target);
		} finally {
			await rm(temporary, { recursive: true, force: true });
		}
		this.emit({ type: existed ? "modify" : "create", path: normalized });
	}

	private async deletePath(path: string, recursive: boolean): Promise<void> {
		const normalized = this.normalize(path);
		const target = await this.pathFor(normalized, false);
		await this.assertContained(target, true);
		await rm(target, { recursive, force: false });
		for (const key of this.metadata.keys()) {
			if (key === normalized || key.startsWith(`${normalized}/`))
				this.metadata.delete(key);
		}
		this.emit({ type: "delete", path: normalized });
	}

	private async walk(
		base: string,
		parent: string,
		recursive: boolean,
		output: Array<VaultEntry>
	): Promise<void> {
		for (const entry of await readdir(base, { withFileTypes: true })) {
			const path = parent ? `${parent}/${entry.name}` : entry.name;
			const target = join(base, entry.name);
			const item = await this.stat(path);
			output.push(item);
			if (recursive && entry.isDirectory())
				await this.walk(target, path, true, output);
		}
	}

	private async pathFor(
		path: string,
		allowMissing: boolean
	): Promise<string> {
		const normalized = this.normalize(path);
		const target = join(this.root, normalized);
		await this.assertContained(target, allowMissing);
		return target;
	}

	private normalize(value: string): string {
		if (value.includes("\0"))
			throw new Error("Vault paths cannot contain null bytes");
		let decoded = value;
		for (let index = 0; index < 3; index += 1) {
			try {
				const next = decodeURIComponent(decoded);
				if (next === decoded) break;
				decoded = next;
			} catch {
				throw new Error("Invalid vault path encoding");
			}
		}
		if (
			decoded.includes("\0") ||
			isAbsolute(decoded) ||
			win32.isAbsolute(decoded) ||
			decoded.startsWith("\\")
		) {
			throw new Error("Vault paths must be relative");
		}
		const normalized = posix.normalize(decoded.replaceAll("\\", "/"));
		if (normalized === ".." || normalized.startsWith("../"))
			throw new Error("Vault path escapes root");
		return normalized === "." ? "" : normalized;
	}

	private async assertContained(
		target: string,
		allowMissing: boolean
	): Promise<void> {
		let candidate = target;
		if (allowMissing) {
			let searching = true;
			while (searching) {
				try {
					await lstat(candidate);
					searching = false;
				} catch (error) {
					if (!isMissing(error)) throw error;
					const parent = dirname(candidate);
					if (parent === candidate) searching = false;
					candidate = parent;
				}
			}
		}
		const [rootReal, candidateReal] = await Promise.all([
			realPath(this.root),
			realPath(candidate),
		]);
		if (
			candidateReal !== rootReal &&
			!candidateReal.startsWith(`${rootReal}${posix.sep}`)
		) {
			throw new Error("Vault path escapes root");
		}
	}

	private async assertFile(path: string): Promise<void> {
		const entry = await this.stat(path);
		if (entry.type !== "file") throw new Error("Vault path is not a file");
	}

	private idFor(path: string): string {
		const current = this.metadata.get(path);
		if (current) return current;
		const id = randomUUID();
		this.metadata.set(path, id);
		return id;
	}

	private emit(event: VaultEvent): void {
		this.events.emit("event", event);
	}

	private enqueue<T>(operation: () => Promise<T>): Promise<T> {
		const result = this.mutation.then(operation, operation);
		this.mutation = result.then(
			() => undefined,
			() => undefined
		);
		return result;
	}

	private async uniqueTrashPath(parent: string): Promise<string> {
		const stamp = new Date().toISOString().replaceAll(/[-:.TZ]/g, "");
		let path = join(parent, stamp);
		let suffix = 0;
		while (await this.existsAbsolute(path))
			path = join(parent, `${stamp}-${++suffix}`);
		return path;
	}

	private async existsAbsolute(path: string): Promise<boolean> {
		try {
			await access(path);
			return true;
		} catch {
			return false;
		}
	}
}

async function realPath(path: string): Promise<string> {
	const { realpath } = await import("node:fs/promises");
	return realpath(path);
}

function isMissing(error: unknown): boolean {
	return Boolean(
		error &&
		typeof error === "object" &&
		"code" in error &&
		error.code === "ENOENT"
	);
}
