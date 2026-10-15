/* FrameUI Studio — Copyright (C) 2026 Berke Akçen. GPL-3.0-or-later. */
(function () {
    'use strict';
    const core = window.FrameStudioCore;
    const dropdowns = window.FrameStudioDropdowns;
    core.configureCatalog(window.FrameStudioCatalog);
    const $ = id => document.getElementById(id);
    const storageKey = 'frameui-studio-v1';
    const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
    let effect = core.createEffect('frameui'), imageBytes = null, imageUrl = '', imageElement = null;
    let undo = [], redo = [], playing = !reducedMotion, playTick = 24, lastFrame = 0, saveTimer, toastTimer, rawDirty = false;
    const thumbs = new Map();
    function element(tag, classes, text) { const node = document.createElement(tag); if (classes) node.className = classes; if (text !== undefined) node.textContent = text; return node; }
    function icon(id) { const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); const use = document.createElementNS('http://www.w3.org/2000/svg', 'use'); use.setAttribute('href', `#icon-${id}`); svg.append(use); return svg; }
    function toast(message, error = false) { clearTimeout(toastTimer); $('toast').textContent = message; $('toast').classList.toggle('error', error); $('toast').hidden = false; toastTimer = setTimeout(() => { $('toast').hidden = true; }, error ? 6500 : 3500); }
    function pathGet(path) { return path.split('.').reduce((value, key) => value[key], effect); }
    function pathSet(path, value) { const parts = path.split('.'); const key = parts.pop(); const owner = parts.reduce((entry, part) => entry[part], effect); owner[key] = value; }
    function snapshot() { return { effect: core.clone(effect), image: imageBytes }; }
    function remember() { undo.push(snapshot()); if (undo.length > 32) undo.shift(); redo.length = 0; }
    function snapshotMatches(a, b) { return a.image === b.image && JSON.stringify(a.effect) === JSON.stringify(b.effect); }
    function mutate(path, value) {
        const previous = snapshot(); pathSet(path, value);
        if (path === 'presentation.show-hands' && value) effect.presentation['hide-hud'] = false;
        if (path === 'presentation.hide-hud' && value) effect.presentation['show-hands'] = false;
        if (path === 'id' && imageBytes) effect.appearance.image = `images/${effect.id}.png`;
        if (!snapshotMatches(previous, snapshot())) { undo.push(previous); if (undo.length > 32) undo.shift(); redo.length = 0; }
        sync(); scheduleSave();
    }
    function scheduleSave() { clearTimeout(saveTimer); saveTimer = setTimeout(save, 450); }
    function toDataUrl(bytes) { let binary = ''; for (let i = 0; i < bytes.length; i += 8192) binary += String.fromCharCode(...bytes.slice(i, i + 8192)); return 'data:image/png;base64,' + btoa(binary); }
    function fromDataUrl(url) { return Uint8Array.from(atob(url.split(',')[1]), c => c.charCodeAt(0)); }
    function save() {
        try { localStorage.setItem(storageKey, JSON.stringify({ version: core.VERSION, effect, image: imageBytes ? toDataUrl(imageBytes) : '' })); }
        catch { toast('Export to save this draft. Browser storage is unavailable.', true); }
    }
    async function setImage(bytes) {
        let nextUrl = '', nextImage = null;
        if (bytes) {
            core.validatePng(bytes); nextUrl = URL.createObjectURL(new Blob([bytes], { type: 'image/png' })); const image = new Image(); image.src = nextUrl;
            try { await image.decode(); } catch { URL.revokeObjectURL(nextUrl); throw new Error('The PNG could not be decoded. Choose a valid image.'); }
            nextImage = image;
        }
        if (imageUrl.startsWith('blob:')) URL.revokeObjectURL(imageUrl);
        imageBytes = bytes; imageUrl = nextUrl; imageElement = nextImage;
        if (renderer) renderer.setImage(imageElement);
    }
    async function restore(state) { const next = core.clone(state.effect); await setImage(state.image); effect = next; rawDirty = false; renderSettings(); sync(); scheduleSave(); }
    async function historyStep(isRedo) { const source = isRedo ? redo : undo, destination = isRedo ? undo : redo; if (!source.length) return; const target = source.pop(); destination.push(snapshot()); await restore(target); }
    function field(label, path, options = {}) {
        const wrap = element(options.options ? 'div' : 'label', 'field'), caption = element('span', 'field-label', label);
        wrap.append(caption);
        let input;
        if (options.options) { input = element('select'); for (const [value, text] of options.options) { const option = element('option', '', text); option.value = value; input.append(option); } }
        else if (options.multiline) { input = element('textarea'); input.rows = 2; }
        else { input = element('input'); input.type = options.type || 'text'; }
        input.dataset.path = path; input.id = 'field-' + path.replaceAll('.', '-'); input.value = options.list ? pathGet(path).join(', ') : pathGet(path);
        if (options.placeholder) input.placeholder = options.placeholder;
        for (const key of ['min', 'max', 'step', 'maxLength']) if (options[key] !== undefined) input[key] = options[key];
        if (options.type === 'range') { const output = element('output'); output.htmlFor = input.id; output.dataset.output = path; caption.append(output); }
        const update = () => {
            const value = options.list ? input.value.split(/[,\n]/).map(item => item.trim()).filter(Boolean) : ['range', 'number'].includes(options.type) ? Number(input.value) : input.value;
            mutate(path, value);
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
        const visual = $('settings-visual'), behavior = $('settings-behavior'), rules = $('settings-rules'); visual.replaceChildren(); behavior.replaceChildren(); rules.replaceChildren();
        const composition = section('Loading screen elements', 'Reusable');
        composition.append(field('Background layout', 'elements.background', { options: [['template','Shader template'],['solid','Solid color'],['split','Split panels'],['grid','Technical grid'],['terminal','Terminal'],['pulse','Expanding pulse']] }), field('Loading indicator', 'elements.progress', { options: [['none','None'],['bar','Moving bar'],['segments','Segmented bar'],['dots','Pulsing dots'],['ring','Rotating ring']] }), field('Ambient decoration', 'elements.decoration', { options: [['none','None'],['embers','Embers'],['petals','Petals'],['scan','Scan line'],['pulse','Pulse emblem']] }), row(field('Indicator X', 'elements.progress-x', { type: 'range', min: .1, max: .9, step: .01 }), field('Indicator Y', 'elements.progress-y', { type: 'range', min: .1, max: .9, step: .01 })), field('Indicator width', 'elements.progress-width', { type: 'range', min: .08, max: .8, step: .01 }), field('Text entrance', 'elements.text-animation', { options: [['still','Fade'],['grow','Grow'],['slide-up','Slide up']] }), field('Text position', 'elements.text-y', { type: 'range', min: .1, max: .9, step: .01 }), field('Text size', 'elements.text-scale', { type: 'range', min: .5, max: 2, step: .01 }), note('Start with a ready-made layout, then replace its words, colors or logo. Loading indicators animate continuously; they do not claim a server loading percentage.'));
        visual.append(composition);
        const identity = section('Effect identity'); identity.append(field('Display name', 'name', { maxLength: 64 }), field('Effect ID / filename', 'id', { maxLength: 48, placeholder: 'my-aurora' }), note('Use a new ID to create a separate effect. Keep the template ID to replace its configuration.'), field('Collection', 'category', { maxLength: 40 })); visual.append(identity);
        const palette = section('Color palette');
        const segments = element('div', 'segmented');
        for (const [value, label] of [['original', 'Original'], ['custom', 'Custom colors']]) { const button = element('button', effect.appearance.palette === value ? 'active' : '', label); button.dataset.palette = value; button.addEventListener('click', () => mutate('appearance.palette', value)); segments.append(button); }
        const colors = element('div', 'colors-row'); colors.id = 'custom-colors';
        for (const [key, label] of [['background', 'Base'], ['primary', 'Primary'], ['secondary', 'Accent']]) { const wrap = element('label', 'field color-field'), name = element('span', 'field-label', label), well = element('span', 'color-well'), input = element('input'), text = element('input'); input.type = 'color'; input.value = effect.appearance[key]; input.dataset.path = `appearance.${key}`; input.setAttribute('aria-label', label + ' color'); text.type = 'text'; text.value = effect.appearance[key]; text.maxLength = 7; text.dataset.path = `appearance.${key}`; text.setAttribute('aria-label', label + ' hex color'); input.addEventListener('input', () => mutate(`appearance.${key}`, input.value)); text.addEventListener('input', () => { if (/^#[0-9a-f]{6}$/i.test(text.value)) mutate(`appearance.${key}`, text.value); }); text.addEventListener('change', () => mutate(`appearance.${key}`, text.value)); well.append(input, text); wrap.append(name, well); colors.append(wrap); }
        palette.append(segments, colors, field('Animation speed', 'appearance.speed', { type: 'range', min: 0.05, max: 8, step: 0.05 }), field('Brightness', 'appearance.intensity', { type: 'range', min: 0, max: 4, step: 0.05 })); visual.append(palette);
        const picture = section('Your image', 'OPTIONAL'), upload = element('button', 'image-upload'); upload.id = 'upload-image'; upload.append(icon('image'), element('strong', '', 'Choose an image'), element('span', '', 'Add a logo, artwork or your own photo'), element('small', '', 'PNG / JPEG · up to 8 MB · resized to 2048 px')); upload.addEventListener('click', () => $('image-file').click());
        picture.append(field('Image entrance', 'elements.image-animation', { options: [['inherit','Follow template'],['fade','Fade'],['grow','Grow from center'],['slide-up','Slide up'],['slide-left','Slide from left'],['wipe','Left-to-right reveal'],['page','Diagonal page']] }), field('Ambient image motion', 'appearance.image-motion', { options: [['still','Still'],['panorama','Slow zoom and pan'],['page','Legacy page reveal']] }), field('Image size', 'elements.image-scale', { type: 'range', min: .1, max: 2, step: .01 }), row(field('Horizontal position', 'elements.image-x', { type: 'range', min: 0, max: 1, step: .01 }),field('Vertical position', 'elements.image-y', { type: 'range', min: 0, max: 1, step: .01 })), field('Entrance delay', 'elements.image-delay', { type: 'range', min: 0, max: .8, step: .01 }));
        const info = element('div', 'image-info'); info.id = 'image-info'; const thumbnail = element('img'); thumbnail.id = 'image-thumbnail'; thumbnail.alt = 'Uploaded effect image'; const label = element('span'); label.id = 'image-description'; const remove = element('button', 'icon-button', '×'); remove.setAttribute('aria-label', 'Remove image'); remove.addEventListener('click', async () => { remember(); await setImage(null); effect.appearance.image = ''; renderSettings(); sync(); scheduleSave(); }); info.append(thumbnail, label, remove);
        picture.append(info, upload, field('Image fit', 'appearance.image-fit', { options: [['cover', 'Cover — fill screen'], ['contain', 'Contain — show entire image']] }), field('Image opacity', 'appearance.image-opacity', { type: 'range', min: 0, max: 1, step: 0.01 }), note('Images follow the template’s transition mask. Transparent pixels reveal the shader underneath.')); visual.append(picture);
        const timing = section('Transition timing', '20 TICKS = 1 SECOND'); timing.append(row(field('Fade in · ticks', 'timing.fade-in-ticks', { type: 'number', min: 0, max: 1200 }), field('Fade out · ticks', 'timing.fade-out-ticks', { type: 'number', min: 1, max: 1200 })), row(field('Minimum · ticks', 'timing.minimum-ticks', { type: 'number', min: 0, max: 1200 }), field('Maximum · ticks', 'timing.maximum-ticks', { type: 'number', min: 0, max: 1200 })), note('Minimum includes fade in. Maximum caps waiting for the destination chunk. The preview uses the minimum duration.')); behavior.append(timing);
        const presentation = section('Player presentation'); presentation.append(toggle('Show hands', 'presentation.show-hands', 'Showing hands also keeps the HUD visible.'), toggle('Hide HUD', 'presentation.hide-hud', 'Hides the hotbar, crosshair and in-game HUD.'), toggle('Block movement', 'presentation.block-movement'), toggle('Block interactions', 'presentation.block-interactions')); behavior.append(presentation);
        const captions = section('Captions'); captions.append(toggle('Show captions', 'captions.enabled'), field('Title', 'captions.title', { maxLength: 64 }), field('Subtitle', 'captions.subtitle', { maxLength: 96 }), details('Context details', field('Joining', 'captions.join-detail', { maxLength: 128 }), field('Teleporting', 'captions.teleport-detail', { maxLength: 128 }), field('Preview', 'captions.preview-detail', { maxLength: 128 }), note('Placeholders: {world} for the destination, {effect} for the effect name.'))); behavior.append(captions);
        const selection = section('Selection'); selection.append(toggle('Enable effect', 'enabled'), row(field('Priority', 'priority', { type: 'number', min: -10000, max: 10000 }), field('Random weight', 'weight', { type: 'number', min: 1, max: 10000 })), field('Cooldown · ticks', 'filters.cooldown-ticks', { type: 'number', min: 0, max: 1728000 }), note('Higher priorities win. Weight controls random selection between equally prioritized matches. A zero cooldown permits every eligible event.')); rules.append(selection);
        const events = section('When to play'); events.append(checkboxList('filters.triggers', core.triggers, { join: 'Join', teleport: 'Teleport', 'world-change': 'World change', command: 'Command' }), note('Commands also respect the effect’s filters. An empty trigger list prevents automatic and command playback.')); rules.append(events);
        const worlds = section('World filters'); worlds.append(field('Include worlds', 'filters.worlds.include', { list: true, placeholder: 'world, survival-*' }), field('Exclude worlds', 'filters.worlds.exclude', { list: true, placeholder: 'world_nether, lobby' }), note('Comma-separated world names. * and ? are supported; exclusions win. Empty include allows every world.'), details('Source world filters', field('Include source worlds', 'filters.source-worlds.include', { list: true, placeholder: 'lobby, hub-*' }), field('Exclude source worlds', 'filters.source-worlds.exclude', { list: true, placeholder: 'minigame-*' }), note('Source is the world the player leaves. On join it is the same as the destination.'))); rules.append(worlds);
        const access = section('Access & game mode'); access.append(field('Required permission', 'filters.permission', { maxLength: 128, placeholder: 'frameui.effect.vip' }), field('Denied permissions', 'filters.deny-permissions', { list: true, placeholder: 'frameui.effect.disable' }), details('Game mode filters', element('span', 'chip-note', 'INCLUDE · EMPTY ALLOWS ALL'), checkboxList('filters.game-modes.include', core.modes), element('span', 'chip-note', 'EXCLUDE'), checkboxList('filters.game-modes.exclude', core.modes)), details('Teleport causes', checkboxList('filters.teleport-causes', core.causes), note('Empty allows every cause. Distance and cause filters apply to teleports and world changes.'))); rules.append(access);
        const environment = section('Environment'); environment.append(details('Distance & height', row(field('Min distance · blocks', 'filters.distance.min', { type: 'number', min: 0, max: 100000000, step: 'any' }), field('Max distance · blocks', 'filters.distance.max', { type: 'number', min: -1, max: 100000000, step: 'any' })), note('Use -1 for unlimited maximum distance. Cross-world teleports satisfy the minimum distance.'), row(field('Min Y', 'filters.height.min', { type: 'number', min: -30000000, max: 30000000, step: 'any' }), field('Max Y', 'filters.height.max', { type: 'number', min: -30000000, max: 30000000, step: 'any' })), note('Height applies to the destination. The defaults allow all heights.')), details('Time & weather', row(field('Start time · ticks', 'filters.time.min', { type: 'number', min: 0, max: 23999 }), field('End time · ticks', 'filters.time.max', { type: 'number', min: 0, max: 23999 })), note('Minecraft time: 0 sunrise, 6000 noon, 12000 sunset, 18000 midnight. A range crossing midnight is supported.'), checkboxList('filters.weather', ['clear', 'rain', 'thunder']), note('Empty allows any weather.'))); rules.append(environment);
        dropdowns.enhance();
    }
    function renderCatalog() {
        const query = $('search').value.trim().toLowerCase(), category = $('category-filter').value, list = $('template-list'); list.replaceChildren();
        for (const item of core.catalog) {
            if ((category && category !== item.category) || (query && !`${item.name} ${item.id} ${item.category}`.toLowerCase().includes(query))) continue;
            const button = element('button', 'template-card' + (effect.id === item.id ? ' active' : '')); button.dataset.template = item.id; button.setAttribute('aria-pressed', effect.template === item.id ? 'true' : 'false');
            const thumb = element('img', 'template-thumb'); thumb.alt = ''; if (thumbs.has(item.id)) thumb.src = thumbs.get(item.id);
            const copy = element('span', 'template-copy'); copy.append(element('b', '', item.name), element('small', '', `${item.category} · ${((item.minimum + item.fadeOut) / 20).toFixed(1)} s`)); button.append(thumb, copy, icon('check'));
            button.addEventListener('click', async () => { try { remember(); const next = core.createEffect(item.id); await setImage(item.image ? new Uint8Array(await (await fetch(item.image)).arrayBuffer()) : null); effect = next; playTick = Math.max(item.fadeIn, 1); rawDirty = false; renderSettings(); renderCatalog(); sync(); scheduleSave(); } catch (error) { toast(error.message, true); } }); list.append(button);
        }
        if (!list.children.length) list.append(element('p', 'empty-state', 'No matching effects. Try another name or collection.'));
    }
    function validState() { try { core.validate(effect); return ''; } catch (error) { return error.message; } }
    function sync() {
        const error = validState(); $('validation-status').textContent = error || (effect.appearance.image && !imageBytes ? 'Image file needs to be supplied' : 'Ready to export'); document.querySelector('.inspector-footer').classList.toggle('invalid', !!error || !!(effect.appearance.image && !imageBytes));
        $('export-button').disabled = !!error; $('yaml-download').disabled = !!error; $('guide-export').disabled = !!error;
        $('effect-heading').textContent = effect.name || 'Untitled effect'; $('effect-subheading').textContent = `${effect.category || 'Custom'} collection · ${effect.id === effect.template ? 'Built-in template' : 'Custom effect'}`;
        $('summary-in').textContent = `${(effect.timing['fade-in-ticks'] / 20).toFixed(1)} s`; $('summary-hold').textContent = `${(effect.timing['minimum-ticks'] / 20).toFixed(1)} s`; $('summary-out').textContent = `${(effect.timing['fade-out-ticks'] / 20).toFixed(1)} s`; $('summary-triggers').textContent = `${effect.filters.triggers.length} events`;
        $('duration-label').textContent = `${(duration() / 20).toFixed(1)} s`; $('undo-button').disabled = !undo.length; $('redo-button').disabled = !redo.length;
        for (const input of document.querySelectorAll('[data-path]')) { if (document.activeElement === input) continue; const value = pathGet(input.dataset.path); if (input.type === 'checkbox') input.checked = value; else input.value = Array.isArray(value) ? value.join(', ') : value; }
        for (const input of document.querySelectorAll('[data-check-path]')) input.checked = pathGet(input.dataset.checkPath).includes(input.value);
        dropdowns.refresh();
        for (const output of document.querySelectorAll('[data-output]')) { const value = pathGet(output.dataset.output); output.textContent = output.dataset.output.endsWith('image-opacity') ? `${Math.round(value * 100)}%` : `${value.toFixed(2).replace(/0$/, '')}×`; }
        for (const button of document.querySelectorAll('[data-palette]')) button.classList.toggle('active', button.dataset.palette === effect.appearance.palette);
        if ($('custom-colors')) { $('custom-colors').style.opacity = effect.appearance.palette === 'custom' ? '1' : '.42'; for (const input of $('custom-colors').querySelectorAll('input')) input.disabled = effect.appearance.palette !== 'custom'; }
        if ($('image-info')) { $('image-info').hidden = !effect.appearance.image; $('upload-image').hidden = !!imageBytes; if (imageUrl) $('image-thumbnail').src = imageUrl; else $('image-thumbnail').removeAttribute('src'); const label = $('image-description'); label.textContent = effect.appearance.image; label.append(element('small', '', imageElement ? `${imageElement.width} × ${imageElement.height} · ${(imageBytes.length / 1024).toFixed(0)} KB` : 'Missing image · choose the matching file')); }
        if (!rawDirty && !error) $('yaml-editor').value = core.toYaml(effect);
        $('play-button').setAttribute('aria-label', playing ? 'Pause preview' : 'Play preview'); $('play-button').replaceChildren(icon(playing ? 'pause' : 'play'));
        for (const button of document.querySelectorAll('[data-template]')) { const selected = button.dataset.template === effect.id; button.classList.toggle('active', selected); button.setAttribute('aria-pressed', String(selected)); }
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
            this.uniforms = Object.fromEntries(['ScreenSize','uTime','uSpeed','frameLoadingEffect','frameLoadingTransition','uCustom','uBackground','uPrimary','uSecondary','uIntensity','uImage','uHasImage','uImageSize','uContain','uImageOpacity','uBackgroundStyle','uImageAnimation','uImageMotion','uPlacement','uIndicator','uDecoration'].map(name => [name, gl.getUniformLocation(program, name)]));
            this.texture = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, this.texture); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([0,0,0,0])); this.picture = null;
        }
        setImage(image) { this.picture = image; const gl = this.gl; gl.bindTexture(gl.TEXTURE_2D, this.texture); if (image) { gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image); } }
        draw(definition, seconds, transition) {
            const gl = this.gl, u = this.uniforms, a = definition.appearance, c = this.canvas;
            const rgb = hex => /^#[0-9a-f]{6}$/i.test(hex) ? [1,3,5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255) : [0,0,0];
            const e = definition.elements;
            gl.useProgram(this.program);
            gl.uniform1i(u.uBackgroundStyle, ['template','solid','split','grid','terminal','pulse'].indexOf(e.background));
            gl.uniform1i(u.uImageAnimation, ['inherit','fade','grow','slide-up','slide-left','wipe','page'].indexOf(e['image-animation']));
            gl.uniform1i(u.uImageMotion, ['still','panorama','page'].indexOf(a['image-motion']));
            gl.uniform4f(u.uPlacement, e['image-x'], e['image-y'], e['image-scale'], e['image-delay']);
            gl.uniform4f(u.uIndicator, ['none','bar','segments','dots','ring'].indexOf(e.progress), e['progress-x'], e['progress-y'], e['progress-width']);
            gl.uniform1i(u.uDecoration, ['none','embers','petals','scan','pulse'].indexOf(e.decoration));
            gl.viewport(0, 0, c.width, c.height); gl.useProgram(this.program); gl.uniform2f(u.ScreenSize, c.width, c.height); gl.uniform1f(u.uTime, seconds); gl.uniform1f(u.uSpeed, a.speed); gl.uniform1i(u.frameLoadingEffect, core.catalog.find(item => item.id === definition.template)?.shaderId || 0); gl.uniform1f(u.frameLoadingTransition, transition); gl.uniform1i(u.uCustom, a.palette === 'custom' ? 1 : 0); gl.uniform3fv(u.uBackground, rgb(a.background)); gl.uniform3fv(u.uPrimary, rgb(a.primary)); gl.uniform3fv(u.uSecondary, rgb(a.secondary)); gl.uniform1f(u.uIntensity, a.intensity); gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, this.texture); gl.uniform1i(u.uImage, 0); gl.uniform1i(u.uHasImage, !!this.picture); gl.uniform2f(u.uImageSize, this.picture?.width || 1, this.picture?.height || 1); gl.uniform1i(u.uContain, a['image-fit'] === 'contain'); gl.uniform1f(u.uImageOpacity, a['image-opacity']); gl.drawArrays(gl.TRIANGLES, 0, 6);
        }
    }
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
        caption.style.transformOrigin = `50% ${layout['text-y'] * 100}%`;
        const fit = $('stage').clientWidth / 640;
        for (const [id, offset, size] of [['preview-title', .004, 14], ['preview-subtitle', .069, 8], ['preview-detail', .246, 7]]) { const line = $(id); line.style.position = 'absolute'; line.style.left = '0'; line.style.right = '0'; line.style.top = ((layout['text-y'] + offset) * 100) + '%'; line.style.margin = '0'; line.style.fontSize = (size * fit) + 'px'; }
        caption.style.transform = `translateY(${layout['text-animation'] === 'slide-up' ? (1 - entrance) * 30 : 0}px) scale(${layout['text-scale'] * (layout['text-animation'] === 'grow' ? 1 - Math.pow(1 - entrance, 3) : 1)})`;
        $('preview-title').style.color = effect.appearance.primary; $('preview-subtitle').style.color = effect.appearance.secondary;
        const captionText = value => value.replace(/\{effect\}/g, effect.name).replace(/\{world\}/g, 'world');
        $('preview-title').textContent = captionText(effect.captions.title); $('preview-subtitle').textContent = captionText(effect.captions.subtitle); $('preview-detail').textContent = captionText(effect.captions['preview-detail']);
        $('game-hud').hidden = effect.presentation['hide-hud']; $('game-hands').hidden = !effect.presentation['show-hands'];
        const seconds = playTick / 20; $('time-label').textContent = `00:${seconds.toFixed(1).padStart(4, '0')}`; if (document.activeElement !== $('timeline')) $('timeline').value = Math.round(playTick / duration() * 1000);
        requestAnimationFrame(previewFrame);
    }
    async function generateThumbnails() {
        const canvas = element('canvas'); canvas.width = 160; canvas.height = 90; let thumbnails;
        try { thumbnails = new ShaderRenderer(canvas); } catch { return; }
        for (const template of core.catalog) { if (template.image) { const image = new Image(); image.src = template.image; try { await image.decode(); thumbnails.setImage(image); } catch { thumbnails.setImage(null); } } else thumbnails.setImage(null); thumbnails.draw(core.createEffect(template.id), 2.5, 1); const url = canvas.toDataURL('image/png'); thumbs.set(template.id, url); const img = document.querySelector(`[data-template="${template.id}"] .template-thumb`); if (img) img.src = url; await new Promise(resolve => requestAnimationFrame(resolve)); }
        thumbnails.gl.getExtension('WEBGL_lose_context')?.loseContext();
    }
    function download(bytes, filename, type) { const url = URL.createObjectURL(new Blob([bytes], { type })), anchor = element('a'); anchor.href = url; anchor.download = filename; document.body.append(anchor); anchor.click(); anchor.remove(); setTimeout(() => URL.revokeObjectURL(url), 10000); }
    function exportEffect() {
        try {
            core.validate(effect); if (effect.appearance.image && !imageBytes) throw new Error('Choose the referenced image before exporting a complete ZIP, or clear the image in YAML.');
            const entries = { [`effects/${effect.id}.yml`]: core.toYaml(effect), 'INSTALL.txt': `FrameUI effect: ${effect.name}\n\n1. Extract effects/ and images/ into plugins/FrameUI/.\n2. Run /frameui reload and accept the refreshed resource pack.\n3. Test with /frameui preview ${effect.id}.\n\nAn existing ID replaces that effect. Keep your other files.\n` }; if (imageBytes) entries[effect.appearance.image] = imageBytes;
            download(core.zip(entries), `${effect.id}-frameui.zip`, 'application/zip'); toast('Effect ZIP downloaded. Follow the install guide to load it on your server.');
        } catch (error) { toast(error.message, true); }
    }
    async function importFile(file) {
        if (!file) return;
        try {
            let imported, bytes = null;
            if (/\.zip$/i.test(file.name)) { const entries = await core.unzip(new Uint8Array(await file.arrayBuffer())), definitions = Object.keys(entries).filter(name => /^effects\/.*\.ya?ml$/i.test(name)); if (definitions.length !== 1) throw new Error('Import one effect at a time. The ZIP must contain exactly one effects/*.yml file.'); imported = core.fromYaml(core.decoder.decode(entries[definitions[0]])); if (definitions[0].replace(/^effects\//, '').replace(/\.ya?ml$/i, '') !== imported.id) throw new Error('Effect ID must match the YAML filename.'); if (imported.appearance.image) { bytes = entries[imported.appearance.image]; if (!bytes) throw new Error(`ZIP is missing ${imported.appearance.image}.`); core.validatePng(bytes); } }
            else if (/\.ya?ml$/i.test(file.name)) { if (file.size > 256000) throw new Error('YAML must be smaller than 256 KB.'); imported = core.fromYaml(await file.text()); if (file.name.replace(/\.ya?ml$/i, '') !== imported.id) throw new Error('Effect ID must match the YAML filename.'); }
            else throw new Error('Choose a FrameUI YAML definition or an exported effect ZIP.');
            const before = snapshot(); await setImage(bytes); undo.push(before); if (undo.length > 32) undo.shift(); redo.length = 0; effect = imported; rawDirty = false; playTick = Math.max(effect.timing['fade-in-ticks'], 1); renderSettings(); renderCatalog(); sync(); scheduleSave(); toast(bytes || !effect.appearance.image ? 'Effect imported. Your previous draft is available with Undo.' : 'Definition imported. Choose its image to preview and export a complete ZIP.');
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
            const bytes = new Uint8Array(await blob.arrayBuffer()); core.validatePng(bytes); remember(); await setImage(bytes); effect.appearance.image = `images/${effect.id}.png`; renderSettings(); sync(); scheduleSave(); toast(`Image added as ${canvas.width} × ${canvas.height} PNG.`);
        } catch (error) { toast(error.message, true); }
        $('image-file').value = '';
    }
    for (const brand of document.querySelectorAll('.brand[href="#"]')) brand.addEventListener('click', event => {
        event.preventDefault();
        const center = $('workspace-content');
        if (getComputedStyle(center).display === 'contents') window.scrollTo({ top: 0 });
        else center.scrollTo({ top: 0 });
    });
    $('search').addEventListener('input', renderCatalog); $('category-filter').addEventListener('change', renderCatalog);
    for (const category of [...new Set(core.catalog.map(item => item.category))]) { const option = element('option', '', category); option.value = category; $('category-filter').append(option); }
    $('undo-button').addEventListener('click', () => historyStep(false)); $('redo-button').addEventListener('click', () => historyStep(true));
    $('play-button').addEventListener('click', () => { playing = !playing; if (playing && playTick >= duration()) playTick = 0; sync(); }); $('restart-button').addEventListener('click', () => { playTick = 0; });
    $('timeline').addEventListener('input', () => { playTick = Number($('timeline').value) / 1000 * duration(); });
    $('import-button').addEventListener('click', () => $('import-file').click()); $('import-file').addEventListener('change', () => importFile($('import-file').files[0])); $('image-file').addEventListener('change', () => uploadImage($('image-file').files[0]));
    $('export-button').addEventListener('click', exportEffect); $('guide-export').addEventListener('click', exportEffect); $('yaml-download').addEventListener('click', () => { try { download(core.toYaml(effect), effect.id + '.yml', 'text/yaml;charset=utf-8'); toast('YAML downloaded. Images must be supplied separately; use Export effect for a complete ZIP.'); } catch (error) { toast(error.message, true); } });
    $('guide-button').addEventListener('click', () => $('guide-dialog').showModal()); $('close-guide').addEventListener('click', () => $('guide-dialog').close()); $('guide-dialog').addEventListener('click', event => { if (event.target === $('guide-dialog')) { const rect = $('guide-dialog').getBoundingClientRect(); if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) $('guide-dialog').close(); } });
    $('new-button').addEventListener('click', () => { remember(); effect.id = 'custom-' + effect.template; effect.name += ' · Custom'; if (imageBytes) effect.appearance.image = `images/${effect.id}.png`; renderSettings(); sync(); scheduleSave(); toast('Custom effect created. Give it your own ID, name and settings.'); });
    $('reset-button').addEventListener('click', async () => { remember(); const preset = core.catalog.find(item => item.id === effect.id) || core.catalog.find(item => item.id === effect.template); effect = core.createEffect(preset.id); await setImage(preset.image ? new Uint8Array(await (await fetch(preset.image)).arrayBuffer()) : null); rawDirty = false; renderSettings(); sync(); scheduleSave(); toast('Template defaults restored. Undo restores your previous draft.'); });
    const tabs = [...document.querySelectorAll('[data-tab]')];
    function selectTab(button) { dropdowns.close(); for (const tab of tabs) { const active = tab === button; tab.classList.toggle('active', active); tab.setAttribute('aria-selected', String(active)); tab.tabIndex = active ? 0 : -1; $('settings-' + tab.dataset.tab).hidden = !active; } }
    for (const tab of tabs) { tab.addEventListener('click', () => selectTab(tab)); tab.addEventListener('keydown', event => { if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) { event.preventDefault(); const index = tabs.indexOf(tab), next = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length; selectTab(tabs[next]); tabs[next].focus(); } }); }
    selectTab(tabs[0]);
    $('yaml-editor').addEventListener('input', () => { rawDirty = true; }); $('apply-yaml').addEventListener('click', async () => { try { const imported = core.fromYaml($('yaml-editor').value); remember(); const priorPath = effect.appearance.image; effect = imported; if (priorPath !== effect.appearance.image) await setImage(null); rawDirty = false; renderSettings(); renderCatalog(); sync(); scheduleSave(); toast('YAML validated and applied.'); } catch (error) { toast(error.message, true); } });
    document.addEventListener('keydown', event => {
        const editing = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName || '') || document.activeElement?.getAttribute('role') === 'combobox';
        if (event.key === '/' && !editing) { event.preventDefault(); $('search').focus(); }
        if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z' && !editing) { event.preventDefault(); historyStep(event.shiftKey); }
        if (event.code === 'Space' && !editing && document.activeElement === document.body) { event.preventDefault(); playing = !playing; sync(); }
    });
    async function start() {
        try { const stored = localStorage.getItem(storageKey); if (stored) { const draft = JSON.parse(stored); if (draft.version === core.VERSION) { effect = core.normalize(draft.effect); if (draft.image) await setImage(fromDataUrl(draft.image)); } } } catch { toast('Previous draft unavailable.', true); }
        if (effect.appearance.image && !imageBytes) { const preset = core.catalog.find(item => item.id === effect.id); if (preset?.image) { try { await setImage(new Uint8Array(await (await fetch(preset.image)).arrayBuffer())); } catch { toast('Preset image could not load. Choose the matching PNG.', true); } } }
        document.querySelector('.panel-heading h1 span').textContent = core.catalog.length;
        renderSettings(); renderCatalog(); sync(); requestAnimationFrame(previewFrame); generateThumbnails();
    }
    start();
})();
