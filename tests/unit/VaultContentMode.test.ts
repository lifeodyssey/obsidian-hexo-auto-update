import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';
import { validateVaultContent, preflightVaultContent, prepareReverseContentLink, VaultContentConfig } from '../../src/services/VaultContentMode';

let tmp: string;
let config: VaultContentConfig;
beforeEach(async () => {
    tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'vault-content-'));
    const vaultRoot = path.join(tmp, 'vault');
    const contentRoot = path.join(vaultRoot, 'Blog');
    const hexoRoot = path.join(tmp, 'engine');
    await fs.mkdir(path.join(contentRoot, '_posts'), {recursive:true});
    await fs.mkdir(hexoRoot);
    await fs.writeFile(path.join(contentRoot, '_posts', 'hello.md'), '---\ntitle: hello\n---\nPublic article');
    await fs.writeFile(path.join(vaultRoot, 'private.md'), 'PRIVATE');
    config = {vaultRoot, contentRoot, gitRoot:contentRoot, hexoRoot};
});
afterEach(async()=> {await fs.rm(tmp,{recursive:true,force:true});});

test('dedicated scope excludes private siblings and metadata', async()=>{
    await fs.mkdir(path.join(config.contentRoot,'.git'));
    await fs.writeFile(path.join(config.contentRoot,'.git','config'), 'metadata');
    const found = await preflightVaultContent(config);
    expect(found.files).toEqual([path.join(config.contentRoot,'_posts','hello.md')]);
    expect((await validateVaultContent(config)).postsRoot).toBe(path.join(config.contentRoot,'_posts'));
});
test('rejects whole-vault and other git roots', async()=>{
    await expect(validateVaultContent({...config,contentRoot:config.vaultRoot,gitRoot:config.vaultRoot})).rejects.toThrow('dedicated');
    await expect(validateVaultContent({...config,gitRoot:config.vaultRoot})).rejects.toThrow('Git root');
});
test('rejects empty, missing and outside content', async()=>{
    await fs.unlink(path.join(config.contentRoot,'_posts','hello.md'));
    await expect(preflightVaultContent(config)).rejects.toThrow('no Markdown');
    await expect(validateVaultContent({...config,contentRoot:path.join(tmp,'missing')})).rejects.toThrow();
    await expect(validateVaultContent({...config,contentRoot:config.hexoRoot!,gitRoot:config.hexoRoot!})).rejects.toThrow('inside');
});
test('rejects symlink and hardlink leaks', async()=>{
    const leak=path.join(config.contentRoot,'leak.md');
    await fs.symlink(path.join(config.vaultRoot,'private.md'),leak);
    await expect(preflightVaultContent(config)).rejects.toThrow('symbolic');
    await fs.unlink(leak);await fs.link(path.join(config.vaultRoot,'private.md'),leak);
    await expect(preflightVaultContent(config)).rejects.toThrow('Hard-linked');
});
test.each(['![[private]]','[private](../../private.md)','[private](%2e%2e%2fprivate.md)','[private](file:///private.md)'])('blocks unsupported or private reference %s',async(text)=>{
    await fs.writeFile(path.join(config.contentRoot,'_posts','hello.md'),text);
    await expect(preflightVaultContent(config)).rejects.toThrow();
});
test('creates only reverse link and is idempotent',async()=>{
    const before=await fs.readFile(path.join(config.contentRoot,'_posts','hello.md'));
    const first=await prepareReverseContentLink(config);expect(first.created).toBe(true);
    expect(await fs.realpath(first.linkPath)).toBe(config.contentRoot);
    expect((await prepareReverseContentLink(config)).created).toBe(false);
    expect(await fs.readdir(config.vaultRoot)).toEqual(['Blog','private.md']);
    expect(await fs.readFile(path.join(first.linkPath,'_posts','hello.md'))).toEqual(before);
});
test('never overwrites directory or wrong/broken symlink',async()=>{
    const target=path.join(config.hexoRoot!,'content');
    await fs.mkdir(target);await fs.writeFile(path.join(target,'user.txt'),'KEEP');
    await expect(prepareReverseContentLink(config)).rejects.toThrow('overwrite');
    expect(await fs.readFile(path.join(target,'user.txt'),'utf8')).toBe('KEEP');
    await fs.rm(target,{recursive:true});await fs.symlink(path.join(tmp,'missing'),target);
    await expect(prepareReverseContentLink(config)).rejects.toThrow('broken');
    expect((await fs.lstat(target)).isSymbolicLink()).toBe(true);
});
test('rejects engine inside or containing vault',async()=>{
    const inner=path.join(config.vaultRoot,'engine');await fs.mkdir(inner);
    await expect(prepareReverseContentLink({...config,hexoRoot:inner})).rejects.toThrow('separate');
    await expect(prepareReverseContentLink({...config,hexoRoot:tmp})).rejects.toThrow('separate');
});
