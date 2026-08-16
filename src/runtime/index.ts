/** A disposable callback returned by an event subscription. */
export class EventRef {
	private active = true;

	public constructor(private readonly dispose: () => void) {}

	/** Remove the subscription once. */
	public unsubscribe(): void {
		if (this.active) {
			this.active = false;
			this.dispose();
		}
	}
}

type Listener<T> = (value: T) => void;

declare global {
	interface HTMLElement {
		createEl: <K extends keyof HTMLElementTagNameMap>(
			tag: K,
			options?: { text?: string; cls?: string } | string
		) => HTMLElementTagNameMap[K];
		createDiv: (
			options?: { text?: string; cls?: string } | string
		) => HTMLDivElement;
		createSpan: (
			options?: { text?: string; cls?: string } | string
		) => HTMLSpanElement;
		empty: () => void;
		setText: (text: string) => void;
		addClass: (...classes: Array<string>) => void;
		removeClass: (...classes: Array<string>) => void;
		toggleClass: (className: string, value: boolean) => void;
		setAttr: (name: string, value: string) => void;
	}
}

/** A small typed event bus for browser-side Obsidian objects. */
export class EventBus<TEvents extends object> {
	private readonly listeners = new Map<
		keyof TEvents,
		Set<Listener<unknown>>
	>();

	/** Subscribe to an event. */
	public on<TKey extends keyof TEvents>(
		event: TKey,
		listener: Listener<TEvents[TKey]>
	): EventRef {
		const listeners =
			this.listeners.get(event) ?? new Set<Listener<unknown>>();
		listeners.add(listener as Listener<unknown>);
		this.listeners.set(event, listeners);
		return new EventRef(() =>
			listeners.delete(listener as Listener<unknown>)
		);
	}

	/** Emit an event to current subscribers. */
	public emit<TKey extends keyof TEvents>(
		event: TKey,
		value: TEvents[TKey]
	): void {
		for (const listener of this.listeners.get(event) ?? []) listener(value);
	}
}

/** A base class that tracks cleanup callbacks. */
export class Component {
	private readonly disposers = new Set<() => void>();

	/** Track an event, component, or custom cleanup callback. */
	public registerEvent(ref: EventRef): EventRef {
		this.disposers.add(() => ref.unsubscribe());
		return ref;
	}

	/** Track a DOM listener until unload. */
	public registerDomEvent<K extends keyof HTMLElementEventMap>(
		element: HTMLElement,
		event: K,
		callback: (event: HTMLElementEventMap[K]) => void,
		options?: AddEventListenerOptions | boolean
	): void {
		element.addEventListener(event, callback as EventListener, options);
		this.register(() =>
			element.removeEventListener(
				event,
				callback as EventListener,
				options
			)
		);
	}

	/** Track an interval until unload. */
	public registerInterval(id: number): number {
		this.register(() => window.clearInterval(id));
		return id;
	}

	/** Load this component. */
	public load(): void {
		(this as { onload?: () => void }).onload?.();
	}

	/** Track a component or custom cleanup callback. */
	public register<T extends { unload: () => void }>(component: T): T;
	public register(callback: () => void): void;
	public register(
		value: EventRef | { unload: () => void } | (() => void)
	): unknown {
		const disposer =
			value instanceof EventRef
				? () => value.unsubscribe()
				: typeof value === "function"
					? value
					: () => value.unload();
		this.disposers.add(disposer);
		return value;
	}

	/** Dispose all tracked resources. */
	public unload(): void {
		for (const dispose of this.disposers) dispose();
		this.disposers.clear();
	}
}

/** An error for an API that the simulator does not implement. */
export class UnsupportedCapabilityError extends Error {
	public readonly capability: string;

	public constructor(capability: string) {
		super(`Unsupported Obsidian capability: ${capability}`);
		this.name = "UnsupportedCapabilityError";
		this.capability = capability;
	}
}

/** Normalize a vault-relative path and reject paths outside the vault. */
export function normalizePath(path: string): string {
	const segments: Array<string> = [];
	for (const segment of path.replaceAll("\\", "/").split("/")) {
		if (!segment || segment === ".") continue;
		if (segment === "..") {
			if (segments.length === 0)
				throw new Error("Path escapes the vault");
			segments.pop();
		} else segments.push(segment);
	}
	return segments.join("/");
}

