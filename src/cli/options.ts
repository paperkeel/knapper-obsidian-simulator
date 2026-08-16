export interface CliOptions {
	path: string;
	vault?: string;
	host: string;
	port: number;
	open: boolean;
	watch: boolean;
	theme: "light" | "dark" | "system";
}

/** Parses simulator command-line options. */
export function parseCliOptions(args: ReadonlyArray<string>): CliOptions {
	let path: string | undefined;
	let vault: string | undefined;
	let host = "127.0.0.1";
	let port = 0;
	let open = false;
	let watch = true;
	let theme: CliOptions["theme"] = "system";
	for (let index = 0; index < args.length; index += 1) {
		const argument = args[index];
		const separator = argument.indexOf("=");
		const key = separator === -1 ? argument : argument.slice(0, separator);
		const inline =
			separator === -1 ? undefined : argument.slice(separator + 1);
		const value = (): string => {
			const result = inline ?? args[++index];
			if (!result) throw new Error(`Missing value for ${key}`);
			return result;
		};
		switch (key) {
			case "--path":
				path = value();
				break;
			case "--vault":
				vault = value();
				break;
			case "--host":
				host = value();
				break;
			case "--port":
				port = Number(value());
				if (!Number.isInteger(port) || port < 0 || port > 65535)
					throw new Error(
						"--port must be an integer from 0 to 65535"
					);
				break;
			case "--open":
				open = true;
				break;
			case "--no-watch":
				watch = false;
				break;
			case "--theme": {
				const candidate = value();
				if (
					candidate !== "light" &&
					candidate !== "dark" &&
					candidate !== "system"
				)
					throw new Error("--theme must be light, dark, or system");
				theme = candidate;
				break;
			}
			default:
				throw new Error(`Unknown option: ${argument}`);
		}
	}
	if (!path) throw new Error("--path is required");
	return { path, vault, host, port, open, watch, theme };
}

/** Parses process.argv and prints a concise CLI error before exiting. */
export function parseProcessOptions(args = process.argv.slice(2)): CliOptions {
	return parseCliOptions(args);
}
