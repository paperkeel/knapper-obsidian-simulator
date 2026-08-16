import type { IncomingMessage, ServerResponse } from "node:http";
import type { FileVault } from "./vault";

interface VaultMutation {
	op: "append" | "mkdir" | "remove" | "rename" | "reset" | "rmdir" | "write";
	path?: string;
	to?: string;
	value?: string;
}

/** Exposes the persistent vault to the same-origin browser runtime. */
export function createVaultRequestHandler(vault: FileVault) {
	return async (
		request: IncomingMessage,
		response: ServerResponse
	): Promise<boolean> => {
		const url = new URL(request.url ?? "/", "http://localhost");
		if (!url.pathname.startsWith("/api/vault")) return false;
		response.setHeader("cache-control", "no-store");
		response.setHeader("content-type", "application/json; charset=utf-8");
		try {
			if (
				request.method === "GET" &&
				url.pathname === "/api/vault/snapshot"
			) {
				response.end(JSON.stringify(await vault.snapshot()));
				return true;
			}
			if (
				request.method === "GET" &&
				url.pathname === "/api/vault/read"
			) {
				response.end(
					JSON.stringify({
						value: await vault.read(requiredPath(url)),
					})
				);
				return true;
			}
			if (
				request.method === "GET" &&
				url.pathname === "/api/vault/read-binary"
			) {
				response.end(
					JSON.stringify({
						value: (
							await vault.readBinary(requiredPath(url))
						).toString("base64"),
					})
				);
				return true;
			}
			if (
				request.method !== "POST" ||
				url.pathname !== "/api/vault/mutate"
			) {
				response.statusCode = 404;
				response.end(
					JSON.stringify({ error: "Vault endpoint not found" })
				);
				return true;
			}
			const mutation = JSON.parse(
				await readBody(request)
			) as VaultMutation;
			const result = await applyMutation(vault, mutation);
			response.end(JSON.stringify(result ?? { ok: true }));
			return true;
		} catch (error) {
			response.statusCode = error instanceof SyntaxError ? 400 : 422;
			response.end(
				JSON.stringify({
					error:
						error instanceof Error ? error.message : String(error),
				})
			);
			return true;
		}
	};
}

async function applyMutation(vault: FileVault, mutation: VaultMutation) {
	const path = mutation.path ?? "";
	switch (mutation.op) {
		case "append": {
			const current = (await vault.exists(path))
				? await vault.read(path)
				: "";
			await vault.write(path, `${current}${mutation.value ?? ""}`);
			return;
		}
		case "mkdir":
			return vault.mkdir(path);
		case "remove":
			return vault.remove(path);
		case "rename":
			if (!mutation.to) throw new Error("A rename target is required");
			return vault.rename(path, mutation.to);
		case "reset":
			return vault.reset();
		case "rmdir":
			return vault.rmdir(path);
		case "write":
			return vault.write(path, mutation.value ?? "");
		default:
			throw new Error("Unsupported vault mutation");
	}
}

function requiredPath(url: URL): string {
	const path = url.searchParams.get("path");
	if (path === null) throw new Error("A vault path is required");
	return path;
}

async function readBody(request: IncomingMessage): Promise<string> {
	const chunks: Array<Buffer> = [];
	let length = 0;
	for await (const chunk of request) {
		const value = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
		length += value.length;
		if (length > 1_048_576) throw new Error("Vault request is too large");
		chunks.push(value);
	}
	return Buffer.concat(chunks).toString("utf8");
}
