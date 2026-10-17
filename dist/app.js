/* FrameUI Studio - Copyright (C) 2026 Berke Akçen. All rights reserved. Proprietary and confidential. */
(function () {
    'use strict';
    const t = window.FrameStudioI18n?.t || (value => value);
    const core = window.FrameStudioCore;
    const dropdowns = window.FrameStudioDropdowns;
    const server = window.FrameStudioServer;
    let serverBusy = false, linkedEffectId = null, selectedComponent = '';
    const componentLabels = {image:'Image', title:'Title', subtitle:'Subtitle', detail:'Extra line', progress:'Loading indicator'};
    const serverEffects = new Map();
    const isServerEffect = () => effect.id === linkedEffectId && serverEffects.has(effect.id);
    const libraryEntries = () => new Map([...savedEffects, ...serverEffects]);
    const serverButtonLabel = () => serverBusy ? (isServerEffect() ? 'Saving…' : 'Importing…') : server.session ? (isServerEffect() ? 'Save to server' : 'Import to server') : 'Connect server';
    core.configureCatalog(window.FrameStudioCatalog);
    const $ = id => document.getElementById(id);
    const storageKey = 'frameui-studio-v1';
    const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
    let effect = core.createEffect('frameui'), imageBytes = null, imageUrl = '', imageElement = null;
    let undo = [], redo = [], playing = !reducedMotion, playTick = 24, saveTimer, toastTimer;
    const thumbs = new Map(), savedEffects = new Map(), legacyDeletedIds = new Set(), savedThumbnails = new Map();
    let activeCategory = core.categories[1], selectionVersion = 0, libraryBusy = false, pendingDelete = null;
    function element(tag, classes, text, literal = false) { const node = document.createElement(tag); if (classes) node.className = classes; if (text !== undefined) node.textContent = literal ? text : t(text); return node; }
    function icon(id) { const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); const use = document.createElementNS('http://www.w3.org/2000/svg', 'use'); use.setAttribute('href', `#icon-${id}`); svg.append(use); return svg; }
    function toast(message, error = false) { clearTimeout(toastTimer); $('toast').textContent = t(message); $('toast').classList.toggle('error', error); $('toast').hidden = false; toastTimer = setTimeout(() => { $('toast').hidden = true; }, error ? 6500 : 3500); }
    function pathGet(path) { return path.split('.').reduce((value, key) => value[key], effect); }
    function pathSet(path, value) { const parts = path.split('.'); const key = parts.pop(); const owner = parts.reduce((entry, part) => entry[part], effect); owner[key] = value; }
    function snapshot() { return { effect: core.clone(effect), image: imageBytes }; }
    function remember() { undo.push(snapshot()); if (undo.length > 32) undo.shift(); redo.length = 0; }
    function snapshotMatches(a, b) { return a.image === b.image && JSON.stringify(a.effect) === JSON.stringify(b.effect); }
    function usedIds() { return [...core.catalog.map(item => item.id), ...savedEffects.keys(), ...serverEffects.keys()]; }
    function usedNames() { return [...libraryEntries().values()].map(entry => entry.effect.name); }
    function commitChange(previous) {
        if (snapshotMatches(previous, snapshot())) return false;
        if (previous.effect.category !== core.categories[2]) {
            const changed = effect, copy = core.userCopy(changed, usedIds(), usedNames());
            if (changed.name !== previous.effect.name) copy.name = core.uniqueName(changed.name, usedNames());
            if (changed.id !== previous.effect.id && !usedIds().includes(changed.id)) copy.id = changed.id;
            if (imageBytes) copy.appearance.image = `images/${copy.id}.png`;
            effect = copy; activeCategory = core.categories[2];
            savedEffects.set(copy.id, { id: copy.id, effect: core.clone(copy), image: imageBytes });
            renderCatalog();
            toast('Copy created in My Effects. Your original stays unchanged.');
        } else effect.category = core.categories[2];
        undo.push(previous); if (undo.length > 32) undo.shift(); redo.length = 0;
        sync(); scheduleSave();
        return true;
    }
    function mutate(path, value) {
        const restart = /^elements\.(?:image|title|subtitle|detail)-animation$/.test(path) && pathGet(path) !== value;
        const previous = snapshot(); pathSet(path, value);
        if (restart) { previewLoop?.suspend(); playTick = 0; playing = true; }
        if (path === 'presentation.show-hands' && value) effect.presentation['hide-hud'] = false;
        if (path === 'presentation.hide-hud' && value) effect.presentation['show-hands'] = false;
        if (path === 'id' && imageBytes) effect.appearance.image = `images/${effect.id}.png`;
        commitChange(previous);
    }
    function scheduleSave() { clearTimeout(saveTimer); saveTimer = setTimeout(save, 450); }
    function toDataUrl(bytes) { let binary = ''; for (let i = 0; i < bytes.length; i += 8192) binary += String.fromCharCode(...bytes.slice(i, i + 8192)); return 'data:image/png;base64,' + btoa(binary); }
    function fromDataUrl(url) { return Uint8Array.from(atob(url.split(',')[1]), c => c.charCodeAt(0)); }
    async function save() {
        clearTimeout(saveTimer);
        const current = { effect: core.clone(effect), image: imageBytes };
        let librarySaved = false;
        if (current.effect.category === core.categories[2] && !validState()) {
            const entry = { id: current.effect.id, effect: current.effect, image: current.image };
            if (isServerEffect()) {
                const remote = serverEffects.get(entry.id);
                serverEffects.set(entry.id, { ...remote, ...entry, dirty: !snapshotMatches(remote.synced, current) });
            } else {
                savedEffects.set(entry.id, entry);
                try { await window.FrameStudioLibrary.put(entry); librarySaved = true; }
                catch { toast('Could not save this effect in your browser. Export it to keep a copy.', true); }
            }
            renderCatalog();
        }
        try { localStorage.setItem(storageKey, JSON.stringify({ version: core.VERSION, effect: current.effect, image: current.image ? toDataUrl(current.image) : '' })); }
        catch { if (!librarySaved) toast('Export to save this draft. Browser storage is unavailable.', true); }
        return librarySaved;
    }
    async function setImage(bytes, current = () => true) {
        let nextUrl = '', nextImage = null;
        if (bytes) {
            core.validatePng(bytes); nextUrl = URL.createObjectURL(new Blob([bytes], { type: 'image/png' })); const image = new Image(); image.src = nextUrl;
            try { await image.decode(); } catch { URL.revokeObjectURL(nextUrl); throw new Error('The PNG could not be decoded. Choose a valid image.'); }
            nextImage = image;
        }
        if (!current()) { if (nextUrl) URL.revokeObjectURL(nextUrl); return false; }
        if (imageUrl.startsWith('blob:')) URL.revokeObjectURL(imageUrl);
        imageBytes = bytes; imageUrl = nextUrl; imageElement = nextImage;
        if (renderer) renderer.setImage(imageElement);
        return true;
    }
    async function restore(state) { const kind = selectedComponent, next = core.clone(state.effect); await setImage(state.image); effect = next; activeCategory = effect.category; renderSettings(); renderCatalog(); sync(); if (kind) directEditor.select(kind); scheduleSave(); }
    async function historyStep(isRedo) { const source = isRedo ? redo : undo, destination = isRedo ? undo : redo; if (!source.length) return; const target = source.pop(); destination.push(snapshot()); await restore(target); }
    const FIELD_HELP = {
        ...Object.fromEntries(['title','subtitle','detail'].map(kind=>['elements.'+kind+'-animation',['Entrance animation for this caption line only.','None (instant) shows it immediately. Fade, Grow and Slide use the effect’s fade-in and fade-out durations. Other lines keep their own entrance.']])),
        'captions.title-color':['Color of the title in Studio and Minecraft.','Changes only the title, independently of the background palette and other caption lines.'],
        'captions.subtitle-color':['Color of the subtitle in Studio and Minecraft.','Changes only the subtitle, independently of the background palette and other caption lines.'],
        'captions.detail-color':['Color of the extra caption line in Studio and Minecraft.','Applies to its Joining, Teleporting and Preview text. Other caption lines keep their own colors.'],
        'canvas.x':['Horizontal position of the selected component’s left edge, as a percentage of the screen width.','Values outside 0 to 100 place it partly or fully off screen.'],
        'canvas.y':['Vertical position of the selected component’s top edge, as a percentage of the screen height.','Values outside 0 to 100 place it partly or fully off screen.'],
        'canvas.width':['Width as a percentage of the screen width.','Resizes this component while keeping its left edge fixed.'],
        'canvas.height':['Height as a percentage of the screen height.','Resizes this component while keeping its top edge fixed.'],
        'canvas.thickness':['Indicator thickness in pixels on the 640 × 360 design canvas.','Scales with the preview and the Minecraft window size.'],
        name: ['The readable name of this effect.', 'Shown in the Studio library, the in-game effect catalog and {effect} placeholders. It does not change the on-screen title.'],
        id: ['The unique ID used to identify this effect.', 'Used by /frameui preview <id>, event assignments and the YAML filename. Use lowercase words separated by hyphens.'],
        'captions.enabled': ['Show or hide all three caption lines.', 'Controls the title, subtitle and extra line on the effect screen in Minecraft and the Studio preview.'],
        'captions.title': ['The main on-screen heading.', 'Appears over the effect in Minecraft and on the preview. An empty value hides this line.'],
        'captions.subtitle': ['The secondary on-screen text.', 'Appears below the title in Minecraft and on the preview. An empty value hides this line.'],
        'captions.join-detail': ['Extra text for a server join.', 'Appears as the smaller third caption line when this effect plays on join. The Studio preview uses Preview text instead.'],
        'captions.teleport-detail': ['Extra text for travel.', 'Appears as the smaller third line for teleports, world changes and supported addon travel events.'],
        'captions.preview-detail': ['Extra text for manual previews.', 'Appears as the smaller third line in Studio and when you run /frameui preview. It is not the join or teleport message.'],
        'elements.background': ['Choose what sits behind the screen elements.', 'Changes the effect background. None leaves the game visible behind your image, captions and indicator.'],
        'appearance.background': ['The base color in your custom palette.', 'Used directly by composed backgrounds, or by Shader template backgrounds when Custom colors is selected.'],
        'appearance.primary': ['The main color in your custom palette.', 'Colors composed backgrounds, loading indicators and ambient decoration. Caption colors are set in their own menus.'],
        'appearance.secondary': ['The accent color in your custom palette.', 'Adds secondary tones to Shader template backgrounds with Custom colors selected. Caption colors are set in their own menus.'],
        'appearance.intensity': ['Adjust the brightness of the effect.', 'Changes the rendered effect, not how long it plays.'],
        'appearance.speed': ['Speed of continuous movement in the background, loading indicator, decoration and panorama image.', '0.5× plays that movement at half speed; 2× plays it twice as fast. A 1.2-second effect still lasts 1.2 seconds. Fade and entrance timings are unchanged. Play the preview to compare.'],
        'appearance.image-fit': ['Choose how your image fits its available area.', 'Cover fills the area and may crop edges. Contain keeps the entire image visible.'],
        'appearance.image-opacity': ['Adjust the visibility of your image.', 'Lower values reveal the background or game beneath the image. Zero makes the image invisible.'],
        'appearance.image-motion': ['Choose continuous movement for your image.', 'Still keeps it fixed. Panorama slowly moves it. This is separate from its entrance animation.'],
        'elements.image-animation': ['Choose how your image enters the screen.', 'Plays during the entrance phase. Follow template uses the selected animation template.'],
        'elements.image-delay': ['Delay the image entrance, in seconds.', 'Measured from the start of fade in. Limited to 80% of fade in and unavailable when fade in is zero.'],
        'elements.image-scale': ['Resize the image around its center.', 'Changes the image on the preview and in Minecraft. You can also drag its corner handles.'],
        'elements.image-x': ['Horizontal position of the image center.', '0 is the left edge, 0.5 is the center and 1 is the right edge of the screen.'],
        'elements.image-y': ['Vertical position of the image center.', '0 is the top, 0.5 is the center and 1 is the bottom of the screen.'],
        'elements.text-animation': ['Choose how captions enter the screen.', 'Affects all three caption lines together. None (instant) shows them immediately without fading or sliding.'],
        'elements.text-x': ['Horizontal position of the caption group.', 'Moves the title, subtitle and extra line together. 0.5 centers them horizontally.'],
        'elements.text-y': ['Vertical position of the caption group.', 'Moves all caption lines together. You can also drag the Text object on the preview.'],
        'elements.text-scale': ['Resize the entire caption group.', 'Changes all three caption lines together in the preview and Minecraft.'],
        'elements.progress': ['Choose the animated loading indicator.', 'Appears over your effect. It is a visual animation, not a measurement of server loading progress.'],
        'elements.progress-x': ['Horizontal position of the loading indicator.', '0.5 centers it. You can also drag the Loading indicator object on the preview.'],
        'elements.progress-y': ['Vertical position of the loading indicator.', 'Moves it toward the top or bottom of the screen.'],
        'elements.progress-width': ['Width of the loading indicator.', 'Changes how much screen space it occupies.'],
        'elements.progress-scale': ['Thickness or overall size of the indicator.', 'Adjusts bar thickness, dot size or ring size depending on its style.'],
        'elements.decoration': ['Add a decorative animated layer.', 'Appears over the background alongside your image, captions and loading indicator.'],
        enabled: ['Allow this effect to play.', 'When disabled, this effect stays in your library but is excluded from automatic playback and in-game previews. The Studio preview still works. Import or save to your server to apply this setting.'],
        priority: ['Choose which matching effect takes precedence.', 'The highest eligible priority wins when several effects match an event.'],
        weight: ['Control selection between equally prioritized effects.', 'Larger weights are more likely to be chosen. Weight does not override priority.'],
        'filters.cooldown-ticks': ['Minimum time between this effect playing for the same player, in seconds.', 'Applies in game after a screen opens. Zero allows every eligible event; global cooldowns still apply.'],
        'presentation.show-hands': ['Keep the player’s normal hands visible.', 'Applies during the effect in Minecraft. Enabling this also keeps the HUD visible. The Studio view is illustrative.'],
        'presentation.hide-hud': ['Hide gameplay HUD elements during the effect.', 'Masks the hotbar and crosshair using a temporary client view. It does not hide chat or pause menus.'],
        'presentation.block-movement': ['Prevent player movement while this effect is active.', 'Applies in Minecraft for the duration of the screen; it does not affect moving elements in Studio.'],
        'presentation.block-interactions': ['Prevent gameplay interactions while the effect is active.', 'Applies to player actions in Minecraft, not clicks in the Studio editor.'],
        'filters.permission': ['Require this permission to see the effect.', 'Checked for automatic playback and manual previews. Empty adds no permission requirement.'],
        'filters.deny-permissions': ['Block the effect for players with any listed permission.', 'A matching denied permission wins even if the required permission is granted. Separate entries with commas.'],
        'filters.distance.min': ['Minimum travel distance, in blocks.', 'Checked for travel events. Cross-world travel counts as infinite distance.'],
        'filters.distance.max': ['Maximum travel distance, in blocks.', 'Use -1 for no maximum. A finite maximum prevents this effect on cross-world travel.'],
        'filters.height.min': ['Lowest allowed destination Y coordinate.', 'Restricts where the player arrives, independently of the source world.'],
        'filters.height.max': ['Highest allowed destination Y coordinate.', 'Restricts where the player arrives. Both height bounds are inclusive.'],
        'filters.time.min': ['Start of the allowed Minecraft world-time range.', 'Uses the destination world clock: 0 sunrise, 6000 noon, 12000 sunset and 18000 midnight. This is not a duration.'],
        'filters.time.max': ['End of the allowed Minecraft world-time range.', 'An end below the start crosses midnight. The default 0-23999 allows the entire day.'],
        duration: ['Total normal playback duration, in seconds.', 'Changing this scales fade in, hold and fade out together. Additional world-loading wait can extend actual playback.'],
        'timing.entrance': ['Time for the effect to become fully visible.', 'Part of the total duration. Changing it preserves the configured hold and extra loading wait.'],
        'timing.hold': ['Time the effect stays fully visible.', 'Starts after fade in and ends before fade out. It excludes both transitions.'],
        'timing.exit': ['Time for the effect to fade away and reveal the game.', 'The last part of the normal playback duration.'],
        'timing.wait': ['Extra time allowed for the destination world to finish loading.', 'Only used when world readiness is pending. It does not lengthen a normal manual preview.']
    };
    let helpPopup = null, helpOwner = null;
    function closeFieldHelp() {
        if (helpOwner) { helpOwner.setAttribute('aria-expanded', 'false'); helpOwner.removeAttribute('aria-describedby'); }
        if (helpPopup) helpPopup.hidden = true;
        helpOwner = null;
    }
    function showFieldHelp(anchor, text) {
        if (!helpPopup) { helpPopup = element('div', 'field-help-popup'); helpPopup.id = 'field-help-popup'; helpPopup.role = 'tooltip'; document.body.append(helpPopup); }
        helpPopup.textContent = t(text); helpPopup.hidden = false;
        const rect = anchor.getBoundingClientRect(), box = helpPopup.getBoundingClientRect();
        helpPopup.style.left = Math.max(12, Math.min(innerWidth - box.width - 12, rect.right - box.width)) + 'px';
        helpPopup.style.top = Math.max(12, rect.bottom + box.height + 10 <= innerHeight ? rect.bottom + 10 : rect.top - box.height - 10) + 'px';
    }
    function updateAvailability() {
        const disabled = core.disabledSettings(effect, !!imageBytes);
        for (const input of document.querySelectorAll('[data-path]')) {
            const reason = disabled[input.dataset.path] || '';
            input.disabled = !!reason;
            const wrapper = input.closest('.field');
            if (!wrapper) continue;
            wrapper.classList.toggle('is-disabled', !!reason);
            wrapper.dataset.disabledReason = reason;
            if (reason) { wrapper.tabIndex = 0; wrapper.setAttribute('aria-description', t(reason)); }
            else { wrapper.removeAttribute('tabindex'); wrapper.removeAttribute('aria-disabled'); wrapper.removeAttribute('aria-description'); }
        }
        const modes = document.querySelector('.segmented');
        if (modes) {
            const reason = disabled['appearance.palette'] || '';
            modes.classList.toggle('is-disabled', !!reason); modes.dataset.disabledReason = reason;
            modes.tabIndex = reason ? 0 : -1;
            for (const button of modes.querySelectorAll('button')) button.disabled = !!reason;
            if (reason) { modes.setAttribute('aria-disabled', 'true'); modes.setAttribute('aria-description', t(reason)); }
            else { modes.removeAttribute('aria-disabled'); modes.removeAttribute('aria-description'); }
        }
    }
    function wireDisabledHelp() {
        for (const wrapper of document.querySelectorAll('.field, .segmented')) {
            if (wrapper.dataset.disabledHelpReady) continue;
            wrapper.dataset.disabledHelpReady = 'true';
            wrapper.addEventListener('pointerenter', () => { if (wrapper.dataset.disabledReason) { closeFieldHelp(); showFieldHelp(wrapper, wrapper.dataset.disabledReason); } });
            wrapper.addEventListener('pointerleave', () => { if (!helpOwner) closeFieldHelp(); });
            wrapper.addEventListener('focus', () => { if (wrapper.dataset.disabledReason) { closeFieldHelp(); showFieldHelp(wrapper, wrapper.dataset.disabledReason); } });
            wrapper.addEventListener('blur', () => { if (!helpOwner) closeFieldHelp(); });
        }
    }
    function fieldHelp(path) {
        if (FIELD_HELP[path]) return FIELD_HELP[path];
        const match = path.match(/^filters\.(worlds|source-worlds|addon-targets)\.(include|exclude)$/);
        if (match) {
            const target = { worlds: 'destination worlds', 'source-worlds': 'worlds the player leaves', 'addon-targets': 'named homes, warps, portals, towns, nations, lands or islands' }[match[1]];
            return [t(match[2] === 'include' ? 'Allow matching {0}.' : 'Block matching {0}.', t(target)), 'Separate names with commas. * and ? are wildcards. Empty includes allow all; exclusions always win. Applies in Minecraft, not to Studio playback.'];
        }
        return null;
    }
    function helpButton(path, label, explanation = fieldHelp(path)) {
        if (!explanation) return document.createTextNode('');
        const button = element('button', 'field-info');
        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.setAttribute('viewBox', '0 0 16 16'); svg.setAttribute('aria-hidden', 'true');
        const circle = document.createElementNS(svg.namespaceURI, 'circle');
        circle.setAttribute('cx', '8'); circle.setAttribute('cy', '8'); circle.setAttribute('r', '6.25');
        const stem = document.createElementNS(svg.namespaceURI, 'path'); stem.setAttribute('d', 'M8 7.3v3.5');
        const dot = document.createElementNS(svg.namespaceURI, 'circle'); dot.setAttribute('cx', '8'); dot.setAttribute('cy', '4.9'); dot.setAttribute('r', '.7'); dot.setAttribute('class', 'info-dot');
        svg.append(circle, stem, dot); button.append(svg);
        button.type = 'button'; button.dataset.helpFor = path;
        button.setAttribute('aria-label', t('About {0}', t(label))); button.setAttribute('aria-expanded', 'false');
        function open() {
            if (helpOwner !== button) closeFieldHelp();
            helpOwner = button;
            const reason = button.closest('[data-disabled-reason]')?.dataset.disabledReason;
            showFieldHelp(button, reason ? t(reason) : explanation.map(value => t(value)).join(' '));
            button.setAttribute('aria-expanded', 'true'); button.setAttribute('aria-describedby', helpPopup.id);
        }
        button.addEventListener('pointerenter', open);
        button.addEventListener('pointerleave', () => { if (helpOwner === button && !button.matches(':focus-visible')) closeFieldHelp(); });
        button.addEventListener('focus', open);
        button.addEventListener('blur', () => { if (helpOwner === button) closeFieldHelp(); });
        button.addEventListener('click', event => { event.preventDefault(); event.stopPropagation(); open(); });
        return button;
    }
    document.addEventListener('click', event => { if (helpPopup && !helpPopup.hidden && (!helpOwner || !helpOwner.contains(event.target))) closeFieldHelp(); });
    document.addEventListener('keydown', event => { if (event.key === 'Escape' && helpPopup && !helpPopup.hidden) { event.preventDefault(); closeFieldHelp(); } });
    document.addEventListener('scroll', closeFieldHelp, true);
    window.addEventListener('resize', closeFieldHelp);
    function fieldHeading(label, controlId, path, helpLabel = label) {
        label = t(label);
        const heading = element('div', 'field-heading'), caption = element('span', 'field-label');
        const split = label.lastIndexOf(' '), tail = element('span', 'field-label-tail');
        function text(value) {
            const node = element(controlId ? 'label' : 'span', '', value);
            if (controlId) node.htmlFor = controlId;
            return node;
        }
        if (split >= 0) caption.append(text(label.slice(0, split + 1)));
        tail.append(text(label.slice(split + 1)), helpButton(path, helpLabel));
        caption.append(tail); heading.append(caption);
        return heading;
    }
    function field(label, path, options = {}) {
        const controlId = (options.component ? 'component-field-' : 'field-') + path.replaceAll('.', '-');
        const wrap = element('div', 'field'), heading = fieldHeading(label, controlId, path);
        wrap.append(heading);
        let input;
        if (options.options) { input = element('select'); for (const [value, text] of options.options) { const option = element('option', '', text); option.value = value; input.append(option); } }
        else if (options.multiline) { input = element('textarea'); input.rows = 2; }
        else { input = element('input'); input.type = options.type || 'text'; }
        input.dataset.path = path; input.id = controlId; input.value = options.list ? pathGet(path).join(', ') : options.seconds ? pathGet(path) / 20 : options.imageDelay ? Number((pathGet(path) * effect.timing['fade-in-ticks'] / 20).toFixed(3)) : pathGet(path);
        if (options.seconds) input.dataset.unit = 'seconds';
        if (options.imageDelay) input.dataset.unit = 'image-delay-seconds';
        if (options.placeholder) input.placeholder = options.placeholder;
        for (const key of ['min', 'max', 'step', 'maxLength']) if (options[key] !== undefined) input[key] = options[key];
        if (options.type === 'range') { const output = element('output'); output.htmlFor = input.id; output.dataset.output = path; heading.append(output); }
        const update = () => {
            const value = options.list ? input.value.split(/[,\n]/).map(item => item.trim()).filter(Boolean) : ['range', 'number'].includes(options.type) ? Number(input.value) : input.value;
            mutate(path, options.seconds ? Math.round(value * 20) : options.imageDelay ? Math.max(0, Math.min(.8, value * 20 / (effect.timing['fade-in-ticks'] || 1))) : value);
        };
        input.addEventListener(options.options ? 'change' : 'input', update);
        if (!options.options) input.addEventListener('change', () => { update(); sync(); });
        wrap.append(input); return wrap;
    }
    function toggle(label, path, note = '', info = false) {
        const row = element('div', 'switch-field'), copy = element('div', 'switch-copy');
        const heading = element('div', 'switch-heading'), caption = element('label', '', label);
        caption.htmlFor = 'field-' + path.replaceAll('.', '-');
        heading.append(caption); copy.append(info ? fieldHeading(label, caption.htmlFor, path) : heading);
        if (note) copy.append(element('small', '', note));
        const slider = element('span', 'switch'), input = element('input');
        input.type = 'checkbox'; input.id = caption.htmlFor; input.checked = pathGet(path); input.dataset.path = path;
        input.setAttribute('aria-label', t(label)); input.addEventListener('change', () => mutate(path, input.checked));
        slider.append(input, element('span')); row.append(copy, slider);
        row.addEventListener('click', event => { if (!event.target.closest('button,input,label')) input.click(); });
        return row;
    }
    function section(title, tag = '') { const result = element('section', 'settings-section'), heading = element('div', 'section-heading'); heading.append(element('h3', '', title)); if (tag) heading.append(element('span', '', tag)); result.append(heading); return result; }
    function note(text) { return element('p', 'field-note', text); }
    function row(...fields) { const result = element('div', 'field-row'); result.append(...fields); return result; }
    function checkboxList(path, values, names = {}) {
        const grid = element('div', 'check-grid');
        for (const value of values) { const label = element('label'), input = element('input'); input.type = 'checkbox'; input.checked = pathGet(path).includes(value); input.dataset.checkPath = path; input.value = value; input.addEventListener('change', () => { const current = pathGet(path).filter(entry => entry !== value); if (input.checked) current.push(value); mutate(path, current); }); label.append(input, element('span', '', names[value] || value.toLowerCase().replace(/[_-]+/g, ' ').replace(/\b[a-z]/g, letter => letter.toUpperCase()))); grid.append(label); }
        return grid;
    }
    function details(title, ...children) {
        const result = element('details', 'advanced-details'), summary = element('summary');
        const chevron = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        chevron.setAttribute('viewBox', '0 0 16 16'); chevron.setAttribute('aria-hidden', 'true'); chevron.classList.add('details-chevron');
        const path = document.createElementNS(chevron.namespaceURI, 'path'); path.setAttribute('d', 'm4 6 4 4 4-4'); chevron.append(path);
        summary.append(chevron, document.createTextNode(t(title))); result.append(summary, ...children); return result;
    }
    function renderSettings() {
        directEditor?.select('');
        closeFieldHelp();
        dropdowns.close();
        const visual = $('settings-visual'), motion = $('settings-motion'), events = $('settings-events'), game = $('settings-game');
        for (const pane of [visual, motion, events, game]) pane.replaceChildren();
        const identity = section('Your effect');
        identity.append(field('Display name', 'name', { maxLength: 64 }));
        visual.append(identity);
        const captions = section('Captions'); captions.append(toggle('Show captions','captions.enabled'));
        for (const kind of ['title','subtitle','detail']) {
            const key = core.captionLines[kind].key, wrap = element('div','field');
            const input = element('input'); input.id = 'caption-entry-'+kind; input.readOnly = true;
            input.dataset.captionEntry = key; input.dataset.path = 'captions.'+key; input.value = effect.captions[key];
            const open = () => { if (input.disabled) return; directEditor.select(kind); const target=$('component-field-captions-'+key); target?.focus({preventScroll:true}); };
            input.addEventListener('click',open);
            input.addEventListener('keydown',event=>{if(event.key==='Enter'||event.key===' ') {event.preventDefault();open();}});
            wrap.append(fieldHeading(componentLabels[kind],input.id,'captions.'+key),input); captions.append(wrap);
        }
        visual.append(captions);
        const background = section('Background');
        background.append(field('Background layout', 'elements.background', { options: [['none','None'],['template','Shader template'],['solid','Solid color'],['split','Split panels'],['grid','Technical grid'],['terminal','Terminal'],['pulse','Expanding pulse']] }));
        visual.append(background);
        const palette = section('Color palette');
        const segments = element('div', 'segmented');
        for (const [value, label] of [['original', 'Original'], ['custom', 'Custom colors']]) { const button = element('button', effect.appearance.palette === value ? 'active' : '', label); button.dataset.palette = value; button.addEventListener('click', () => mutate('appearance.palette', value)); segments.append(button); }
        const colors = element('div', 'colors-row'); colors.id = 'custom-colors';
        for (const [key, label] of [['background', 'Base'], ['primary', 'Primary'], ['secondary', 'Accent']]) { const wrap = element('div', 'field color-field'), well = element('span', 'color-well'), input = element('input'), text = element('input'); input.type = 'color'; input.value = effect.appearance[key]; input.dataset.path = `appearance.${key}`; input.setAttribute('aria-label', t(label + ' color')); text.type = 'text'; text.value = effect.appearance[key]; text.maxLength = 7; text.dataset.path = `appearance.${key}`; text.setAttribute('aria-label', t(label + ' hex color')); input.addEventListener('input', () => mutate(`appearance.${key}`, input.value)); text.addEventListener('input', () => { if (/^#[0-9a-f]{6}$/i.test(text.value)) mutate(`appearance.${key}`, text.value); }); text.addEventListener('change', () => mutate(`appearance.${key}`, text.value)); well.append(input, text); const heading = fieldHeading(label, '', 'appearance.' + key, label + ' color'); wrap.append(heading, well); colors.append(wrap); }
        palette.append(segments, colors, field('Brightness', 'appearance.intensity', { type: 'range', min: 0, max: 4, step: 0.05 })); visual.append(palette);
        const picture = section('Your image'), upload = element('button', 'image-upload'); upload.id = 'upload-image'; upload.append(icon('image'), element('strong', '', 'Choose an image'), element('span', '', 'Add a logo, artwork or your own photo'), element('small', '', 'PNG / JPEG · up to 8 MB · resized to 2048 px')); upload.addEventListener('click', () => $('image-file').click());
        const info = element('div', 'image-info'); info.id = 'image-info'; const thumbnail = element('img'); thumbnail.id = 'image-thumbnail'; thumbnail.alt = t('Uploaded effect image'); const label = element('span'); label.id = 'image-description'; const remove = element('button', 'icon-button', '×'); remove.setAttribute('aria-label', t('Remove image')); remove.addEventListener('click', async () => { const previous = snapshot(); await setImage(null); effect.appearance.image = ''; commitChange(previous); renderSettings(); sync(); }); info.append(thumbnail, label, remove);
        const editImage = element('button','component-entry','Edit image'); editImage.append(element('span','','›'));
        editImage.id = 'edit-image'; editImage.addEventListener('click',()=>directEditor.select('image'));
        picture.append(info,upload,editImage); visual.append(picture);
        const indicator = section('Loading indicator');
        indicator.append(field('Indicator style', 'elements.progress', { options: [['none','None'],['bar','Moving bar'],['segments','Segmented bar'],['dots','Pulsing dots'],['ring','Rotating ring']] }), note('An animated visual indicator, not a measurement of server loading progress.'));
        visual.append(indicator);
        const decoration = section('Finishing touches');
        decoration.append(field('Ambient decoration', 'elements.decoration', { options: [['none','None'],['embers','Embers'],['petals','Petals'],['scan','Scan line'],['pulse','Pulse emblem']] }));
        visual.append(decoration);
        const metadata = section('File details');
        metadata.append(field('Effect ID / filename', 'id', { maxLength: 48, placeholder: 'my-aurora' }));
        visual.append(metadata);
        const durationSection = section('Duration'), durationField = element('div', 'field');
        durationField.append(fieldHeading('Total duration · seconds', 'duration-seconds', 'duration', 'Total duration'));
        const durationInput = element('input'); durationInput.id = 'duration-seconds'; durationInput.type = 'number'; durationInput.min = .05; durationInput.max = 60; durationInput.step = .05; durationInput.value = duration() / 20;
        durationInput.addEventListener('change', () => { try { const previous = snapshot(); effect.timing = core.durationTiming(effect.timing, Number(durationInput.value)); commitChange(previous); durationInput.value = duration() / 20; } catch (error) { toast(error.message, true); durationInput.value = duration() / 20; } });
        durationField.append(durationInput); durationSection.append(durationField, note('Scales the entrance, hold and exit together. Use the controls below to adjust each phase separately.')); motion.append(durationSection);
        const timing = details('Fine-tune each phase');
        for (const [phase, label, description] of [
            ['entrance', 'Fade in · seconds', 'Time to reveal the effect.'],
            ['hold', 'Hold · seconds', 'Time fully visible before fading out.'],
            ['exit', 'Fade out · seconds', 'Time to reveal the game again.'],
            ['wait', 'Extra loading wait · seconds', 'Additional time allowed if the destination world is still loading.']
        ]) {
            const wrap = element('div', 'field timing-field');
            wrap.append(fieldHeading(label, 'timing-' + phase, 'timing.' + phase));
            const input = element('input');
            input.type = 'number'; input.min = phase === 'exit' ? .05 : 0; input.max = 60; input.step = .05;
            input.id = 'timing-' + phase; input.dataset.timingPhase = phase;
            input.value = core.timingSeconds(effect.timing)[phase];
            input.addEventListener('change', () => {
                try {
                    const previous = snapshot();
                    effect.timing = core.phaseTiming(effect.timing, phase, input.value === '' ? NaN : Number(input.value));
                    commitChange(previous);
                } catch (error) { toast(error.message, true); }
                input.value = core.timingSeconds(effect.timing)[phase];
            });
            wrap.append(input, note(description)); timing.append(wrap);
        }
        durationSection.append(timing);
        const animation = section('Animation');
        animation.append(field('Ambient motion speed', 'appearance.speed', { type: 'range', min: .05, max: 8, step: .05 }), note('0.5× = half-speed motion; 2× = double speed. Duration and entrances stay the same. Play the preview to compare.'));
        motion.append(animation);
        const playback = section('When to play');
        playback.append(checkboxList('play-on', ['join', 'teleport', 'world-change'], { join: 'Join', teleport: 'Teleport', 'world-change': 'World change' }), note('Choose where this effect runs automatically. Your selection applies when imported to your server. Leave all unchecked for manual previews only.')); events.append(playback);
        const integrations = section('Plugin events');
        integrations.querySelector('h3').append(helpButton('plugin-events', 'Plugin events', ['Connect your server to see which addons are installed.']));
        integrations.append(note('Choose an installed plugin and its events. One effect plays per teleport.'));
        for (const addon of core.addons) {
            const group = details(addon.name, checkboxList('play-on', Object.keys(addon.events), addon.events));
            group.dataset.addon = addon.id;
            const state = server.session?.addons?.[addon.id];
            group.querySelector('summary').append(element('span', 'addon-state' + (state === 'active' ? ' active' : ''), state === 'active' ? 'Active' : state === 'disabled' ? 'Disabled' : state === 'unsupported-api' ? 'Unsupported API' : state ? 'Not installed' : 'Optional'));
            integrations.append(group);
        }
        events.append(integrations);
        const selection = section('Availability & selection'); selection.append(toggle('Enable effect', 'enabled', '', true), row(field('Priority', 'priority', { type: 'number', min: -10000, max: 10000 }), field('Random weight', 'weight', { type: 'number', min: 1, max: 10000 })), field('Cooldown · seconds', 'filters.cooldown-ticks', { type: 'number', min: 0, max: 86400, step: .05, seconds: true }), note('Higher priorities win. Weight controls random selection between equally prioritized matches. A zero cooldown permits every eligible event.')); events.append(selection);
        const presentation = section('Player view'); presentation.append(toggle('Show hands', 'presentation.show-hands', '', true), toggle('Hide HUD', 'presentation.hide-hud', '', true), toggle('Block movement', 'presentation.block-movement', '', true), toggle('Block interactions', 'presentation.block-interactions', '', true)); game.append(presentation);
        const worlds = section('Where it can play'); worlds.append(field('Include worlds', 'filters.worlds.include', { list: true, placeholder: 'world, survival-*' }), field('Exclude worlds', 'filters.worlds.exclude', { list: true, placeholder: 'world_nether, lobby' }), note('Comma-separated world names. * and ? are supported; exclusions win. Empty include allows every world.'), details('Source world filters', field('Include source worlds', 'filters.source-worlds.include', { list: true, placeholder: 'lobby, hub-*' }), field('Exclude source worlds', 'filters.source-worlds.exclude', { list: true, placeholder: 'minigame-*' }), note('Source is the world the player leaves. On join it is the same as the destination.'))); game.append(worlds);
        const access = section('Who can see it'); access.append(field('Required permission', 'filters.permission', { maxLength: 128, placeholder: 'frameui.effect.vip' }), field('Denied permissions', 'filters.deny-permissions', { list: true, placeholder: 'frameui.effect.disable' }), details('Game mode filters', element('span', 'chip-note', 'INCLUDE · EMPTY ALLOWS ALL'), checkboxList('filters.game-modes.include', core.modes), element('span', 'chip-note', 'EXCLUDE'), checkboxList('filters.game-modes.exclude', core.modes))); game.append(access);
        const environment = section('Advanced conditions'); environment.append(details('Distance & height', row(field('Min distance · blocks', 'filters.distance.min', { type: 'number', min: 0, max: 100000000, step: 'any' }), field('Max distance · blocks', 'filters.distance.max', { type: 'number', min: -1, max: 100000000, step: 'any' })), note('Use -1 for unlimited maximum distance. Cross-world teleports satisfy the minimum distance.'), row(field('Min Y', 'filters.height.min', { type: 'number', min: -30000000, max: 30000000, step: 'any' }), field('Max Y', 'filters.height.max', { type: 'number', min: -30000000, max: 30000000, step: 'any' })), note('Height applies to the destination. The defaults allow all heights.')), details('Time & weather', row(field('Start time · ticks', 'filters.time.min', { type: 'number', min: 0, max: 23999 }), field('End time · ticks', 'filters.time.max', { type: 'number', min: 0, max: 23999 })), note('Minecraft time: 0 sunrise, 6000 noon, 12000 sunset, 18000 midnight. A range crossing midnight is supported.'), checkboxList('filters.weather', ['clear', 'rain', 'thunder']), note('Empty allows any weather.'))); environment.append(details('Teleport causes', checkboxList('filters.teleport-causes', core.causes), note('Empty allows every cause. Distance and cause filters apply to teleports and world changes.'))); game.append(environment);
        const targets = section('Plugin destinations');
        targets.append(details('Home, warp, portal & island names', field('Include addon destinations', 'filters.addon-targets.include', { list: true, placeholder: 'spawn, town-*, survival_portal' }), field('Exclude addon destinations', 'filters.addon-targets.exclude', { list: true, placeholder: 'staff-*' }), note('Restrict the plugin events selected in Events. Match home, warp, portal, town, nation, land or island names. Multiverse-Core uses destination worlds. Empty includes allow all; * and ? are wildcards.')));
        game.append(targets);
        wireDisabledHelp();
        dropdowns.enhance();
    }
    function showComponent(kind) {
        selectedComponent = kind; closeFieldHelp(); dropdowns.close();
        $('inspector-title').textContent = t(componentLabels[kind] || 'Effect settings');
        $('component-back').hidden = !kind; document.querySelector('.inspector-heading').classList.toggle('component-heading',!!kind); document.querySelector('.inspector-tabs').hidden = !!kind;
        $('settings-component').hidden = !kind;
        $('reset-button').textContent = t('Reset');
        for (const pane of document.querySelectorAll('.settings-pane:not(#settings-component)')) pane.hidden = !!kind || pane.id !== 'settings-'+activeTab;
        document.querySelector('.inspector-scroll').scrollTop = 0;
        if (kind) renderComponent(kind);
    }
    function geometryValues(rect) {
        if (!rect) return;
        for (const input of document.querySelectorAll('[data-geometry]')) {
            if (document.activeElement === input) continue;
            input.value = Number((rect[input.dataset.geometry]*100).toFixed(2));
        }
    }
    function captionColor(kind) {
        const path = 'captions.'+kind+'-color', wrap = element('div','field color-field caption-color'), well = element('span','color-well');
        const picker = element('input'), hex = element('input');
        picker.type = 'color'; picker.dataset.path = path; picker.value = pathGet(path); picker.setAttribute('aria-label',t('Text color'));
        hex.type = 'text'; hex.dataset.path = path; hex.value = pathGet(path); hex.maxLength = 7; hex.setAttribute('aria-label',t('Text hex color'));
        picker.addEventListener('input',()=>mutate(path,picker.value));
        hex.addEventListener('input',()=>{if(/^#[0-9a-f]{6}$/i.test(hex.value)) mutate(path,hex.value);});
        hex.addEventListener('change',()=>{hex.value=pathGet(path);sync();});
        well.append(picker,hex); wrap.append(fieldHeading('Color','',path,'Text color'),well); return wrap;
    }
    function renderComponent(kind) {
        const pane = $('settings-component'); pane.replaceChildren();
        const layout = section('Position & size'), fields = {};
        for (const [key,label] of [['x','X · %'],['y','Y · %'],['width','Width · %'],['height','Height · %']]) {
            if (kind==='progress' && key==='height') continue;
            const wrap = element('div','field'), input = element('input');
            input.id = 'geometry-'+key; const caption = fieldHeading(label,input.id,'canvas.'+key); input.type = 'number'; input.step = 'any';
            input.min = key==='width'||key==='height' ? .01 : -1000; input.max = 1000; input.dataset.geometry = key;
            let previous = null;
            input.addEventListener('focus',()=>{previous=snapshot();});
            input.addEventListener('input',()=>{
                const value = Number(input.value);
                if (Number.isFinite(value) && input.value && input.checkValidity()) directEditor.setGeometry(kind,key,value/100,false);
            });
            input.addEventListener('blur',()=>{if(previous) commitChange(previous); previous=null; geometryValues(directEditor.bounds(kind));});
            input.addEventListener('keydown',event=>{if(event.key==='Enter') input.blur();});
            wrap.append(caption,input); fields[key] = wrap;
        }
        layout.append(row(fields.x,fields.y),kind==='progress'?fields.width:row(fields.width,fields.height));
        if (kind==='progress') {
            const wrap = element('div','field'), input = element('input');
            input.id = 'component-thickness'; const label = fieldHeading('Thickness · px',input.id,'canvas.thickness'); input.type = 'number'; input.min=.1; input.max=144; input.step='any';
            let previous = null;
            input.addEventListener('focus',()=>{previous=snapshot();});
            input.addEventListener('input',()=>{const unit=effect.elements.progress==='ring'?4.4:effect.elements.progress==='dots'?7.2:6; if(input.checkValidity() && input.value) {effect.elements['progress-scale']=Math.max(.05,Math.min(20,Number(input.value)/unit)); sync();}});
            input.addEventListener('blur',()=>{if(previous) commitChange(previous); previous=null; sync();});
            input.addEventListener('keydown',event=>{if(event.key==='Enter') input.blur();});
            wrap.append(label,input); layout.append(wrap);
        }
        pane.append(layout);
        if (core.captionLines[kind]) {
            const content = element('section','settings-section caption-content');
            if (kind==='detail') {
                for (const [key,label] of [['join-detail','Joining'],['teleport-detail','Teleporting'],['preview-detail','Preview']]) content.append(field(label,'captions.'+key,{maxLength:128,component:true}));
            } else content.append(field(componentLabels[kind],'captions.'+kind,{maxLength:kind==='title'?64:96,component:true}));
            content.append(captionColor(kind),field('Entrance','elements.'+kind+'-animation',{component:true,options:[['none','None (instant)'],['still','Fade'],['grow','Grow'],['slide-up','Slide from bottom'],['slide-down','Slide from top'],['slide-left','Slide from left'],['slide-right','Slide from right']]}));
            pane.append(content);
        } else if (kind==='image') {
            const appearance = section('Appearance');
            appearance.append(field('Image fit','appearance.image-fit',{component:true,options:[['cover','Cover - fill screen'],['contain','Contain - show entire image']]}),field('Image opacity','appearance.image-opacity',{component:true,type:'range',min:0,max:1,step:.01}));
            const replace = element('button','button button-quiet full-width','Replace image'); replace.addEventListener('click',()=>$('image-file').click()); appearance.append(replace); pane.append(appearance);
            const motion = section('Motion');
            motion.append(field('Image entrance','elements.image-animation',{component:true,options:[['none','None (instant)'],['inherit','Follow template'],['fade','Fade'],['grow','Grow from center'],['slide-up','Slide from bottom'],['slide-down','Slide from top'],['slide-left','Slide from left'],['slide-right','Slide from right'],['wipe','Left-to-right reveal'],['page','Diagonal page']]}),field('Image entrance delay · seconds','elements.image-delay',{component:true,type:'number',min:0,max:.8*effect.timing['fade-in-ticks']/20,step:.01,imageDelay:true}),field('Ambient image motion','appearance.image-motion',{component:true,options:[['still','Still'],['panorama','Slow zoom and pan'],['page','Legacy page reveal']]})); pane.append(motion);
        } else {
            const appearance = section('Appearance'); appearance.append(field('Indicator style','elements.progress',{component:true,options:[['none','None'],['bar','Moving bar'],['segments','Segmented bar'],['dots','Pulsing dots'],['ring','Rotating ring']]})); pane.append(appearance);
        }
        wireDisabledHelp(); dropdowns.enhance(); sync();
    }
    function syncComponentGeometry(kind,rect) {
        if (!kind || kind!==selectedComponent) return;
        geometryValues(rect);
        const reason = kind==='progress' ? 'Choose an indicator style to adjust its layout.' : kind==='image' ? 'Add an image to adjust its layout.' : effect.captions.enabled ? 'Enter text for this line to adjust its layout.' : 'Enable Show captions in Effect settings to adjust this line.';
        const thickness = $('component-thickness');
        for (const input of document.querySelectorAll('[data-geometry],#component-thickness')) {
            input.disabled = !rect;
            const field = input.closest('.field'); field.classList.toggle('is-disabled',!rect);
            field.dataset.disabledReason = rect ? '' : reason;
        }
        if (thickness && document.activeElement!==thickness) thickness.value = Number((effect.elements['progress-scale']*(effect.elements.progress==='ring'?4.4:effect.elements.progress==='dots'?7.2:6)).toFixed(2));
    }
    function replayPreview() {previewLoop.suspend();playTick=0;playing=true;sync();}
    function resetComponent() {
        const previous = snapshot();
        effect = core.resetComponent(effect,selectedComponent);
        commitChange(previous); replayPreview();
    }
    function renderCategories() {
        const select = $('category-filter');
        for (const category of core.categories) {
            const count = category === core.categories[2] ? libraryEntries().size : core.catalog.filter(item => item.category === category).length;
            const option = [...select.options].find(option => option.value === category);
            option.textContent = t(`${t(category)} (${count})`);
        }
        select.value = activeCategory;
        dropdowns.refresh();
        document.querySelector('.panel-heading h1').textContent = t(`Effect library (${core.catalog.length + libraryEntries().size})`);
    }
    async function openLibraryItem(item, saved) {
        const version = ++selectionVersion;
        const current = () => version === selectionVersion;
        try {
            await save(); if (!current()) return;
            let stored = saved?.remote ? serverEffects.get(item.id) : saved ? savedEffects.get(item.id) || saved : null;
            if (stored?.remote && (!stored.loaded || !stored.dirty || stored.conflicted)) {
                const response = await server.loadEffect(item.id);
                const entries = await core.unzip(response.bytes);
                const nextEffect = core.fromYaml(core.decoder.decode(entries[`effects/${item.id}.yml`]));
                const picture = nextEffect.appearance.image ? entries[nextEffect.appearance.image] : null;
                if (nextEffect.appearance.image && !picture) throw new Error('The server effect is missing its image.');
                if (picture) core.validatePng(picture);
                if (!current()) return;
                stored = { id: item.id, effect: nextEffect, image: picture, remote: true, revision: response.revision,
                    loaded: true, dirty: false, synced: { effect: core.clone(nextEffect), image: picture } };
                serverEffects.set(item.id, stored);
            }
            const next = stored ? core.clone(stored.effect) : core.createEffect(item.id);
            const bytes = stored ? stored.image : item.image ? new Uint8Array(await (await fetch(item.image)).arrayBuffer()) : null;
            if (!current()) return;
            const before = snapshot();
            if (!await setImage(bytes, current)) return;
            undo.push(before); if (undo.length > 32) undo.shift(); redo.length = 0;
            effect = next; linkedEffectId = stored?.remote ? item.id : null;
            if (stored?.remote) serverStatus(`Editing ${next.name} · Save to server to apply changes`);
            playTick = Math.max(effect.timing['fade-in-ticks'], 1);
            renderSettings(); renderCatalog(); sync();
            document.querySelector('.inspector-scroll').scrollTop = 0;
            scheduleSave();
        } catch (error) { if (current()) toast(error.message, true); }
    }
    function catalogDuration(item) {
        const timing = item.definition?.timing;
        return timing ? timing['minimum-ticks'] + timing['fade-out-ticks'] : item.minimum + item.fadeOut;
    }
    function renderCatalog() {
        renderCategories();
        const query = $('search').value.trim().toLowerCase(), list = $('template-list'); list.replaceChildren();
        const own = activeCategory === core.categories[2];
        const items = (own ? [...libraryEntries().values()].map(entry => ({ id: entry.id, name: entry.effect.name, category: core.categories[2], definition: entry.effect }))
            : core.catalog.filter(item => item.category === activeCategory))
            .sort((a, b) => catalogDuration(a) - catalogDuration(b) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
        for (const item of items) {
            if (query && !`${item.name} ${item.id}`.toLowerCase().includes(query)) continue;
            const button = element('button', 'template-card'); button.dataset.template = item.id; button.dataset.libraryGroup = activeCategory;
            button.setAttribute('aria-pressed', String(effect.id === item.id && effect.category === activeCategory));
            button.classList.toggle('active', effect.id === item.id && effect.category === activeCategory);
            const thumb = element('img', 'template-thumb'); thumb.alt = t('');
            const saved = own ? libraryEntries().get(item.id) : null;
            if (saved?.image) {
                let preview = savedThumbnails.get(item.id);
                if (!preview || preview.image !== saved.image) {
                    if (preview) URL.revokeObjectURL(preview.url);
                    preview = { image: saved.image, url: URL.createObjectURL(new Blob([saved.image], { type: 'image/png' })) }; savedThumbnails.set(item.id, preview);
                }
                thumb.src = preview.url;
            } else if (thumbs.has(saved?.effect.template || item.id)) thumb.src = thumbs.get(saved?.effect.template || item.id);
            const seconds = catalogDuration(item) / 20;
            const copy = element('span', 'template-copy'); copy.append(element('b', '', item.name, true), element('small', '', `${seconds.toFixed(1)} s`));
            if (saved?.remote) copy.append(element('span', 'server-effect-badge', saved.dirty ? 'Unsaved changes' : 'Server'));
            button.title = item.name;
            button.append(thumb, copy); button.addEventListener('click', () => openLibraryItem(item, saved));
            if (own) {
                const entry = element('div', 'template-row'), remove = element('button', 'icon-button effect-delete');
                remove.append(icon('trash')); remove.title = t('Delete effect'); remove.setAttribute('aria-label', t(`Delete ${item.name}`));
                remove.addEventListener('click', () => requestDelete(item.id)); entry.append(button, remove); list.append(entry);
            } else list.append(button);
        }
        if (previewReady) generateThumbnails();
        if (!list.children.length) list.append(element('p', 'empty-state', own && !query ? 'Edit an animation or preset to create your first effect automatically. You can also import your own effect ZIP.' : 'No matching effects in this category.'));
    }
    function requestDelete(id) {
        if (libraryBusy || serverBusy) return;
        const entry=libraryEntries().get(id); if (!entry) return;
        pendingDelete={id,name:entry.effect.name,remote:!!entry.remote,revision:entry.revision};
        $('purge-description').textContent=t(`Permanently delete “${pendingDelete.name}”? This action cannot be undone.`);
        $('purge-dialog').showModal();
    }
    async function confirmDelete() {
        if (libraryBusy || serverBusy || !pendingDelete) return;
        const target=pendingDelete; libraryBusy=true;
        $('confirm-purge').disabled=true; $('cancel-purge').disabled=true;
        try {
            await save();
            if (target.remote) {
                await server.deleteEffect(target.id,target.revision); serverEffects.delete(target.id);
                if (savedEffects.has(target.id)) {
                    try {await window.FrameStudioLibrary.deleteEffect(target.id);} catch {toast('Deleted from your server. A separate local copy could not be removed.',true);}
                }
            } else await window.FrameStudioLibrary.deleteEffect(target.id);
            savedEffects.delete(target.id);
            const thumbnail=savedThumbnails.get(target.id); if(thumbnail) URL.revokeObjectURL(thumbnail.url); savedThumbnails.delete(target.id);
            const keep=state=>state.effect.category!==core.categories[2] || state.effect.id!==target.id;
            undo=undo.filter(keep);redo=redo.filter(keep);
            if (effect.id===target.id && effect.category===core.categories[2]) {
                ++selectionVersion; const next=core.createEffect(effect.template);
                await setImage(null); effect=next; linkedEffectId=null;renderSettings();
            }
            pendingDelete=null; $('purge-dialog').close(); renderCatalog();sync();await save();
            toast('Effect permanently deleted.');
        } catch(error) {toast(error.message || 'Could not delete this effect. Try again.',true);}
        finally {libraryBusy=false;$('confirm-purge').disabled=false;$('cancel-purge').disabled=false;sync();}
    }
    function validState() {try {core.validate(effect);return '';} catch(error) {return error.message;}}
    function sync() {
        const error = validState(); $('validation-status').textContent = t(error || (effect.appearance.image && !imageBytes ? 'Image file needs to be supplied' : isServerEffect() ? (serverBusy ? 'Saving to server…' : snapshotMatches(serverEffects.get(effect.id).synced, snapshot()) ? 'Saved on server' : 'Changes not saved to server') : 'Ready to export')); document.querySelector('.inspector-footer').classList.toggle('invalid', !!error || !!(effect.appearance.image && !imageBytes));
        $('server-import-button').disabled = serverBusy || libraryBusy || (!!server.session && !!error);
        $('server-import-button').querySelector('span').textContent = t(serverButtonLabel());
        $('export-button').disabled = !!error; $('yaml-download').disabled = !!error; $('guide-export').disabled = !!error;
        $('effect-heading').textContent = effect.name || t('Untitled effect');
        for (const input of document.querySelectorAll('[data-caption-entry]')) input.value = effect.captions[input.dataset.captionEntry];
        $('summary-in').textContent = t(`${Number((effect.timing['fade-in-ticks'] / 20).toFixed(2))} s`); $('summary-hold').textContent = t(`${Number(((effect.timing['minimum-ticks'] - effect.timing['fade-in-ticks']) / 20).toFixed(2))} s`); $('summary-out').textContent = t(`${Number((effect.timing['fade-out-ticks'] / 20).toFixed(2))} s`); $('summary-triggers').textContent = t(effect['play-on'].length ? `${effect['play-on'].length} ${t(effect['play-on'].length === 1 ? 'event' : 'events')}` : 'Manual only');
        $('duration-label').textContent = t(`${Number((duration() / 20).toFixed(2))} s`); $('undo-button').disabled = !undo.length; $('redo-button').disabled = !redo.length;
        if ($('duration-seconds') && document.activeElement !== $('duration-seconds')) $('duration-seconds').value = duration() / 20;
        for (const input of document.querySelectorAll('[data-path]')) { if (document.activeElement === input) continue; const value = pathGet(input.dataset.path); if (input.type === 'checkbox') input.checked = value; else input.value = Array.isArray(value) ? value.join(', ') : input.dataset.unit === 'seconds' ? value / 20 : input.dataset.unit === 'image-delay-seconds' ? Number((value * effect.timing['fade-in-ticks'] / 20).toFixed(3)) : value; }
        for (const input of document.querySelectorAll('[data-unit="image-delay-seconds"]')) {
            input.max = .8 * effect.timing['fade-in-ticks'] / 20;
            input.disabled = effect.timing['fade-in-ticks'] === 0;
        }
        for (const input of document.querySelectorAll('[data-timing-phase]')) {
            if (document.activeElement !== input) input.value = core.timingSeconds(effect.timing)[input.dataset.timingPhase];
        }
        for (const input of document.querySelectorAll('[data-check-path]')) input.checked = pathGet(input.dataset.checkPath).includes(input.value);
        for (const addon of core.addons) {
            const group = document.querySelector(`[data-addon="${addon.id}"]`);
            if (group) {
                const count = Object.keys(addon.events).filter(key => effect['play-on'].includes(key)).length;
                group.querySelector('summary').setAttribute('aria-label', t(addon.name + (count ? ` · ${count} selected` : '')));
            }
        }
        updateAvailability();
        dropdowns.refresh();
        for (const output of document.querySelectorAll('[data-output]')) { const value = pathGet(output.dataset.output); output.textContent = t(output.dataset.output.endsWith('image-opacity') ? `${Math.round(value * 100)}%` : `${value.toFixed(2).replace(/0$/, '')}×`); }
        for (const button of document.querySelectorAll('[data-palette]')) button.classList.toggle('active', button.dataset.palette === effect.appearance.palette);
        if ($('image-info')) { $('image-info').hidden = !effect.appearance.image; $('upload-image').hidden = !!imageBytes; if (imageUrl) $('image-thumbnail').src = imageUrl; else $('image-thumbnail').removeAttribute('src'); const label = $('image-description'); label.textContent = effect.appearance.image; label.append(element('small', '', imageElement ? `${imageElement.width} × ${imageElement.height} · ${(imageBytes.length / 1024).toFixed(0)} KB` : 'Missing image · choose the matching file')); }
        $('play-button').setAttribute('aria-label', t(playing ? 'Pause preview' : 'Play preview')); $('play-button').replaceChildren(icon(playing ? 'pause' : 'play'));
        for (const button of document.querySelectorAll('[data-template]')) { const selected = button.dataset.template === effect.id && button.dataset.libraryGroup === effect.category; button.classList.toggle('active', selected); button.setAttribute('aria-pressed', String(selected)); }
        if ($('edit-image')) $('edit-image').hidden = !imageBytes;
        directEditor?.render();
        if (previewReady) previewLoop.invalidate();
    }
    function duration() { return Math.max(1, effect.timing['minimum-ticks'] + effect.timing['fade-out-ticks']); }
    class ShaderRenderer {
        constructor(canvas) {
            this.canvas = canvas; const gl = this.gl = canvas.getContext('webgl', { alpha: true, premultipliedAlpha: false, preserveDrawingBuffer: true, antialias: false });
            if (!gl) throw new Error('WebGL is unavailable. Enable hardware acceleration to preview effects. Editing and export still work.');
            function compile(type, code) { const shader = gl.createShader(type); gl.shaderSource(shader, code); gl.compileShader(shader); if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error('Shader preview failed: ' + gl.getShaderInfoLog(shader)); return shader; }
            const program = this.program = gl.createProgram(); gl.attachShader(program, compile(gl.VERTEX_SHADER, 'attribute vec2 position; void main(){gl_Position=vec4(position,0.0,1.0);}')); gl.attachShader(program, compile(gl.FRAGMENT_SHADER, window.FrameStudioShader)); gl.linkProgram(program); if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error('Shader preview could not link. Editing and export still work.'); gl.useProgram(program);
            const buffer = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buffer); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1,1,-1,-1,1,-1,1,1,-1,1,1]), gl.STATIC_DRAW); const position = gl.getAttribLocation(program, 'position'); gl.enableVertexAttribArray(position); gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
            this.uniforms = Object.fromEntries(['ScreenSize','uTime','uSpeed','frameLoadingEffect','frameLoadingTransition','uCustom','uBackground','uPrimary','uSecondary','uIntensity','uImage','uHasImage','uImageSize','uContain','uImageOpacity','uBackgroundStyle','uImageAnimation','uImageMotion','uGrowingTitle','uPlacement','uIndicator','uDecoration','uProgressScale','uImageStretch'].map(name => [name, gl.getUniformLocation(program, name)]));
            this.texture = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, this.texture); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([0,0,0,0])); this.picture = null;
        }
        setImage(image) { this.picture = image; const gl = this.gl; gl.bindTexture(gl.TEXTURE_2D, this.texture); if (image) { gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image); } }
        clear() { this.gl.clear(this.gl.COLOR_BUFFER_BIT); }
        draw(definition, seconds, transition) {
            const gl = this.gl, u = this.uniforms, a = definition.appearance, c = this.canvas;
            const rgb = hex => /^#[0-9a-f]{6}$/i.test(hex) ? [1,3,5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255) : [0,0,0];
            const e = definition.elements;
            gl.useProgram(this.program);
            gl.uniform1i(u.uBackgroundStyle, ['template','solid','split','grid','terminal','pulse','none'].indexOf(e.background));
            gl.uniform2f(u.uImageStretch, e['image-stretch-x'], e['image-stretch-y']);
            gl.uniform1i(u.uImageAnimation, ['inherit','fade','grow','slide-up','slide-left','wipe','page','slide-right','slide-down','none'].indexOf(e['image-animation']));
            gl.uniform1i(u.uImageMotion, this.picture ? ['still','panorama','page'].indexOf(a['image-motion']) : 0);
            gl.uniform1i(u.uGrowingTitle,a['title-motion'] === 'grow');
            gl.uniform4f(u.uPlacement, e['image-x'], e['image-y'], e['image-scale'], e['image-delay']);
            gl.uniform4f(u.uIndicator, ['none','bar','segments','dots','ring'].indexOf(e.progress), e['progress-x'], e['progress-y'], e['progress-width']);
            gl.uniform1f(u.uProgressScale, e['progress-scale']);
            gl.uniform1i(u.uDecoration, ['none','embers','petals','scan','pulse'].indexOf(e.decoration));
            gl.viewport(0, 0, c.width, c.height); gl.useProgram(this.program); gl.uniform2f(u.ScreenSize, c.width, c.height); gl.uniform1f(u.uTime, seconds); gl.uniform1f(u.uSpeed, a.speed); gl.uniform1i(u.frameLoadingEffect, core.catalog.find(item => item.id === definition.template)?.shaderId || 0); gl.uniform1f(u.frameLoadingTransition, transition); gl.uniform1i(u.uCustom, a.palette === 'custom' ? 1 : 0); gl.uniform3fv(u.uBackground, rgb(a.background)); gl.uniform3fv(u.uPrimary, rgb(a.primary)); gl.uniform3fv(u.uSecondary, rgb(a.secondary)); gl.uniform1f(u.uIntensity, definition.elements.background === 'template' ? a.intensity : 1); gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, this.texture); gl.uniform1i(u.uImage, 0); gl.uniform1i(u.uHasImage, !!this.picture); gl.uniform2f(u.uImageSize, this.picture?.width || 1, this.picture?.height || 1); gl.uniform1i(u.uContain, a['image-fit'] === 'contain'); gl.uniform1f(u.uImageOpacity, a['image-opacity']); gl.drawArrays(gl.TRIANGLES, 0, 6);
        }
    }
    let directEditor = null;
    let renderer = null, previewLoop = null, previewReady = false, previewInView = true;
    let previewFit = 1, previewDraws = 0;
    try { renderer = new ShaderRenderer($('preview-canvas')); } catch (error) { $('renderer-error').hidden = false; $('renderer-error').textContent = t(error.message); }
    function previewFrame(time,elapsed,changed) {
        if (playing) {
            playTick += elapsed / 50;
            if (playTick > duration()) {
                if ($('loop').checked) playTick %= duration();
                else { playTick = duration(); playing = false; sync(); }
            }
        }
        const transition = core.coverageAt(effect,playTick), opacity = Math.abs(transition);
        const active = playTick < duration();
        if (renderer) { if (active) renderer.draw(effect,playTick/20,transition); else renderer.clear(); }
        $('preview-canvas').dataset.renderCount = String(++previewDraws);
        const phase = playTick < effect.timing['fade-in-ticks'] ? t('FADE IN') : playTick < effect.timing['minimum-ticks'] ? t('HOLD') : t('FADE OUT');
        if ($('stage-phase').textContent !== phase) $('stage-phase').textContent = t(phase);
        const caption = $('caption-preview'), layout = effect.elements;
        caption.hidden = !active || !effect.captions.enabled;
        $('game-hud').hidden = active && effect.presentation['hide-hud'];
        $('game-hands').hidden = active && !effect.presentation['show-hands'];
        if (changed) {
            previewFit = Math.min($('stage').clientWidth/640,$('stage').clientHeight/360);
            caption.style.inset = '0'; caption.style.transform = 'none'; caption.style.opacity = '1';
            const captionText = text => text.replace(/\{effect\}/g,effect.name).replace(/\{world\}/g,'world').replace(/\{player\}/g,server.session?.player || 'Player');
            for (const [kind,definition] of Object.entries(core.captionLines)) {
                const line = $('preview-'+kind), anchor = core.elementAnchor(layout,kind);
                line.style.position = 'absolute'; line.style.left = anchor.x*100+'%'; line.style.right = 'auto';
                line.style.top = anchor.y*100+'%'; line.style.margin = '0'; line.style.transformOrigin = '50% 0';
                window.FrameStudioFont.render(line,captionText(effect.captions[definition.key]),effect.captions[kind+'-color'],definition.size*previewFit);
            }
            directEditor?.render();
        }
        for (const kind of Object.keys(core.captionLines)) {
            const line = $('preview-'+kind), frame = core.captionFrame(effect,kind,opacity);
            const scale = layout['text-scale']*layout[kind+'-scale']*frame.grow, alpha = String(frame.alpha);
            const transform = `translateX(-50%) translate(${frame.x*previewFit}px,${frame.y*previewFit}px) scale(${layout['text-stretch-x']*layout[kind+'-stretch-x']*scale},${layout['text-stretch-y']*layout[kind+'-stretch-y']*scale})`;
            if (line.style.opacity !== alpha) line.style.opacity = alpha;
            if (line.style.transform !== transform) line.style.transform = transform;
        }
        const seconds = playTick/20, label = `00:${seconds.toFixed(1).padStart(4,'0')}`;
        if ($('time-label').textContent !== label) $('time-label').textContent = t(label);
        if (document.activeElement !== $('timeline')) $('timeline').value = Math.round(playTick/duration()*1000);
    }
    previewLoop = window.FrameStudioPreviewLoop.create({fps:30,playing:()=>playing,
        visible:()=>previewReady && !document.hidden && previewInView,render:previewFrame});
    function sizePreview() {
        const stage = $('stage'), canvas = $('preview-canvas'), ratio = Math.min(devicePixelRatio || 1,1.5);
        const width = Math.max(1,Math.min(960,Math.round(stage.clientWidth*ratio)));
        const height = Math.max(1,Math.round(width*stage.clientHeight/Math.max(1,stage.clientWidth)));
        if (canvas.width !== width || canvas.height !== height) { canvas.width=width;canvas.height=height; }
        if (previewReady) previewLoop.invalidate();
    }
    document.addEventListener('visibilitychange',()=>{if(document.hidden) previewLoop.suspend();else {previewLoop.invalidate();generateThumbnails();}});
    if (typeof ResizeObserver !== 'undefined') new ResizeObserver(sizePreview).observe($('stage'));
    else window.addEventListener('resize',sizePreview);
    if (typeof IntersectionObserver !== 'undefined') new IntersectionObserver(entries=>{
        previewInView = entries[0].isIntersecting;
        if (previewInView) previewLoop.invalidate(); else previewLoop.suspend();
    }).observe($('stage'));
    let thumbnailsRunning = false;
    function pendingThumbnails() {
        const wanted = new Set([...document.querySelectorAll('.template-card[data-template]')].map(button=>{
            const saved=activeCategory===core.categories[2]?libraryEntries().get(button.dataset.template):null;
            return saved?.image?null:saved?.effect.template || button.dataset.template;
        }));
        return core.catalog.filter(item=>wanted.has(item.id)&&!thumbs.has(item.id));
    }
    async function generateThumbnails() {
        if (!previewReady || document.hidden || thumbnailsRunning) return;
        const missing = pendingThumbnails(), category=activeCategory;
        if (!missing.length) return;
        thumbnailsRunning = true;
        const canvas = element('canvas'); canvas.width=160;canvas.height=90;let thumbnails,failed=false;
        try {
            thumbnails = new ShaderRenderer(canvas);
            for (const template of missing) {
                if (document.hidden || category!==activeCategory) break;
                if (template.image) { const image = new Image(); image.src=template.image; try {await image.decode();thumbnails.setImage(image);} catch {thumbnails.setImage(null);} }
                else thumbnails.setImage(null);
                thumbnails.draw(core.createEffect(template.id),2.5,1);
                const url=canvas.toDataURL('image/png'); thumbs.set(template.id,url);
                for (const button of document.querySelectorAll('.template-card[data-template]')) {
                    const saved=activeCategory===core.categories[2]?libraryEntries().get(button.dataset.template):null;
                    if (!saved?.image && (saved?.effect.template || button.dataset.template)===template.id) button.querySelector('.template-thumb').src=url;
                }
                await new Promise(resolve=>setTimeout(resolve,50));
            }
        } catch {failed=true;} finally {
            thumbnails?.gl.getExtension('WEBGL_lose_context')?.loseContext(); thumbnailsRunning=false;
            if (!failed && pendingThumbnails().length && !document.hidden) setTimeout(generateThumbnails,100);
        }
    }
    function download(bytes, filename, type) { const url = URL.createObjectURL(new Blob([bytes], { type })), anchor = element('a'); anchor.href = url; anchor.download = filename; document.body.append(anchor); anchor.click(); anchor.remove(); setTimeout(() => URL.revokeObjectURL(url), 10000); }
    function effectArchive() {
        core.validate(effect);
        if (effect.appearance.image && !imageBytes) throw new Error('Choose the referenced image, or remove it in Design.');
        const entries = { [`effects/${effect.id}.yml`]: core.toYaml(effect), 'INSTALL.txt': `FrameUI effect: ${effect.name}\n\nOpen /frameui editor to import directly, or extract effects/ and images/ into plugins/FrameUI/ and run /frameui reload.\nTest with /frameui preview ${effect.id}.\n` };
        if (imageBytes) entries[effect.appearance.image] = imageBytes;
        return core.zip(entries);
    }
    function exportEffect() {
        try { download(effectArchive(), `${effect.id}-frameui.zip`, 'application/zip'); toast('Effect ZIP downloaded.'); }
        catch (error) { toast(error.message, true); }
    }
    function serverStatus(message, error = false) {
        const status = $('server-connection'); status.hidden = false; status.textContent = t(message);
        status.classList.toggle('connection-error', error);
        $('server-import-button').querySelector('span').textContent = t(serverButtonLabel());
    }
    async function connectServer() {
        if (!server.available) return;
        try {
            const session = await server.connect();
            const records = await server.listEffects();
            for (const record of records) {
                const definition = core.fromYaml(record.yaml);
                serverEffects.set(record.id, { id: record.id, effect: definition, image: null, remote: true,
                    revision: record.revision, loaded: false, dirty: false });
            }
            if (serverEffects.size) activeCategory = core.categories[2];
            renderSettings(); renderCatalog();
            serverStatus(`Connected as ${session.player} · Link expires at ${new Date(session.expires).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`);
        } catch (error) { serverStatus(error.message, true); }
        sync();
    }
    async function importToServer() {
        if (!server.session) { $('connect-dialog').showModal(); return; }
        if (serverBusy || libraryBusy) return;
        const updating = isServerEffect();
        serverBusy = true; serverStatus(updating ? 'Saving changes to your server…' : 'Importing your effect…'); sync();
        try {
            // Stock effects remain unchanged. Importing one creates the same independent copy as editing it.
            if (effect.category !== core.categories[2]) {
                const before = snapshot();
                effect = core.userCopy(effect, usedIds(), usedNames());
                if (imageBytes) effect.appearance.image = `images/${effect.id}.png`;
                activeCategory = core.categories[2]; undo.push(before); redo.length = 0;
                await save(); renderSettings(); renderCatalog(); sync();
            }
            const id = effect.id, sent = snapshot(), archive = effectArchive();
            const result = await server.importEffect(archive, updating ? serverEffects.get(id).revision : null);
            const changed = effect.id === id && !snapshotMatches(sent, snapshot());
            serverEffects.set(id, { id, effect: core.clone(changed ? effect : sent.effect), image: changed ? imageBytes : sent.image,
                remote: true, loaded: true, revision: result.revision, dirty: changed, synced: sent });
            linkedEffectId = id;
            renderCatalog();
            serverStatus(`${updating ? 'Saved' : 'Imported'} ${id} · Your selected events are active`);
            toast(updating ? 'Server effect updated.' : 'Effect imported to your server. The resource pack refreshes automatically.');
        } catch (error) { if (error.status === 409 && isServerEffect()) serverEffects.get(effect.id).conflicted = true; serverStatus(error.message, true); toast(error.message, true); }
        finally {
            serverBusy = false;
            $('server-import-button').querySelector('span').textContent = t(serverButtonLabel());
            sync();
        }
    }
    async function importFile(file) {
        if (!file) return;
        try {
            let imported, bytes = null;
            if (/\.zip$/i.test(file.name)) { const entries = await core.unzip(new Uint8Array(await file.arrayBuffer())), definitions = Object.keys(entries).filter(name => /^effects\/.*\.ya?ml$/i.test(name)); if (definitions.length !== 1) throw new Error('Import one effect at a time. The ZIP must contain exactly one effects/*.yml file.'); imported = core.fromYaml(core.decoder.decode(entries[definitions[0]])); if (definitions[0].replace(/^effects\//, '').replace(/\.ya?ml$/i, '') !== imported.id) throw new Error('Effect ID must match the YAML filename.'); if (imported.appearance.image) { bytes = entries[imported.appearance.image]; if (!bytes) throw new Error(`ZIP is missing ${imported.appearance.image}.`); core.validatePng(bytes); } }
            else if (/\.ya?ml$/i.test(file.name)) { if (file.size > 256000) throw new Error('YAML must be smaller than 256 KB.'); imported = core.fromYaml(await file.text()); if (file.name.replace(/\.ya?ml$/i, '') !== imported.id) throw new Error('Effect ID must match the YAML filename.'); }
            else throw new Error('Choose a FrameUI YAML definition or an exported effect ZIP.');
            await save(); imported.category = core.categories[2]; activeCategory = core.categories[2];
            const before = snapshot(); await setImage(bytes); undo.push(before); if (undo.length > 32) undo.shift(); redo.length = 0; effect = imported; playTick = Math.max(effect.timing['fade-in-ticks'], 1); renderSettings(); renderCatalog(); sync(); scheduleSave(); toast(bytes || !effect.appearance.image ? 'Effect imported. Your previous draft is available with Undo.' : 'Definition imported. Choose its image to preview and export a complete ZIP.');
        } catch (error) { toast(error.message, true); }
        $('import-file').value = '';
    }
    async function uploadImage(file) {
        if (!file) return;
        try {
            if (!['image/png', 'image/jpeg'].includes(file.type) || file.size > core.MAX_IMAGE_BYTES) throw new Error('Choose a PNG or JPEG image smaller than 8 MB.');
            const temporary = URL.createObjectURL(file), image = new Image(); image.src = temporary;
            try { await image.decode(); } finally { URL.revokeObjectURL(temporary); }
            const scale = Math.min(1, core.MAX_IMAGE_SIZE / Math.max(image.naturalWidth, image.naturalHeight)), canvas = element('canvas'); canvas.width = Math.max(1, Math.round(image.naturalWidth * scale)); canvas.height = Math.max(1, Math.round(image.naturalHeight * scale)); canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);
            const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png')); if (!blob || blob.size > core.MAX_IMAGE_BYTES) throw new Error('Converted PNG is larger than 8 MB. Use a smaller image.');
            const bytes = new Uint8Array(await blob.arrayBuffer()); core.validatePng(bytes); const previous = snapshot(); await setImage(bytes); effect.appearance.image = `images/${effect.id}.png`; commitChange(previous); renderSettings(); sync(); toast(`Image added as ${canvas.width} × ${canvas.height} PNG.`);
        } catch (error) { toast(error.message, true); }
        $('image-file').value = '';
    }
    for (const brand of document.querySelectorAll('.brand[href="#"]')) brand.addEventListener('click', event => {
        event.preventDefault();
        const center = $('workspace-content');
        if (getComputedStyle(center).display === 'contents') window.scrollTo({ top: 0 });
        else center.scrollTo({ top: 0 });
    });
    $('search').addEventListener('input', renderCatalog);
    $('category-filter').addEventListener('change', () => { activeCategory = $('category-filter').value; renderCatalog(); });
    $('cancel-purge').addEventListener('click',()=>{pendingDelete=null;$('purge-dialog').close();});
    $('confirm-purge').addEventListener('click',confirmDelete);
    $('purge-dialog').addEventListener('cancel',event=>{if(libraryBusy) event.preventDefault();else pendingDelete=null;});
    $('undo-button').addEventListener('click', () => historyStep(false)); $('redo-button').addEventListener('click', () => historyStep(true));
    $('play-button').addEventListener('click', () => { playing = !playing; if (playing && playTick >= duration()) playTick = 0; sync(); }); $('restart-button').addEventListener('click', () => { playTick = 0; previewLoop.invalidate(); });
    $('timeline').addEventListener('input', () => { playTick = Number($('timeline').value) / 1000 * duration(); previewLoop.invalidate(); });
    $('import-button').addEventListener('click', () => $('import-file').click()); $('import-file').addEventListener('change', () => importFile($('import-file').files[0])); $('image-file').addEventListener('change', () => uploadImage($('image-file').files[0]));
    $('server-import-button').addEventListener('click', importToServer);
    $('close-connect').addEventListener('click', () => $('connect-dialog').close());
    $('export-button').addEventListener('click', exportEffect); $('guide-export').addEventListener('click', exportEffect); $('yaml-download').addEventListener('click', () => { try { download(core.toYaml(effect), effect.id + '.yml', 'text/yaml;charset=utf-8'); toast('YAML downloaded. Images must be supplied separately; use Export effect for a complete ZIP.'); } catch (error) { toast(error.message, true); } });
    $('guide-button').addEventListener('click', () => $('guide-dialog').showModal()); $('close-guide').addEventListener('click', () => $('guide-dialog').close()); $('guide-dialog').addEventListener('click', event => { if (event.target === $('guide-dialog')) { const rect = $('guide-dialog').getBoundingClientRect(); if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) $('guide-dialog').close(); } });
    $('reset-button').addEventListener('click', async () => { if (selectedComponent) { resetComponent(); return; } remember(); const preset = core.catalog.find(item => item.id === effect.id) || core.catalog.find(item => item.id === effect.template); effect = core.createEffect(preset.id); await setImage(preset.image ? new Uint8Array(await (await fetch(preset.image)).arrayBuffer()) : null); activeCategory = effect.category; renderSettings(); renderCatalog(); replayPreview(); scheduleSave(); toast('Template defaults restored. Undo restores your previous draft.'); });
    window.addEventListener('frameui:language', () => {
        const kind = selectedComponent;
        renderSettings(); renderCatalog(); sync();
        if (kind) directEditor.select(kind);
        previewLoop.invalidate();
    });
    const tabs = [...document.querySelectorAll('[data-tab]')];
    const tabScroll = new Map();
    let activeTab = null;
    function selectTab(button) {
        if (selectedComponent) directEditor?.select('');
        closeFieldHelp();
        dropdowns.close();
        const scroll = document.querySelector('.inspector-scroll');
        if (activeTab) tabScroll.set(activeTab, scroll.scrollTop);
        activeTab = button.dataset.tab;
        for (const tab of tabs) {
            const active = tab === button;
            tab.classList.toggle('active', active);
            tab.setAttribute('aria-selected', String(active));
            tab.tabIndex = active ? 0 : -1;
            $('settings-' + tab.dataset.tab).hidden = !active;
        }
        scroll.scrollTop = tabScroll.get(activeTab) || 0;
    }
    for (const tab of tabs) { tab.addEventListener('click', () => selectTab(tab)); tab.addEventListener('keydown', event => { if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) { event.preventDefault(); const index = tabs.indexOf(tab), next = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length; selectTab(tabs[next]); tabs[next].focus(); } }); }
    selectTab(tabs[0]);
    document.addEventListener('keydown', event => {
        const editing = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName || '') || document.activeElement?.getAttribute('role') === 'combobox';
        if (event.key === '/' && !editing) { event.preventDefault(); $('search').focus(); }
        if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z' && !editing) { event.preventDefault(); historyStep(event.shiftKey); }
        if (event.code === 'Space' && !editing && document.activeElement === document.body) { event.preventDefault(); playing = !playing; sync(); }
    });
    $('component-back').addEventListener('click',()=>directEditor.select(''));
    directEditor = window.FrameStudioCanvas.create({
        select:showComponent, geometry:syncComponentGeometry,
        stage: $('stage'),
        effect: () => effect, image: () => imageElement,
        pause: () => { playing = false; playTick = Math.max(effect.timing['fade-in-ticks'], Math.min(playTick, effect.timing['minimum-ticks'] - 1)); sync(); },
        update: elements => { effect.elements = elements; sync(); },
        commit: before => { const previous = snapshot(); previous.effect.elements = before; commitChange(previous); }
    });
    async function start() {
        await window.FrameStudioFont.load();
        const renamed = new Map();
        try {
            for (const entry of await window.FrameStudioLibrary.listDeleted()) {
                legacyDeletedIds.add(entry.id);
            }
            for (const entry of await window.FrameStudioLibrary.list()) {
                try { entry.effect = core.normalize(entry.effect); entry.effect.category = core.categories[2]; savedEffects.set(entry.id, entry); } catch {}
            }
            const names = [...savedEffects.values()].filter(entry => !/ · (?:Copy|Kopya)(?: \d+)?$/.test(entry.effect.name)).map(entry => entry.effect.name);
            for (const entry of savedEffects.values()) {
                if (!/ · (?:Copy|Kopya)(?: \d+)?$/.test(entry.effect.name)) continue;
                const original = entry.effect.name; entry.effect.name = core.uniqueName(original, names); names.push(entry.effect.name);
                if (original !== entry.effect.name) { renamed.set(entry.id, { original, name: entry.effect.name }); await window.FrameStudioLibrary.put(entry); }
            }
        } catch { toast('My Effects could not access browser storage. Export your effects to keep a copy.', true); }
        try { const stored = localStorage.getItem(storageKey); if (stored) { const draft = JSON.parse(stored); if (draft.version === core.VERSION) { effect = core.normalize(draft.effect); if (draft.image) await setImage(fromDataUrl(draft.image)); } } } catch { toast('Previous draft unavailable.', true); }
        if (effect.category === core.categories[2] && legacyDeletedIds.has(effect.id)) { const template = effect.template; await setImage(null); effect = core.createEffect(template); }
        const rename = renamed.get(effect.id); if (effect.category === core.categories[2] && rename?.original === effect.name) effect.name = rename.name;
        if (effect.appearance.image && !imageBytes) { const preset = core.catalog.find(item => item.id === effect.id); if (preset?.image) { try { await setImage(new Uint8Array(await (await fetch(preset.image)).arrayBuffer())); } catch { toast('Preset image could not load. Choose the matching PNG.', true); } } }
        activeCategory = effect.category;
        if (effect.category === core.categories[2]) await save();
        renderSettings(); renderCatalog(); sync(); previewReady=true; sizePreview(); previewLoop.invalidate(); generateThumbnails();
    }
    start().then(connectServer).catch(error => {
        console.error('Studio startup failed', error);
        $('renderer-error').textContent = t('Studio could not start. Reload the page; if this continues, update the server plugin and reopen /frameui editor.');
        $('renderer-error').hidden = false;
        toast('Studio could not load its required files. Reload the page to retry.', true);
    });
})();
