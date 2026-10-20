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
(function (scope) {
    'use strict';
    const data = scope.FrameStudioTranslations, languages = Object.freeze(data.languages);
    const normalize = value => {
        const code = String(value || '').trim().toLowerCase().replaceAll('_', '-').split('-')[0];
        const alias = ({iw:'he', in:'id'})[code] || code;
        return Object.hasOwn(languages, alias) ? alias : null;
    };
    let stored;
    try { stored = localStorage.getItem('frameui-studio-language'); } catch {}
    let language = normalize(new URLSearchParams(location.search).get('lang')) || normalize(stored) || 'en';
    const flags = {en:'gb',es:'es',ru:'ru',de:'de',fr:'fr',pt:'pt',pl:'pl',tr:'tr',zh:'cn',id:'id',it:'it',vi:'vn',nl:'nl',ko:'kr',cs:'cz',th:'th',hu:'hu',ar:'sa',ja:'jp',uk:'ua',sv:'se',da:'dk',ro:'ro',sk:'sk',he:'il',lt:'lt',ms:'my',ta:'sg'};
    function languageName(code) {
        const name = data.languageNames?.[language]?.[code] || languages[code];
        return name.charAt(0).toLocaleUpperCase(language) + name.slice(1);
    }
    const stockNames = new Set(data.stockNames || []);
    function displayName(value) {
        if (stockNames.has(value)) return t(value);
        const copy = value.match(/^(.*) · (?:Copy|Kopya)( \d+)?$/);
        return copy && stockNames.has(copy[1]) ? t(copy[1]) + ' · ' + t('Copy') + (copy[2] || '') : value;
    }
    const secondFormats = new Map();
    function seconds(value) {
        if (!secondFormats.has(language)) secondFormats.set(language,new Intl.NumberFormat(language,{style:'unit',unit:'second',unitDisplay:'narrow',maximumFractionDigits:2}));
        return secondFormats.get(language).format(Number(value));
    }
    const patterns = Object.keys(data.messages.en).filter(key => /\{\d+\}/.test(key)
        && key.replace(/\{\d+\}/g, '').replace(/[^a-zA-Z]/g, '').length >= 4).map(key => {
            const indices = [];
            const expression = key.split(/(\{\d+\})/).map(part => {
                if (/^\{\d+\}$/.test(part)) { indices.push(part); return '([\\s\\S]*?)'; }
                return part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            }).join('');
            return {key, indices, expression:new RegExp('^' + expression + '$')};
        });
    const cache = new Map();
    function t(source, ...values) {
        if (typeof source !== 'string' || language === 'en' && !values.length) return source;
        const messages = data.messages[language];
        if (values.length) return (messages[source] || source).replace(/\{(\d+)\}/g, (token,index) => String(values[index] ?? token));
        if (Object.hasOwn(messages, source)) return messages[source];
        if (cache.has(source)) return cache.get(source);
        if (source.includes('\n')) return source.split('\n').map(line => t(line)).join('\n');
        for (const pattern of patterns) {
            const match = pattern.expression.exec(source);
            if (!match) continue;
            const replacements = Object.fromEntries(pattern.indices.map((key,i) => [key,match[i+1]]));
            const result = (messages[pattern.key] || pattern.key).replace(/\{\d+\}/g, token => replacements[token] ?? token);
            if (cache.size > 512) cache.clear();
            cache.set(source,result); return result;
        }
        return source;
    }
    const originals = [], richTexts = [];
    function captureStatic() {
        for (const node of document.querySelectorAll('[data-i18n]')) {
            richTexts.push({node,source:node.dataset.i18n,slots:new Map([...node.querySelectorAll('[data-i18n-slot]')].map(slot=>[slot.dataset.i18nSlot,slot]))});
        }
        const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
        while (walker.nextNode()) {
            const node = walker.currentNode;
            if (node.parentElement.closest('script,style,svg,code,.brand,#caption-preview,#effect-heading,.language-control,[data-i18n]')) continue;
            const text = node.textContent.trim();
            if (text && Object.hasOwn(data.messages.en,text)) originals.push({node,text,raw:node.textContent});
        }
        for (const node of document.querySelectorAll('[aria-label],[data-tooltip],[placeholder],[alt]')) {
            if (node.closest('.language-control')) continue;
            for (const attr of ['aria-label','data-tooltip','placeholder','alt']) {
                const text = node.getAttribute(attr);
                if (text && Object.hasOwn(data.messages.en,text)) originals.push({node,attr,text});
            }
        }
    }
    function applyStatic() {
        document.documentElement.lang = language;
        document.documentElement.dir = ['ar','he'].includes(language) ? 'rtl' : 'ltr';
        for (const entry of richTexts) {
            const parts = t(entry.source).split(/(\{\d+\})/);
            entry.node.replaceChildren(...parts.map(part => {
                const slot = /^\{\d+\}$/.test(part) && entry.slots.get(part.slice(1,-1));
                if (!slot) return document.createTextNode(part);
                if (slot.dataset.i18nLabel) slot.textContent = t(slot.dataset.i18nLabel);
                return slot;
            }));
        }
        for (const entry of originals) {
            if (entry.attr) entry.node.setAttribute(entry.attr,t(entry.text));
            else entry.node.textContent = entry.raw.replace(entry.text,t(entry.text));
        }
        document.title = t('Home') + ' | FrameUI Studio';
        const select = document.getElementById('language-select');
        if (select) {
            for (const option of select.options) {
                option.textContent = languageName(option.value);
                option.lang = language;
                option.dataset.flag = flags[option.value];
            }
            select.value = language; select.setAttribute('aria-label',t('Language'));
        }
    }
    function setLanguage(value) {
        const next = normalize(value);
        if (!next || next === language) return;
        language = next; cache.clear();
        try { localStorage.setItem('frameui-studio-language',language); } catch {}
        const url = new URL(location.href); url.searchParams.set('lang',language);
        try { history.replaceState(null,'',url); } catch {}
        applyStatic();
        scope.dispatchEvent(new CustomEvent('frameui:language',{detail:{language}}));
        scope.FrameStudioDropdowns?.refresh();
    }
    scope.FrameStudioI18n = {t,normalize,languages,languageName,flags,displayName,seconds,setLanguage,get language() {return language;}};
    if (typeof document !== 'undefined') {
        const select = document.getElementById('language-select');
        if (select) {
            const order = ['en','tr','de','fr','ru','pl',...Object.keys(languages).filter(code=>!['en','tr','de','fr','ru','pl'].includes(code))];
            for (const code of order) {
                const name = languages[code];
                const option = document.createElement('option'); option.value = code; option.textContent = name; option.lang = code; select.append(option);
            }
            select.addEventListener('change',() => setLanguage(select.value));
        }
        captureStatic(); applyStatic();
    }
})(window);
