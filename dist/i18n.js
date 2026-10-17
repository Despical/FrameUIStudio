/* FrameUI Studio - Copyright (C) 2026 Berke Akçen. All rights reserved. */
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
    let language = normalize(new URLSearchParams(location.search).get('lang')) || normalize(stored)
        || (navigator.languages || [navigator.language]).map(normalize).find(Boolean) || 'en';
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
    const originals = [];
    function captureStatic() {
        const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
        while (walker.nextNode()) {
            const node = walker.currentNode;
            if (node.parentElement.closest('script,style,svg,code,.brand,#caption-preview,#effect-heading,.language-control')) continue;
            const text = node.textContent.trim();
            if (text && Object.hasOwn(data.messages.en,text)) originals.push({node,text,raw:node.textContent});
        }
        for (const node of document.querySelectorAll('[aria-label],[title],[placeholder],[alt]')) {
            if (node.closest('.language-control')) continue;
            for (const attr of ['aria-label','title','placeholder','alt']) {
                const text = node.getAttribute(attr);
                if (text && Object.hasOwn(data.messages.en,text)) originals.push({node,attr,text});
            }
        }
    }
    function applyStatic() {
        document.documentElement.lang = language;
        document.documentElement.dir = ['ar','he'].includes(language) ? 'rtl' : 'ltr';
        for (const entry of originals) {
            if (entry.attr) entry.node.setAttribute(entry.attr,t(entry.text));
            else entry.node.textContent = entry.raw.replace(entry.text,t(entry.text));
        }
        document.title = t('Home') + ' | FrameUI Studio';
        const select = document.getElementById('language-select');
        if (select) { select.value = language; select.setAttribute('aria-label',t('Language')); }
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
    scope.FrameStudioI18n = {t,normalize,languages,setLanguage,get language() {return language;}};
    if (typeof document !== 'undefined') {
        const select = document.getElementById('language-select');
        if (select) {
            for (const [code,name] of Object.entries(languages)) {
                const option = document.createElement('option'); option.value = code; option.textContent = name; option.lang = code; select.append(option);
            }
            select.addEventListener('change',() => setLanguage(select.value));
        }
        captureStatic(); applyStatic();
    }
})(window);
