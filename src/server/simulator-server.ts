import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { createServer } from "node:http";
import type { IncomingMessage, ServerResponse } from "node:http";
import { extname, relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { Readable } from "node:stream";
import type { PluginArtifacts } from "../artifacts";
import { handleArtifactRequest } from "./app-server";
import type { FileVault } from "./vault/vault";
import { createVaultRequestHandler } from "./vault/handler";

interface StartServerEntry {
	fetch: (request: Request) => Promise<Response>;
}

export interface SimulatorServerOptions {
	artifacts: () => PluginArtifacts;
	vault: FileVault;
	packageRoot: string;
}

export interface SimulatorServer {
	listen: (
		port?: number,
		host?: string
	) => Promise<{ host: string; port: number }>;
	close: () => Promise<void>;
	notifyReload: () => void;
}

/** Serve the built simulator app, plugin artifacts, and persistent vault. */
export async function createSimulatorServer(
	options: SimulatorServerOptions
): Promise<SimulatorServer> {
	const clientRoot = resolve(options.packageRoot, "dist/client");
	const serverEntryUrl = pathToFileURL(
		resolve(options.packageRoot, "dist/server/server.js")
	).href;
	const start = (await import(serverEntryUrl)).default as StartServerEntry;
	const vaultHandler = createVaultRequestHandler(options.vault);
	const eventClients = new Set<ServerResponse>();
	const server = createServer(async (request, response) => {
		try {
			if (handleArtifactRequest(options.artifacts(), request, response))
				return;
			if (await vaultHandler(request, response)) return;
			if (
				new URL(request.url ?? "/", "http://localhost").pathname ===
				"/api/events"
			) {
				response.writeHead(200, {
					"cache-control": "no-cache",
					connection: "keep-alive",
					"content-type": "text/event-stream",
				});
				response.write("event: ready\ndata: connected\n\n");
				eventClients.add(response);
				request.once("close", () => eventClients.delete(response));
				return;
			}
			if (await serveStatic(clientRoot, request, response)) return;
			await serveStart(start, request, response);
		} catch (error) {
			if (response.headersSent) response.end();
			else {
				response.statusCode = 500;
				response.setHeader("content-type", "text/plain; charset=utf-8");
				response.end(
					error instanceof Error ? error.message : String(error)
				);
			}
		}
	});
	return {
		listen: (port = 0, host = "127.0.0.1") =>
			new Promise((resolveListen, reject) => {
				server.once("error", reject);
				server.listen(port, host, () => {
					const address = server.address();
					if (!address || typeof address === "string") {
						reject(
							new Error("Unable to determine simulator address")
						);
						return;
					}
					resolveListen({ host, port: address.port });
				});
			}),
		close: () =>
			new Promise((resolveClose, reject) => {
				for (const client of eventClients) client.end();
				server.close((error) =>
					error ? reject(error) : resolveClose()
				);
			}),
		notifyReload: () => {
			for (const client of eventClients)
				client.write("event: reload\ndata: artifacts\n\n");
		},
	};
}

async function serveStatic(
	clientRoot: string,
	request: IncomingMessage,
	response: ServerResponse
): Promise<boolean> {
	const pathname = decodeURIComponent(
		new URL(request.url ?? "/", "http://localhost").pathname
	);
	if (pathname === "/" || !pathname.includes(".")) return false;
	const target = resolve(clientRoot, `.${pathname}`);
	if (relative(clientRoot, target).startsWith("..")) return false;
	const details = await stat(target).catch(() => null);
	if (!details?.isFile()) return false;
	response.statusCode = 200;
	response.setHeader("content-length", details.size);
	response.setHeader("content-type", contentType(extname(target)));
	await new Promise<void>((resolveStream, reject) => {
		createReadStream(target)
			.once("error", reject)
			.once("end", resolveStream)
			.pipe(response);
	});
	return true;
}

async function serveStart(
	start: StartServerEntry,
	request: IncomingMessage,
	response: ServerResponse
): Promise<void> {
	const host = request.headers.host ?? "127.0.0.1";
	const method = request.method ?? "GET";
	const body =
		method === "GET" || method === "HEAD"
			? undefined
			: (Readable.toWeb(request) as ReadableStream<Uint8Array>);
	const webRequest = new Request(`http://${host}${request.url ?? "/"}`, {
		method,
		headers: request.headers as HeadersInit,
		body,
		duplex: body ? "half" : undefined,
	} as RequestInit & { duplex?: "half" });
	const webResponse = await start.fetch(webRequest);
	response.statusCode = webResponse.status;
	for (const [name, value] of webResponse.headers)
		response.setHeader(name, value);
	if (!webResponse.body) {
		response.end();
		return;
	}
	Readable.fromWeb(webResponse.body as never).pipe(response);
}

function contentType(extension: string): string {
	return (
		(
			{
				".css": "text/css; charset=utf-8",
				".ico": "image/x-icon",
				".js": "application/javascript; charset=utf-8",
				".json": "application/json; charset=utf-8",
				".png": "image/png",
				".svg": "image/svg+xml",
				".woff2": "font/woff2",
			} as Record<string, string>
		)[extension] ?? "application/octet-stream"
	);
}