/** A vault file or folder base object. */
export class TAbstractFile {
	public readonly name: string;
	public readonly parent: TFolder | null;

	public constructor(
		public readonly path: string,
		parent: TFolder | null = null
	) {
		this.name = path.split("/").at(-1) ?? path;
		this.parent = parent;
	}
}

/** A folder in the simulated vault. */
export class TFolder extends TAbstractFile {
	public readonly children: Array<TAbstractFile> = [];
	public readonly vault = undefined;

	public constructor(path: string, parent: TFolder | null = null) {
		super(path, parent);
	}

	/** Return the folder type used by Obsidian. */
	public get extension(): "" {
		return "";
	}
}

/** A file in the simulated vault. */
export class TFile extends TAbstractFile {
	public readonly extension: string;
	public readonly basename: string;
	public readonly stat: { size: number; ctime: number; mtime: number };

	public constructor(
		path: string,
		size = 0,
		mtime = Date.now(),
		parent: TFolder | null = null
	) {
		super(path, parent);
		const index = this.name.lastIndexOf(".");
		this.extension = index > 0 ? this.name.slice(index + 1) : "";
		this.basename = index > 0 ? this.name.slice(0, index) : this.name;
		this.stat = { size, ctime: mtime, mtime };
	}
}

/** Persistence ports used by Plugin data methods. */
export interface DataStorePort {
	read: (id: string) => Promise<unknown>;
	write: (id: string, value: unknown) => Promise<void>;
}

export interface ObsidianManifest {
	id: string;
	name: string;
	version: string;
	dir?: string;
	[key: string]: unknown;
}

/** A command registered by a plugin. */
export interface Command {
	id: string;
	name: string;
	callback?: () => unknown;
}

/** A registered workspace view factory. */
export interface ViewRegistration {
	viewType: string;
	factory: (leaf: WorkspaceLeaf) => ItemView;
}

/** A plugin instance with lifecycle and registration helpers. */
export class Plugin extends Component {
	public readonly app: App;
	public readonly manifest: ObsidianManifest;
	private readonly dataStore: DataStorePort;
	private data: unknown;
	public readonly commands: Array<Command> = [];
	public readonly views: Array<ViewRegistration> = [];
	public readonly settingTabs: Array<PluginSettingTab> = [];

	public constructor(app: App, manifest: ObsidianManifest);
	public constructor(options?: {
		id?: string;
		dataStore?: DataStorePort;
		workspace?: Workspace;
	});
	public constructor(
		appOrOptions:
			| App
			| {
					id?: string;
					dataStore?: DataStorePort;
					workspace?: Workspace;
			  } = {},
		manifest?: ObsidianManifest
	) {
		super();
		const isApp = appOrOptions instanceof App;
		const options = isApp ? {} : appOrOptions;
		this.app = isApp
			? appOrOptions
			: new App({ workspace: options.workspace ?? new Workspace() });
		this.manifest = manifest ?? {
			id: options.id ?? "plugin",
			name: options.id ?? "Plugin",
			version: "0.0.0",
		};
		this.dataStore = options.dataStore ?? createPluginDataStore(this.app);
	}

	/** Default plugin load hook. */
	public onload(): void | Promise<void> {}

	/** Default plugin unload hook. */
	public onunload(): void {}

	/** Run the plugin unload hook, then release registered resources. */
	public override unload(): void {
		this.onunload();
		super.unload();
	}

	/** Read plugin settings from the configured persistence port. */
	public async loadData<T = unknown>(): Promise<T | undefined> {
		this.data = await this.dataStore.read(this.manifest.id);
		return this.data as T | undefined;
	}

	/** Write plugin settings to the configured persistence port. */
	public async saveData<T>(data: T): Promise<void> {
		this.data = data;
		await this.dataStore.write(this.manifest.id, data);
	}

	/** Return the latest loaded settings value. */
	public getData<T = unknown>(): T | undefined {
		return this.data as T | undefined;
	}

	/** Register a command in the simulator command registry. */
	public addCommand(command: Command): Command {
		this.commands.push(command);
		this.app.commands.commands[`${this.manifest.id}:${command.id}`] =
			command;
		return command;
	}

