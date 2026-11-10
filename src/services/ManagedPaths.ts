import { promises as fs } from 'fs';
import { resolve, relative, isAbsolute, dirname, extname, sep } from 'path';

export const isMarkdown = (file: string): boolean => ['.md', '.markdown'].includes(extname(file).toLowerCase());
export const isInside = (root: string, file: string): boolean => {
    const rel = relative(resolve(root), resolve(file));
    return rel !== '' && rel !== '..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel);
};

export async function assertManagedPath(root: string, file: string, allowMissing = false): Promise<void> {
    if (!isInside(root, file)) throw new Error('File is outside the managed posts directory');
    const realRoot = await fs.realpath(root);
    let candidate = resolve(file);
    while (true) {
        try {
            const stat = await fs.lstat(candidate);
            if (candidate === resolve(file) && stat.isSymbolicLink()) throw new Error('Refusing a symbolic-link file');
            const real = await fs.realpath(candidate);
            if (real !== realRoot && !isInside(realRoot, real)) throw new Error('File resolves outside the managed posts directory');
            return;
        } catch (error) {
            if (!allowMissing || error.code !== 'ENOENT') throw error;
            const parent = dirname(candidate);
            if (parent === candidate) throw error;
            candidate = parent;
        }
    }
}
