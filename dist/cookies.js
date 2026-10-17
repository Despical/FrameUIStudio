/* FrameUI Studio - Copyright (c) 2026 Berke Akçen. All rights reserved. */
(function () {
    'use strict';
    const MEASUREMENT_ID = 'G-ENNPRLYB7P';
    const HOST = 'https://frameui-studio.berkeakcen.chatgpt.site';
    const KEY = 'frameui-studio-cookie-consent';
    const MAX_AGE = 180 * 24 * 60 * 60 * 1000;
    const hosted = location.origin === HOST && !location.hash.includes('server=') && (location.pathname === '/' || location.pathname === '/index.html');
    const banner = document.getElementById('cookie-banner');
    const dialog = document.getElementById('cookie-dialog');
    let loaded = false;
    let preference = read();

    function read() {
        try {
            const value = JSON.parse(localStorage.getItem(KEY));
            if (value?.version === 1 && typeof value.analytics === 'boolean' && Number.isFinite(value.updatedAt)
                && value.updatedAt <= Date.now() && Date.now() - value.updatedAt < MAX_AGE) return value;
        } catch (_) { /* Storage can be unavailable in private browsers. */ }
        return null;
    }

    function gtag() { window.dataLayer.push(arguments); }

    function clearAnalyticsCookies() {
        for (const entry of document.cookie.split(';')) {
            const name = entry.trim().split('=')[0];
            if (!/^_ga(?:_|$)/.test(name)) continue;
            document.cookie = name + '=; Max-Age=0; Path=/; SameSite=Lax; Secure';
            document.cookie = name + '=; Max-Age=0; Path=/; Domain=' + location.hostname + '; SameSite=Lax; Secure';
        }
    }

    function apply() {
        const allowed = hosted && preference?.analytics === true && /^G-[A-Z0-9]+$/.test(MEASUREMENT_ID);
        window['ga-disable-' + MEASUREMENT_ID] = !allowed;
        if (!allowed) {
            if (loaded) gtag('consent', 'update', {analytics_storage:'denied',ad_storage:'denied',ad_user_data:'denied',ad_personalization:'denied'});
            clearAnalyticsCookies();
            return;
        }
        if (loaded) {
            gtag('consent', 'update', {analytics_storage:'granted'});
            return;
        }
        loaded = true;
        window.dataLayer = window.dataLayer || [];
        window.gtag = gtag;
        gtag('consent', 'default', {analytics_storage:'denied',ad_storage:'denied',ad_user_data:'denied',ad_personalization:'denied'});
        gtag('consent', 'update', {analytics_storage:'granted'});
        gtag('js', new Date());
        // Only the public editor's canonical URL is measured, never query strings,
        // personal server capabilities, authored effect names or imported content.
        gtag('config', MEASUREMENT_ID, {page_location:HOST + '/',page_referrer:'',page_title:'FrameUI Studio',
            send_page_view:true,cookie_domain:'none',cookie_flags:'SameSite=Lax;Secure',
            allow_google_signals:false,allow_ad_personalization_signals:false});
        const script = document.createElement('script');
        script.async = true;
        script.src = 'https://www.googletagmanager.com/gtag/js?id=' + MEASUREMENT_ID;
        script.referrerPolicy = 'no-referrer';
        document.head.appendChild(script);
    }

    function save(analytics) {
        preference = {version:1,analytics:!!analytics,updatedAt:Date.now()};
        try { localStorage.setItem(KEY, JSON.stringify(preference)); } catch (_) { /* Apply for this visit even without storage. */ }
        apply();
        banner.hidden = true;
        dialog.close();
    }

    function open() {
        dialog.showModal();
    }

    document.getElementById('cookie-settings').addEventListener('click', open);
    document.getElementById('cookie-customize').addEventListener('click', open);
    document.getElementById('cookie-close').addEventListener('click', () => dialog.close());
    document.getElementById('cookie-accept').addEventListener('click', () => save(true));
    document.getElementById('cookie-reject').addEventListener('click', () => save(false));
    document.getElementById('cookie-dialog-reject').addEventListener('click', () => save(false));
    document.getElementById('cookie-dialog-accept').addEventListener('click', () => save(true));
    window.addEventListener('storage', event => {
        if (event.key !== KEY) return;
        preference = read();
        banner.hidden = !hosted || !!preference;
        apply();
    });
    banner.hidden = !hosted || !!preference;
    apply();
}());