	/** Register a view factory for workspace leaves. */
	public registerView(
		viewType: string,
		factory: (leaf: WorkspaceLeaf) => ItemView
	): void {
		this.views.push({ viewType, factory });
		this.app.workspace.registerView(viewType, factory);
	}

	/** Register a settings tab for the settings screen. */
	public addSettingTab(tab: PluginSettingTab): void {
		this.settingTabs.push(tab);
	}

	/** Add a ribbon icon and track it for plugin unload. */
	public addRibbonIcon(
		icon: string,
		title: string,
		callback: (event: MouseEvent) => void
	): HTMLElement {
		const element = createEl("button", icon, "side-dock-ribbon-action");
		element.setAttribute("aria-label", title);
		element.addEventListener("click", callback);
		this.register(() => element.remove());
		return element;
	}

	/** Track an editor extension until plugin unload. */
	public registerEditorExtension(extension: unknown): void {
		this.register(() => void extension);
	}
}

/** A leaf that hosts one plugin view. */
export class WorkspaceLeaf {
	public view: ItemView | null = null;
	public state: Record<string, unknown> = {};
	public containerEl: HTMLElement = document.createElement("div");

	public constructor(private readonly workspace?: Workspace) {
		this.containerEl.className = "workspace-leaf-content";
	}

	/** Set the view state and optional view instance. */
	public async setViewState(state: Record<string, unknown>): Promise<void> {
		this.state = state;
		const type = typeof state.type === "string" ? state.type : "";
		const factory = this.workspace?.getViewFactory(type);
		if (factory) {
			if (this.view) await this.view.onClose();
			this.view = factory(this);
			await this.view.onOpen();
		}
	}

	/** Return this leaf's current state. */
	public getViewState(): Record<string, unknown> {
		return this.state;
	}

	/** Detach and close the hosted view. */
	public async detach(): Promise<void> {
		if (this.view) await this.view.onClose();
		this.view = null;
		this.containerEl.remove();
	}

	/** Open this leaf as the active leaf. */
	public openFile(file: TFile): Promise<void> {
		this.state = { ...this.state, file };
		return Promise.resolve();
	}
}

/** A workspace with one sidebar leaf and three tab leaves. */
export class Workspace {
	private readonly tabs: Array<WorkspaceLeaf> = [];
	private rightLeaf: WorkspaceLeaf | undefined;
	public activeLeaf: WorkspaceLeaf | undefined;
	private readonly events = new EventBus<Record<string, unknown>>();
	private readonly viewFactories = new Map<
		string,
		(leaf: WorkspaceLeaf) => ItemView
	>();
	public readonly rootSplit = {};
	public activeEditor: unknown = null;

	/** Subscribe to a workspace event. */
	public on(event: string, callback: (value: unknown) => void): EventRef {
		return this.events.on(event, callback);
	}

	/** Run a callback after workspace setup. */
	public onLayoutReady(callback: () => void): void {
		queueMicrotask(callback);
	}

	/** Get or create the right sidebar leaf. */
	public getRightLeaf(_split: boolean): WorkspaceLeaf {
		this.rightLeaf ??= new WorkspaceLeaf(this);
		return this.rightLeaf;
	}

	/** Get a tab leaf, or create one when capacity allows. */
	public getLeaf(newLeaf = false): WorkspaceLeaf | undefined {
		if (!newLeaf) return this.activeLeaf ?? this.tabs[0];
		if (this.tabs.length >= 3) return undefined;
		const leaf = new WorkspaceLeaf(this);
		this.tabs.push(leaf);
		this.activeLeaf = leaf;
		return leaf;
	}

	/** Return all tab leaves. */
	public getTabLeaves(): Array<WorkspaceLeaf> {
		return [...this.tabs];
	}

	/** Return leaves that host the requested view type. */
	public getLeavesOfType(viewType: string): Array<WorkspaceLeaf> {
		return [...this.tabs, this.rightLeaf].filter(
			(leaf): leaf is WorkspaceLeaf =>
				leaf?.view?.getViewType() === viewType
		);
	}

	/** Activate a leaf. */
	public setActiveLeaf(leaf: WorkspaceLeaf): void {
		this.activeLeaf = leaf;
		this.events.emit("active-leaf-change", leaf);
	}

	/** Return the most recently active leaf. */
	public getMostRecentLeaf(): WorkspaceLeaf | undefined {
		return this.activeLeaf;
	}

