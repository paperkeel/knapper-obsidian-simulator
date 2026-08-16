// @vitest-environment jsdom
import { describe, expect, it, vi } from "vite-plus/test";
import {
	BrowserVaultAdapter,
	Component,
	EventBus,
	ItemView,
	Menu,
	Notice,
	Plugin,
	PluginSettingTab,
	TFile,
	TFolder,
	UnsupportedCapabilityError,
	Vault,
	Workspace,
	normalizePath,
	setIcon,
} from "./index";

describe("runtime primitives", () => {
	it("normalizes vault paths and rejects unsupported capabilities", () => {
		expect(normalizePath("/notes/../index.md")).toBe("index.md");
		expect(normalizePath("notes\\daily.md")).toBe("notes/daily.md");
		expect(() => normalizePath("../../outside.md")).toThrow();
		expect(new UnsupportedCapabilityError("canvas").capability).toBe(
			"canvas"
		);
	});

	it("dispatches events and cleans all component registrations", () => {
		const bus = new EventBus<{ changed: string }>();
		const component = new Component();
		const listener = vi.fn();
		component.registerEvent(bus.on("changed", listener));
		bus.emit("changed", "first");
		component.unload();
		bus.emit("changed", "second");
		expect(listener).toHaveBeenCalledTimes(1);
	});

	it("loads and saves plugin data through a data port", async () => {
		const data = new Map<string, unknown>();
		const plugin = new Plugin({
			id: "demo",
			dataStore: {
				read: (id) => Promise.resolve(data.get(id)),
				write: (id, value) => {
					data.set(id, value);
					return Promise.resolve();
				},
			},
		});
		expect(await plugin.loadData()).toBeUndefined();
		await plugin.saveData({ enabled: true });
		expect(data.get("demo")).toEqual({ enabled: true });
	});

	it("limits workspace tabs and exposes a right sidebar leaf", () => {
		const workspace = new Workspace();
		const right = workspace.getRightLeaf(false);
		expect(right).toBeTruthy();
		expect(workspace.getLeavesOfType("x")).toHaveLength(0);
		for (let index = 0; index < 3; index += 1) workspace.getLeaf(true);
		expect(workspace.getLeaf(true)).toBeUndefined();
		expect(workspace.getTabLeaves()).toHaveLength(3);
	});

	it("creates view, setting, menu, and notice helpers", () => {
		const view = new ItemView(document.createElement("div"));
		const setting = new PluginSettingTab({ containerEl: document.body });
		const menu = new Menu();
		menu.addItem((item) => item.setTitle("Run"));
		const notice = new Notice("Ready");
		expect(view.getViewType()).toBe("item");
		expect(setting.containerEl).toBe(document.body);
		expect(menu.items[0]?.title).toBe("Run");
		notice.hide();
	});

	it("renders built-in icons as bounded SVG elements", () => {
		const host = document.createElement("span");
		setIcon(host, "chevron-right");
		const svg = host.querySelector("svg");
		expect(host.textContent).toBe("");
		expect(svg?.classList.contains("svg-icon")).toBe(true);
		expect(svg?.getAttribute("width")).toBe("24");
		expect(svg?.getAttribute("height")).toBe("24");
		expect(svg?.getAttribute("viewBox")).toBe("0 0 24 24");
	});
});

describe("file identity", () => {
	it("keeps file and folder identity stable", () => {
		const folder = new TFolder("notes");
		const file = new TFile("notes/today.md", 12, 3, folder);
		expect(file.parent).toBe(folder);
		expect(file.extension).toBe("md");
		expect(file.basename).toBe("today");
	});

	it("exposes cached files through synchronous vault APIs", () => {
		const adapter = new BrowserVaultAdapter([
			{
				id: "folder",
				name: "Notes",
				path: "Notes",
				type: "folder",
				size: 0,
				mtimeMs: 1,
			},
			{
				id: "note",
				name: "Draft.md",
				path: "Notes/Draft.md",
				type: "file",
				size: 12,
				mtimeMs: 2,
			},
		]);
		const vault = new Vault(adapter);
		expect(vault.getFolderByPath("Notes")).toBeInstanceOf(TFolder);
		expect(vault.getFileByPath("Notes/Draft.md")).toBeInstanceOf(TFile);
		expect(vault.getMarkdownFiles().map((file) => file.path)).toEqual([
			"Notes/Draft.md",
		]);
	});
});
