# Knapper Obsidian Simulator

Run a built Obsidian plugin in a local browser shell. The simulator loads the standard release artifacts: `main.js`, `manifest.json`, and `styles.css`.

This project complements [Knapper](https://github.com/bearfire-dev/knapper). Knapper tests plugins in live Obsidian instances. This simulator provides a faster browser workflow for local interface development.

The shell provides these surfaces:

- One right sidebar.
- Up to three tabs, with one visible tab at a time.
- A separate plugin settings screen.
- Independent sidebar, tab, and settings dimensions.
- Light and dark Obsidian themes.
- A persistent local vault.

## Run the simulator

Build your plugin first. Then run:

```bash
pnpm exec knapper-obsidian-simulator --path ./dist
```

To run a published package without installing it in the project, use:

```bash
pnpm dlx knapper-obsidian-simulator --path ./dist
```

The default vault is `./.knapper_files`. Use `--vault` to select another directory:

```bash
pnpm exec knapper-obsidian-simulator \
	--path ./dist \
	--vault ./test-vault \
	--port 3000 \
	--open
```

The CLI watches the artifact directory by default. A new plugin build reloads the hosted plugin frames. Use `--no-watch` to turn off this behavior.

## Persistent files and reset

Plugin vault operations use the local vault directory. Data remains after the simulator stops. The reset control requires a reset icon click and a confirmation click. Reset moves the old vault into a timestamped `.knapper-simulator-trash` directory next to the vault. This makes the reset recoverable.

## Import the package

The package exports the artifact loader, compatibility runtime, theme snapshot utilities, local app server, and persistent vault:

```ts
import {
	FileVault,
	createAppServerFromPath,
	loadPluginArtifacts,
	validateThemeSnapshot,
} from "knapper-obsidian-simulator";
```

## Refresh the Obsidian theme capture

The checked-in light and dark fixtures come from a private Knapper Obsidian session. The capture reads computed CSS values and shell geometry. It does not read vault Markdown files.

Run the maintenance command with a local Knapper checkout:

```bash
pnpm run theme:capture \
	--knapper-root ../knapper \
	--obsidian-version 1.12.7

pnpm run theme:validate
```

The command creates a temporary Knapper home, opens an isolated Obsidian session, captures both modes, stops the session, and removes the temporary home.

## Compatibility boundary

The simulator provides common Obsidian plugin APIs, workspace leaves, settings tabs, vault operations, DOM helpers, notices, menus, modals, icons, network requests, and permissive CodeMirror host objects. It is a development simulator. It is not a security boundary and it is not a full Electron replacement.

## License

This project uses the [MIT License](LICENSE).
