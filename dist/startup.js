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
    window.FrameStudioStartup = {ready, fail};
})();
