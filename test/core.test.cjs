const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const core = require('../dist/core.js');
core.configureCatalog(require('./catalog.json'));

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
    const definition = core.createEffect('aurora'); definition.id = 'custom-aurora'; definition.category = 'Efektlerim'; definition.appearance.image = 'images/custom-aurora.png';
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
    assert.deepEqual(core.categories, ['Animasyonlar', 'Hazır Tasarımlar', 'Efektlerim']);
    assert.equal(core.catalog.filter(item => item.category === 'Animasyonlar').length, 50);
    assert.equal(core.catalog.filter(item => item.category === 'Hazır Tasarımlar').length, 10);
    assert.equal(core.fromYaml('id: aurora\ncategory: Nature').category, 'Animasyonlar');
    assert.equal(core.fromYaml('id: frameui\ntemplate: fade-black\ncategory: Signature').category, 'Hazır Tasarımlar');
    assert.equal(core.fromYaml('id: my-screen\ntemplate: aurora\ncategory: Nature').category, 'Efektlerim');
    assert.equal(core.fromYaml('id: aurora\ncategory: Efektlerim').category, 'Efektlerim');
});

test('custom copies never overwrite stock or existing saved IDs', () => {
    assert.equal(core.copyId('frameui', ['frameui']), 'custom-frameui');
    assert.equal(core.copyId('custom-frameui', ['custom-frameui', 'custom-frameui-2']), 'custom-frameui-3');
    const id = core.copyId('a'.repeat(48), ['a'.repeat(48)]);
    assert.ok(id.length <= 48);
    assert.match(id, /^[a-z0-9]+(?:-[a-z0-9]+)*$/);
});
