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

test('new text is centered on both axes and stored alignment remains unchanged', () => {
    const object=core.objectDefaults();
    assert.equal(object['align-x'],'center');
    assert.equal(object['align-y'],'middle');
    const effect=core.createEffect('frameui');
    effect.elements.objects['text-1']={...object,'align-x':'left','align-y':'bottom'};
    const loaded=core.fromYaml(core.toYaml(effect));
    assert.equal(loaded.elements.objects['text-1']['align-x'],'left');
    assert.equal(loaded.elements.objects['text-1']['align-y'],'bottom');
});

test('title subtitle and detail keep zero-size boxes fixed across all nine alignments', () => {
    const effect=core.createEffect('frameui');
    for (const kind of ['title','subtitle','detail']) {
        const style=core.captionStyle(effect,kind),text='Caption '+kind;
        let fixedBox,fixedRect;
        const positions=new Set();
        for (const x of ['left','center','right']) for (const y of ['top','middle','bottom']) {
            const aligned={...style,'box-width':0,'box-height':0,'align-x':x,'align-y':y};
            const placed=font.layout(text,aligned,0);
            const rect=core.textRect(text,aligned,0,.5,.5,1,1,1,640,360,font);
            if (!fixedBox) {fixedBox=placed.box;fixedRect=rect;}
            assert.deepEqual(placed.box,fixedBox,kind);
            assert.deepEqual(rect,fixedRect,kind);
            positions.add(placed.x+','+placed.y);
            assert.equal(placed.box.height,placed.metrics.height*1.5);
            assert.ok(placed.x>=0 && placed.x+placed.metrics.width*placed.size<=placed.box.width);
            assert.ok(placed.y>=placed.box.top && placed.y+placed.metrics.height*placed.size<=placed.box.top+placed.box.height);
        }
        assert.equal(positions.size,9,kind);
    }
});

test('text dependencies disable inactive controls and recover without changing values', () => {
    const effect = core.createEffect('frameui');
    effect.elements.objects['text-1'] = {...core.objectDefaults(), type:'text'};
    const object = effect.elements.objects['text-1'];
    object.shadow = false; object['outline-width'] = 0; object['background-opacity'] = 0;
    effect.captions.enabled = false;
    let disabled = core.disabledSettings(effect, false);
    for (const key of ['font-size','shadow','align-x','background-opacity','opacity','rotation']) assert.ok(disabled['captions.title-' + key], key);
    for (const key of ['shadow-color','shadow-offset','outline-color','background']) assert.ok(disabled['elements.objects.text-1.' + key], key);
    assert.equal(disabled['elements.objects.text-1.text'], undefined);
    assert.equal(disabled['elements.objects.text-1.shadow'], undefined);
    effect.captions.enabled = true;
    effect.captions['title-shadow'] = true;
    effect.captions['title-outline-width'] = 1;
    effect.captions['title-background-opacity'] = .5;
    object.shadow = true; object['outline-width'] = 1; object['background-opacity'] = .5;
    disabled = core.disabledSettings(effect, false);
    for (const key of ['shadow-color','shadow-offset','outline-color','background']) {
        assert.equal(disabled['captions.title-' + key], undefined, key);
        assert.equal(disabled['elements.objects.text-1.' + key], undefined, key);
    }
    object['shadow-offset'] = 0;
    effect.captions['title-shadow-offset'] = 0;
    disabled = core.disabledSettings(effect, false);
    assert.ok(disabled['elements.objects.text-1.shadow-color']);
    assert.ok(disabled['captions.title-shadow-color']);
    assert.equal(disabled['elements.objects.text-1.shadow-offset'], undefined);
    object['shadow-offset'] = .5;
    effect.captions['title-shadow-offset'] = .5;
    disabled = core.disabledSettings(effect, false);
    assert.equal(disabled['elements.objects.text-1.shadow-color'], undefined);
    assert.equal(disabled['captions.title-shadow-color'], undefined);
    assert.equal(core.fromYaml(core.toYaml(effect)).elements.objects['text-1']['shadow-offset'], .5);
});

test('font size changes glyphs independently of box dimensions and padding', () => {
    const style={...core.textDefaults(),'box-width':100,'box-height':40,padding:4,'align-x':'right','align-y':'bottom'};
    const before=font.layout('Test',style,1),after=font.layout('Test',{...style,'font-size':200},1);
    assert.deepEqual(after.box,before.box);
    assert.equal(after.size,2);
    assert.equal(after.x+after.metrics.width*2,96);
    assert.equal(after.y+after.metrics.height*2,after.box.top+36);
    const object={...core.objectDefaults(),text:'Test',...style,'background-opacity':1};
    assert.deepEqual(core.objectRect(object,null,640,360,font),core.objectRect({...object,'font-size':200},null,640,360,font));
    for(const padding of [0,2,12]) assert.deepEqual(font.layout('Test',{...style,padding},1).box,before.box);
});

