import { promises as fs } from 'fs';
import * as os from 'os';
import * as path from 'path';
import { EventEmitter } from 'events';
import chokidar from 'chokidar';
import { FileWatcherV2 } from '../../src/services/FileWatcherV2';

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
async function until(test: () => boolean): Promise<void> {
    for (let i = 0; i < 100; i++) { if (test()) return; await sleep(30); }
    throw new Error('Timed out waiting for filesystem event');
}

describe('watcher lifecycle and actual filesystem safety', () => {
    let root: string;
    let service: FileWatcherV2;
    beforeEach(async () => {
        root = await fs.mkdtemp(path.join(os.tmpdir(), 'watcher-safety-'));
        service = new FileWatcherV2(10);
    });
    afterEach(async () => {
        await service.dispose().catch(() => undefined);
        jest.restoreAllMocks();
        await fs.rm(root, { recursive: true, force: true });
    });

    test('watches multiple real directories, ignores configured/default files, and closes', async () => {
        const a = path.join(root, 'a'); const b = path.join(root, 'b');
        await fs.mkdir(a); await fs.mkdir(b);
        const events: string[] = [];
        const stopA = service.watch(a, e => { events.push(e.path); }, { ignore: ['**/private/**'] });
        service.watch(b, e => { events.push(e.path); });
        await Promise.all([service.ready(a), service.ready(b)]);
        for (const name of ['.git', '.obsidian', 'node_modules', 'private']) {
            await fs.mkdir(path.join(a, name));
            await fs.writeFile(path.join(a, name, 'hidden.md'), 'hidden');
        }
        await fs.writeFile(path.join(a, 'ignored.tmp'), 'hidden');
        const first = path.join(a, 'first.md'); const second = path.join(b, 'second.md');
        await fs.writeFile(first, 'a'); await fs.writeFile(second, 'b');
        await until(() => events.includes(first) && events.includes(second));
        await sleep(200);
        expect(events.filter(p => p.endsWith('hidden.md') || p.endsWith('.tmp'))).toEqual([]);
        await stopA();
        const count = events.length;
        await fs.writeFile(first, 'changed');
        await sleep(250);
        expect(events).toHaveLength(count);
        expect(service.getWatchedPaths()).toEqual([b]);
        await service.dispose();
        expect(service.getStats()).toEqual({ watchedPaths: 0, activeCallbacks: 0, pendingDebounces: 0 });
    });

    test('serializes async callbacks across paths and drops queued callbacks after stop', async () => {
        const a = path.join(root, 'a'); const b = path.join(root, 'b');
        await fs.mkdir(a); await fs.mkdir(b);
        let release!: () => void;
        const gate = new Promise<void>(resolve => { release = resolve; });
        const started: string[] = [];
        service.watch(a, async e => { started.push(e.path); await gate; });
        const stopB = service.watch(b, e => { started.push(e.path); });
        await Promise.all([service.ready(a), service.ready(b)]);
        const first = path.join(a, 'one.md');
        await fs.writeFile(first, '1'); await until(() => started.length === 1);
        await fs.writeFile(path.join(b, 'two.md'), '2'); await sleep(250);
        expect(started).toEqual([first]);
        await stopB(); release(); await sleep(100);
        expect(started).toEqual([first]);
    });

    test('awaits an async callback before invoking the next subscriber', async () => {
        let release!: () => void;
        const gate = new Promise<void>(resolve => { release = resolve; });
        const order: string[] = [];
        service.watch(root, async () => { order.push('start'); await gate; order.push('end'); });
        service.watch(root, () => { order.push('next'); });
        await service.ready(root);
        await fs.writeFile(path.join(root, 'one.md'), '1');
        await until(() => order.length === 1);
        await sleep(100); expect(order).toEqual(['start']);
        release(); await until(() => order.length === 3);
        expect(order).toEqual(['start', 'end', 'next']);
    });

    test('callback failures do not stop following real events', async () => {
        const errors: unknown[] = []; const seen: string[] = [];
        service.on('callbackError', e => errors.push(e));
        service.watch(root, async e => { seen.push(e.path); throw new Error('callback failed'); });
        await service.ready(root);
        await fs.writeFile(path.join(root, 'one.md'), '1'); await until(() => errors.length === 1);
        await fs.writeFile(path.join(root, 'two.md'), '2'); await until(() => errors.length === 2);
        expect(seen).toHaveLength(2);
    });

    function fakeWatcher(close = jest.fn().mockResolvedValue(undefined)) {
        const fake = Object.assign(new EventEmitter(), { close });
        jest.spyOn(chokidar, 'watch').mockReturnValue(fake as unknown as ReturnType<typeof chokidar.watch>);
        return fake;
    }

    test('stop before ready rejects readiness instead of hanging; stale unwatch cannot stop a replacement', async () => {
        const fake = fakeWatcher();
        const stop = service.watch(root, () => undefined);
        const ready = service.ready(root);
        const rejected = expect(ready).rejects.toThrow('stopped before ready');
        await stop(); await rejected;
        service.watch(root, () => undefined);
        await stop();
        expect(service.isWatching(root)).toBe(true);
        fake.emit('ready'); await service.ready(root);
    });

    test('watcher error catches close rejection and reports both errors', async () => {
        const closeError = new Error('close failed');
        const fake = fakeWatcher(jest.fn().mockRejectedValue(closeError));
        const errors: unknown[] = [];
        service.on('watcherError', e => errors.push(e));
        service.watch(root, () => undefined);
        const ready = service.ready(root);
        const error = new Error('watch failed');
        fake.emit('error', error);
        await expect(ready).rejects.toBe(error);
        await until(() => errors.length === 2);
        expect(errors).toEqual([error, closeError]);
        expect(service.isWatching(root)).toBe(false);
    });

    test('dispose rejects close errors consistently and invalidates immediately', async () => {
        fakeWatcher(jest.fn().mockRejectedValue(new Error('close failed')));
        service.watch(root, () => undefined);
        const first = service.dispose();
        expect(service.getWatchedPaths()).toEqual([]);
        expect(service.dispose()).toBe(first);
        await expect(first).rejects.toThrow('close failed');
    });
});
