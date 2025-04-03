// Mock of the Obsidian API for testing purposes
export class App {
  vault = {
    adapter: new FileSystemAdapter()
  };
  
  constructor() {}
}

export class FileSystemAdapter {
  basePath = '/fake/vault/path';
  
  constructor() {}
  
  getBasePath() {
    return this.basePath;
  }
}

export class Plugin {
  app: App;
  manifest: any;
  
  constructor(app: App, manifest: any) {
    this.app = app;
    this.manifest = manifest;
  }
  
  loadData() {
    return Promise.resolve({});
  }
  
  saveData(data: any) {
    return Promise.resolve();
  }
  
  addSettingTab(tab: any) {
    // Mocked functionality
  }
}

export class Notice {
  constructor(message: string) {
    // Mocked functionality
  }
}

export class PluginSettingTab {
  app: App;
  plugin: Plugin;
  
  constructor(app: App, plugin: Plugin) {
    this.app = app;
    this.plugin = plugin;
  }
  
  display() {
    // Mocked functionality
  }
}

export class Setting {
  containerEl: HTMLElement;
  
  constructor(containerEl: HTMLElement) {
    this.containerEl = containerEl;
  }
  
  setName(name: string) {
    return this;
  }
  
  setDesc(desc: string) {
    return this;
  }
  
  addText(callback: (text: any) => any) {
    return this;
  }
  
  addButton(callback: (button: any) => any) {
    return this;
  }
}

// Add more mock classes and functions as needed 