	/** Return every open leaf. */
	public iterateAllLeaves(callback: (leaf: WorkspaceLeaf) => void): void {
		for (const leaf of [...this.tabs, this.rightLeaf].filter(
			(value): value is WorkspaceLeaf => value !== undefined
		))
			callback(leaf);
	}

	/** Remove all leaves with a matching view type. */
	public detachLeavesOfType(viewType: string): void {
		for (const leaf of this.getLeavesOfType(viewType)) void leaf.detach();
	}

	/** Register a view factory for leaf state changes. */
	public registerView(
		viewType: string,
		factory: (leaf: WorkspaceLeaf) => ItemView
	): void {
		this.viewFactories.set(viewType, factory);
	}

	/** Return the factory for a registered view type. */
	public getViewFactory(
		viewType: string
	): ((leaf: WorkspaceLeaf) => ItemView) | undefined {
		return this.viewFactories.get(viewType);
	}

	/** Reveal and activate a leaf. */
	public revealLeaf(leaf: WorkspaceLeaf): Promise<void> {
		this.setActiveLeaf(leaf);
		return Promise.resolve();
	}

	/** Return the active file, when a Markdown host sets one. */
	public getActiveFile(): TFile | null {
		const file = this.activeLeaf?.state.file;
		return file instanceof TFile ? file : null;
	}

	/** Open a vault path in the active leaf. */
	public async openLinkText(path: string): Promise<void> {
		const file = new TFile(normalizePath(path));
		const leaf = this.activeLeaf ?? this.getLeaf(true);
		await leaf?.openFile(file);
	}

	/** Return a leaf by its simulator identifier. */
	public getLeafById(_id: string): WorkspaceLeaf | null {
		return null;
	}

	/** Obsidian refresh hook used after settings changes. */
	public updateOptions(): void {}
}

export interface VaultEntryMetadata {
	id: string;
	name: string;
	path: string;
	type: "file" | "folder" | "symlink";
	size: number;
	mtimeMs: number;
}

/** Browser adapter backed by the simulator's same-origin vault API. */
export class BrowserVaultAdapter {
	private entries: Map<string, VaultEntryMetadata>;

	public constructor(entries: ReadonlyArray<VaultEntryMetadata> = []) {
		this.entries = new Map(entries.map((entry) => [entry.path, entry]));
	}

	/** Refresh file metadata without reading file contents. */
	public async refresh(): Promise<void> {
		const response = await fetch("/api/vault/snapshot", {
			cache: "no-store",
		});
		if (!response.ok) throw new Error(await response.text());
		const entries = (await response.json()) as Array<VaultEntryMetadata>;
		this.entries = new Map(entries.map((entry) => [entry.path, entry]));
	}

	/** Return cached metadata for synchronous Obsidian vault APIs. */
	public getEntry(path: string): VaultEntryMetadata | undefined {
		return this.entries.get(normalizePath(path));
	}

	/** Return all cached metadata without reading file content. */
	public getEntries(): Array<VaultEntryMetadata> {
		return [...this.entries.values()];
	}

	/** Test whether a path exists. */
	public async exists(path: string): Promise<boolean> {
		await this.refresh();
		return this.entries.has(normalizePath(path));
	}

	/** Read UTF-8 file content. */
	public async read(path: string): Promise<string> {
		const response = await fetch(
			`/api/vault/read?path=${encodeURIComponent(normalizePath(path))}`,
			{ cache: "no-store" }
		);
		if (!response.ok) throw new Error((await response.json()).error);
		return ((await response.json()) as { value: string }).value;
	}

	/** Read binary file content. */
	public async readBinary(path: string): Promise<ArrayBuffer> {
		const response = await fetch(
			`/api/vault/read-binary?path=${encodeURIComponent(normalizePath(path))}`,
			{ cache: "no-store" }
		);
		if (!response.ok) throw new Error((await response.json()).error);
		const { value } = (await response.json()) as { value: string };
		const bytes = Uint8Array.from(atob(value), (character) =>
			character.charCodeAt(0)
		);
		return bytes.buffer;
	}

	/** Write UTF-8 file content. */
	public async write(path: string, value: string): Promise<void> {
		await this.mutate({ op: "write", path: normalizePath(path), value });
	}

