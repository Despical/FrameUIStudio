/* FrameUI Studio — Copyright (C) 2026 Berke Akçen. All rights reserved. Proprietary and confidential. */
(function () {
    'use strict';
    const core = window.FrameStudioCore;
    const dropdowns = window.FrameStudioDropdowns;
    const server = window.FrameStudioServer;
    let serverBusy = false, linkedEffectId = null;
    const serverEffects = new Map(), serverTrash = new Map();
    const inServerTrash = id => [...serverTrash.values()].some(entry => entry.id === id) && !serverEffects.has(id);
    const isServerEffect = () => effect.id === linkedEffectId && serverEffects.has(effect.id);
    const libraryEntries = () => new Map([...savedEffects, ...serverEffects].filter(([id]) => !inServerTrash(id)));
    const serverButtonLabel = () => serverBusy ? (isServerEffect() ? 'Saving…' : 'Importing…') : server.session ? (isServerEffect() ? 'Save to server' : 'Import to server') : 'Connect server';
    core.configureCatalog(window.FrameStudioCatalog);
    const $ = id => document.getElementById(id);
    const storageKey = 'frameui-studio-v1';
    const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
    let effect = core.createEffect('frameui'), imageBytes = null, imageUrl = '', imageElement = null;
    let undo = [], redo = [], playing = !reducedMotion, playTick = 24, lastFrame = 0, saveTimer, toastTimer;
    const thumbs = new Map(), savedEffects = new Map(), deletedEffects = new Map(), savedThumbnails = new Map();
    let activeCategory = core.categories[1], selectionVersion = 0, libraryBusy = false, pendingPurge = [];
    function element(tag, classes, text) { const node = document.createElement(tag); if (classes) node.className = classes; if (text !== undefined) node.textContent = text; return node; }
    function icon(id) { const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); const use = document.createElementNS('http://www.w3.org/2000/svg', 'use'); use.setAttribute('href', `#icon-${id}`); svg.append(use); return svg; }
    function toast(message, error = false) { clearTimeout(toastTimer); $('toast').textContent = message; $('toast').classList.toggle('error', error); $('toast').hidden = false; toastTimer = setTimeout(() => { $('toast').hidden = true; }, error ? 6500 : 3500); }
    function pathGet(path) { return path.split('.').reduce((value, key) => value[key], effect); }
    function pathSet(path, value) { const parts = path.split('.'); const key = parts.pop(); const owner = parts.reduce((entry, part) => entry[part], effect); owner[key] = value; }
    function snapshot() { return { effect: core.clone(effect), image: imageBytes }; }
    function remember() { undo.push(snapshot()); if (undo.length > 32) undo.shift(); redo.length = 0; }
    function snapshotMatches(a, b) { return a.image === b.image && JSON.stringify(a.effect) === JSON.stringify(b.effect); }
    function usedIds() { return [...core.catalog.map(item => item.id), ...savedEffects.keys(), ...serverEffects.keys(), ...[...serverTrash.values()].map(entry => entry.id), ...deletedEffects.keys()]; }
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
        const previous = snapshot(); pathSet(path, value);
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
        if (inServerTrash(current.effect.id)) return false;
        if (current.effect.category === core.categories[2] && deletedEffects.has(current.effect.id) && !serverEffects.has(current.effect.id)) return false;
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
    async function restore(state) { const next = core.clone(state.effect); await setImage(state.image); effect = next; activeCategory = effect.category; renderSettings(); renderCatalog(); sync(); scheduleSave(); }
    async function historyStep(isRedo) { const source = isRedo ? redo : undo, destination = isRedo ? undo : redo; if (!source.length) return; const target = source.pop(); destination.push(snapshot()); await restore(target); }
    function field(label, path, options = {}) {
        const wrap = element(options.options ? 'div' : 'label', 'field'), caption = element('span', 'field-label', label);
        wrap.append(caption);
        let input;
        if (options.options) { input = element('select'); for (const [value, text] of options.options) { const option = element('option', '', text); option.value = value; input.append(option); } }
        else if (options.multiline) { input = element('textarea'); input.rows = 2; }
        else { input = element('input'); input.type = options.type || 'text'; }
        input.dataset.path = path; input.id = 'field-' + path.replaceAll('.', '-'); input.value = options.list ? pathGet(path).join(', ') : options.seconds ? pathGet(path) / 20 : options.imageDelay ? Number((pathGet(path) * effect.timing['fade-in-ticks'] / 20).toFixed(3)) : pathGet(path);
        if (options.seconds) input.dataset.unit = 'seconds';
        if (options.imageDelay) input.dataset.unit = 'image-delay-seconds';
        if (options.placeholder) input.placeholder = options.placeholder;
        for (const key of ['min', 'max', 'step', 'maxLength']) if (options[key] !== undefined) input[key] = options[key];
        if (options.type === 'range') { const output = element('output'); output.htmlFor = input.id; output.dataset.output = path; caption.append(output); }
        const update = () => {
            const value = options.list ? input.value.split(/[,\n]/).map(item => item.trim()).filter(Boolean) : ['range', 'number'].includes(options.type) ? Number(input.value) : input.value;
            mutate(path, options.seconds ? Math.round(value * 20) : options.imageDelay ? Math.max(0, Math.min(.8, value * 20 / (effect.timing['fade-in-ticks'] || 1))) : value);
        };
        input.addEventListener(options.options ? 'change' : 'input', update);
        if (!options.options) input.addEventListener('change', () => { update(); sync(); });
        wrap.append(input); return wrap;
    }
    function toggle(label, path, note = '') {
        const row = element('label', 'switch-field'), copy = element('span', 'switch-copy', label); if (note) copy.append(element('small', '', note));
        const slider = element('span', 'switch'), input = element('input'); input.type = 'checkbox'; input.checked = pathGet(path); input.dataset.path = path; input.addEventListener('change', () => mutate(path, input.checked)); slider.append(input, element('span')); row.append(copy, slider); return row;
    }
    function section(title, tag = '') { const result = element('section', 'settings-section'), heading = element('div', 'section-heading'); heading.append(element('h3', '', title)); if (tag) heading.append(element('span', '', tag)); result.append(heading); return result; }
    function note(text) { return element('p', 'field-note', text); }
    function row(...fields) { const result = element('div', 'field-row'); result.append(...fields); return result; }
    function checkboxList(path, values, names = {}) {
        const grid = element('div', 'check-grid');
        for (const value of values) { const label = element('label'), input = element('input'); input.type = 'checkbox'; input.checked = pathGet(path).includes(value); input.dataset.checkPath = path; input.value = value; input.addEventListener('change', () => { const current = pathGet(path).filter(entry => entry !== value); if (input.checked) current.push(value); mutate(path, current); }); label.append(input, element('span', '', names[value] || value[0] + value.slice(1).toLowerCase().replaceAll('-', ' '))); grid.append(label); }
        return grid;
    }
    function details(title, ...children) { const result = element('details', 'advanced-details'); result.append(element('summary', '', title), ...children); return result; }
    function renderSettings() {
        dropdowns.close();
        const visual = $('settings-visual'), motion = $('settings-motion'), events = $('settings-events'), game = $('settings-game');
        for (const pane of [visual, motion, events, game]) pane.replaceChildren();
        const identity = section('Your effect');
        identity.append(field('Display name', 'name', { maxLength: 64 }));
        visual.append(identity);
        const captions = section('Captions'); captions.append(toggle('Show captions', 'captions.enabled'), field('Title', 'captions.title', { maxLength: 64 }), field('Subtitle', 'captions.subtitle', { maxLength: 96 }), details('Context details', field('Joining', 'captions.join-detail', { maxLength: 128 }), field('Teleporting', 'captions.teleport-detail', { maxLength: 128 }), field('Preview', 'captions.preview-detail', { maxLength: 128 }), note('Use {player}, {world}, {effect} in captions; details also support {source-world}, {destination} and {event}.'))); captions.append(details('Text placement', row(field('Horizontal position', 'elements.text-x', { type: 'range', min: 0, max: 1, step: .01 }), field('Vertical position', 'elements.text-y', { type: 'range', min: .1, max: .9, step: .01 })), field('Text size', 'elements.text-scale', { type: 'range', min: .5, max: 2, step: .01 }))); visual.append(captions);
        const placeholderState = server.session?.addons?.placeholderapi;
        captions.append(note('PlaceholderAPI: ' + (placeholderState === 'active' ? 'Active' : placeholderState === 'disabled' ? 'Disabled' : placeholderState === 'not-installed' ? 'Not installed' : 'Optional') + '. Installed expansions can supply %placeholders% in captions.'));
        const background = section('Background');
        background.append(field('Background layout', 'elements.background', { options: [['none','None'],['template','Shader template'],['solid','Solid color'],['split','Split panels'],['grid','Technical grid'],['terminal','Terminal'],['pulse','Expanding pulse']] }));
        visual.append(background);
        const palette = section('Color palette');
        const segments = element('div', 'segmented');
        for (const [value, label] of [['original', 'Original'], ['custom', 'Custom colors']]) { const button = element('button', effect.appearance.palette === value ? 'active' : '', label); button.dataset.palette = value; button.addEventListener('click', () => mutate('appearance.palette', value)); segments.append(button); }
        const colors = element('div', 'colors-row'); colors.id = 'custom-colors';
        for (const [key, label] of [['background', 'Base'], ['primary', 'Primary'], ['secondary', 'Accent']]) { const wrap = element('label', 'field color-field'), name = element('span', 'field-label', label), well = element('span', 'color-well'), input = element('input'), text = element('input'); input.type = 'color'; input.value = effect.appearance[key]; input.dataset.path = `appearance.${key}`; input.setAttribute('aria-label', label + ' color'); text.type = 'text'; text.value = effect.appearance[key]; text.maxLength = 7; text.dataset.path = `appearance.${key}`; text.setAttribute('aria-label', label + ' hex color'); input.addEventListener('input', () => mutate(`appearance.${key}`, input.value)); text.addEventListener('input', () => { if (/^#[0-9a-f]{6}$/i.test(text.value)) mutate(`appearance.${key}`, text.value); }); text.addEventListener('change', () => mutate(`appearance.${key}`, text.value)); well.append(input, text); wrap.append(name, well); colors.append(wrap); }
        palette.append(segments, colors, field('Brightness', 'appearance.intensity', { type: 'range', min: 0, max: 4, step: 0.05 })); visual.append(palette);
        const picture = section('Your image', 'OPTIONAL'), upload = element('button', 'image-upload'); upload.id = 'upload-image'; upload.append(icon('image'), element('strong', '', 'Choose an image'), element('span', '', 'Add a logo, artwork or your own photo'), element('small', '', 'PNG / JPEG · up to 8 MB · resized to 2048 px')); upload.addEventListener('click', () => $('image-file').click());
        const info = element('div', 'image-info'); info.id = 'image-info'; const thumbnail = element('img'); thumbnail.id = 'image-thumbnail'; thumbnail.alt = 'Uploaded effect image'; const label = element('span'); label.id = 'image-description'; const remove = element('button', 'icon-button', '×'); remove.setAttribute('aria-label', 'Remove image'); remove.addEventListener('click', async () => { const previous = snapshot(); await setImage(null); effect.appearance.image = ''; commitChange(previous); renderSettings(); sync(); }); info.append(thumbnail, label, remove);
        picture.append(info, upload, field('Image fit', 'appearance.image-fit', { options: [['cover', 'Cover — fill screen'], ['contain', 'Contain — show entire image']] }), field('Image opacity', 'appearance.image-opacity', { type: 'range', min: 0, max: 1, step: 0.01 }), details('Image placement', field('Image size', 'elements.image-scale', { type: 'range', min: .1, max: 2, step: .01 }), row(field('Horizontal position', 'elements.image-x', { type: 'range', min: 0, max: 1, step: .01 }), field('Vertical position', 'elements.image-y', { type: 'range', min: 0, max: 1, step: .01 }))), note('Drag the image on the preview to position it. Configure its entrance and movement in Motion.')); visual.append(picture);
        const indicator = section('Loading indicator');
        indicator.append(field('Indicator style', 'elements.progress', { options: [['none','None'],['bar','Moving bar'],['segments','Segmented bar'],['dots','Pulsing dots'],['ring','Rotating ring']] }), details('Indicator placement', row(field('Horizontal position', 'elements.progress-x', { type: 'range', min: .1, max: .9, step: .01 }), field('Vertical position', 'elements.progress-y', { type: 'range', min: .1, max: .9, step: .01 })), field('Indicator width', 'elements.progress-width', { type: 'range', min: .08, max: .8, step: .01 }), field('Indicator thickness', 'elements.progress-scale', { type: 'range', min: .5, max: 3, step: .01 })), note('An animated visual indicator, not a measurement of server loading progress.'));
        visual.append(indicator);
        const decoration = section('Finishing touches');
        decoration.append(field('Ambient decoration', 'elements.decoration', { options: [['none','None'],['embers','Embers'],['petals','Petals'],['scan','Scan line'],['pulse','Pulse emblem']] }));
        visual.append(decoration);
        const metadata = section('File details');
        metadata.append(details('Effect ID & category', field('Effect ID / filename', 'id', { maxLength: 48, placeholder: 'my-aurora' }), element('p', 'category-readonly', 'Category: ' + effect.category), note('The first edit creates a copy in My Effects. The ID is also the YAML filename: use lowercase words separated by hyphens.')));
        visual.append(metadata);
        const durationSection = section('Duration'), durationField = element('label', 'field');
        durationField.append(element('span', 'field-label', 'Total duration · seconds'));
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
            const wrap = element('label', 'field timing-field');
            wrap.append(element('span', 'field-label', label));
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
        animation.append(field('Animation speed', 'appearance.speed', { type: 'range', min: .05, max: 8, step: .05 }), note('Changes the animation movement without changing total duration.'));
        motion.append(animation);
        const entrances = section('Element entrances');
        entrances.append(field('Text entrance', 'elements.text-animation', { options: [['still','Fade'],['grow','Grow'],['slide-up','Slide up']] }), field('Image entrance', 'elements.image-animation', { options: [['inherit','Follow template'],['fade','Fade'],['grow','Grow from center'],['slide-up','Slide up'],['slide-left','Slide from left'],['wipe','Left-to-right reveal'],['page','Diagonal page']] }), field('Image entrance delay · seconds', 'elements.image-delay', { type: 'number', min: 0, max: .8 * effect.timing['fade-in-ticks'] / 20, step: .01, imageDelay: true }), note('Time after fade in begins before the image appears. Limited to 80% of the fade-in duration.'));
        motion.append(entrances);
        const imageMotion = section('Image movement');
        imageMotion.append(field('Ambient image motion', 'appearance.image-motion', { options: [['still','Still'],['panorama','Slow zoom and pan'],['page','Legacy page reveal']] }), note('Add or replace your image in Design. These settings animate it after placement.'));
        motion.append(imageMotion);
        const playback = section('When to play');
        playback.append(checkboxList('play-on', ['join', 'teleport', 'world-change'], { join: 'Join', teleport: 'Teleport', 'world-change': 'World change' }), note('Choose where this effect runs automatically. Your selection applies when imported to your server. Leave all unchecked for manual previews only.')); events.append(playback);
        const integrations = section('Plugin events', 'OPTIONAL');
        integrations.append(note('Choose an installed plugin and its events. One effect plays per teleport.'));
        for (const addon of core.addons) {
            const group = details(addon.name, checkboxList('play-on', Object.keys(addon.events), addon.events));
            group.dataset.addon = addon.id;
            const state = server.session?.addons?.[addon.id];
            group.querySelector('summary').append(element('span', 'addon-state' + (state === 'active' ? ' active' : ''), state === 'active' ? 'Active' : state === 'disabled' ? 'Disabled' : state === 'unsupported-api' ? 'Unsupported API' : state ? 'Not installed' : 'Optional'));
            integrations.append(group);
        }
        if (!server.session) integrations.append(note('Connect your server to see which addons are installed.'));
        events.append(integrations);
        const selection = section('Availability & selection'); selection.append(toggle('Enable effect', 'enabled'), row(field('Priority', 'priority', { type: 'number', min: -10000, max: 10000 }), field('Random weight', 'weight', { type: 'number', min: 1, max: 10000 })), field('Cooldown · seconds', 'filters.cooldown-ticks', { type: 'number', min: 0, max: 86400, step: .05, seconds: true }), note('Higher priorities win. Weight controls random selection between equally prioritized matches. A zero cooldown permits every eligible event.')); events.append(selection);
        const presentation = section('Player view'); presentation.append(toggle('Show hands', 'presentation.show-hands', 'Showing hands also keeps the HUD visible.'), toggle('Hide HUD', 'presentation.hide-hud', 'Hides the hotbar, crosshair and in-game HUD.'), toggle('Block movement', 'presentation.block-movement'), toggle('Block interactions', 'presentation.block-interactions')); game.append(presentation);
        const worlds = section('Where it can play'); worlds.append(field('Include worlds', 'filters.worlds.include', { list: true, placeholder: 'world, survival-*' }), field('Exclude worlds', 'filters.worlds.exclude', { list: true, placeholder: 'world_nether, lobby' }), note('Comma-separated world names. * and ? are supported; exclusions win. Empty include allows every world.'), details('Source world filters', field('Include source worlds', 'filters.source-worlds.include', { list: true, placeholder: 'lobby, hub-*' }), field('Exclude source worlds', 'filters.source-worlds.exclude', { list: true, placeholder: 'minigame-*' }), note('Source is the world the player leaves. On join it is the same as the destination.'))); game.append(worlds);
        const access = section('Who can see it'); access.append(field('Required permission', 'filters.permission', { maxLength: 128, placeholder: 'frameui.effect.vip' }), field('Denied permissions', 'filters.deny-permissions', { list: true, placeholder: 'frameui.effect.disable' }), details('Game mode filters', element('span', 'chip-note', 'INCLUDE · EMPTY ALLOWS ALL'), checkboxList('filters.game-modes.include', core.modes), element('span', 'chip-note', 'EXCLUDE'), checkboxList('filters.game-modes.exclude', core.modes))); game.append(access);
        const environment = section('Advanced conditions'); environment.append(details('Distance & height', row(field('Min distance · blocks', 'filters.distance.min', { type: 'number', min: 0, max: 100000000, step: 'any' }), field('Max distance · blocks', 'filters.distance.max', { type: 'number', min: -1, max: 100000000, step: 'any' })), note('Use -1 for unlimited maximum distance. Cross-world teleports satisfy the minimum distance.'), row(field('Min Y', 'filters.height.min', { type: 'number', min: -30000000, max: 30000000, step: 'any' }), field('Max Y', 'filters.height.max', { type: 'number', min: -30000000, max: 30000000, step: 'any' })), note('Height applies to the destination. The defaults allow all heights.')), details('Time & weather', row(field('Start time · ticks', 'filters.time.min', { type: 'number', min: 0, max: 23999 }), field('End time · ticks', 'filters.time.max', { type: 'number', min: 0, max: 23999 })), note('Minecraft time: 0 sunrise, 6000 noon, 12000 sunset, 18000 midnight. A range crossing midnight is supported.'), checkboxList('filters.weather', ['clear', 'rain', 'thunder']), note('Empty allows any weather.'))); environment.append(details('Teleport causes', checkboxList('filters.teleport-causes', core.causes), note('Empty allows every cause. Distance and cause filters apply to teleports and world changes.'))); game.append(environment);
        const targets = section('Plugin destinations');
        targets.append(details('Home, warp, portal & island names', field('Include addon destinations', 'filters.addon-targets.include', { list: true, placeholder: 'spawn, town-*, survival_portal' }), field('Exclude addon destinations', 'filters.addon-targets.exclude', { list: true, placeholder: 'staff-*' }), note('Restrict the plugin events selected in Events. Match home, warp, portal, town, nation, land or island names. Multiverse-Core uses destination worlds. Empty includes allow all; * and ? are wildcards.')));
        game.append(targets);
        dropdowns.enhance();
    }
    function renderCategories() {
        const select = $('category-filter');
        for (const category of core.categories) {
            const count = category === core.categories[2] ? libraryEntries().size : core.catalog.filter(item => item.category === category).length;
            const option = [...select.options].find(option => option.value === category);
            option.textContent = `${category} (${count})`;
        }
        select.value = activeCategory;
        dropdowns.refresh();
        document.querySelector('.panel-heading h1 span').textContent = core.catalog.length + libraryEntries().size;
        $('catalog-footer').hidden = activeCategory !== core.categories[2];
        $('trash-button').textContent = `Trash (${deletedEffects.size + serverTrash.size})`;
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
            const thumb = element('img', 'template-thumb'); thumb.alt = '';
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
            const copy = element('span', 'template-copy'); copy.append(element('b', '', item.name), element('small', '', `${seconds.toFixed(1)} s`));
            if (saved?.remote) copy.append(element('span', 'server-effect-badge', saved.dirty ? 'Unsaved changes' : 'Server'));
            button.title = item.name;
            button.append(thumb, copy, icon('check')); button.addEventListener('click', () => openLibraryItem(item, saved));
            if (own) {
                const entry = element('div', 'template-row'), remove = element('button', 'icon-button effect-delete');
                remove.append(icon('trash')); remove.title = 'Move to Trash'; remove.setAttribute('aria-label', `Delete ${item.name}`);
                remove.addEventListener('click', () => deleteEffect(item.id)); entry.append(button, remove); list.append(entry);
            } else list.append(button);
        }
        if (!list.children.length) list.append(element('p', 'empty-state', own && !query ? 'Edit an animation or preset to create your first effect automatically. You can also import your own effect ZIP.' : 'No matching effects in this category.'));
    }
    async function deleteEffect(id) {
        if (libraryBusy || serverBusy) return;
        libraryBusy = true; sync();
        try {
            await save();
            const remote = serverEffects.get(id);
            if (remote) {
                const deleted = await server.trashEffect(id, remote.revision);
                serverTrash.set(deleted.trashId, deleted); serverEffects.delete(id);
                serverStatus(`${deleted.name} moved to server Trash`);
            } else {
                const entry = savedEffects.get(id); if (!entry) return;
                await window.FrameStudioLibrary.remove(entry);
                deletedEffects.set(id, entry); savedEffects.delete(id);
            }
            const thumbnail = savedThumbnails.get(id); if (thumbnail) URL.revokeObjectURL(thumbnail.url); savedThumbnails.delete(id);
            const keep = state => state.effect.category !== core.categories[2] || state.effect.id !== id;
            undo = undo.filter(keep); redo = redo.filter(keep);
            if (effect.id === id && effect.category === core.categories[2]) {
                ++selectionVersion; const next = core.createEffect(effect.template);
                await setImage(null); effect = next; linkedEffectId = null; renderSettings();
            }
            renderCatalog(); sync(); await save();
            toast('Effect moved to Trash. Restore it from My Effects → Trash.');
        } catch (error) { toast(error.message || 'Could not delete this effect. Your saved copy is still available.', true); }
        finally { libraryBusy = false; sync(); }
    }
    async function restoreServerEffect(entry) {
        if (libraryBusy || serverBusy) return;
        libraryBusy = true; sync(); renderTrash();
        try {
            await server.restoreEffect(entry.trashId, entry.revision);
            serverTrash.delete(entry.trashId);
            // The operation is already committed even if the subsequent image download is interrupted.
            const records = await server.listEffects();
            const record = records.find(record => record.id === entry.id);
            if (!record) throw new Error('The effect was restored. Reopen Studio to refresh the library.');
            serverEffects.set(record.id, { id: record.id, effect: core.fromYaml(record.yaml), image: null, remote: true,
                revision: record.revision, loaded: false, dirty: false });
            activeCategory = core.categories[2]; renderCatalog();
            serverStatus(`${entry.name} restored to your server`); toast('Effect restored to your server.');
        } catch (error) { toast(error.message || 'Could not restore this effect. It is still in server Trash.', true); }
        finally { libraryBusy = false; renderCatalog(); renderTrash(); sync(); }
    }
    function renderTrash() {
        const list = $('trash-list'); list.replaceChildren();
        $('empty-trash').disabled = !deletedEffects.size || libraryBusy;
        $('empty-trash').textContent = serverTrash.size ? 'Empty local Trash' : 'Empty Trash';
        for (const entry of serverTrash.values()) {
            const row = element('div', 'trash-row'), copy = element('div', 'template-copy');
            copy.append(element('b', '', entry.name), element('small', '', entry.id), element('span', 'server-effect-badge', 'Server'));
            const restore = element('button', 'button button-quiet', 'Restore'); restore.setAttribute('aria-label', `Restore ${entry.name} from server Trash`);
            restore.disabled = libraryBusy; restore.addEventListener('click', () => restoreServerEffect(entry));
            row.append(copy, restore); list.append(row);
        }
        for (const entry of deletedEffects.values()) {
            const row = element('div', 'trash-row'), copy = element('div', 'template-copy');
            copy.append(element('b', '', entry.effect.name), element('small', '', entry.id));
            const restore = element('button', 'button button-quiet', 'Restore'); restore.setAttribute('aria-label', `Restore ${entry.effect.name}`);
            restore.addEventListener('click', async () => {
                if (libraryBusy) return; libraryBusy = true; restore.disabled = true;
                try {
                    const restored = { id: entry.id, effect: core.clone(entry.effect), image: entry.image };
                    restored.effect.name = core.uniqueName(restored.effect.name, usedNames());
                    await window.FrameStudioLibrary.put(restored);
                    deletedEffects.delete(entry.id); savedEffects.set(entry.id, restored);
                    renderCatalog(); renderTrash(); sync(); toast('Effect restored to My Effects.');
                } catch { restore.disabled = false; toast('Could not restore this effect. It is still in Trash.', true); }
                finally { libraryBusy = false; $('empty-trash').disabled = !deletedEffects.size; }
            });
            const remove = element('button', 'button button-danger', 'Delete permanently'); remove.setAttribute('aria-label', `Delete permanently ${entry.effect.name}`);
            remove.addEventListener('click', () => requestPurge([entry.id]));
            const actions = element('div', 'trash-row-actions'); actions.append(restore, remove);
            row.append(copy, actions); list.append(row);
        }
        if (!list.children.length) list.append(element('p', 'empty-state', 'Trash is empty.'));
    }
    function requestPurge(ids) {
        if (libraryBusy) return;
        pendingPurge = ids.filter(id => deletedEffects.has(id)); if (!pendingPurge.length) return;
        $('purge-description').textContent = pendingPurge.length === 1
            ? `“${deletedEffects.get(pendingPurge[0]).effect.name}” and its image will be deleted. This cannot be undone.`
            : `All ${pendingPurge.length} effects in Trash and their images will be deleted. This cannot be undone.`;
        $('confirm-purge').textContent = ids.length > 1 ? 'Empty Trash' : 'Delete permanently';
        $('purge-dialog').showModal();
    }
    async function confirmPurge() {
        if (libraryBusy || !pendingPurge.length) return;
        libraryBusy = true; $('confirm-purge').disabled = true; $('cancel-purge').disabled = true;
        try {
            const removed = await window.FrameStudioLibrary.purgeDeleted(pendingPurge);
            for (const id of removed) deletedEffects.delete(id);
            pendingPurge = []; $('purge-dialog').close(); renderCatalog();
            toast(removed.length === 1 ? 'Effect permanently deleted.' : `${removed.length} effects permanently deleted.`);
        } catch { toast('Could not empty Trash. Your effects are still available.', true); }
        finally {
            libraryBusy = false; $('confirm-purge').disabled = false; $('cancel-purge').disabled = false; renderTrash();
        }
    }
    function validState() { try { core.validate(effect); if (inServerTrash(effect.id)) return 'This ID is in server Trash. Restore it first.'; if (effect.category === core.categories[2] && deletedEffects.has(effect.id) && !serverEffects.has(effect.id)) return 'This ID is in Trash. Restore it or choose another ID.'; return ''; } catch (error) { return error.message; } }
    function sync() {
        const error = validState(); $('validation-status').textContent = error || (effect.appearance.image && !imageBytes ? 'Image file needs to be supplied' : isServerEffect() ? (serverBusy ? 'Saving to server…' : snapshotMatches(serverEffects.get(effect.id).synced, snapshot()) ? 'Saved on server' : 'Changes not saved to server') : 'Ready to export'); document.querySelector('.inspector-footer').classList.toggle('invalid', !!error || !!(effect.appearance.image && !imageBytes));
        $('server-import-button').disabled = serverBusy || libraryBusy || (!!server.session && !!error);
        $('server-import-button').querySelector('span').textContent = serverButtonLabel();
        $('export-button').disabled = !!error; $('yaml-download').disabled = !!error; $('guide-export').disabled = !!error;
        $('effect-heading').textContent = effect.name || 'Untitled effect';
        $('summary-in').textContent = `${Number((effect.timing['fade-in-ticks'] / 20).toFixed(2))} s`; $('summary-hold').textContent = `${Number(((effect.timing['minimum-ticks'] - effect.timing['fade-in-ticks']) / 20).toFixed(2))} s`; $('summary-out').textContent = `${Number((effect.timing['fade-out-ticks'] / 20).toFixed(2))} s`; $('summary-triggers').textContent = effect['play-on'].length ? `${effect['play-on'].length} ${effect['play-on'].length === 1 ? 'event' : 'events'}` : 'Manual only';
        $('duration-label').textContent = `${Number((duration() / 20).toFixed(2))} s`; $('undo-button').disabled = !undo.length; $('redo-button').disabled = !redo.length;
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
                group.querySelector('summary').setAttribute('aria-label', addon.name + (count ? ` · ${count} selected` : ''));
            }
        }
        dropdowns.refresh();
        for (const output of document.querySelectorAll('[data-output]')) { const value = pathGet(output.dataset.output); output.textContent = output.dataset.output.endsWith('image-opacity') ? `${Math.round(value * 100)}%` : `${value.toFixed(2).replace(/0$/, '')}×`; }
        for (const button of document.querySelectorAll('[data-palette]')) button.classList.toggle('active', button.dataset.palette === effect.appearance.palette);
        if ($('custom-colors')) { $('custom-colors').style.opacity = effect.appearance.palette === 'custom' ? '1' : '.42'; for (const input of $('custom-colors').querySelectorAll('input')) input.disabled = effect.appearance.palette !== 'custom'; }
        if ($('image-info')) { $('image-info').hidden = !effect.appearance.image; $('upload-image').hidden = !!imageBytes; if (imageUrl) $('image-thumbnail').src = imageUrl; else $('image-thumbnail').removeAttribute('src'); const label = $('image-description'); label.textContent = effect.appearance.image; label.append(element('small', '', imageElement ? `${imageElement.width} × ${imageElement.height} · ${(imageBytes.length / 1024).toFixed(0)} KB` : 'Missing image · choose the matching file')); }
        $('play-button').setAttribute('aria-label', playing ? 'Pause preview' : 'Play preview'); $('play-button').replaceChildren(icon(playing ? 'pause' : 'play'));
        for (const button of document.querySelectorAll('[data-template]')) { const selected = button.dataset.template === effect.id && button.dataset.libraryGroup === effect.category; button.classList.toggle('active', selected); button.setAttribute('aria-pressed', String(selected)); }
        if (document.querySelector('.category-readonly')) document.querySelector('.category-readonly').textContent = 'Category: ' + effect.category;
        directEditor?.render();
    }
    function duration() { return Math.max(1, effect.timing['minimum-ticks'] + effect.timing['fade-out-ticks']); }
    function coverageAt(tick) {
        const t = effect.timing, fadeIn = t['fade-in-ticks'], minimum = t['minimum-ticks'];
        if (fadeIn > 0 && tick < fadeIn) return Math.max(0, tick / fadeIn);
        if (tick < minimum) return 1;
        return -Math.max(0, 1 - (tick - minimum) / Math.max(1, t['fade-out-ticks']));
    }
    class ShaderRenderer {
        constructor(canvas) {
            this.canvas = canvas; const gl = this.gl = canvas.getContext('webgl', { alpha: true, premultipliedAlpha: false, preserveDrawingBuffer: true, antialias: false });
            if (!gl) throw new Error('WebGL is unavailable. Enable hardware acceleration to preview effects. Editing and export still work.');
            function compile(type, code) { const shader = gl.createShader(type); gl.shaderSource(shader, code); gl.compileShader(shader); if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error('Shader preview failed: ' + gl.getShaderInfoLog(shader)); return shader; }
            const program = this.program = gl.createProgram(); gl.attachShader(program, compile(gl.VERTEX_SHADER, 'attribute vec2 position; void main(){gl_Position=vec4(position,0.0,1.0);}')); gl.attachShader(program, compile(gl.FRAGMENT_SHADER, window.FrameStudioShader)); gl.linkProgram(program); if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error('Shader preview could not link. Editing and export still work.'); gl.useProgram(program);
            const buffer = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buffer); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1,1,-1,-1,1,-1,1,1,-1,1,1]), gl.STATIC_DRAW); const position = gl.getAttribLocation(program, 'position'); gl.enableVertexAttribArray(position); gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
            this.uniforms = Object.fromEntries(['ScreenSize','uTime','uSpeed','frameLoadingEffect','frameLoadingTransition','uCustom','uBackground','uPrimary','uSecondary','uIntensity','uImage','uHasImage','uImageSize','uContain','uImageOpacity','uBackgroundStyle','uImageAnimation','uImageMotion','uPlacement','uIndicator','uDecoration','uProgressScale'].map(name => [name, gl.getUniformLocation(program, name)]));
            this.texture = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, this.texture); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([0,0,0,0])); this.picture = null;
        }
        setImage(image) { this.picture = image; const gl = this.gl; gl.bindTexture(gl.TEXTURE_2D, this.texture); if (image) { gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image); } }
        draw(definition, seconds, transition) {
            const gl = this.gl, u = this.uniforms, a = definition.appearance, c = this.canvas;
            const rgb = hex => /^#[0-9a-f]{6}$/i.test(hex) ? [1,3,5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255) : [0,0,0];
            const e = definition.elements;
            gl.useProgram(this.program);
            gl.uniform1i(u.uBackgroundStyle, ['template','solid','split','grid','terminal','pulse','none'].indexOf(e.background));
            gl.uniform1i(u.uImageAnimation, ['inherit','fade','grow','slide-up','slide-left','wipe','page'].indexOf(e['image-animation']));
            gl.uniform1i(u.uImageMotion, ['still','panorama','page'].indexOf(a['image-motion']));
            gl.uniform4f(u.uPlacement, e['image-x'], e['image-y'], e['image-scale'], e['image-delay']);
            gl.uniform4f(u.uIndicator, ['none','bar','segments','dots','ring'].indexOf(e.progress), e['progress-x'], e['progress-y'], e['progress-width']);
            gl.uniform1f(u.uProgressScale, e['progress-scale']);
            gl.uniform1i(u.uDecoration, ['none','embers','petals','scan','pulse'].indexOf(e.decoration));
            gl.viewport(0, 0, c.width, c.height); gl.useProgram(this.program); gl.uniform2f(u.ScreenSize, c.width, c.height); gl.uniform1f(u.uTime, seconds); gl.uniform1f(u.uSpeed, a.speed); gl.uniform1i(u.frameLoadingEffect, core.catalog.find(item => item.id === definition.template)?.shaderId || 0); gl.uniform1f(u.frameLoadingTransition, transition); gl.uniform1i(u.uCustom, a.palette === 'custom' ? 1 : 0); gl.uniform3fv(u.uBackground, rgb(a.background)); gl.uniform3fv(u.uPrimary, rgb(a.primary)); gl.uniform3fv(u.uSecondary, rgb(a.secondary)); gl.uniform1f(u.uIntensity, a.intensity); gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, this.texture); gl.uniform1i(u.uImage, 0); gl.uniform1i(u.uHasImage, !!this.picture); gl.uniform2f(u.uImageSize, this.picture?.width || 1, this.picture?.height || 1); gl.uniform1i(u.uContain, a['image-fit'] === 'contain'); gl.uniform1f(u.uImageOpacity, a['image-opacity']); gl.drawArrays(gl.TRIANGLES, 0, 6);
        }
    }
    let directEditor = null;
    let renderer = null;
    try { renderer = new ShaderRenderer($('preview-canvas')); } catch (error) { $('renderer-error').hidden = false; $('renderer-error').textContent = error.message; }
    function previewFrame(time) {
        if (lastFrame && playing && !document.hidden) { playTick += Math.min((time - lastFrame) / 50, 2); if (playTick > duration()) { if ($('loop').checked) playTick %= duration(); else { playTick = duration(); playing = false; sync(); } } }
        lastFrame = time;
        const raw = coverageAt(playTick), value = Math.abs(raw), transition = Math.sign(raw) * value * value * (3 - 2 * value), opacity = Math.abs(transition);
        if (renderer && !document.hidden) renderer.draw(effect, playTick / 20, transition);
        const phase = playTick < effect.timing['fade-in-ticks'] ? 'FADE IN' : playTick < effect.timing['minimum-ticks'] ? 'HOLD' : 'FADE OUT'; $('stage-phase').textContent = phase;
        const caption = $('caption-preview'), layout = effect.elements;
        const delay = Math.max(.12, layout['image-delay']), t = Math.max(0, Math.min(1, (opacity - delay) / (1 - delay))), entrance = t * t * (3 - 2 * t);
        caption.hidden = !effect.captions.enabled; caption.style.opacity = String(entrance);
        caption.style.top = '0'; caption.style.bottom = '0';
        caption.style.left = ((layout['text-x'] - .5) * 100) + '%'; caption.style.right = ((.5 - layout['text-x']) * 100) + '%';
        caption.style.transformOrigin = `50% ${layout['text-y'] * 100}%`;
        const fit = $('stage').clientWidth / 640;
        for (const [id, offset, size] of [['preview-title', .004, 14], ['preview-subtitle', .069, 8], ['preview-detail', .246, 7]]) { const line = $(id); line.style.position = 'absolute'; line.style.left = '0'; line.style.right = '0'; line.style.top = ((layout['text-y'] + offset) * 100) + '%'; line.style.margin = '0'; line.style.fontSize = (size * fit) + 'px'; }
        caption.style.transform = `translateY(${layout['text-animation'] === 'slide-up' ? (1 - entrance) * 30 : 0}px) scale(${layout['text-scale'] * (layout['text-animation'] === 'grow' ? 1 - Math.pow(1 - entrance, 3) : 1)})`;
        $('preview-title').style.color = effect.appearance.primary; $('preview-subtitle').style.color = effect.appearance.secondary;
        const captionText = value => value.replace(/\{effect\}/g, effect.name).replace(/\{world\}/g, 'world');
        $('preview-title').textContent = captionText(effect.captions.title); $('preview-subtitle').textContent = captionText(effect.captions.subtitle); $('preview-detail').textContent = captionText(effect.captions['preview-detail']);
        $('game-hud').hidden = effect.presentation['hide-hud']; $('game-hands').hidden = !effect.presentation['show-hands'];
        const seconds = playTick / 20; $('time-label').textContent = `00:${seconds.toFixed(1).padStart(4, '0')}`; if (document.activeElement !== $('timeline')) $('timeline').value = Math.round(playTick / duration() * 1000);
        directEditor?.render();
        requestAnimationFrame(previewFrame);
    }
    async function generateThumbnails() {
        const canvas = element('canvas'); canvas.width = 160; canvas.height = 90; let thumbnails;
        try { thumbnails = new ShaderRenderer(canvas); } catch { return; }
        for (const template of core.catalog) { if (template.image) { const image = new Image(); image.src = template.image; try { await image.decode(); thumbnails.setImage(image); } catch { thumbnails.setImage(null); } } else thumbnails.setImage(null); thumbnails.draw(core.createEffect(template.id), 2.5, 1); const url = canvas.toDataURL('image/png'); thumbs.set(template.id, url); const img = document.querySelector(`[data-template="${template.id}"] .template-thumb`); if (img && activeCategory !== core.categories[2]) img.src = url; await new Promise(resolve => requestAnimationFrame(resolve)); }
        thumbnails.gl.getExtension('WEBGL_lose_context')?.loseContext();
    }
    function download(bytes, filename, type) { const url = URL.createObjectURL(new Blob([bytes], { type })), anchor = element('a'); anchor.href = url; anchor.download = filename; document.body.append(anchor); anchor.click(); anchor.remove(); setTimeout(() => URL.revokeObjectURL(url), 10000); }
    function effectArchive() {
        core.validate(effect);
        if (effect.appearance.image && !imageBytes) throw new Error('Choose the referenced image, or clear it in YAML.');
        const entries = { [`effects/${effect.id}.yml`]: core.toYaml(effect), 'INSTALL.txt': `FrameUI effect: ${effect.name}\n\nOpen /frameui editor to import directly, or extract effects/ and images/ into plugins/FrameUI/ and run /frameui reload.\nTest with /frameui preview ${effect.id}.\n` };
        if (imageBytes) entries[effect.appearance.image] = imageBytes;
        return core.zip(entries);
    }
    function exportEffect() {
        try { download(effectArchive(), `${effect.id}-frameui.zip`, 'application/zip'); toast('Effect ZIP downloaded.'); }
        catch (error) { toast(error.message, true); }
    }
    function serverStatus(message, error = false) {
        const status = $('server-connection'); status.hidden = false; status.textContent = message;
        status.classList.toggle('connection-error', error);
        $('server-import-button').querySelector('span').textContent = serverButtonLabel();
    }
    async function connectServer() {
        if (!server.available) return;
        try {
            const session = await server.connect();
            const [records, trashed] = await Promise.all([server.listEffects(), server.listTrash()]);
            for (const record of trashed) serverTrash.set(record.trashId, record);
            for (const record of records) {
                const definition = core.fromYaml(record.yaml);
                serverEffects.set(record.id, { id: record.id, effect: definition, image: null, remote: true,
                    revision: record.revision, loaded: false, dirty: false });
            }
            if (inServerTrash(effect.id)) {
                await setImage(null); effect = core.createEffect(effect.template); linkedEffectId = null;
                renderSettings();
            }
            if (serverEffects.size || serverTrash.size) activeCategory = core.categories[2];
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
            $('server-import-button').querySelector('span').textContent = serverButtonLabel();
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
    $('trash-button').addEventListener('click', () => { renderTrash(); $('trash-dialog').showModal(); });
    $('close-trash').addEventListener('click', () => $('trash-dialog').close());
    $('empty-trash').addEventListener('click', () => requestPurge([...deletedEffects.keys()]));
    $('cancel-purge').addEventListener('click', () => { pendingPurge = []; $('purge-dialog').close(); });
    $('confirm-purge').addEventListener('click', confirmPurge);
    $('purge-dialog').addEventListener('cancel', event => { if (libraryBusy) event.preventDefault(); else pendingPurge = []; });
    $('category-filter').addEventListener('change', () => { activeCategory = $('category-filter').value; renderCatalog(); });
    $('undo-button').addEventListener('click', () => historyStep(false)); $('redo-button').addEventListener('click', () => historyStep(true));
    $('play-button').addEventListener('click', () => { playing = !playing; if (playing && playTick >= duration()) playTick = 0; sync(); }); $('restart-button').addEventListener('click', () => { playTick = 0; });
    $('timeline').addEventListener('input', () => { playTick = Number($('timeline').value) / 1000 * duration(); });
    $('import-button').addEventListener('click', () => $('import-file').click()); $('import-file').addEventListener('change', () => importFile($('import-file').files[0])); $('image-file').addEventListener('change', () => uploadImage($('image-file').files[0]));
    $('server-import-button').addEventListener('click', importToServer);
    $('close-connect').addEventListener('click', () => $('connect-dialog').close());
    $('export-button').addEventListener('click', exportEffect); $('guide-export').addEventListener('click', exportEffect); $('yaml-download').addEventListener('click', () => { try { download(core.toYaml(effect), effect.id + '.yml', 'text/yaml;charset=utf-8'); toast('YAML downloaded. Images must be supplied separately; use Export effect for a complete ZIP.'); } catch (error) { toast(error.message, true); } });
    $('guide-button').addEventListener('click', () => $('guide-dialog').showModal()); $('close-guide').addEventListener('click', () => $('guide-dialog').close()); $('guide-dialog').addEventListener('click', event => { if (event.target === $('guide-dialog')) { const rect = $('guide-dialog').getBoundingClientRect(); if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) $('guide-dialog').close(); } });
    $('reset-button').addEventListener('click', async () => { remember(); const preset = core.catalog.find(item => item.id === effect.id) || core.catalog.find(item => item.id === effect.template); effect = core.createEffect(preset.id); await setImage(preset.image ? new Uint8Array(await (await fetch(preset.image)).arrayBuffer()) : null); activeCategory = effect.category; renderSettings(); renderCatalog(); sync(); scheduleSave(); toast('Template defaults restored. Undo restores your previous draft.'); });
    const tabs = [...document.querySelectorAll('[data-tab]')];
    const tabScroll = new Map();
    let activeTab = null;
    function selectTab(button) {
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
    directEditor = window.FrameStudioCanvas.create({
        stage: $('stage'),
        effect: () => effect, image: () => imageElement,
        pause: () => { playing = false; playTick = Math.max(effect.timing['fade-in-ticks'], Math.min(playTick, effect.timing['minimum-ticks'] - 1)); sync(); },
        update: elements => { effect.elements = elements; sync(); },
        commit: before => { const previous = snapshot(); previous.effect.elements = before; commitChange(previous); }
    });
    async function start() {
        const renamed = new Map();
        try {
            for (const entry of await window.FrameStudioLibrary.listDeleted()) {
                try { entry.effect = core.normalize(entry.effect); entry.effect.category = core.categories[2]; deletedEffects.set(entry.id, entry); } catch {}
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
        if (effect.category === core.categories[2] && deletedEffects.has(effect.id)) { const template = effect.template; await setImage(null); effect = core.createEffect(template); }
        const rename = renamed.get(effect.id); if (effect.category === core.categories[2] && rename?.original === effect.name) effect.name = rename.name;
        if (effect.appearance.image && !imageBytes) { const preset = core.catalog.find(item => item.id === effect.id); if (preset?.image) { try { await setImage(new Uint8Array(await (await fetch(preset.image)).arrayBuffer())); } catch { toast('Preset image could not load. Choose the matching PNG.', true); } } }
        activeCategory = effect.category;
        if (effect.category === core.categories[2]) await save();
        renderSettings(); renderCatalog(); sync(); requestAnimationFrame(previewFrame); generateThumbnails();
    }
    start().then(connectServer);
})();
