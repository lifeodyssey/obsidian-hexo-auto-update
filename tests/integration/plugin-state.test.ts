import HexoPlugin from '../../src/HexoIntegrationPluginV3';
import { DEFAULT_SETTINGS } from '../../src/constants';
import { Notice } from 'obsidian';

type Internals = {
    enqueue<T>(fn: () => Promise<T>): Promise<T>;
    initializeBlogIntegration(): Promise<void>;
    handleFileChange(event: { type: string; path: string }): Promise<void>;
    commitChanges(files: string[]): Promise<void>;
    handleSyncNow(): Promise<void>;
    performInitialScan(): Promise<void>;
    isInitialized: boolean;
    activeSettings: typeof DEFAULT_SETTINGS;
    fileScanner: unknown;
    git: { commit: jest.Mock } | undefined;
    stats: { lastSync: Date | null };
};
function fixture() {
    const plugin = new HexoPlugin(undefined as never, undefined as never);
    plugin.settings = { ...DEFAULT_SETTINGS };
    return { plugin, state: plugin as unknown as Internals };
}

test('operation queue serializes async work and continues after failure', async () => {
    const { state } = fixture(); const order: string[] = [];
    const a = state.enqueue(async () => { order.push('start'); await new Promise(r => setTimeout(r, 20)); order.push('end'); throw new Error('expected'); });
    const b = state.enqueue(async () => { order.push('next'); });
    await expect(a).rejects.toThrow(); await b; expect(order).toEqual(['start', 'end', 'next']);
});

test('old queued watcher events are ignored after settings generation changes', async () => {
    const { state } = fixture(); state.activeSettings = { ...DEFAULT_SETTINGS };
    const blocker = state.enqueue(async () => { state.activeSettings = { ...DEFAULT_SETTINGS }; });
    await state.handleFileChange({ type: 'change', path: '/should/not/be/read.md' });
    await blocker;
});

test('failed push never advances lastSync', async () => {
    const { state } = fixture(); state.activeSettings = { ...DEFAULT_SETTINGS, autoPush: true };
    state.git = { commit: jest.fn().mockRejectedValue(new Error('push failed')) };
    await expect(state.commitChanges([])).rejects.toThrow('push failed');
    expect(state.stats.lastSync).toBeNull();
    state.git.commit.mockResolvedValue({ committed: false, pushed: true });
    await state.commitChanges([]); expect(state.stats.lastSync).toBeInstanceOf(Date);
});

test('invalid new settings clear old scanner/Git rather than keep syncing old repository', async () => {
    const { plugin, state } = fixture(); state.git = { commit: jest.fn() }; state.fileScanner = {};
    plugin.settings.hexoSourcePath = 'relative';
    await expect(plugin.saveSettings()).rejects.toThrow('absolute');
    expect(state.git).toBeUndefined(); expect(state.fileScanner).toBeUndefined();
});

test('manual sync surfaces scan failure, not success', async () => {
    const { state } = fixture(); state.isInitialized = true;
    const notices = (Notice as unknown as { messages: string[] }).messages;
    notices.length = 0;
    await state.handleSyncNow();
    expect(notices.some(message => message.includes('Manual sync failed'))).toBe(true);
    expect(notices.some(message => message.includes('Manual sync completed'))).toBe(false);
});

test('applying settings initializes without triggering initial sync or publication', async () => {
    const {plugin,state}=fixture(); state.isInitialized=true;
    const initialize=jest.spyOn(state,'initializeBlogIntegration').mockResolvedValue(undefined);
    await plugin.saveSettings();
    expect(initialize).toHaveBeenCalledWith(false);
});

test('changing content mode drains prior work, invalidates old settings and disables auto actions',async()=>{
    const {plugin,state}=fixture();
    const previous={...DEFAULT_SETTINGS, autoPush:true}; state.activeSettings=previous;
    state.git={commit:jest.fn()};state.fileScanner={};
    let complete!:()=>void; const gate=new Promise<void>(resolve=>{complete=resolve;});
    const pending=state.enqueue(()=>gate);
    const changing=plugin.changeContentMode('vault');
    expect(state.activeSettings).toBe(previous);
    complete();await pending;await changing;
    expect(state.activeSettings).not.toBe(previous);
    expect(plugin.settings).toMatchObject({contentMode:'vault',autoSync:false,autoCommit:false,autoPush:false});
    expect(state.git).toBeUndefined();expect(state.fileScanner).toBeUndefined();
});

test('vault mode with automatic sync off loads without initial content edits', async()=>{
    const {plugin,state}=fixture();
    jest.spyOn(plugin,'loadSettings').mockImplementation(async()=>{plugin.settings={...DEFAULT_SETTINGS,contentMode:'vault',vaultContentPath:'/public',autoSync:false,autoCommit:false,autoPush:false};});
    const host=state as unknown as { initializeCoreServices():Promise<void>; setupUI():void };
    jest.spyOn(host,'initializeCoreServices').mockResolvedValue(undefined);
    jest.spyOn(host,'setupUI').mockImplementation(()=>undefined);
    const initialize=jest.spyOn(state,'initializeBlogIntegration').mockResolvedValue(undefined);
    await plugin.onload();
    expect(initialize).toHaveBeenCalledWith(false);
});
