/** Minimal host doubles; filesystem and Git tests still use real temporary directories. */
export class FileSystemAdapter {
    constructor(private basePath = '') {}
    getBasePath(): string { return this.basePath; }
}

export class App {
    vault = { adapter: new FileSystemAdapter() };
}

export class Notice {
    static messages: string[] = [];
    constructor(public message: string, public timeout?: number) { Notice.messages.push(message); }
    hide = jest.fn();
    setMessage = jest.fn();
}

export class Plugin {
    app: App;
    constructor(app = new App()) { this.app = app; }
    loadData = jest.fn(async () => ({}));
    saveData = jest.fn(async () => undefined);
    addSettingTab = jest.fn();
    addCommand = jest.fn();
    registerEvent = jest.fn();
    registerInterval = jest.fn();
}

export class PluginSettingTab {
    containerEl = { empty: jest.fn(), createEl: jest.fn() };
    constructor(public app: App, public plugin: Plugin) {}
}

export class Setting {
    constructor(public containerEl: unknown) {}
    setName(): this { return this; }
    setDesc(): this { return this; }
    addText(): this { return this; }
    addToggle(): this { return this; }
    addButton(): this { return this; }
    addDropdown(): this { return this; }
}
