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

test('text background padding expands selection bounds without shifting the text anchor', () => {
    const object=core.objectDefaults(), plain=core.objectRect(object,null,1280,720,font);
    object['background-opacity']=.5;
    const filled=core.objectRect(object,null,1280,720,font);
    assert.ok(filled.width>plain.width);assert.ok(filled.height>plain.height);
    assert.ok(Math.abs(filled.x+filled.width/2-object.x)<1e-9);
    assert.equal(object.y,.5);
});

test('large text resizing keeps the opposite painted edge fixed with or without a background', () => {
    for (const opacity of [0,1]) for (const handle of ['n','s','e','w','nw','ne','sw','se']) {
        const effect=core.createEffect('aurora'), object={...core.objectDefaults(),text:'Text',scale:4,'background-opacity':opacity,x:.45,y:.25};
        effect.elements.objects={'text-1':object};
        const before=core.objectRect(object,null,640,360,font);
        const next=core.transformElement(effect.elements,'text-1',handle.includes('w')?-.2:.3,handle.includes('n')?-.2:.35,handle,before);
        const after=core.objectRect(next.objects['text-1'],null,640,360,font);
        if(handle.includes('s')) assert.ok(Math.abs(after.y-before.y)<.0002,handle+' top moved');
        if(handle.includes('n')) assert.ok(Math.abs(after.y+after.height-before.y-before.height)<.0002,handle+' bottom moved');
        if(handle.includes('e')) assert.ok(Math.abs(after.x-before.x)<.0002,handle+' left moved');
        if(handle.includes('w')) assert.ok(Math.abs(after.x+after.width-before.x-before.width)<.0002,handle+' right moved');
        core.validate({...effect,elements:next});
    }
});
