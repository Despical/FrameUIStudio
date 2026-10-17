const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const core = require('../dist/core.js');
core.configureCatalog(require('./catalog.json'));

test('every addon event survives YAML and ZIP without enabling unrelated events', async () => {
    assert.equal(core.addons.length, 9);
    for (const addon of core.addons) {
        const effect = core.userCopy(core.createEffect('fade-out'), [], []);
        effect['play-on'] = Object.keys(addon.events);
        effect.filters['addon-targets'] = { include: ['vip-*'], exclude: ['vip-staff'] };
        const archive = core.zip({ ['effects/' + effect.id + '.yml']: core.toYaml(effect) });
        const entries = await core.unzip(archive);
        const restored = core.fromYaml(core.decoder.decode(entries['effects/' + effect.id + '.yml']));
        assert.deepEqual(restored, effect, addon.name);
        assert(!restored['play-on'].includes('teleport'));
    }
    const invalid = core.createEffect('fade-out'); invalid['play-on'] = ['towny-typo'];
    assert.throws(() => core.validate(invalid), /Automatic playback/);
});

test('all 50 templates round-trip through complete plugin YAML', () => {
    assert.equal(core.catalog.filter(entry => !entry.definition).length, 50);
    for (const template of core.catalog) {
        const definition = core.createEffect(template.id);
        assert.deepEqual(core.fromYaml(core.toYaml(definition)), definition, template.id);
    }
});

test('backend effect definitions load without unsupported fields or altered behavior', () => {
    const directory = path.resolve(__dirname, 'fixtures/effects');
    const files = fs.existsSync(directory) ? fs.readdirSync(directory).filter(name => name.endsWith('.yml')) : [];
    assert.equal(files.length, 60);
    for (const file of files) {
        const effect = core.fromYaml(fs.readFileSync(path.join(directory, file), 'utf8'));
        assert.equal(effect.id, file.replace(/\.yml$/, ''));
        assert.equal(core.validate(effect), effect);
    }
});

test('nested maps, block lists, plain fields and quoted comments import', () => {
    const effect = core.fromYaml(`id: my-aurora\ntemplate: aurora\nname: 'A # vivid aurora'\nfilters:\n  worlds:\n    include:\n      - world\n      - 'survival-*'\n  triggers: [join, teleport]\nappearance:\n  primary: "#12ff34" # color comment\n`);
    assert.equal(effect.name, 'A # vivid aurora');
    assert.deepEqual(effect.filters.worlds.include, ['world', 'survival-*']);
    assert.deepEqual(effect.filters.triggers, ['join', 'teleport']);
    assert.equal(effect.appearance.primary, '#12ff34');
});

test('backend enum normalization and indentationless block lists import', () => {
    const effect = core.fromYaml('id: aurora\nfilters:\n  triggers:\n  - WORLD_CHANGE\n  - COMMAND\n  game-modes:\n    include: [survival]\n  weather: [THUNDER]\n');
    assert.deepEqual(effect.filters.triggers, ['world-change', 'command']);
    assert.deepEqual(effect.filters['game-modes'].include, ['SURVIVAL']);
    assert.deepEqual(effect.filters.weather, ['thunder']);
});

