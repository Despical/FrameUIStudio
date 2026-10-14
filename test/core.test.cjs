const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const core = require('../dist/core.js');
core.configureCatalog(require('./catalog.json'));

test('all 50 templates round-trip through complete plugin YAML', () => {
    assert.equal(core.catalog.length, 50);
    for (const template of core.catalog) {
        const definition = core.createEffect(template.id);
        assert.deepEqual(core.fromYaml(core.toYaml(definition)), definition, template.id);
    }
});

test('backend effect definitions load without unsupported fields or altered behavior', () => {
    const directory = path.resolve(__dirname, '../../src/main/resources/effects');
    const files = fs.existsSync(directory) ? fs.readdirSync(directory).filter(name => name.endsWith('.yml')) : [];
    assert.equal(files.length, 50);
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
    const definition = core.createEffect('aurora'); definition.id = 'custom-aurora'; definition.appearance.image = 'images/custom-aurora.png';
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
