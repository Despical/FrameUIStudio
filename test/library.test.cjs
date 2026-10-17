/*
 * FrameUI Studio
 * Copyright (C) 2026 Berke Akçen
 * SPDX-License-Identifier: GPL-3.0-only
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License version 3.
 * This program is distributed WITHOUT ANY WARRANTY; without even the
 * implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.
 * See the LICENSE file or <https://www.gnu.org/licenses/> for details.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

// An isolated transactional storage adapter; never reads the user's browser library.
function libraryFixture(entries, failDelete = '') {
    const records = new Map(entries.map(entry => [entry.id, structuredClone(entry)]));
    const database = { transaction(_, mode) {
        const staged = new Map(records), tx = {};
        let pending = 0, stopped = false;
        function request(action) {
            const result = {}; pending++;
            queueMicrotask(() => {
                if (stopped) return;
                try { result.result = action(); result.onsuccess?.(); }
                catch (error) { stopped = true; tx.error = error; tx.onabort?.(); return; }
                if (--pending === 0) queueMicrotask(() => {
                    if (stopped || pending) return;
                    if (mode === 'readwrite') { records.clear(); for (const [id, entry] of staged) records.set(id, entry); }
                    stopped = true; tx.oncomplete?.();
                });
            });
            return result;
        }
        tx.objectStore = () => ({
            getAll: () => request(() => structuredClone([...staged.values()])),
            put: entry => request(() => { assert.equal(mode, 'readwrite'); staged.set(entry.id, structuredClone(entry)); return entry.id; }),
            delete: id => request(() => { assert.equal(mode, 'readwrite'); if (id === failDelete) throw Error('Storage failed'); staged.delete(id); })
        });
        return tx;
    }};
    const scope = { window: {}, indexedDB: { open() {
        const request = {}; queueMicrotask(() => { request.result = database; request.onsuccess(); }); return request;
    }}};
    vm.runInNewContext(fs.readFileSync(require.resolve('../dist/effect-library.js'), 'utf8'), scope);
    return { library: scope.window.FrameStudioLibrary, records };
}

const fixtures = () => [
    { id: 'active', effect: { name: 'Keep me' }, image: new Uint8Array([1, 2]) },
    { id: 'trash-one', deleted: true, effect: { name: 'One' }, image: new Uint8Array([3, 4]) },
    { id: 'trash-two', deleted: true, effect: { name: 'Two' }, image: new Uint8Array([5, 6]) }
];

test('permanent deletion removes only the selected trashed definition and its image', async () => {
    const { library, records } = libraryFixture(fixtures());
    const removed = await library.purgeDeleted(['trash-one', 'active', 'missing']);
    assert.deepEqual(Array.from(removed), ['trash-one']);
    assert.equal(records.has('trash-one'), false);
    assert.deepEqual(records.get('active').image, new Uint8Array([1, 2]));
    assert.equal((await library.list()).length, 1);
    assert.equal((await library.listDeleted()).length, 1);
});

test('emptying Trash deletes every selected tombstone while preserving active effects', async () => {
    const { library, records } = libraryFixture(fixtures());
    const ids = (await library.listDeleted()).map(entry => entry.id);
    const removed = await library.purgeDeleted(ids);
    assert.equal(removed.length, 2);
    assert.deepEqual([...records.keys()], ['active']);
    assert.equal((await library.listDeleted()).length, 0);
    assert.equal((await library.purgeDeleted([])).length, 0);
});

test('a failed bulk deletion rolls back both definitions and image bytes', async () => {
    const entries = fixtures(), { library, records } = libraryFixture(entries, 'trash-two');
    await assert.rejects(library.purgeDeleted(['trash-one', 'trash-two']), /Storage failed/);
    assert.deepEqual([...records.values()], entries);
});

test('direct deletion removes the active record and image without creating a tombstone', async () => {
    const {library,records}=libraryFixture(fixtures());
    await library.deleteEffect('active');
    assert.equal(records.has('active'),false);
    assert.equal(records.size,2);
    assert.deepEqual(records.get('trash-one').image,new Uint8Array([3,4]));
});
test('failed direct deletion retains the complete active definition and image', async () => {
    const entries=fixtures(),{library,records}=libraryFixture(entries,'active');
    await assert.rejects(library.deleteEffect('active'),/Storage failed/);
    assert.deepEqual([...records.values()],entries);
});