test('alignment anchors each selected edge for fitting and overflowing text', () => {
    for (const dimensions of [{'box-width':12,'box-height':5}, {'box-width':200,'box-height':50}]) {
        for (const size of [100,200,400]) {
            const style = {...core.textDefaults(),...dimensions,'font-size':size,padding:4};
            const left = font.layout('Test', {...style,'align-x':'left','align-y':'top'},1);
            const center = font.layout('Test', {...style,'align-x':'center','align-y':'middle'},1);
            const right = font.layout('Test', {...style,'align-x':'right','align-y':'bottom'},1);
            assert.deepEqual(left.box,right.box);
            assert.equal(center.x,(left.x+right.x)/2);
            assert.equal(left.x,style.padding);
            assert.equal(left.y,left.box.top + style.padding);
            assert.equal(right.x+right.metrics.width*right.size,right.box.width-style.padding);
            assert.equal(right.y+right.metrics.height*right.size,right.box.top+right.box.height-style.padding);
            assert.notEqual(left.x,right.x);
            assert.notEqual(left.y,right.y);
        }
    }
});

test('zero dimensions keep the box fixed and align only its text', () => {
    for (const opacity of [0,1]) for (const padding of [0,2,8,32]) for (const size of [10,100,200,400]) {
        const style={...core.textDefaults(),padding,'font-size':size};
        const positions=[];
        let fixedBox, fixedBounds;
        for (const [x,y] of [['left','top'],['center','middle'],['right','bottom']]) {
            const placed=font.layout('Test',{...style,'align-x':x,'align-y':y},opacity);
            const object={...core.objectDefaults(),...style,'align-x':x,'align-y':y,'background-opacity':opacity,text:'Test'};
            const bounds=core.objectRect(object,null,640,360,font);
            if (!fixedBox) { fixedBox=placed.box; fixedBounds=bounds; }
            assert.deepEqual(placed.box,fixedBox,'Alignment must not move or resize the box');
            assert.deepEqual(bounds,fixedBounds,'Selection bounds must stay fixed');
            const left=placed.box.left+placed.x,top=placed.y;
            positions.push({left,top});
            assert.ok(placed.x>=0);
            assert.ok(placed.x+placed.metrics.width*placed.size<=placed.box.width+1e-9);
            assert.ok(top>=placed.box.top);
            assert.ok(top+placed.metrics.height*placed.size<=placed.box.top+placed.box.height+1e-9);
        }
        assert.ok(positions[0].left<positions[1].left && positions[1].left<positions[2].left);
        assert.ok(positions[0].top<positions[1].top && positions[1].top<positions[2].top);
    }
});

test('rotation bounds include all four corners and keep the caption anchor', () => {
    const object={...core.objectDefaults(),text:'Test','box-width':100,'box-height':40,rotation:90};
    const rect=core.objectRect(object,null,640,360,font),unit=.7*object.scale;
    assert.ok(Math.abs(rect.width*640-40*unit)<1e-8);
    assert.ok(Math.abs(rect.height*360-100*unit)<1e-8);
    assert.ok(Math.abs(rect.y-(object.y-50*unit/360))<1e-8);
});

test('all text settings and variable tokens survive YAML and ZIP import', async () => {
    const effect=core.createEffect('frameui');
    const style={...core.textDefaults(),'font-size':150,'box-width':100,'box-height':40,padding:5,'align-x':'right','align-y':'bottom',opacity:.3,rotation:-25,shadow:true,'shadow-color':'#123456','shadow-offset':2,'outline-width':2,'outline-color':'#654321'};
    effect.elements.objects['text-1']={...core.objectDefaults(),...style,text:'Hello {player} in {world} · {effect}'};
    for(const [key,value] of Object.entries(style)) effect.captions['title-'+key]=value;
    const yaml=core.toYaml(effect),zip=core.zip({'effects/test.yml':core.utf8.encode(yaml)});
    const entries=await core.unzip(zip);
    const loaded=core.fromYaml(core.decoder.decode(entries['effects/test.yml']));
    assert.deepEqual(loaded,effect);
    for(const [key,value] of [['font-size',0],['opacity',1.1],['rotation',181],['align-y','left'],['shadow','yes'],['outline-width',.5]]) {
        const invalid=core.clone(effect);invalid.elements.objects['text-1'][key]=value;
        assert.throws(()=>core.validate(invalid),undefined,key);
        const caption=core.clone(effect);caption.captions['title-'+key]=value;
        assert.throws(()=>core.validate(caption),undefined,key);
    }
});