	/** Append UTF-8 file content. */
	public async append(path: string, value: string): Promise<void> {
		await this.mutate({ op: "append", path: normalizePath(path), value });
	}

	/** Create a folder and missing parents. */
	public async mkdir(path: string): Promise<void> {
		await this.mutate({ op: "mkdir", path: normalizePath(path) });
	}

	/** Remove a file. */
	public async remove(path: string): Promise<void> {
		await this.mutate({ op: "remove", path: normalizePath(path) });
	}

	/** Remove a folder recursively. */
	public async rmdir(path: string, recursive = false): Promise<void> {
		await this.mutate({
			op: recursive ? "rmdir" : "remove",
			path: normalizePath(path),
		});
	}

	/** Rename a file or folder. */
	public async rename(from: string, to: string): Promise<void> {
		await this.mutate({
			op: "rename",
			path: normalizePath(from),
			to: normalizePath(to),
		});
	}

	/** Replace a file using an async-safe read and write. */
	public async process(
		path: string,
		transform: (value: string) => string
	): Promise<string> {
		const next = transform(await this.read(path));
		await this.write(path, next);
		return next;
	}

	/** List immediate files and folders below a path. */
	public async list(
		path: string
	): Promise<{ files: Array<string>; folders: Array<string> }> {
		await this.refresh();
		const parent = normalizePath(path);
		const prefix = parent ? `${parent}/` : "";
		const entries = [...this.entries.values()].filter((entry) => {
			if (!entry.path.startsWith(prefix)) return false;
			return !entry.path.slice(prefix.length).includes("/");
		});
		return {
			files: entries
				.filter((entry) => entry.type === "file")
				.map((entry) => entry.path),
			folders: entries
				.filter((entry) => entry.type === "folder")
				.map((entry) => entry.path),
		};
	}

	/** Return Obsidian-shaped file metadata. */
	public async stat(path: string): Promise<{
		type: "file" | "folder";
		size: number;
		mtime: number;
		ctime: number;
	} | null> {
		await this.refresh();
		const entry = this.entries.get(normalizePath(path));
		if (!entry || entry.type === "symlink") return null;
		return {
			type: entry.type,
			size: entry.size,
			mtime: entry.mtimeMs,
			ctime: entry.mtimeMs,
		};
	}

	private async mutate(input: Record<string, unknown>): Promise<unknown> {
		const response = await fetch("/api/vault/mutate", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify(input),
		});
		const result = (await response.json()) as { error?: string };
		if (!response.ok)
			throw new Error(result.error ?? "Vault operation failed");
		await this.refresh();
		return result;
	}
}

type VaultEventName = "create" | "delete" | "modify" | "rename";

/** Obsidian-shaped vault facade for plugin code. */
export class Vault {
	public readonly configDir = ".obsidian";
	private readonly listeners = new Map<
		VaultEventName,
		Set<(...args: Array<unknown>) => void>
	>();

	public constructor(public readonly adapter: BrowserVaultAdapter) {}

	/** Return the display name of the simulated vault. */
	public getName(): string {
		return ".knapper_files";
	}

	/** Return a virtual root folder. */
	public getRoot(): TFolder {
		return new TFolder("");
	}

	/** Return a file from the latest metadata snapshot. */
	public getFileByPath(path: string): TFile | null {
		const entry = this.adapter.getEntry(path);
		return entry?.type === "file"
			? new TFile(entry.path, entry.size, entry.mtimeMs)
			: null;
	}

	/** Resolve a path asynchronously for simulator consumers. */
	public async resolve(path: string): Promise<TAbstractFile | null> {
		const stat = await this.adapter.stat(path);
		if (!stat) return null;
		return stat.type === "folder"
			? new TFolder(normalizePath(path))
			: new TFile(normalizePath(path), stat.size, stat.mtime);
	}

	/** Obsidian compatibility alias. Metadata refreshes asynchronously. */
	public getAbstractFileByPath(path: string): TAbstractFile | null {
		const entry = this.adapter.getEntry(path);
		if (!entry || entry.type === "symlink") return null;
		return entry.type === "folder"
			? new TFolder(entry.path)
			: new TFile(entry.path, entry.size, entry.mtimeMs);
	}

