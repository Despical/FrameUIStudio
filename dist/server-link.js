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
    // The capability stays in memory and the URL fragment, never in cookies, storage or request URLs.
    const parameters = new URLSearchParams(location.hash.slice(1));
    const token = parameters.get('server');
    const endpointValue = parameters.get('endpoint');
    let endpoint = null, connectionError = null;
    if (token) {
        try {
            endpoint = endpointValue ? new URL(endpointValue) : location.pathname.endsWith('/studio/') ? new URL('./', location.href) : null;
            if (!endpoint || !['http:','https:'].includes(endpoint.protocol) || endpoint.username || endpoint.password
                || endpoint.search || endpoint.hash || !endpoint.pathname.endsWith('/studio/')) throw new Error();
            const loopback = endpoint.hostname === 'localhost' || endpoint.hostname === '127.0.0.1' || endpoint.hostname === '[::1]';
            if (location.protocol === 'https:' && endpoint.protocol !== 'https:' && !loopback) {
                connectionError = 'Your server needs an HTTPS resource-pack public URL to connect from the hosted Studio. Configure a reverse proxy, then run /frameui editor again.';
            }
        } catch { endpoint = null; connectionError = 'Invalid server connection link. Run /frameui editor for a new link.'; }
    }
    let session = null;
    if (token) for (const brand of document.querySelectorAll('a.brand')) brand.href = location.pathname + location.search + location.hash;
    async function request(path, bytes, options = {}) {
        if (!token || !/^[A-Za-z0-9_-]{43}$/.test(token)) throw new Error('Run /frameui editor to open your personal server connection.');
        if (connectionError) throw new Error(connectionError);
        if (!endpoint) throw new Error('Run /frameui editor to open your personal server connection.');
        let response;
        try {
            response = await fetch(new URL('api/' + path, endpoint), {
                method: options.method || (bytes ? 'POST' : 'GET'), credentials: 'omit', cache: 'no-store', redirect: 'error',
                mode: 'cors', referrerPolicy: 'no-referrer',
                ...(endpoint.protocol === 'http:' && ['localhost','127.0.0.1','[::1]'].includes(endpoint.hostname)
                    ? {targetAddressSpace:'loopback'} : {}),
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
        async deleteEffect(id, revision) { return request('effects/' + encodeURIComponent(id), null, { method: 'DELETE', revision }); },
        async loadEffect(id) { return request('effects/' + encodeURIComponent(id), null, { binary: true }); },
        async importEffect(bytes, revision) { return request('import', bytes, { revision }); }
    };
})();
