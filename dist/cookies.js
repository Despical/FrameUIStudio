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
    const MEASUREMENT_ID = 'G-ENNPRLYB7P';
    const PUBLIC_URLS = ['https://frameui.despical.dev/', 'https://despical.github.io/FrameUIStudio/', 'https://frameui-studio.berkeakcen.chatgpt.site/'];
    const canonical = PUBLIC_URLS.find(url => location.origin + location.pathname === url || location.origin + location.pathname === url + 'index.html');
    const KEY = 'frameui-studio-cookie-consent';
    const MAX_AGE = 180 * 24 * 60 * 60 * 1000;
    const hosted = !!canonical && !location.hash.includes('server=');
    const banner = document.getElementById('cookie-banner');
    let returnFocus = null;
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
        gtag('config', MEASUREMENT_ID, {page_location:canonical,page_referrer:'',page_title:'FrameUI Studio',
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
        returnFocus?.focus();
        returnFocus = null;
    }

    function open() {
        returnFocus = document.activeElement;
        banner.hidden = false;
        document.getElementById('cookie-reject').focus();
    }

    document.getElementById('cookie-settings').addEventListener('click', open);
    document.getElementById('cookie-accept').addEventListener('click', () => save(true));
    document.getElementById('cookie-reject').addEventListener('click', () => save(false));
    window.addEventListener('storage', event => {
        if (event.key !== KEY) return;
        preference = read();
        banner.hidden = !hosted || !!preference;
        apply();
    });
    banner.hidden = !hosted || !!preference;
    apply();
}());