	/** Return a folder when the path uses a folder suffix. */
	public getFolderByPath(path: string): TFolder | null {
		if (path === "") return this.getRoot();
		const entry = this.adapter.getEntry(path);
		return entry?.type === "folder" ? new TFolder(entry.path) : null;
	}

	/** Return Markdown metadata without reading content. */
	public getMarkdownFiles(): Array<TFile> {
		return this.adapter
			.getEntries()
			.filter(
				(entry) =>
					entry.type === "file" &&
					entry.path.toLowerCase().endsWith(".md")
			)
			.map((entry) => new TFile(entry.path, entry.size, entry.mtimeMs));
	}

	/** Read a vault file. */
	public read(file: TFile): Promise<string> {
		return this.adapter.read(file.path);
	}

	/** Read a vault file without a separate cache layer. */
	public cachedRead(file: TFile): Promise<string> {
		return this.read(file);
	}

	/** Create a file. */
	public async create(path: string, value: string): Promise<TFile> {
		await this.adapter.write(path, value);
		const file = new TFile(normalizePath(path), value.length);
		this.emit("create", file);
		return file;
	}

	/** Create a folder. */
	public async createFolder(path: string): Promise<TFolder> {
		await this.adapter.mkdir(path);
		const folder = new TFolder(normalizePath(path));
		this.emit("create", folder);
		return folder;
	}

	/** Modify a file. */
	public async modify(file: TFile, value: string): Promise<void> {
		await this.adapter.write(file.path, value);
		this.emit("modify", file);
	}

	/** Process a file through a synchronous transform. */
	public async process(
		file: TFile,
		transform: (value: string) => string
	): Promise<string> {
		const result = await this.adapter.process(file.path, transform);
		this.emit("modify", file);
		return result;
	}

	/** Move a file or folder. */
	public async rename(file: TAbstractFile, path: string): Promise<void> {
		const oldPath = file.path;
		await this.adapter.rename(oldPath, path);
		this.emit("rename", file, oldPath);
	}

	/** Remove a file or folder. */
	public async trash(file: TAbstractFile): Promise<void> {
		if (file instanceof TFolder) await this.adapter.rmdir(file.path, true);
		else await this.adapter.remove(file.path);
		this.emit("delete", file);
	}

	/** Subscribe to vault changes. */
	public on(
		event: VaultEventName,
		listener: (...args: Array<unknown>) => void
	): EventRef {
		const listeners = this.listeners.get(event) ?? new Set();
		listeners.add(listener);
		this.listeners.set(event, listeners);
		return new EventRef(() => listeners.delete(listener));
	}

	/** Remove a vault event subscription. */
	public offref(ref: EventRef): void {
		ref.unsubscribe();
	}

	private emit(event: VaultEventName, ...args: Array<unknown>): void {
		for (const listener of this.listeners.get(event) ?? [])
			listener(...args);
	}
}

/** Minimal Obsidian application object shared with a plugin instance. */
export class App {
	public readonly workspace: Workspace;
	public readonly vault: Vault;
	public readonly commands = {
		commands: {} as Record<string, Command>,
		listCommands: () => Object.values(this.commands.commands),
	};
	public readonly metadataCache = {
		resolvedLinks: {} as Record<string, Record<string, number>>,
		getCache: (_path: string) => null,
		getFileCache: (_file: TFile) => null,
		getFirstLinkpathDest: (_link: string, _source: string) => null,
	};
	public readonly fileManager = {
		renameFile: (file: TAbstractFile, path: string) =>
			this.vault.rename(file, path),
	};
	public readonly setting = { openTabById: (_id: string) => undefined };

	public constructor(
		options: { workspace?: Workspace; adapter?: BrowserVaultAdapter } = {}
	) {
		this.workspace = options.workspace ?? new Workspace();
		this.vault = new Vault(options.adapter ?? new BrowserVaultAdapter());
	}
}

function createPluginDataStore(app: App): DataStorePort {
	return {
		read: async (id) => {
			const path = `${app.vault.configDir}/plugins/${id}/data.json`;
			if (!(await app.vault.adapter.exists(path))) return undefined;
			return JSON.parse(await app.vault.adapter.read(path)) as unknown;
		},
		write: async (id, value) => {
			const path = `${app.vault.configDir}/plugins/${id}/data.json`;
			await app.vault.adapter.write(path, JSON.stringify(value, null, 2));
		},
	};
}