test('generated preview excludes Minecraft wrappers and includes all shader branches', () => {
    const script = fs.readFileSync(path.resolve(__dirname, '../dist/shaders.js'), 'utf8');
    assert.doesNotMatch(script, /frameSpeed\(|frameTemplate\(|framePalette\(|frameIntensity\(|frameImage\(|Sampler0|texCoord0|GameTime/);
    assert.match(script, /vec4 frameEffect\(\)/);
    assert.match(script, /effect == 49/);
    assert.match(script, /uImageOpacity/);
});

test('wrong schemas, traversal, control characters and unsafe YAML are rejected', () => {
    for (const yaml of [
        'id: ../outside\ntemplate: aurora',
        'id: bad__name\ntemplate: aurora',
        'id: a--b\ntemplate: aurora',
        'id: bad\ntemplate: mystery',
        'id: aurora\nid: loading',
        'id: aurora\nappearance:\n  image: images/../secret.png',
        'id: aurora\nappearance:\n  image: images/sub/../secret.png',
        'id: aurora\nappearance:\n  palette: [custom]',
        'id: aurora\nwrong-setting: true',
        'id: aurora\npresentation:\n  show-hands: true\n  hide-hud: true',
        'id: aurora\nname: "bad\\nline"',
        'id: aurora\nname: &anchor name',
        '__proto__:\n  polluted: true'
    ]) assert.throws(() => core.fromYaml(yaml), undefined, yaml);
    assert.equal({}.polluted, undefined);
});

test('timing, numeric boundaries and permission filters match the plugin', () => {
    const effect = core.createEffect('fade-in');
    effect.appearance.speed = 0.05; effect.appearance.intensity = 4;
    effect.filters.height = { min: -30000000, max: 30000000 };
    effect.filters.distance = { min: 100000000, max: -1 };
    effect.filters.time = { min: 18000, max: 6000 };
    effect.filters['cooldown-ticks'] = 1728000;
    assert.equal(core.validate(effect), effect);
    effect.timing['minimum-ticks'] = 1; effect.timing['maximum-ticks'] = 0;
    assert.throws(() => core.validate(effect), /Maximum duration/);
    effect.timing['maximum-ticks'] = 1; effect.filters.permission = 'invalid permission';
    assert.throws(() => core.validate(effect), /Permission/);
});

test('effect ZIP round-trip preserves YAML and PNG bytes, verifies CRC', async () => {
    const definition = core.createEffect('aurora'); definition.id = 'custom-aurora'; definition.category = 'My Effects'; definition.appearance.image = 'images/custom-aurora.png';
    const image = Uint8Array.from([137,80,78,71,13,10,26,10,0,0,0,13,73,72,68,82,0,0,0,1,0,0,0,1,8,6,0,0,0,0,0,0,0]);
    core.validatePng(image);
    const archive = core.zip({ 'effects/custom-aurora.yml': core.toYaml(definition), 'images/custom-aurora.png': image, 'INSTALL.txt': 'Installation instructions' });
    const entries = await core.unzip(archive);
    assert.deepEqual(core.fromYaml(core.decoder.decode(entries['effects/custom-aurora.yml'])), definition);
    assert.deepEqual(entries['images/custom-aurora.png'], image);
    archive[70] ^= 0xff;
    await assert.rejects(core.unzip(archive), /integrity/);
    assert.throws(() => core.zip({ '../outside.yml': 'bad' }), /Unsafe/);
});

test('oversized and malformed PNG files are rejected before decoding', () => {
    assert.throws(() => core.validatePng(new Uint8Array(34)), /PNG/);
    const png = Uint8Array.from([137,80,78,71,13,10,26,10,0,0,0,13,73,72,68,82,0,0,8,1,0,0,0,1,8,6,0,0,0,0,0,0,0]);
    assert.throws(() => core.validatePng(png), /dimensions/);
});

test('CRC32 matches ZIP standard reference', () => {
    assert.equal(core.crc32(core.utf8.encode('123456789')), 0xcbf43926);
});


test('ready-made compositions preserve image animation, editable elements and packaged assets', async () => {
    const presets = core.catalog.filter(entry => entry.definition);
    assert.equal(presets.length, 10);
    for (const preset of presets) {
        const effect = core.createEffect(preset.id);
        assert.deepEqual(core.fromYaml(core.toYaml(effect)), effect);
        assert.ok(effect.timing['maximum-ticks'] + effect.timing['fade-out-ticks'] <= 100);
        if (preset.image) {
            const image = fs.readFileSync(path.resolve(__dirname, '../dist', preset.image));
            core.validatePng(image);
            const zip = core.zip({['effects/' + effect.id + '.yml']:core.toYaml(effect), [effect.appearance.image]:image});
            const entries = await core.unzip(zip);
            assert.deepEqual(Buffer.from(entries[effect.appearance.image]), image);
        }
    }
    assert.throws(() => core.normalize({id:'bad',template:'frameui'}), /Unknown template/);
    const bad = core.createEffect('clean-loader');
    bad.elements['image-delay'] = 2;
    assert.throws(() => core.validate(bad), /delay/);
    bad.elements['image-delay'] = 0;
    bad.elements.progress = 'unknown';
    assert.throws(() => core.validate(bad), /progress/);
});


test('canvas movement uses the exported coordinates and respects bounds', () => {
    const original = core.createEffect('clean-loader').elements;
    const moved = core.transformElement(original, 'image', .2, -.1);
    assert.equal(moved['image-x'], .7); assert.equal(moved['image-y'], .4);
    assert.equal(original['image-x'], .5);
    const text = core.transformElement(original, 'text', .2, -.1);
    assert.equal(text['text-x'], .7); assert.equal(text['text-y'], .34);
    const bounded = core.transformElement(original, 'progress', 100, -100);
    assert.equal(bounded['progress-x'], .9); assert.equal(bounded['progress-y'], .1);
    assert.throws(() => core.transformElement(original,'unknown',0,0));
    assert.throws(() => core.transformElement(original,'image',NaN,0));
});

test('corner resizing preserves aspect and fixes the opposite corner', () => {
    const original = core.createEffect('clean-loader').elements;
    const resized = core.transformElement(original,'image',.2,.1,'se',{x:.3,y:.4,width:.4,height:.2});
    assert.equal(resized['image-scale'],1.5);
    assert.equal(resized['image-x'],.6); assert.equal(resized['image-y'],.55);
    assert.equal(Math.round((resized['image-x']-.4*1.5/2)*1e4)/1e4,.3);
    const text = core.transformElement(original,'text',.1,.05,'se',{x:.4,y:original['text-y'],width:.2,height:.1});
    assert.equal(text['text-scale'],1.5); assert.equal(text['text-y'],original['text-y']);
    const bar = core.transformElement(original,'progress',.17,.02,'se',{x:.33,y:.64,width:.34,height:.04});
    assert.equal(bar['progress-width'],.51); assert.equal(bar['progress-scale'],1.5);
    const bounded = core.transformElement(original,'image',100,100,'se',{x:.3,y:.4,width:.4,height:.2});
    assert.equal(bounded['image-scale'],2);
    assert.throws(() => core.transformElement(original,'text',1,1,'bad',{x:0,y:0,width:1,height:1}));
});


test('exactly three groups classify stock, legacy and custom effects consistently', () => {
    assert.deepEqual(core.categories, ['Animations', 'Presets', 'My Effects']);
    assert.equal(core.catalog.filter(item => item.category === 'Animations').length, 50);
    assert.equal(core.catalog.filter(item => item.category === 'Presets').length, 10);
    assert.equal(core.fromYaml('id: aurora\ncategory: Nature').category, 'Animations');
    assert.equal(core.fromYaml('id: frameui\ntemplate: fade-black\ncategory: Signature').category, 'Presets');
    assert.equal(core.fromYaml('id: my-screen\ntemplate: aurora\ncategory: Nature').category, 'My Effects');
    assert.equal(core.fromYaml('id: aurora\ncategory: Efektlerim').category, 'My Effects');
});

test('custom copies never overwrite stock or existing saved IDs', () => {
    assert.equal(core.copyId('frameui', ['frameui']), 'custom-frameui');
    assert.equal(core.copyId('custom-frameui', ['custom-frameui', 'custom-frameui-2']), 'custom-frameui-3');
    const id = core.copyId('a'.repeat(48), ['a'.repeat(48)]);
    assert.ok(id.length <= 48);
    assert.match(id, /^[a-z0-9]+(?:-[a-z0-9]+)*$/);
});


test('all sixty shipped screens use 1-5 seconds with short transitions and bounded readiness', () => {
    let short = 0;
    for (const item of core.catalog) {
        const effect = core.createEffect(item.id), timing = effect.timing;
        const duration = timing['minimum-ticks'] + timing['fade-out-ticks'];
        assert.ok(duration >= 20 && duration <= 100, item.id);
        assert.ok(timing['maximum-ticks'] + timing['fade-out-ticks'] <= 100, item.id);
        if (duration <= 40) short++;
    }
    assert.ok(short >= 10);
    assert.equal(core.createEffect('fade-in').timing['fade-out-ticks'], 20);
});

test('editable copies retain the shader and image while isolating nested settings from their source', () => {
    for (const item of core.catalog) {
        const original = core.createEffect(item.id), baseline = core.toYaml(original);
        const copy = core.userCopy(original, core.catalog.map(entry => entry.id));
        assert.equal(copy.category, 'My Effects');
        assert.notEqual(copy.id, original.id);
        assert.equal(copy.template, original.template);
        if (original.appearance.image) assert.equal(copy.appearance.image, `images/${copy.id}.png`);
        copy.timing = core.durationTiming(copy.timing, 3.5);
        copy.appearance.primary = '#123456'; copy.elements['text-x'] = .25;
        copy.filters.worlds.include.push('private-world');
        assert.equal(core.toYaml(original), baseline);
        assert.deepEqual(core.fromYaml(core.toYaml(copy)), copy);
        assert.equal(core.toYaml(core.createEffect(item.id)), baseline);
        const second = core.userCopy(original, [copy.id]);
        assert.notEqual(second.id, copy.id);
    }
});

test('duration editing scales all phases and keeps every template valid at short and long durations', () => {
    for (const item of core.catalog) for (const seconds of [.05, 1, 2.5, 5, 60]) {
        const effect = core.createEffect(item.id), before = core.clone(effect.timing);
        const timing = core.durationTiming(effect.timing, seconds);
        assert.deepEqual(effect.timing, before);
        effect.timing = timing; core.validate(effect);
        assert.equal(timing['minimum-ticks'] + timing['fade-out-ticks'], Math.round(seconds * 20));
    }
    const exitOnly = core.createEffect('fade-in');
    assert.equal(core.durationTiming(exitOnly.timing, 3)['minimum-ticks'], 0);
    for (const value of [0, -1, 61, NaN, Infinity]) assert.throws(() => core.durationTiming(exitOnly.timing, value), /Duration/);
});

test('automatic copies get distinct readable names, including copies of numbered copies', () => {
    const source = core.createEffect('fade-out'), ids = [], names = [];
    for (let i = 1; i <= 12; i++) {
        const copy = core.userCopy(i === 1 ? source : { ...source, name: names[names.length - 1] }, ids, names);
        assert.equal(copy.name, 'Fade Out · Copy' + (i === 1 ? '' : ' ' + i));
        core.validate(copy); ids.push(copy.id); names.push(copy.name);
    }
    assert.equal(new Set(ids).size, 12);
    assert.equal(core.userCopy({ ...source, name: 'Fade Out · Kopya 2' }, [], names).name, 'Fade Out · Copy 13');
    assert.equal(core.userCopy(source, [], ['Fade Out · Copy', 'Fade Out · Copy 3']).name, 'Fade Out · Copy 2');
});

test('copy-name collisions ignore letter case and respect the 64-character export limit', () => {
    assert.equal(core.uniqueName('Fade Out · Copy', ['  FADE OUT · COPY  ']), 'Fade Out · Copy 2');
    const source = core.createEffect('frameui'); source.name = 'A'.repeat(64);
    const names = [];
    for (let i = 0; i < 15; i++) {
        const copy = core.userCopy(source, [], names);
        assert.ok(copy.name.length <= 64); core.validate(copy); names.push(copy.name);
    }
    assert.equal(new Set(names).size, 15);
    assert.equal(core.uniqueName('Fade Out · Copy 2', ['Fade Out · Copy', 'Fade Out · Copy 2']), 'Fade Out · Copy 3');
});

test('automatic playback is explicitly selected and survives standalone YAML and ZIP export', async () => {
    for (const item of core.catalog) assert.deepEqual(core.createEffect(item.id)['play-on'], []);
    const effect = core.userCopy(core.createEffect('clean-loader'), [], []);
    effect['play-on'] = ['join', 'teleport', 'world-change'];
    const zip = core.zip({ [`effects/${effect.id}.yml`]: core.toYaml(effect) });
    const entries = await core.unzip(zip);
    assert.deepEqual(core.fromYaml(core.decoder.decode(entries[`effects/${effect.id}.yml`])), effect);
    assert.deepEqual(core.fromYaml('id: old-design\ntemplate: fade-out\nfilters:\n  triggers: [join, teleport]\n')['play-on'], []);
    assert.deepEqual(core.fromYaml('id: selected\ntemplate: fade-out\nplay-on: [JOIN, WORLD_CHANGE]\n')['play-on'], ['join', 'world-change']);
    for (const events of [['command'], ['unknown'], ['join', 'join'], 'join', [42]]) {
        const invalid = core.clone(effect); invalid['play-on'] = events;
        assert.throws(() => core.validate(invalid), /playback/);
    }
});
test('None background round-trips without removing image, widgets or event bindings', () => {
    const effect = core.createEffect('frameui');
    effect.elements.background = 'none';
    effect.elements['image-animation'] = 'grow';
    effect.elements.progress = 'bar';
    effect['play-on'] = ['join','teleport','world-change'];
    const restored = core.fromYaml(core.toYaml(effect));
    assert.equal(restored.elements.background, 'none');
    assert.equal(restored.appearance.image, effect.appearance.image);
    assert.equal(restored.elements['image-animation'], 'grow');
    assert.equal(restored.elements.progress, 'bar');
    assert.deepEqual(restored['play-on'], effect['play-on']);
});

test('second-based phase edits preserve hold and world-loading wait without exposing tick arithmetic', () => {
    let timing = { 'fade-in-ticks': 10, 'minimum-ticks': 40, 'maximum-ticks': 60, 'fade-out-ticks': 10 };
    assert.deepEqual(core.timingSeconds(timing), { entrance: .5, hold: 1.5, exit: .5, wait: 1 });
    timing = core.phaseTiming(timing, 'entrance', .75);
    assert.deepEqual(core.timingSeconds(timing), { entrance: .75, hold: 1.5, exit: .5, wait: 1 });
    timing = core.phaseTiming(timing, 'hold', 2.25);
    timing = core.phaseTiming(timing, 'exit', .8);
    timing = core.phaseTiming(timing, 'wait', 1.25);
    assert.deepEqual(timing, { 'fade-in-ticks': 15, 'minimum-ticks': 60, 'maximum-ticks': 85, 'fade-out-ticks': 16 });
    const effect = core.createEffect('aurora'); effect.timing = timing;
    assert.deepEqual(core.fromYaml(core.toYaml(effect)).timing, timing);
});

test('phase editing supports zero entrances, rounds to server resolution and rejects invalid waits', () => {
    const timing = { 'fade-in-ticks': 0, 'minimum-ticks': 0, 'maximum-ticks': 0, 'fade-out-ticks': 1 };
    assert.equal(core.phaseTiming(timing, 'hold', .13)['minimum-ticks'], 3);
    for (const value of [NaN, Infinity, -.1, 60.1]) assert.throws(() => core.phaseTiming(timing, 'hold', value));
    assert.throws(() => core.phaseTiming(timing, 'exit', 0));
    assert.throws(() => core.phaseTiming(timing, 'unknown', 1));
    const long = { 'fade-in-ticks': 20, 'minimum-ticks': 1180, 'maximum-ticks': 1200, 'fade-out-ticks': 1 };
    assert.throws(() => core.phaseTiming(long, 'wait', 2), /60 seconds/);
    assert.deepEqual(core.phaseTiming(timing, 'entrance', 0), timing);
});

test('transparent backgrounds disable only colors with no visible consumers', () => {
    const effect = core.createEffect('aurora');
    effect.elements.background = 'none'; effect.elements.progress = 'none'; effect.elements.decoration = 'none';
    effect.captions.enabled = true; effect.captions.title = 'Welcome'; effect.captions.subtitle = 'Loading';
    const original = core.clone(effect);
    let disabled = core.disabledSettings(effect, false);
    assert.ok(disabled['appearance.background']); assert.ok(disabled['appearance.palette']);
    assert.equal(disabled['appearance.primary'], undefined); assert.equal(disabled['appearance.secondary'], undefined);
    assert.deepEqual(effect, original);
    effect.captions.enabled = false;
    disabled = core.disabledSettings(effect, false);
    assert.ok(disabled['appearance.primary']); assert.ok(disabled['appearance.secondary']);
    assert.ok(disabled['captions.title']); assert.ok(disabled['elements.text-animation']);
    effect.elements.progress = 'bar';
    disabled = core.disabledSettings(effect, false);
    assert.equal(disabled['appearance.primary'], undefined);
    assert.equal(disabled['elements.progress-width'], undefined);
});

test('image, indicator and palette controls re-enable without losing configured values', () => {
    const effect = core.createEffect('aurora'); effect.elements.progress = 'none'; effect.elements.decoration = 'none';
    effect.appearance.palette = 'original';
    let disabled = core.disabledSettings(effect, false);
    assert.ok(disabled['appearance.background']); assert.ok(disabled['appearance.image-fit']);
    assert.ok(disabled['elements.progress-width']); assert.equal(disabled['appearance.palette'], undefined);
    effect.appearance.palette = 'custom'; effect.elements.progress = 'ring';
    disabled = core.disabledSettings(effect, true);
    for (const path of ['appearance.background', 'appearance.primary', 'appearance.secondary', 'appearance.image-fit', 'elements.image-delay', 'elements.progress-width']) assert.equal(disabled[path], undefined, path);
    effect.timing['fade-in-ticks'] = 0;
    assert.ok(core.disabledSettings(effect, true)['elements.image-delay']);
    effect.timing['fade-in-ticks'] = 10;
    assert.equal(core.disabledSettings(effect, true)['elements.image-delay'], undefined);
});

test('composed layouts use direct color endpoints independently of palette mode', () => {
    const effect = core.createEffect('aurora'); effect.elements.background = 'solid';
    effect.elements.progress = 'none'; effect.elements.decoration = 'none'; effect.captions.enabled = false;
    effect.appearance.palette = 'original';
    const disabled = core.disabledSettings(effect, false);
    assert.equal(disabled['appearance.background'], undefined);
    assert.ok(disabled['appearance.palette']); assert.ok(disabled['appearance.intensity']);
    assert.ok(disabled['appearance.primary']); assert.ok(disabled['appearance.speed']);
});
