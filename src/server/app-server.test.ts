import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vite-plus/test";
import { loadPluginArtifacts } from "../artifacts";
import { createAppServer } from "./app-server";

describe("app server", () => {
	it("serves artifact metadata and files", async () => {
		const root = await mkdtemp(join(tmpdir(), "knapper-server-"));
		await writeFile(join(root, "main.js"), "module.exports = {};");
		await writeFile(join(root, "styles.css"), "body { color: black; }");
		await writeFile(
			join(root, "manifest.json"),
			JSON.stringify({ id: "test", name: "Test", version: "1" })
		);
		const server = createAppServer({
			artifacts: await loadPluginArtifacts(root),
		});
		const address = await server.listen(0, "127.0.0.1");
		try {
			const metadata = await fetch(
				`http://${address.host}:${address.port}/api/artifacts`
			).then((response) => response.json());
			expect(metadata.manifest.id).toBe("test");
			const main = await fetch(
				`http://${address.host}:${address.port}/api/artifacts/main.js`
			).then((response) => response.text());
			expect(main).toContain("module.exports");
		} finally {
			await server.close();
		}
	});
});
