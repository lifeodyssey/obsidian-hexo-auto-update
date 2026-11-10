import { readFileSync } from 'fs';
import * as path from 'path';

const root = path.resolve(__dirname, '../..');
const readJson = (file: string) => JSON.parse(readFileSync(path.join(root, file), 'utf8'));
const atLeast = (version: string, minimum: number[]) => {
    const parts = version.split('.').map(Number);
    return parts.every(Number.isInteger) && parts.length === 3 &&
        (parts[0] > minimum[0] || (parts[0] === minimum[0] &&
        (parts[1] > minimum[1] || (parts[1] === minimum[1] && parts[2] >= minimum[2]))));
};

describe('Obsidian security version floor (CVE-2021-38148)', () => {
    it('requires a host version newer than the vulnerable releases', () => {
        expect(atLeast(readJson('manifest.json').minAppVersion, [0, 12, 12])).toBe(true);
    });

    it('pins and locks a patched SDK instead of the mutable latest tag', () => {
        const sdk = readJson('package.json').devDependencies.obsidian;
        expect(atLeast(sdk, [0, 12, 12])).toBe(true);
        const lock = readJson('package-lock.json');
        expect(lock.packages[''].devDependencies.obsidian).toBe(sdk);
        expect(lock.packages['node_modules/obsidian'].version).toBe(sdk);
    });
});
