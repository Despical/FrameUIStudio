/* Browser-local user effects. Images live in IndexedDB rather than the small localStorage quota. */
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
    window.FrameStudioLibrary = {
        list: () => transaction('readonly', store => store.getAll()),
        put: entry => transaction('readwrite', store => store.put(entry))
    };
})();
