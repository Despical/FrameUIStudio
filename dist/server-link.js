/* FrameUI Studio — Copyright (C) 2026 Berke Akçen. GPL-3.0-or-later. */
(function () {
    'use strict';
    // The capability stays in memory and the URL fragment, never in cookies, storage or request URLs.
    const token = location.pathname.endsWith('/studio/') ? new URLSearchParams(location.hash.slice(1)).get('server') : null;
    let session = null;
    if (token) for (const brand of document.querySelectorAll('a.brand')) brand.href = location.pathname + location.hash;
    async function request(path, bytes) {
        if (!token || !/^[A-Za-z0-9_-]{43}$/.test(token)) throw new Error('Run /frameui editor to open your personal server connection.');
        let response;
        try {
            response = await fetch(new URL('api/' + path, location.href), {
                method: bytes ? 'POST' : 'GET', credentials: 'omit', cache: 'no-store', redirect: 'error',
                headers: { Authorization: 'Bearer ' + token, ...(bytes ? { 'Content-Type': 'application/zip' } : {}) },
                body: bytes
            });
        } catch { throw new Error('Cannot reach your server. Check that it is running, then try again.'); }
        const result = await response.json();
        if (!response.ok) {
            if (response.status === 401 || response.status === 403) session = null;
            throw new Error(result.error || 'The server could not import this effect.');
        }
        return result;
    }
    window.FrameStudioServer = {
        get available() { return !!token; },
        get session() { return session; },
        async connect() { session = await request('session'); return session; },
        async importEffect(bytes) { return request('import', bytes); }
    };
})();
