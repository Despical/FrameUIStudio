/*
 * FrameUI Studio
 * Copyright (C) 2026 Berke Akçen
 * SPDX-License-Identifier: GPL-3.0-only
 */
(function () {
    'use strict';
    const root = document.documentElement;
    root.classList.add('studio-starting');
    root.setAttribute('aria-busy', 'true');
    let presetImage;
    // Fetch the initial preset alongside scripts instead of waiting for app startup.
    try {
        const draft = JSON.parse(localStorage.getItem('frameui-studio-v1'));
        if (!draft || (draft.effect?.id === 'frameui' && !draft.image)) {
            presetImage = fetch('assets/frameui-logo.png').then(response => {
                if (!response.ok) throw new Error('Preset image could not load.');
                return response.arrayBuffer();
            });
            presetImage.catch(() => {}); // The editor reports a failed request when it consumes it.
        }
    } catch (_) { /* A blocked or invalid draft must not prevent startup. */ }
    let settled = false;
    function ready() {
        if (settled) return;
        settled = true;
        root.classList.remove('studio-starting');
        root.removeAttribute('aria-busy');
    }
    function fail() {
        if (settled) return;
        ready();
        const showError = () => {
            const error = document.getElementById('renderer-error');
            if (!error || !error.hidden) return;
            const message = 'Studio could not load its required files. Reload the page to retry.';
            error.textContent = window.FrameStudioI18n?.t(message) || message;
            error.hidden = false;
        };
        if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', showError, {once:true});
        else showError();
    }
    window.addEventListener('error', event => {
        if (event.target?.tagName === 'SCRIPT' || event.error) fail();
    }, true);
    window.FrameStudioStartup = {ready, fail, presetImage};
})();
