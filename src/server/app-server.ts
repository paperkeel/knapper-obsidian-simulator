import { createServer } from "node:http";
import type { IncomingMessage, ServerResponse } from "node:http";
import { loadPluginArtifacts } from "../artifacts";
import type { PluginArtifacts } from "../artifacts";

export interface AppServerOptions {
	artifacts: PluginArtifacts;
	vault?: unknown;
	runtime?: {
		handleRequest?: (
			request: IncomingMessage,
			response: ServerResponse
		) => Promise<boolean> | boolean;
	};
	fallback?: (
		request: IncomingMessage,
		response: ServerResponse
	) => Promise<boolean> | boolean;
}

export interface AppServer {
	listen: (
		port?: number,
		host?: string
	) => Promise<{ host: string; port: number }>;
	close: () => Promise<void>;
}

/** Creates the local HTTP boundary for simulator metadata and plugin artifacts. */
export function createAppServer(options: AppServerOptions): AppServer {
	const server = createServer(async (request, response) => {
		if (
			options.runtime?.handleRequest &&
			(await options.runtime.handleRequest(request, response))
		)
			return;
		if (handleArtifactRequest(options.artifacts, request, response)) return;
		if (options.fallback && (await options.fallback(request, response)))
			return;
		response.statusCode = 404;
		response.end("Not found");
	});
	return {
		listen: (port = 0, host = "127.0.0.1") =>
			new Promise((resolve, reject) => {
				server.once("error", reject);
				server.listen(port, host, () => {
					const address = server.address();
					if (!address || typeof address === "string")
						return reject(
							new Error("Unable to determine server address")
						);
					resolve({ host, port: address.port });
				});
			}),
		close: () =>
			new Promise((resolve, reject) =>
				server.close((error) => (error ? reject(error) : resolve()))
			),
	};
}

/** Serve simulator metadata and immutable plugin artifact routes. */
export function handleArtifactRequest(
	artifacts: PluginArtifacts,
	request: IncomingMessage,
	response: ServerResponse
): boolean {
	const path = new URL(request.url ?? "/", "http://localhost").pathname;
	if (!path.startsWith("/api/artifacts")) return false;
	response.setHeader("cache-control", "no-store");
	if (path === "/api/artifacts") {
		response.setHeader("content-type", "application/json; charset=utf-8");
		response.end(
			JSON.stringify({
				manifest: artifacts.manifest,
				requires: artifacts.requires,
				styles: artifacts.styles,
			})
		);
		return true;
	}
	const files: Record<string, [string, string]> = {
		"/api/artifacts/main.js": [
			artifacts.main,
			"application/javascript; charset=utf-8",
		],
		"/api/artifacts/styles.css": [
			artifacts.styles,
			"text/css; charset=utf-8",
		],
		"/api/artifacts/manifest.json": [
			JSON.stringify(artifacts.manifest),
			"application/json; charset=utf-8",
		],
	};
	if (!(path in files)) {
		response.statusCode = 404;
		response.end("Not found");
		return true;
	}
	const file = files[path];
	response.setHeader("content-type", file[1]);
	response.end(file[0]);
	return true;
}

/** Loads artifacts and creates an app server in one operation. */
export async function createAppServerFromPath(
	path: string
): Promise<AppServer> {
	return createAppServer({ artifacts: await loadPluginArtifacts(path) });
}
