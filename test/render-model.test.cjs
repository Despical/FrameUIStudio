const test = require('node:test');
const assert = require('node:assert/strict');
const core = require('../dist/core.js');
const font = require('../dist/caption-font.js');
core.configureCatalog(require('./catalog.json'));

test('every catalog timeline enters, holds and releases with the configured durations', () => {
    for (const preset of core.catalog) {
        const effect = core.createEffect(preset.id), t = effect.timing;
        if (t['fade-in-ticks']) {
            assert.equal(core.coverageAt(effect,0),0,preset.id);
            assert.equal(core.coverageAt(effect,t['fade-in-ticks']/2),.5,preset.id);
        }
        assert.equal(Math.abs(core.coverageAt(effect,t['minimum-ticks'])),1,preset.id);
        assert.equal(core.coverageAt(effect,t['minimum-ticks']+t['fade-out-ticks']/2),-.5,preset.id);
        assert.equal(Math.abs(core.coverageAt(effect,t['minimum-ticks']+t['fade-out-ticks'])),0,preset.id);
    }
    const fade = core.createEffect('fade-in');
    Object.assign(fade.timing,{'fade-in-ticks':20,'minimum-ticks':40,'maximum-ticks':40,'fade-out-ticks':20});
    assert.equal(core.coverageAt(fade,0),0);
    assert.equal(core.coverageAt(fade,10),.5);
    assert.equal(core.coverageAt(fade,50),-.5);
});

test('caption entrances share the game opacity threshold and keep instant lines visible', () => {
    const effect = core.createEffect('frameui');
    for (const animation of ['still','grow','slide-up','slide-down','slide-left','slide-right']) {
        effect.elements['title-animation'] = animation;
        assert.equal(core.captionFrame(effect,'title',0).alpha,0,animation);
        assert.equal(core.captionFrame(effect,'title',1).alpha,1,animation);
        assert.equal(Math.abs(core.captionFrame(effect,'title',1).x),0);
        assert.equal(Math.abs(core.captionFrame(effect,'title',1).y),0);
    }
    effect.elements['title-animation'] = 'none';
    assert.equal(core.captionFrame(effect,'title',0).alpha,1);
    assert.equal(core.captionFrame(effect,'subtitle',0).alpha,0);
});

test('caption layout uses actual Minecraft glyph widths, including Turkish text', () => {
    assert.equal(font.measure('BERKE').width,30);
    assert.equal(font.measure('iii').width,6);
    assert.equal(font.measure('WWW').width,18);
    assert.equal(font.measure('A A').width,16);
    assert.equal(font.measure('Berke Akçen').width,62);
    assert.ok(font.measure('İstanbul, çığ ve Şeker').width>0);
});

test('legacy placeholder-bearing plain YAML can be imported from an existing server', () => {
    const effect = core.fromYaml('id: loading\ncaptions:\n  teleport-detail: Travelling to {world}\n');
    assert.equal(effect.captions['teleport-detail'],'Travelling to {world}');
});

test('legacy growing captions use the editable title entrance without hiding the other lines', () => {
    const effect = core.fromYaml('id: legacy-grow\ntemplate: aurora\nappearance:\n  title-motion: grow\n');
    assert.equal(effect.elements['title-animation'],'grow');
    assert.equal(effect.elements['subtitle-animation'],'still');
    assert.deepEqual(core.fromYaml(core.toYaml(effect)),effect);
});
