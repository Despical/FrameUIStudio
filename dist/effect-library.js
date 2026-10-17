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
(function () {
    'use strict';
    let database;
    function open() {
        if (!database) database = new Promise((resolve, reject) => {
            const request = indexedDB.open('frameui-studio-library', 1);
            request.onupgradeneeded = () => request.result.createObjectStore('effects', { keyPath: 'id' });
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
        return database;
    }
    async function transaction(mode, action) {
        const db = await open();
        return new Promise((resolve, reject) => {
            const tx = db.transaction('effects', mode);
            const request = action(tx.objectStore('effects'));
            tx.oncomplete = () => resolve(request.result);
            tx.onabort = tx.onerror = () => reject(tx.error || request.error);
        });
    }
    async function purgeDeleted(ids) {
        const targets = new Set(ids), removed = [];
        await transaction('readwrite', store => {
            const request = store.getAll();
            request.onsuccess = () => {
                for (const entry of request.result) {
                    if (!entry.deleted || !targets.has(entry.id)) continue;
                    store.delete(entry.id); removed.push(entry.id);
                }
            };
            return request;
        });
        return removed;
    }
    window.FrameStudioLibrary = {
        list: async () => (await transaction('readonly', store => store.getAll())).filter(entry => !entry.deleted),
        listDeleted: async () => (await transaction('readonly', store => store.getAll())).filter(entry => entry.deleted),
        put: entry => transaction('readwrite', store => store.put({ ...entry, deleted: false })),
        remove: entry => transaction('readwrite', store => store.put({ ...entry, deleted: true })),
        deleteEffect: id => transaction('readwrite', store => store.delete(id)),
        purgeDeleted
    };
})();
