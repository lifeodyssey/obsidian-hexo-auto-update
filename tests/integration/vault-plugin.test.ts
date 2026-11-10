import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import HexoPlugin from '../../src/HexoIntegrationPluginV3';
import { FileSystemAdapter, TFile } from 'obsidian';
import { createHexoFrontMatterProcessor, ProcessingResult } from '../../src/services/FrontMatterProcessorV2';
import { DEFAULT_SETTINGS } from '../../src/constants';

type State = {
    activeSettings: typeof DEFAULT_SETTINGS;
    frontMatterProcessor: ReturnType<typeof createHexoFrontMatterProcessor>;
    processVaultFiles(files: string[]): Promise<ProcessingResult[]>;
};
let root: string;
beforeEach(async () => { root = await fs.mkdtemp(path.join(os.tmpdir(), 'vault-native-test-')); });
afterEach(async () => { await fs.rm(root, {recursive:true,force:true}); });
function setup(original: string, race = false) {
    const absolute = path.join(root, 'Blog/_posts/post.md');
    const file = new TFile(); Object.assign(file, {path:'Blog/_posts/post.md'});
    let content = original;
    const process = jest.fn(async (_file: TFile, callback: (value: string) => string) => {
        if (race) content = 'newer editor content';
        content = callback(content); return content;
    });
    const app = {vault:{adapter:new FileSystemAdapter(root), getAbstractFileByPath:jest.fn(()=>file), read:jest.fn(async()=>content), process}};
    const plugin = new HexoPlugin(app as never, undefined as never);
    const state=plugin as unknown as State;
    state.activeSettings={...DEFAULT_SETTINGS, contentMode:'vault',vaultContentPath:path.join(root,'Blog'),contentGitPath:path.join(root,'Blog')};
    state.frontMatterProcessor=createHexoFrontMatterProcessor({requiredFields:[]});
    return {state, absolute, process, app, getContent:()=>content};
}
test('vault mode uses host coordinated write and retains body, no external filesystem overwrite', async()=>{
    const fixture=setup('Hello world');
    const result=await fixture.state.processVaultFiles([fixture.absolute]);
    expect(result[0].success).toBe(true); expect(fixture.process).toHaveBeenCalledTimes(1);
    expect(fixture.getContent()).toContain('title: Post'); expect(fixture.getContent()).toContain('Hello world');
    expect(await fs.readdir(root)).toEqual([]); // host owns write, no fs fallback or backup created
});
test('vault mode aborts rather than overwrite edit arriving during async planning',async()=>{
    const fixture=setup('Original',true);
    await expect(fixture.state.processVaultFiles([fixture.absolute])).rejects.toThrow('changed');
    expect(fixture.getContent()).toBe('newer editor content');
});
test('unindexed vault post fails without filesystem fallback',async()=>{
    const fixture=setup('Original'); fixture.app.vault.getAbstractFileByPath.mockReturnValue(null as never);
    await expect(fixture.state.processVaultFiles([fixture.absolute])).rejects.toThrow('not indexed');
    expect(fixture.process).not.toHaveBeenCalled();
});

test('vault mode refuses undecodable Markdown without coordinated write', async()=>{
    const fixture=setup('bad \uFFFD text');
    await expect(fixture.state.processVaultFiles([fixture.absolute])).rejects.toThrow('undecodable');
    expect(fixture.process).not.toHaveBeenCalled();
});
