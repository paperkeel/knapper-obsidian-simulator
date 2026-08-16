import { describe, expect, it } from "vite-plus/test";
import { parseCliOptions } from "./options";

describe("CLI options", () => {
	it("parses artifact, vault, host, port, and flags", () => {
		expect(
			parseCliOptions([
				"--path",
				"./dist",
				"--vault",
				"./vault",
				"--port",
				"4567",
				"--host=0.0.0.0",
				"--open",
				"--no-watch",
			])
		).toEqual({
			path: "./dist",
			vault: "./vault",
			port: 4567,
			host: "0.0.0.0",
			open: true,
			watch: false,
			theme: "system",
		});
	});

	it("uses safe defaults", () => {
		expect(parseCliOptions(["--path", "dist"])).toMatchObject({
			path: "dist",
			host: "127.0.0.1",
			port: 0,
			watch: true,
			theme: "system",
		});
	});

	it("rejects missing and unknown options", () => {
		expect(() => parseCliOptions([])).toThrow(/--path/);
		expect(() => parseCliOptions(["--path", "dist", "--unknown"])).toThrow(
			/Unknown option/
		);
	});
});