/** Base view used by plugin workspace leaves. */
export class ItemView extends Component {
	public readonly containerEl: HTMLElement;
	public readonly contentEl: HTMLElement;

	public constructor(leafOrElement: WorkspaceLeaf | HTMLElement) {
		super();
		this.containerEl =
			leafOrElement instanceof WorkspaceLeaf
				? leafOrElement.containerEl
				: leafOrElement;
		this.contentEl = this.containerEl;
	}

	/** Return the registered view type. */
	public getViewType(): string {
		return "item";
	}

	/** Default view open hook. */
	public onOpen(): void | Promise<void> {}

	/** Default view close hook. */
	public onClose(): void | Promise<void> {}
}

/** Base settings tab for plugin settings screens. */
export class PluginSettingTab extends Component {
	public readonly containerEl: HTMLElement;
	public readonly app: App;
	public readonly plugin: Plugin | undefined;

	public constructor(
		options:
			| { containerEl: HTMLElement }
			| App
			| { app?: App; plugin?: Plugin },
		plugin?: Plugin
	) {
		super();
		if ("containerEl" in options) {
			this.containerEl = options.containerEl;
			this.app = new App();
			this.plugin = undefined;
		} else {
			this.containerEl = document.createElement("div");
			this.app =
				options instanceof App ? options : (options.app ?? new App());
			this.plugin =
				plugin ?? (options instanceof App ? undefined : options.plugin);
		}
		this.containerEl.className = "vertical-tab-content";
	}

	/** Render settings content. */
	public display(): void {}

	/** Hide settings content. */
	public hide(): void {}
}

/** Markdown view identity used by plugin guards. */
export class MarkdownView extends ItemView {
	public file: TFile | null = null;
	public editor: unknown = null;

	public getViewType(): string {
		return "markdown";
	}
}

/** Obsidian-shaped modal with a dimmed container and content surface. */
export class Modal {
	public readonly containerEl = createDiv(
		undefined,
		"modal-container mod-dim"
	);
	public readonly modalEl = createDiv(undefined, "modal");
	public readonly titleEl = createDiv(undefined, "modal-title");
	public readonly contentEl = createDiv(undefined, "modal-content");

	public constructor(public readonly app: App) {
		this.modalEl.append(this.titleEl, this.contentEl);
		this.containerEl.append(this.modalEl);
	}

	/** Attach and populate the modal. */
	public open(): void {
		document.body.append(this.containerEl);
		this.onOpen();
	}

	/** Close and detach the modal. */
	public close(): void {
		this.onClose();
		this.containerEl.remove();
	}

	public onOpen(): void {}
	public onClose(): void {}
}

/** A small menu model that plugins can populate. */
export class Menu {
	public readonly items: Array<MenuItem> = [];

	/** Add one menu item. */
	public addItem(callback: (item: MenuItem) => void): this {
		const item = new MenuItem();
		callback(item);
		this.items.push(item);
		return this;
	}
}

/** A menu item model. */
export class MenuItem {
	public title = "";
	public callback: (() => void) | undefined;

	/** Set the visible item title. */
	public setTitle(title: string): this {
		this.title = title;
		return this;
	}

	/** Set the item action. */
	public onClick(callback: () => void): this {
		this.callback = callback;
		return this;
	}

	/** Set an icon name for compatibility. */
	public setIcon(_icon: string): this {
		return this;
	}

	/** Mark a menu item as checked. */
	public setChecked(_checked: boolean): this {
		return this;
	}
}

/** Display a temporary message in the simulator. */
export class Notice {
	private readonly element: HTMLElement;
	public readonly messageEl: HTMLElement;
	public readonly noticeEl: HTMLElement;

	public constructor(message: string, duration = 5000) {
		this.element = document.createElement("div");
		this.element.className = "notice mod-warning";
		this.messageEl = document.createElement("div");
		this.messageEl.className = "notice-message";
		this.messageEl.textContent = message;
		this.noticeEl = this.element;
		this.element.append(this.messageEl);
		document.body.append(this.element);
		if (duration > 0) window.setTimeout(() => this.hide(), duration);
	}

	/** Remove the message from the document. */
	public hide(): void {
		this.element.remove();
	}
}

