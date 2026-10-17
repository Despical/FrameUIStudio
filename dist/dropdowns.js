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
    const t = window.FrameStudioI18n?.t || (value => value);
    const controls = new WeakMap();
    let opened = null;

    function close() {
        if (!opened) return;
        opened.popup.remove();
        opened.trigger.setAttribute('aria-expanded', 'false');
        opened.trigger.removeAttribute('aria-activedescendant');
        opened.trigger.removeAttribute('aria-controls');
        opened = null;
    }

    function enhance(root = document) {
        for (const select of root.querySelectorAll('select')) {
            if (controls.has(select)) continue;
            const wrapper = document.createElement('div');
            wrapper.className = 'custom-select';
            const languageSelect = select.id === 'language-select';
            if (languageSelect) wrapper.classList.add('language-picker');
            const trigger = document.createElement('button');
            trigger.type = 'button';
            trigger.className = 'select-trigger';
            trigger.setAttribute('role', 'combobox');
            trigger.setAttribute('aria-haspopup', 'listbox');
            trigger.setAttribute('aria-expanded', 'false');
            let label = select.getAttribute('aria-label') || select.closest('.field')?.querySelector('.field-label')?.textContent || 'Choose an option';
            trigger.setAttribute('aria-label', t(label));
            const value = document.createElement('span');
            value.className = 'select-value';
            const chevron = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
            chevron.setAttribute('viewBox', '0 0 20 20');
            chevron.setAttribute('aria-hidden', 'true');
            const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
            path.setAttribute('d', 'm5 8 5 5 5-5');
            chevron.append(path);
            trigger.append(value, chevron);
            if (languageSelect) {
                const globe = document.createElementNS('http://www.w3.org/2000/svg','svg');
                globe.setAttribute('viewBox','0 0 24 24'); globe.setAttribute('aria-hidden','true');
                const lines = document.createElementNS(globe.namespaceURI,'path');
                lines.setAttribute('d','M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0ZM3 12h18M12 3c3 3 3 15 0 18-3-3-3-15 0-18Z');
                globe.append(lines); trigger.prepend(globe); chevron.remove();
            }
            select.before(wrapper);
            wrapper.append(select, trigger);
            select.hidden = true;
            const update = () => {
                label = select.getAttribute('aria-label') || label;
                trigger.setAttribute('aria-label', t(label));
                value.textContent = languageSelect ? select.value.toUpperCase() : (select.selectedOptions[0]?.textContent || t('Choose an option'));
                if (languageSelect) trigger.setAttribute('aria-label', t('Language') + ': ' + select.selectedOptions[0]?.textContent);
                trigger.disabled = select.disabled;
            };
            controls.set(select, update);
            update();
            let active = 0, choices = [], popup, typed = '', lastType = 0;

            function highlight(index, scroll = true) {
                active = Math.max(0, Math.min(choices.length - 1, index));
                choices.forEach((choice, i) => choice.classList.toggle('highlighted', i === active));
                const choice = choices[active];
                if (choice) {
                    trigger.setAttribute('aria-activedescendant', choice.id);
                    if (scroll) choice.scrollIntoView({ block: 'nearest' });
                }
            }

            function choose(index) {
                const option = select.options[index];
                if (!option || option.disabled) return;
                close();
                trigger.focus({ preventScroll: true });
                if (select.value !== option.value) {
                    select.value = option.value;
                    update();
                    select.dispatchEvent(new Event('change', { bubbles: true }));
                }
            }

            function open() {
                close();
                typed = '';
                popup = document.createElement('div');
                popup.className = 'select-menu';
                if (languageSelect) popup.classList.add('language-menu');
                popup.id = select.id + '-options';
                popup.setAttribute('role', 'listbox');
                popup.setAttribute('aria-label', t('{0} options', label));
                choices = [...select.options].map((option, index) => {
                    const choice = document.createElement('div');
                    choice.id = popup.id + '-' + index;
                    choice.className = 'select-option';
                    choice.setAttribute('role', 'option');
                    choice.setAttribute('aria-selected', String(option.selected));
                    choice.setAttribute('aria-disabled', String(option.disabled));
                    const text = document.createElement('span');
                    text.textContent = option.textContent;
                    const check = document.createElement('span');
                    check.className = 'select-check';
                    check.textContent = t('✓');
                    check.setAttribute('aria-hidden', 'true');
                    choice.append(text, check);
                    if (languageSelect) {
                        const flag = document.createElement('img'); flag.className = 'language-flag';
                        flag.src = 'flags/' + option.dataset.flag + '.svg'; flag.alt = ''; flag.setAttribute('aria-hidden','true');
                        choice.prepend(flag); choice.lang = window.FrameStudioI18n.language;
                    }
                    choice.addEventListener('pointermove', () => { if (!option.disabled) highlight(index, false); });
                    choice.addEventListener('pointerdown', event => event.preventDefault());
                    choice.addEventListener('click', () => choose(index));
                    popup.append(choice);
                    return choice;
                });
                const rect = trigger.getBoundingClientRect();
                const below = innerHeight - rect.bottom - 14, above = rect.top - 14;
                const upward = below < Math.min(180, choices.length * 42 + 12) && above > below;
                const height = Math.min(320, Math.max(60, upward ? above : below));
                const width = Math.min(innerWidth - 24, Math.max(rect.width, languageSelect ? 240 : 216));
                popup.style.width = width + 'px';
                popup.style.maxHeight = height + 'px';
                popup.style.left = Math.max(12, Math.min(rect.left, innerWidth - width - 12)) + 'px';
                if (upward) popup.style.bottom = innerHeight - rect.top + 7 + 'px';
                else popup.style.top = rect.bottom + 7 + 'px';
                document.body.append(popup);
                opened = { popup, trigger, wrapper };
                trigger.setAttribute('aria-controls', popup.id);
                trigger.setAttribute('aria-expanded', 'true');
                highlight(Math.max(0, select.selectedIndex));
            }

            trigger.addEventListener('click', () => { if (opened?.trigger === trigger) close(); else open(); });
            trigger.addEventListener('keydown', event => {
                const isOpen = opened?.trigger === trigger;
                const keys = ['ArrowDown', 'ArrowUp', 'Home', 'End', 'Enter', ' ', 'Escape'];
                if (keys.includes(event.key)) {
                    event.preventDefault();
                    if (event.key === 'Escape') { close(); return; }
                    if (event.key === 'Enter' || event.key === ' ') { if (isOpen) choose(active); else open(); return; }
                    if (!isOpen) open();
                    let next = event.key === 'Home' ? 0 : event.key === 'End' ? choices.length - 1 : active + (event.key === 'ArrowDown' ? 1 : -1);
                    const direction = event.key === 'ArrowUp' || event.key === 'End' ? -1 : 1;
                    while (select.options[next]?.disabled) next += direction;
                    highlight(next);
                } else if (event.key === 'Tab') close();
                else if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
                    event.preventDefault();
                    if (!isOpen) open();
                    const now = performance.now();
                    typed = (now - lastType < 700 ? typed : '') + event.key.toLowerCase();
                    lastType = now;
                    const index = [...select.options].findIndex(option => !option.disabled && option.textContent.toLowerCase().startsWith(typed));
                    if (index !== -1) highlight(index);
                }
            });
            trigger.addEventListener('blur', close);
        }
    }

    document.addEventListener('pointerdown', event => {
        if (opened && !opened.wrapper.contains(event.target) && !opened.popup.contains(event.target)) close();
    });
    document.addEventListener('scroll', event => {
        if (opened && !opened.popup.contains(event.target)) close();
    }, true);
    window.addEventListener('resize', close);
    window.FrameStudioDropdowns = {
        enhance, close,
        refresh() { for (const select of document.querySelectorAll('select')) controls.get(select)?.(); }
    };
})();
