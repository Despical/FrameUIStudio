/* FrameUI Studio - Copyright (C) 2026 Berke Akçen. All rights reserved. Proprietary and confidential. */
(function (scope) {
    'use strict';
    const VERSION = 1;
    const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
    const MAX_IMAGE_SIZE = 2048;
    const utf8 = new TextEncoder();
    const decoder = new TextDecoder('utf-8', { fatal: true });
    const clone = value => JSON.parse(JSON.stringify(value));
    const catalog = [];
    const categories = ['Animations', 'Presets', 'My Effects'];
    const designIds = new Set(['overworld', 'frameui', 'clean-loader', 'segmented-loader', 'orbit-loader', 'terminal-loader', 'split-loader', 'pulse-loader', 'nether-forge', 'cherry-valley']);
    function categoryFor(id, configured) {
        if (configured === categories[2] || configured === 'Efektlerim') return categories[2];
        if (designIds.has(id)) return categories[1];
        return catalog.some(item => item.id === id && !item.definition) ? categories[0] : categories[2];
    }
    function copyId(id, used) {
        const base = ('custom-' + id.replace(/^custom-/, '')).slice(0, 43).replace(/-$/, '');
        let candidate = base, suffix = 2;
        while (used.includes(candidate)) candidate = base + '-' + suffix++;
        return candidate;
    }
    function uniqueName(preferred, used) {
        const names = new Set(used.map(name => name.trim().toLowerCase()));
        let candidate = preferred.slice(0, 64), suffix = 2;
        const base = preferred.replace(/( · (?:Kopya|Copy))(?: \d+)?$/, '$1');
        while (names.has(candidate.trim().toLowerCase())) {
            const ending = ' ' + suffix++;
            candidate = base.slice(0, 64 - ending.length).trimEnd() + ending;
        }
        return candidate;
    }
    function userCopy(source, used, names = []) {
        const result = clone(source);
        result.id = copyId(source.id, used);
        result.name = uniqueName(source.name.replace(/ · (?:Kopya|Copy)(?: \d+)?$/, '').slice(0, 57) + ' · Copy', names);
        result.category = categories[2];
        if (result.appearance.image) result.appearance.image = `images/${result.id}.png`;
        return result;
    }
    function durationTiming(timing, seconds) {
        if (!Number.isFinite(seconds) || seconds < .05 || seconds > 60) throw new Error('Duration must be between 0.05 and 60 seconds.');
        const ticks = Math.round(seconds * 20), total = timing['minimum-ticks'] + timing['fade-out-ticks'];
        const out = Math.max(1, Math.min(ticks, Math.round(timing['fade-out-ticks'] / total * ticks)));
        const minimum = ticks - out;
        return {
            'fade-in-ticks': Math.min(minimum, Math.round(timing['fade-in-ticks'] / total * ticks)),
            'minimum-ticks': minimum,
            'maximum-ticks': Math.min(1200, Math.max(minimum, Math.round(timing['maximum-ticks'] / total * ticks))),
            'fade-out-ticks': out
        };
    }
    function timingSeconds(timing) {
        return {
            entrance: timing['fade-in-ticks'] / 20,
            hold: (timing['minimum-ticks'] - timing['fade-in-ticks']) / 20,
            exit: timing['fade-out-ticks'] / 20,
            wait: (timing['maximum-ticks'] - timing['minimum-ticks']) / 20
        };
    }
    function phaseTiming(timing, phase, seconds) {
        if (!['entrance', 'hold', 'exit', 'wait'].includes(phase)) throw new Error('Unknown timing phase.');
        const minimum = phase === 'exit' ? .05 : 0;
        if (!Number.isFinite(seconds) || seconds < minimum || seconds > 60) {
            throw new Error(`Time must be between ${minimum} and 60 seconds.`);
        }
        const parts = timingSeconds(timing);
        parts[phase] = Math.round(seconds * 20) / 20;
        const entrance = Math.round(parts.entrance * 20), hold = Math.round(parts.hold * 20);
        const wait = Math.round(parts.wait * 20);
        if (entrance + hold + wait > 1200) {
            throw new Error('Fade in, hold and extra loading wait must fit within 60 seconds.');
        }
        return { 'fade-in-ticks': entrance, 'minimum-ticks': entrance + hold,
            'maximum-ticks': entrance + hold + wait, 'fade-out-ticks': Math.round(parts.exit * 20) };
    }
    function disabledSettings(effect, hasImage) {
        const disabled = {}, e = effect.elements, a = effect.appearance;
        const template = e.background === 'template', none = e.background === 'none';
        const overlay = e.progress !== 'none' || e.decoration !== 'none';
        const mapped = template && a.palette === 'custom';
        function block(paths, reason) { for (const path of paths) if (!disabled[path]) disabled[path] = reason; }
        if (!template) block(['appearance.palette'], 'Palette mode only affects Shader template backgrounds. Other layouts use their colors directly.');
        if (!(mapped || !template && !none)) block(['appearance.background'], none ? 'Background is None, so no base background color is drawn.' : 'Choose Custom colors to edit the shader background color.');
        if (!(mapped || overlay || !none && !template && e.background !== 'solid' || !template && effect.captions.enabled && effect.captions.title.trim())) {
            block(['appearance.primary'], template ? 'Primary is unused with the Original shader palette and no loading indicator or decoration. Choose Custom colors or add an element that uses it.' : 'No visible title, indicator, decoration or background element uses the primary color.');
        }
        if (!(mapped || !template && effect.captions.enabled && effect.captions.subtitle.trim())) {
            block(['appearance.secondary'], 'Accent is unused here. It colors the subtitle on composed screens, or the shader when Custom colors is selected.');
        }
        if (!template) block(['appearance.intensity'], 'Brightness adjusts the Shader template background. This background layout does not use that setting.');
        if (none || e.background === 'solid') {
            if (!overlay && !(hasImage && a['image-motion'] === 'panorama')) block(['appearance.speed'], 'There is no moving background, indicator, decoration or panorama image using animation speed.');
        }
        if (!effect.captions.enabled) block(['captions.title', 'captions.subtitle', 'captions.join-detail', 'captions.teleport-detail', 'captions.preview-detail', 'elements.text-x', 'elements.text-y', 'elements.text-scale', 'elements.text-animation'], 'Show captions is off. Enable it to edit the on-screen text and its placement.');
        if (!hasImage) block(['appearance.image-fit', 'appearance.image-opacity', 'appearance.image-motion', 'elements.image-scale', 'elements.image-x', 'elements.image-y', 'elements.image-animation', 'elements.image-delay'], 'Add an image in Design before adjusting its appearance, placement or movement.');
        if (e['image-animation'] === 'none') block(['elements.image-delay'], 'Image entrance is None (instant), so there is no entrance animation to delay.');
        if (effect.timing['fade-in-ticks'] === 0) block(['elements.image-delay'], 'Fade in is zero seconds, so there is no entrance phase to delay.');
        if (e.progress === 'none') block(['elements.progress-x', 'elements.progress-y', 'elements.progress-width', 'elements.progress-scale'], 'Loading indicator is None. Choose an indicator style to adjust its placement and size.');
        return disabled;
    }
    const modes = ['SURVIVAL', 'CREATIVE', 'ADVENTURE', 'SPECTATOR'];
    const triggers = ['join', 'teleport', 'world-change', 'command'];
    const addons = [
        { id: 'essentialsx', name: 'EssentialsX', events: { 'essentials-teleport': 'Any teleport', 'essentials-home': 'Home', 'essentials-warp': 'Warp', 'essentials-spawn': 'Spawn', 'essentials-back': 'Back', 'essentials-tpa': 'Accepted TPA' } },
        { id: 'huskhomes', name: 'HuskHomes', events: { 'huskhomes-teleport': 'Any teleport', 'huskhomes-home': 'Home', 'huskhomes-warp': 'Warp', 'huskhomes-spawn': 'Spawn', 'huskhomes-back': 'Back', 'huskhomes-tpa': 'Accepted TPA', 'huskhomes-rtp': 'Random teleport' } },
        { id: 'cmi', name: 'CMI', events: { 'cmi-teleport': 'Any teleport', 'cmi-home': 'Home', 'cmi-warp': 'Warp', 'cmi-spawn': 'Spawn', 'cmi-back': 'Back', 'cmi-tpa': 'Accepted TPA', 'cmi-rtp': 'Random teleport' } },
        { id: 'betterrtp', name: 'BetterRTP', events: { 'betterrtp-teleport': 'Random teleport' } },
        { id: 'multiverse-core', name: 'Multiverse-Core', events: { 'multiverse-teleport': 'World / destination teleport' } },
        { id: 'multiverse-portals', name: 'Multiverse-Portals', events: { 'multiverse-portal': 'Portal travel' } },
        { id: 'towny', name: 'Towny', events: { 'towny-town-spawn': 'Town spawn', 'towny-nation-spawn': 'Nation spawn', 'towny-outpost': 'Outpost' } },
        { id: 'lands', name: 'Lands', events: { 'lands-spawn': 'Land spawn' } },
        { id: 'superiorskyblock2', name: 'SuperiorSkyblock2', events: { 'superiorskyblock-create': 'Create island', 'superiorskyblock-home': 'Island home', 'superiorskyblock-visit': 'Visit island', 'superiorskyblock-warp': 'Island warp' } }
    ];
    const automaticTriggers = ['join', 'teleport', 'world-change', ...addons.flatMap(addon => Object.keys(addon.events))];
    const causes = ['ENDER_PEARL', 'COMMAND', 'PLUGIN', 'NETHER_PORTAL', 'END_PORTAL', 'SPECTATE', 'END_GATEWAY', 'CONSUMABLE_EFFECT', 'CHORUS_FRUIT', 'DISMOUNT', 'EXIT_BED', 'UNKNOWN'];
    function configureCatalog(templates) { catalog.splice(0, catalog.length, ...templates); }
    function createEffect(templateId = 'aurora') {
        const template = catalog.find(entry => entry.id === templateId) || catalog[0];
        if (!template) throw new Error('The template catalog is unavailable.');
        if (template.definition) return normalize(template.definition);
        return {
            id: template.id, name: template.name, category: template.category, template: template.id,
            enabled: true, weight: 1, priority: 0, 'play-on': [],
            timing: { 'fade-in-ticks': template.fadeIn, 'minimum-ticks': template.minimum, 'maximum-ticks': template.id === 'loading' ? Math.max(template.minimum, 100 - template.fadeOut) : template.minimum, 'fade-out-ticks': template.fadeOut },
            captions: { enabled: template.captions, title: template.id === 'loading' ? 'Preparing your world' : template.name, subtitle: template.id === 'loading' ? 'Your next adventure is almost ready' : template.id === 'aurora' ? 'A quiet moment between worlds' : 'Searching the horizon', 'join-detail': 'Joining the server', 'teleport-detail': 'Travelling to {world}', 'preview-detail': '{effect} preview' },
            presentation: { 'show-hands': false, 'hide-hud': true, 'block-movement': true, 'block-interactions': true },
            appearance: { palette: 'original', background: '#081221', primary: '#7faeff', secondary: '#c2d6ff', speed: 1, intensity: 1, image: '', 'image-fit': 'cover', 'image-opacity': 1, 'image-motion': 'still', 'title-motion': 'still' },
            elements: { background: 'template', 'image-animation': 'inherit', 'image-scale': 1, 'image-x': 0.5, 'image-y': 0.5, 'image-delay': 0, 'text-animation': 'still', 'text-y': 0.64, 'text-scale': 1, progress: 'none', 'progress-x': 0.5, 'progress-y': 0.8, 'progress-width': 0.34, decoration: 'none', 'text-x': 0.5, 'progress-scale': 1, 'image-stretch-x': 1, 'image-stretch-y': 1, 'text-stretch-x': 1, 'text-stretch-y': 1 },
            filters: { permission: '', 'deny-permissions': [], worlds: { include: [], exclude: [] }, 'source-worlds': { include: [], exclude: [] }, 'addon-targets': { include: [], exclude: [] }, 'game-modes': { include: [], exclude: [] }, 'teleport-causes': [], triggers: [...triggers], distance: { min: 0, max: -1 }, height: { min: -30000000, max: 30000000 }, time: { min: 0, max: 23999 }, weather: [], 'cooldown-ticks': 0 }
        };
    }
    function merge(defaults, input, path = '') {
        if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error(`${path || 'Effect'} must be a mapping.`);
        const result = clone(defaults);
        for (const key of Object.keys(input)) {
            if (!Object.hasOwn(defaults, key)) throw new Error(`Unknown setting: ${path}${key}.`);
            const value = input[key], base = defaults[key];
            result[key] = base && typeof base === 'object' && !Array.isArray(base) ? merge(base, value, `${path}${key}.`) : value;
        }
        return result;
    }
    function normalize(input) {
        if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('The effect must be a YAML mapping.');
        const template = input.template || input.id || 'aurora';
        if (!catalog.some(entry => entry.id === template && !entry.definition)) throw new Error(`Unknown template: ${template}. Choose one of the 50 built-in templates.`);
        const result = merge(createEffect(template), input);
        result.category = categoryFor(result.id, result.category);
        if (!Array.isArray(result['play-on'])) throw new Error('Automatic playback must be a list.');
        result['play-on'] = result['play-on'].map(value => typeof value === 'string' ? value.toLowerCase().replaceAll('_', '-') : value);
        for (const key of ['include', 'exclude']) {
            if (!Array.isArray(result.filters['game-modes'][key])) throw new Error(`Game modes ${key} must be a list.`);
            result.filters['game-modes'][key] = result.filters['game-modes'][key].map(value => typeof value === 'string' ? value.toUpperCase() : value);
        }
        for (const key of ['teleport-causes', 'triggers', 'weather']) {
            if (!Array.isArray(result.filters[key])) throw new Error(`${key} must be a list.`);
            result.filters[key] = result.filters[key].map(value => typeof value === 'string' ? key === 'teleport-causes' ? value.toUpperCase().replaceAll('-', '_') : value.toLowerCase().replaceAll('_', '-') : value);
        }
        validate(result);
        return result;
    }
    function validate(effect) {
        const fail = message => { throw new Error(message); };
        const string = (value, label, max = 128) => { if (typeof value !== 'string' || value.length > max || /[\u0000-\u001f\u007f-\u009f]/.test(value)) fail(`${label} must be text of at most ${max} characters, without control characters.`); };
        const number = (value, label, min, max, integer = true) => { if (typeof value !== 'number' || !Number.isFinite(value) || (integer && !Number.isInteger(value)) || value < min || value > max) fail(`${label} must be ${integer ? 'an integer' : 'a number'} from ${min} to ${max}.`); };
        const list = (value, label, allowed) => { if (!Array.isArray(value) || value.length > 128 || value.some(item => typeof item !== 'string' || item.length > (allowed ? 64 : 128) || !item.trim() || /[\u0000-\u001f\u007f-\u009f]/.test(item) || (allowed && !allowed.includes(item)))) fail(`${label} contains an invalid value.`); };
        if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(effect.id) || effect.id.length > 48) fail('ID must contain up to 48 lowercase letters, numbers and single hyphens.');
        string(effect.name, 'Name', 64); if (!effect.name.trim()) fail('Name cannot be empty.');
        string(effect.category, 'Category', 40); if (!categories.includes(effect.category)) fail('Choose one of the three library categories.');
        if (!catalog.some(entry => entry.id === effect.template && !entry.definition)) fail('Select a built-in template.');
        if (typeof effect.enabled !== 'boolean') fail('Enabled must be true or false.');
        list(effect['play-on'], 'Automatic playback', automaticTriggers);
        if (new Set(effect['play-on']).size !== effect['play-on'].length) fail('Automatic playback contains duplicate events.');
        number(effect.weight, 'Weight', 1, 10000); number(effect.priority, 'Priority', -10000, 10000);
        const t = effect.timing;
        number(t['fade-in-ticks'], 'Fade in', 0, 1200); number(t['minimum-ticks'], 'Minimum duration', 0, 1200); number(t['maximum-ticks'], 'Maximum duration', 0, 1200); number(t['fade-out-ticks'], 'Fade out', 1, 1200);
        if (t['minimum-ticks'] < t['fade-in-ticks']) fail('Minimum duration must be at least the fade-in duration.');
        if (t['maximum-ticks'] < t['minimum-ticks']) fail('Maximum duration must be at least the minimum duration.');
        for (const key of ['title', 'subtitle', 'join-detail', 'teleport-detail', 'preview-detail']) string(effect.captions[key], `Caption ${key}`, key === 'title' ? 64 : key === 'subtitle' ? 96 : 128);
        if (typeof effect.captions.enabled !== 'boolean') fail('Captions enabled must be true or false.');
        for (const [key, value] of Object.entries(effect.presentation)) if (typeof value !== 'boolean') fail(`${key} must be true or false.`);
        if (effect.presentation['show-hands'] && effect.presentation['hide-hud']) fail('Show hands requires hide HUD to be disabled.');
        const a = effect.appearance;
        if (!['original', 'custom'].includes(a.palette)) fail('Palette must be original or custom.');
        for (const key of ['background', 'primary', 'secondary']) if (!/^#[0-9a-f]{6}$/i.test(a[key])) fail(`${key} must be a six-digit hexadecimal color.`);
        number(a.speed, 'Animation speed', 0.05, 8, false); number(a.intensity, 'Intensity', 0, 4, false); number(a['image-opacity'], 'Image opacity', 0, 1, false);
        if (!['cover', 'contain'].includes(a['image-fit'])) fail('Image fit must be cover or contain.');
        if (!['still', 'panorama', 'page'].includes(a['image-motion'])) fail('Invalid image motion.');
        if (!['still', 'grow'].includes(a['title-motion'])) fail('Invalid title motion.');
        const e = effect.elements;
        const choice = (key, values) => { if (!values.includes(e[key])) fail(`Invalid element ${key}.`); };
        choice('background', ['template', 'solid', 'split', 'grid', 'terminal', 'pulse', 'none']);
        choice('image-animation', ['inherit', 'fade', 'grow', 'slide-up', 'slide-left', 'wipe', 'page', 'slide-right', 'slide-down', 'none']);
        choice('text-animation', ['still', 'grow', 'slide-up', 'slide-down', 'slide-left', 'slide-right', 'none']);
        choice('progress', ['none', 'bar', 'segments', 'dots', 'ring']);
        choice('decoration', ['none', 'embers', 'petals', 'scan', 'pulse']);
        for (const key of ['image-x', 'image-y', 'text-x']) number(e[key], key, 0, 1, false);
        for (const key of ['text-y', 'progress-x', 'progress-y']) number(e[key], key, 0.1, 0.9, false);
        number(e['image-scale'], 'Image scale', 0.01, 10, false); number(e['image-delay'], 'Image delay', 0, 0.8, false);
        for (const key of ['image-stretch-x', 'image-stretch-y', 'text-stretch-x', 'text-stretch-y']) number(e[key], key, .01, 10, false);
        number(e['progress-scale'], 'Indicator scale', 0.05, 20, false);
        number(e['text-scale'], 'Text scale', 0.01, 10, false); number(e['progress-width'], 'Indicator width', 0.01, 2, false);
        string(a.image, 'Image path', 180);
        if (a.image && (!a.image.startsWith('images/') || !/\.png$/i.test(a.image) || /[\\:\u0000]/.test(a.image) || a.image.split('/').some(part => !part.trim() || part === '.' || part === '..'))) fail('Image must be a safe PNG path inside images/, such as images/my-effect.png.');
        const f = effect.filters;
        string(f.permission, 'Permission', 128); list(f['deny-permissions'], 'Denied permissions');
        if (f.permission && !/^[a-zA-Z0-9_.:*\-]+$/.test(f.permission)) fail('Permission contains an invalid node.');
        if (f['deny-permissions'].some(permission => !/^[a-zA-Z0-9_.:*\-]+$/.test(permission))) fail('Denied permissions contain an invalid node.');
        for (const group of ['worlds', 'source-worlds']) { list(f[group].include, `${group} include`); list(f[group].exclude, `${group} exclude`); }
        list(f['addon-targets'].include, 'Included addon destinations'); list(f['addon-targets'].exclude, 'Excluded addon destinations');
        list(f['game-modes'].include, 'Included game modes', modes); list(f['game-modes'].exclude, 'Excluded game modes', modes); list(f['teleport-causes'], 'Teleport causes', causes); list(f.triggers, 'Triggers', [...triggers, ...automaticTriggers]); list(f.weather, 'Weather', ['clear', 'rain', 'thunder']);
        number(f.distance.min, 'Minimum distance', 0, 100000000, false); number(f.distance.max, 'Maximum distance', -1, 100000000, false);
        if (f.distance.max < 0 && f.distance.max !== -1) fail('Maximum distance uses -1 for no upper limit.');
        if (f.distance.max !== -1 && f.distance.max < f.distance.min) fail('Maximum distance must be -1 or at least the minimum distance.');
        for (const key of ['min', 'max']) number(f.height[key], `Height ${key}`, -30000000, 30000000, false);
        if (f.height.max < f.height.min) fail('Maximum height must be at least the minimum height.');
        for (const key of ['min', 'max']) number(f.time[key], `Time ${key}`, 0, 23999);
        number(f['cooldown-ticks'], 'Cooldown', 0, 1728000);
        return effect;
    }
    // The same normalized coordinates are exported to the plugin. One transform can be committed
    // as one history entry by any input surface (pointer, touch or keyboard).
    function transformElement(elements, kind, dx, dy, corner = '', rect = null) {
        if (!['image', 'text', 'progress'].includes(kind)) throw new Error('Unknown canvas element.');
        if (![dx, dy].every(Number.isFinite)) throw new Error('Invalid canvas movement.');
        const next = clone(elements);
        const xKey = kind + '-x', yKey = kind + '-y';
        const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
        if (!corner) { next[xKey] += dx; next[yKey] += dy; }
        else if (['n','s','e','w'].includes(corner)) {
            if (!rect || rect.width <= 0 || rect.height <= 0) throw new Error('Invalid resize bounds.');
            const horizontal = corner === 'e' || corner === 'w', sign = corner === 'e' || corner === 's' ? 1 : -1;
            const dimension = horizontal ? rect.width : rect.height, delta = horizontal ? dx : dy;
            const key = kind === 'progress' ? (horizontal ? 'progress-width' : 'progress-scale') : kind + '-stretch-' + (horizontal ? 'x' : 'y');
            const min = kind === 'progress' ? (horizontal ? .01 : .05) : .01;
            const max = kind === 'progress' ? (horizontal ? 2 : 20) : 10;
            const previous = elements[key] || 1;
            const ratio = clamp(1 + sign * delta / dimension, min / previous, max / previous);
            next[key] = previous * ratio;
            const position = horizontal ? xKey : yKey, start = horizontal ? rect.x : rect.y;
            const anchor = start + (sign < 0 ? dimension : 0);
            if (!(kind === 'progress' && !horizontal)) {
                next[position] = anchor + sign * dimension * ratio / 2 - (start + dimension / 2 - elements[position]) * ratio;
            }
        }
        else {
            if (!['nw','ne','sw','se'].includes(corner) || !rect || rect.width <= 0 || rect.height <= 0) throw new Error('Invalid resize handle.');
            const sx = corner.endsWith('e') ? 1 : -1, sy = corner.startsWith('s') ? 1 : -1;
            let ratio = (rect.width * (rect.width + sx * dx) + rect.height * (rect.height + sy * dy)) / (rect.width ** 2 + rect.height ** 2);
            const scaleKey = kind === 'progress' ? 'progress-scale' : kind + '-scale';
            const min = kind === 'progress' ? .05 : .01, max = kind === 'progress' ? 20 : 10;
            let lower = min / elements[scaleKey], upper = max / elements[scaleKey];
            if (kind === 'progress') { lower = Math.max(lower, .01 / elements['progress-width']); upper = Math.min(upper, 2 / elements['progress-width']); }
            ratio = clamp(ratio, lower, upper);
            next[scaleKey] *= ratio;
            if (kind === 'progress') next['progress-width'] *= ratio;
            const anchorX = rect.x + (sx < 0 ? rect.width : 0), anchorY = rect.y + (sy < 0 ? rect.height : 0);
            const centerX = anchorX + sx * rect.width * ratio / 2, centerY = anchorY + sy * rect.height * ratio / 2;
            next[xKey] = centerX - (rect.x + rect.width / 2 - elements[xKey]) * ratio;
            next[yKey] = centerY - (rect.y + rect.height / 2 - elements[yKey]) * ratio;
        }
        const minPosition = kind === 'progress' ? .1 : 0;
        next[xKey] = clamp(next[xKey], minPosition, kind === 'progress' ? .9 : 1);
        next[yKey] = clamp(next[yKey], kind === 'image' ? 0 : .1, kind === 'image' ? 1 : .9);
        for (const key of Object.keys(next)) if (typeof next[key] === 'number') next[key] = Math.round(next[key] * 10000) / 10000;
        return next;
    }

    // Snap the visible bounds, including the caption group's offset from its anchor.
    // Tolerance is in screen pixels so the magnetic area feels the same at any viewport size.
    function snapElement(before, candidate, kind, rect, width, height, tolerance = 8) {
        const next = clone(candidate), guides = {x: false, y: false};
        for (const [axis, size, dimension] of [['x', width, 'width'], ['y', height, 'height']]) {
            const key = kind + '-' + axis;
            const center = rect[axis] + rect[dimension] / 2 + candidate[key] - before[key];
            const offset = .5 - center;
            if (Math.abs(offset) * size > tolerance) continue;
            const minimum = kind === 'progress' || (kind === 'text' && axis === 'y') ? .1 : 0;
            const maximum = minimum === .1 ? .9 : 1;
            const snapped = next[key] + offset;
            if (snapped < minimum || snapped > maximum) continue;
            next[key] = Math.round(snapped * 1000000) / 1000000;
            guides[axis] = true;
        }
        return {elements: next, guides};
    }

    function toYaml(effect) {
        validate(effect);
        function mapping(value, indent) {
            return Object.entries(value).map(([key, entry]) => {
                const prefix = ' '.repeat(indent) + key + ':';
                if (entry && typeof entry === 'object' && !Array.isArray(entry)) return prefix + '\n' + mapping(entry, indent + 2);
                return prefix + ' ' + JSON.stringify(entry);
            }).join('\n');
        }
        return '# FrameUI effect · generated by FrameUI Studio\n# Import with Studio, or install in plugins/FrameUI/effects/ and run /frameui reload\n' + mapping(effect, 0) + '\n';
    }
    function stripComment(line) {
        let quote = '', escaped = false;
        for (let i = 0; i < line.length; i++) {
            const c = line[i];
            if (escaped) { escaped = false; continue; }
            if (c === '\\' && quote === '"') { escaped = true; continue; }
            if (quote) { if (c === quote) quote = ''; }
            else if (c === '"' || c === "'") quote = c;
            else if (c === '#' && (i === 0 || /\s/.test(line[i - 1]))) return line.slice(0, i).trimEnd();
        }
        return line.trimEnd();
    }
    function parseScalar(text, line) {
        const error = () => { throw new Error(`Unsupported YAML value on line ${line}. Use plain values, quoted text or inline lists.`); };
        if (/^[&*!|>]/.test(text)) error();
        if (text === 'true') return true; if (text === 'false') return false;
        if (text === 'null' || text === '~') return null;
        if (/^-?(?:\d+\.?\d*|\d*\.\d+)$/.test(text)) return Number(text);
        if (text.startsWith('"')) { try { return JSON.parse(text); } catch { error(); } }
        if (text.startsWith("'")) { if (!text.endsWith("'")) error(); return text.slice(1, -1).replace(/''/g, "'"); }
        if (text.startsWith('[')) {
            if (!text.endsWith(']')) error();
            const body = text.slice(1, -1).trim(); if (!body) return [];
            const parts = []; let part = '', quote = '', escaped = false;
            for (const c of body) {
                if (escaped) { part += c; escaped = false; continue; }
                if (c === '\\' && quote === '"') { part += c; escaped = true; continue; }
                if (quote) { if (c === quote) quote = ''; part += c; }
                else if (c === '"' || c === "'") { quote = c; part += c; }
                else if (c === ',') { parts.push(parseScalar(part.trim(), line)); part = ''; }
                else part += c;
            }
            if (quote || !part.trim()) error(); parts.push(parseScalar(part.trim(), line)); return parts;
        }
        if (!text || /[\[\]{}]|:\s/.test(text)) error();
        return text;
    }
    function fromYaml(text) {
        if (typeof text !== 'string' || text.length > 256000) throw new Error('YAML must be smaller than 256 KB.');
        const lines = text.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n').split('\n').map((source, index) => ({ text: stripComment(source), line: index + 1 })).filter(entry => entry.text.trim() && !['---', '...'].includes(entry.text.trim()));
        for (const entry of lines) { if (/\t/.test(entry.text)) throw new Error(`Use spaces instead of tabs on line ${entry.line}.`); entry.indent = entry.text.length - entry.text.trimStart().length; entry.body = entry.text.trimStart(); }
        let index = 0;
        function block(indent, depth = 0) {
            if (depth > 8) throw new Error('YAML nesting is too deep.');
            const array = lines[index]?.body.startsWith('- '), result = array ? [] : {};
            while (index < lines.length && lines[index].indent === indent) {
                if (array && !lines[index].body.startsWith('- ')) break;
                const entry = lines[index++];
                if (array) {
                    if (!entry.body.startsWith('- ')) throw new Error(`Invalid list on line ${entry.line}.`);
                    result.push(parseScalar(entry.body.slice(2).trim(), entry.line));
                } else {
                    const match = /^([a-zA-Z0-9_-]+):(?:\s+(.*))?$/.exec(entry.body);
                    if (!match || ['__proto__', 'prototype', 'constructor'].includes(match[1])) throw new Error(`Invalid setting on line ${entry.line}.`);
                    const key = match[1]; if (Object.hasOwn(result, key)) throw new Error(`Duplicate setting ${key} on line ${entry.line}.`);
                    if (match[2] !== undefined) result[key] = parseScalar(match[2].trim(), entry.line);
                    else if (index < lines.length && lines[index].indent > indent) result[key] = block(lines[index].indent, depth + 1);
                    else if (index < lines.length && lines[index].indent === indent && lines[index].body.startsWith('- ')) result[key] = block(indent, depth + 1);
                    else result[key] = {};
                }
                if (index < lines.length && lines[index].indent > indent) throw new Error(`Unexpected indentation on line ${lines[index].line}.`);
            }
            return result;
        }
        if (!lines.length || lines[0].indent !== 0) throw new Error('YAML must start with a setting at the left edge.');
        const parsed = block(0); if (index !== lines.length) throw new Error(`Invalid indentation on line ${lines[index].line}.`);
        return normalize(parsed);
    }
    const crcTable = Uint32Array.from({ length: 256 }, (_, n) => { for (let k = 0; k < 8; k++) n = (n & 1) ? 0xedb88320 ^ (n >>> 1) : n >>> 1; return n >>> 0; });
    function crc32(bytes) { let crc = 0xffffffff; for (const byte of bytes) crc = crcTable[(crc ^ byte) & 255] ^ (crc >>> 8); return (crc ^ 0xffffffff) >>> 0; }
    function safeEntry(name) { return /^(?:effects\/[a-z0-9]+(?:-[a-z0-9]+)*\.ya?ml|images\/[^\\:\u0000]+\.png|INSTALL\.txt)$/i.test(name) && name.length <= 180 && name.split('/').every(part => part.trim() && part !== '.' && part !== '..'); }
    function zip(entries) {
        const localParts = [], centralParts = []; let offset = 0, centralSize = 0;
        for (const [name, data] of Object.entries(entries)) {
            if (!safeEntry(name)) throw new Error(`Unsafe ZIP entry: ${name}.`);
            const path = utf8.encode(name), bytes = typeof data === 'string' ? utf8.encode(data) : data, crc = crc32(bytes);
            const local = new Uint8Array(30 + path.length), lv = new DataView(local.buffer);
            lv.setUint32(0, 0x04034b50, true); lv.setUint16(4, 20, true); lv.setUint16(6, 0x0800, true); lv.setUint32(14, crc, true); lv.setUint32(18, bytes.length, true); lv.setUint32(22, bytes.length, true); lv.setUint16(26, path.length, true); local.set(path, 30);
            localParts.push(local, bytes);
            const central = new Uint8Array(46 + path.length), cv = new DataView(central.buffer);
            cv.setUint32(0, 0x02014b50, true); cv.setUint16(4, 20, true); cv.setUint16(6, 20, true); cv.setUint16(8, 0x0800, true); cv.setUint32(16, crc, true); cv.setUint32(20, bytes.length, true); cv.setUint32(24, bytes.length, true); cv.setUint16(28, path.length, true); cv.setUint32(42, offset, true); central.set(path, 46);
            centralParts.push(central); offset += local.length + bytes.length; centralSize += central.length;
        }
        const footer = new Uint8Array(22), fv = new DataView(footer.buffer);
        fv.setUint32(0, 0x06054b50, true); fv.setUint16(8, centralParts.length, true); fv.setUint16(10, centralParts.length, true); fv.setUint32(12, centralSize, true); fv.setUint32(16, offset, true);
        const result = new Uint8Array(offset + centralSize + 22); let cursor = 0;
        for (const part of [...localParts, ...centralParts, footer]) { result.set(part, cursor); cursor += part.length; }
        return result;
    }
    async function unzip(bytes) {
        if (!(bytes instanceof Uint8Array) || bytes.length > 10 * 1024 * 1024) throw new Error('ZIP must be smaller than 10 MB.');
        const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength), entries = {}; let offset = 0, count = 0, totalSize = 0;
        while (offset + 4 <= bytes.length && view.getUint32(offset, true) === 0x04034b50) {
            if (offset + 30 > bytes.length || ++count > 128) throw new Error('Invalid ZIP archive.');
            const flags = view.getUint16(offset + 6, true), method = view.getUint16(offset + 8, true), crc = view.getUint32(offset + 14, true), compressed = view.getUint32(offset + 18, true), size = view.getUint32(offset + 22, true), nameLength = view.getUint16(offset + 26, true), extra = view.getUint16(offset + 28, true);
            if (flags & 9) throw new Error('Use an unencrypted ZIP without data descriptors, or import the YAML directly.');
            totalSize += size; if (totalSize > 12 * 1024 * 1024) throw new Error('ZIP contents are too large.');
            const start = offset + 30 + nameLength + extra, end = start + compressed;
            if (end > bytes.length) throw new Error('ZIP archive is incomplete.');
            const name = decoder.decode(bytes.slice(offset + 30, offset + 30 + nameLength));
            if (!safeEntry(name) || Object.hasOwn(entries, name)) throw new Error(`Unsafe or duplicate ZIP entry: ${name}.`);
            let data = bytes.slice(start, end);
            if (method === 8) {
                try {
                    const reader = new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw')).getReader(), chunks = []; let length = 0;
                    while (true) { const next = await reader.read(); if (next.done) break; length += next.value.length; if (length > size || length > 12 * 1024 * 1024) { await reader.cancel(); throw new Error('ZIP data exceeds its declared size.'); } chunks.push(next.value); }
                    data = new Uint8Array(length); let position = 0; for (const chunk of chunks) { data.set(chunk, position); position += chunk.length; }
                } catch (error) { if (/declared size/.test(error.message)) throw error; throw new Error('This browser cannot read compressed ZIP files. Import YAML, or a ZIP exported by Studio.'); }
            } else if (method !== 0) throw new Error('Unsupported ZIP compression. Import the YAML file directly.');
            if (data.length !== size || crc32(data) !== crc) throw new Error(`ZIP integrity check failed for ${name}.`);
            entries[name] = data; offset = end;
        }
        if (!count || offset + 4 > bytes.length || ![0x02014b50, 0x06054b50].includes(view.getUint32(offset, true))) throw new Error('Invalid ZIP archive.');
        return entries;
    }
    function validatePng(bytes) {
        if (bytes.length > MAX_IMAGE_BYTES || bytes.length < 33 || ![137, 80, 78, 71, 13, 10, 26, 10].every((value, index) => bytes[index] === value)) throw new Error('The image must be a PNG smaller than 8 MB.');
        const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength), width = v.getUint32(16), height = v.getUint32(20);
        if (v.getUint32(8) !== 13 || v.getUint32(12) !== 0x49484452) throw new Error('The image has an invalid PNG header.');
        if (!width || !height || width > MAX_IMAGE_SIZE || height > MAX_IMAGE_SIZE) throw new Error('PNG dimensions must be 1-2048 pixels.');
        return { width, height };
    }
    const api = { VERSION, MAX_IMAGE_BYTES, MAX_IMAGE_SIZE, catalog, categories, categoryFor, copyId, uniqueName, userCopy, durationTiming, timingSeconds, phaseTiming, disabledSettings, modes, triggers, addons, automaticTriggers, causes, configureCatalog, clone, createEffect, normalize, validate, transformElement, snapElement, toYaml, fromYaml, crc32, zip, unzip, validatePng, utf8, decoder };
    if (typeof module !== 'undefined' && module.exports) module.exports = api; else scope.FrameStudioCore = api;
})(typeof window !== 'undefined' ? window : globalThis);