/** Render a minimal Markdown fallback without external dependencies. */
export const MarkdownRenderer = {
	renderMarkdown(markdown: string, container: HTMLElement): void {
		container.textContent = markdown;
	},
	render(_app: App, markdown: string, container: HTMLElement): Promise<void> {
		container.textContent = markdown;
		return Promise.resolve();
	},
};

/** Browser-safe platform flags. */
export const Platform = {
	isDesktop: true,
	isDesktopApp: true,
	isMobile: false,
	isMobileApp: false,
	isPhone: false,
	isTablet: false,
	isIosApp: false,
	isAndroidApp: false,
	isMacOS: false,
	isWin: false,
	isLinux: true,
	isSafari: false,
};

const iconRegistry = new Map<string, string>();

/** Register an SVG icon body. */
export function addIcon(name: string, svg: string): void {
	iconRegistry.set(name, svg);
}

/** Render a registered icon or its name into an element. */
export function setIcon(element: HTMLElement, name: string): void {
	const svg = iconRegistry.get(name);
	if (svg)
		element.innerHTML = `<svg viewBox="0 0 100 100" aria-hidden="true">${svg}</svg>`;
	else element.textContent = name;
}

/** Fetch a URL with Obsidian's response shape. */
export async function requestUrl(
	options:
		| string
		| {
				url: string;
				method?: string;
				headers?: Record<string, string>;
				body?: string | ArrayBuffer;
				throw?: boolean;
		  }
): Promise<{
	status: number;
	headers: Record<string, string>;
	text: string;
	json: unknown;
	arrayBuffer: ArrayBuffer;
}> {
	const input = typeof options === "string" ? { url: options } : options;
	const response = await fetch(input.url, {
		method: input.method ?? "GET",
		headers: input.headers,
		body: input.body as BodyInit | undefined,
	});
	const arrayBuffer = await response.arrayBuffer();
	const text = new TextDecoder().decode(arrayBuffer);
	let json: unknown;
	try {
		json = JSON.parse(text) as unknown;
	} catch {
		json = null;
	}
	if (!response.ok && input.throw !== false)
		throw new Error(`Request failed with status ${response.status}`);
	return {
		status: response.status,
		headers: Object.fromEntries(response.headers),
		text,
		json,
		arrayBuffer,
	};
}

/** Create an element with optional text and class names. */
export function createEl<K extends keyof HTMLElementTagNameMap>(
	tag: K,
	text?: string,
	cls?: string
): HTMLElementTagNameMap[K] {
	const element = document.createElement(tag);
	if (text !== undefined) element.textContent = text;
	if (cls) element.className = cls;
	return element;
}

/** Create a div with optional text and class names. */
export function createDiv(text?: string, cls?: string): HTMLDivElement {
	return createEl("div", text, cls);
}

/** Add the small element helper set used by common Obsidian plugins. */
export function installDomHelpers(): void {
	if (
		typeof HTMLElement === "undefined" ||
		"createDiv" in HTMLElement.prototype
	)
		return;
	Object.assign(HTMLElement.prototype, {
		createEl<K extends keyof HTMLElementTagNameMap>(
			this: HTMLElement,
			tag: K,
			options?: { text?: string; cls?: string } | string
		) {
			const value =
				typeof options === "string" ? { text: options } : options;
			const element = createEl(tag, value?.text, value?.cls);
			this.append(element);
			return element;
		},
		createDiv(
			this: HTMLElement,
			options?: { text?: string; cls?: string } | string
		) {
			return this.createEl("div", options);
		},
		createSpan(
			this: HTMLElement,
			options?: { text?: string; cls?: string } | string
		) {
			return this.createEl("span", options);
		},
		empty(this: HTMLElement) {
			this.replaceChildren();
		},
		setText(this: HTMLElement, text: string) {
			this.textContent = text;
		},
		addClass(this: HTMLElement, ...classes: Array<string>) {
			this.classList.add(...classes);
		},
		removeClass(this: HTMLElement, ...classes: Array<string>) {
			this.classList.remove(...classes);
		},
		toggleClass(this: HTMLElement, className: string, value: boolean) {
			this.classList.toggle(className, value);
		},
		setAttr(this: HTMLElement, name: string, value: string) {
			this.setAttribute(name, value);
		},
	});
}

installDomHelpers();
