/* FrameUI Studio — Copyright (C) 2026 Berke Akçen. All rights reserved. Proprietary and confidential. */
(function () {
    'use strict';
    // The capability stays in memory and the URL fragment, never in cookies, storage or request URLs.
    const token = location.pathname.endsWith('/studio/') ? new URLSearchParams(location.hash.slice(1)).get('server') : null;
    let session = null;
    if (token) for (const brand of document.querySelectorAll('a.brand')) brand.href = location.pathname + location.hash;
    async function request(path, bytes, options = {}) {
        if (!token || !/^[A-Za-z0-9_-]{43}$/.test(token)) throw new Error('Run /frameui editor to open your personal server connection.');
        let response;
        try {
            response = await fetch(new URL('api/' + path, location.href), {
                method: options.method || (bytes ? 'POST' : 'GET'), credentials: 'omit', cache: 'no-store', redirect: 'error',
                headers: { Authorization: 'Bearer ' + token, ...(bytes ? { 'Content-Type': 'application/zip' } : {}),
                    ...(options.revision ? { 'If-Match': '"' + options.revision + '"' } : bytes ? { 'If-None-Match': '*' } : {}) },
                body: bytes
            });
        } catch { throw new Error('Cannot reach your server. Check that it is running, then try again.'); }
        if (!response.ok) {
            const result = await response.json();
            if (response.status === 401 || response.status === 403) session = null;
            const error = new Error(result.error || 'The server could not save this effect.'); error.status = response.status; throw error;
        }
        return options.binary ? { bytes: new Uint8Array(await response.arrayBuffer()), revision: response.headers.get('ETag')?.replaceAll('"', '') } : response.json();
    }
    window.FrameStudioServer = {
        get available() { return !!token; },
        get session() { return session; },
        async connect() { session = await request('session'); return session; },
        async listEffects() { return (await request('effects')).effects; },
        async listTrash() { return (await request('trash')).trash; },
        async trashEffect(id, revision) { return request('effects/' + encodeURIComponent(id), null, { method: 'DELETE', revision }); },
        async restoreEffect(id, revision) { return request('trash/' + encodeURIComponent(id) + '/restore', null, { method: 'POST', revision }); },
        async loadEffect(id) { return request('effects/' + encodeURIComponent(id), null, { binary: true }); },
        async importEffect(bytes, revision) { return request('import', bytes, { revision }); }
    };
})();
