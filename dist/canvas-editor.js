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
(function (scope) {
    'use strict';
    const t = window.FrameStudioI18n?.t || (value => value);
    function create(options) {
        const core = scope.FrameStudioCore, stage = options.stage;
        const labels = {image:'Image', title:'Title', subtitle:'Subtitle', detail:'Extra line', progress:'Indicator'};
        const toolbar = document.createElement('div'); toolbar.className = 'canvas-toolbar';
        toolbar.setAttribute('role', 'toolbar'); toolbar.setAttribute('aria-label', t('Arrange screen elements'));
        const overlay = document.createElement('div'); overlay.className = 'canvas-editor';
        const boxes = new Map(), buttons = new Map(), rects = new Map();
        let selected = '', gesture = null, renderedKey = '';
        const guides = {};
        for (const axis of ['x', 'y']) {
            const line = document.createElement('div'); line.className = 'canvas-guide canvas-guide-' + axis;
            line.hidden = true; line.setAttribute('aria-hidden', 'true'); overlay.append(line); guides[axis] = line;
        }
        function showGuides(lines = []) {
            for (const axis of ['x','y']) {
                const line = lines.find(item => item.axis === axis), node = guides[axis]; node.hidden = !line;
                if (!line) continue;
                const horizontal = axis === 'y';
                node.style.left = (horizontal ? line.from : line.position) * 100 + '%';
                node.style.top = (horizontal ? line.position : line.from) * 100 + '%';
                node.style.width = horizontal ? (line.to - line.from) * 100 + '%' : '1px';
                node.style.height = horizontal ? '1px' : (line.to - line.from) * 100 + '%';
            }
        }

        function addObjectControl(kind,label) {
            labels[kind]=label;
            const button = document.createElement('button'); button.type = 'button';
            button.textContent = t(labels[kind]); button.dataset.canvasSelect = kind;
            button.setAttribute('aria-pressed', 'false');
            button.addEventListener('click', () => { options.pause(); select(kind); render(); });
            toolbar.append(button); buttons.set(kind, button);
            const box = document.createElement('div'); box.className = 'canvas-object';
            box.dataset.canvasObject = kind; box.tabIndex = 0; box.setAttribute('role', 'button');
            box.setAttribute('aria-label', t('Move ' + labels[kind].toLowerCase()));
            box.addEventListener('pointerdown', event => begin(event, kind, ''));
            box.addEventListener('keydown', event => nudge(event, kind));
            for (const corner of ['nw','n','ne','e','se','s','sw','w']) {
                const handle = document.createElement('button'); handle.type = 'button';
                handle.className = 'canvas-handle canvas-handle-' + corner; handle.dataset.corner = corner;
                const sideNames = {n:'top edge',s:'bottom edge',e:'right edge',w:'left edge',nw:'top-left corner',ne:'top-right corner',sw:'bottom-left corner',se:'bottom-right corner'};
                handle.setAttribute('aria-label', t('Resize ' + labels[kind].toLowerCase() + ' ' + sideNames[corner]));
                handle.title = t(corner.length === 2 ? 'Resize proportionally' : corner === 'e' || corner === 'w' ? 'Change width only' : kind === 'progress' ? 'Change thickness only' : 'Change height only');
                handle.addEventListener('pointerdown', event => begin(event, kind, corner));
                handle.addEventListener('keydown', event => nudge(event, kind, corner));
                box.append(handle);
            }
            boxes.set(kind, box); overlay.append(box);
        }
        for (const kind of ['image','title','subtitle','detail','progress']) addObjectControl(kind,labels[kind]);
        stage.parentElement.before(toolbar); stage.append(overlay);
        const translatedAttributes = [...toolbar.querySelectorAll('[aria-label]'), toolbar, ...overlay.querySelectorAll('[aria-label],[title]')].map(node => ({node,
            aria:node.getAttribute('aria-label'), title:node.getAttribute('title')}));
        // Store English sources so switching repeatedly never translates a previous translation.
        for (const entry of translatedAttributes) {
            if (entry.node === toolbar) entry.aria = 'Arrange screen elements';
            const kind = entry.node.dataset.canvasObject;
            if (kind) entry.aria = 'Move ' + labels[kind].toLowerCase();
            const handle = entry.node.dataset.corner;
            if (handle) {
                const owner = entry.node.parentElement.dataset.canvasObject;
                const sides = {n:'top edge',s:'bottom edge',e:'right edge',w:'left edge',nw:'top-left corner',ne:'top-right corner',sw:'bottom-left corner',se:'bottom-right corner'};
                entry.aria = 'Resize ' + labels[owner].toLowerCase() + ' ' + sides[handle];
                entry.title = handle.length === 2 ? 'Resize proportionally' : handle === 'e' || handle === 'w' ? 'Change width only' : owner === 'progress' ? 'Change thickness only' : 'Change height only';
            }
        }
        toolbar.setAttribute('aria-label',t('Arrange screen elements'));
        scope.addEventListener('frameui:language', () => {
            for (const [kind, button] of buttons) {const o=options.effect().elements.objects?.[kind];button.textContent=o?t(o.type==='image'?'Image':'Text')+' '+kind.split('-').pop():t(labels[kind]);}
            for (const entry of translatedAttributes) {
                if (entry.aria) entry.node.setAttribute('aria-label',t(entry.aria));
                if (entry.title) entry.node.setAttribute('title',t(entry.title));
            }
        });

        function select(kind) {
            const changed = selected !== kind;
            if (changed && kind) options.pause();
            selected = kind;
            for (const [key, box] of boxes) {
                box.classList.toggle('selected', key === kind);
                buttons.get(key).setAttribute('aria-pressed', String(key === kind));
            }
            if (changed) options.select?.(kind);
        }
        function captionRect(definition, kind, width, height) {
            const e = definition.elements, line = core.captionLines[kind], anchor = core.elementAnchor(e,kind);
            const text = definition.captions[line.key].replaceAll('{effect}',definition.name).replaceAll('{world}','world');
            if (!text.trim()) return null;
            const fit = Math.min(width/640,height/360), scale = e['text-scale'] * e[kind+'-scale'];
            const pixels = line.size / 10 * fit * scale, metrics = scope.FrameStudioFont.measure(text);
            const w = Math.max(1,metrics.width) * pixels * e['text-stretch-x'] * e[kind+'-stretch-x'] / width;
            const yScale = pixels * e['text-stretch-y'] * e[kind+'-stretch-y'] / height;
            return {x:anchor.x-w/2,y:anchor.y+metrics.top*yScale,width:w,height:metrics.height*yScale};
        }
        function render() {
            const definition = options.effect(), e = definition.elements, width = stage.clientWidth, height = stage.clientHeight;
            if (!width || !height) return;
            const image = options.image();
            for (const [kind,object] of Object.entries(e.objects || {})) if (!boxes.has(kind)) addObjectControl(kind,t(object.type==='image'?'Image':'Text')+' '+kind.split('-').pop());
            for (const kind of [...boxes.keys()]) if (!['image','title','subtitle','detail','progress'].includes(kind) && !e.objects?.[kind]) {boxes.get(kind).remove();buttons.get(kind).remove();boxes.delete(kind);buttons.delete(kind);if(selected===kind) select('');}
            const key = JSON.stringify([e,definition.captions,definition.name,definition.appearance['image-fit'],width,height,image?.width,image?.height]);
            if (key === renderedKey) {options.geometry?.(selected,rects.get(selected));return;}
            renderedKey = key; rects.clear();
            if (image && definition.appearance.image) {
                const ratio = (width / height) / (image.width / image.height);
                const contain = definition.appearance['image-fit'] === 'contain';
                const w = (contain ? Math.min(1 / ratio, 1) : Math.max(1 / ratio, 1)) * e['image-scale'] * e['image-stretch-x'];
                const h = (contain ? Math.min(ratio, 1) : Math.max(ratio, 1)) * e['image-scale'] * e['image-stretch-y'];
                rects.set('image', {x: e['image-x']-w/2, y: e['image-y']-h/2, width:w, height:h});
            }
            if (definition.captions.enabled) for (const kind of Object.keys(core.captionLines)) {
                const rect = captionRect(definition,kind,width,height); if (rect) rects.set(kind,rect);
            }
            for (const [kind,object] of Object.entries(e.objects || {})) {
                const display={...object,text:options.text?options.text(object.text):object.text};
                const rect=core.objectRect(display,options.objectImage?.(object.image),width,height,scope.FrameStudioFont);
                if(rect) rects.set(kind,rect);
            }
            if (e.progress !== 'none') {
                const h = e.progress === 'ring' ? e['progress-width'] * width / height : (e.progress === 'dots' ? 7.2 : 6) * width / 640 * e['progress-scale'] / height;
                rects.set('progress', {x:e['progress-x']-e['progress-width']/2,y:e['progress-y']-h/2,width:e['progress-width'],height:h});
            }
            for (const [kind, box] of boxes) {
                const rect = rects.get(kind); box.hidden = !rect; buttons.get(kind).disabled = !rect;
                if (!rect) continue;
                box.style.left = rect.x * 100 + '%'; box.style.top = rect.y * 100 + '%';
                box.style.width = rect.width * 100 + '%'; box.style.height = rect.height * 100 + '%';
                box.style.setProperty('--hit-padding', Math.max(0,(28-rect.height*height)/2)+'px');
                box.style.setProperty('--hit-padding-x', Math.max(0,(28-rect.width*width)/2)+'px');
                box.style.setProperty('--handle-pad-x', Math.max(8,(56-rect.width*width)/2)+'px');
                box.style.setProperty('--handle-pad-y', Math.max(8,(44-rect.height*height)/2)+'px');
            }
            options.geometry?.(selected,rects.get(selected));
        }
        function begin(event, kind, corner) {
            if (event.button !== 0 || gesture) return;
            event.preventDefault(); event.stopPropagation(); options.pause(); select(kind); render();
            const rect = rects.get(kind); if (!rect) return;
            const target = event.currentTarget;
            gesture = {kind,corner,rect:{...rect},before:core.clone(options.effect().elements),x:event.clientX,y:event.clientY,
                width:stage.clientWidth,height:stage.clientHeight,targets:[...rects].filter(([key])=>key!==kind).map(([,rect])=>({...rect})),target,pointer:event.pointerId};
            target.setPointerCapture(event.pointerId); target.focus({preventScroll:true});
            stage.classList.add('canvas-transforming');
        }
        function move(event) {
            const g = gesture; if (!g || event.pointerId !== g.pointer) return;
            event.preventDefault();
            let next = core.transformElement(g.before,g.kind,(event.clientX-g.x)/g.width,(event.clientY-g.y)/g.height,g.corner,g.rect);
            if (!g.corner && !event.altKey) {
                const snapped = core.snapElement(g.before,next,g.kind,g.rect,g.width,g.height,8,g.targets);
                next = snapped.elements; showGuides(snapped.lines);
            } else showGuides();
            options.update(next);
            render();
        }
        function finish(cancel) {
            const g = gesture; if (!g) return;
            gesture = null; showGuides(); stage.classList.remove('canvas-transforming');
            if (cancel) options.update(g.before); else options.commit(g.before);
            if (g.target.hasPointerCapture(g.pointer)) g.target.releasePointerCapture(g.pointer);
            render();
        }
        function nudge(event, kind, corner = '') {
            if (!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key)) return;
            event.preventDefault(); event.stopPropagation(); options.pause(); select(kind); render();
            const before = core.clone(options.effect().elements), amount = event.shiftKey ? 10 : 1;
            const dx = (event.key==='ArrowRight'?amount:event.key==='ArrowLeft'?-amount:0)/stage.clientWidth;
            const dy = (event.key==='ArrowDown'?amount:event.key==='ArrowUp'?-amount:0)/stage.clientHeight;
            options.update(core.transformElement(before,kind,dx,dy,corner,rects.get(kind))); options.commit(before); render();
        }
        overlay.addEventListener('pointermove', move);
        overlay.addEventListener('pointerup', event => { if (gesture && event.pointerId===gesture.pointer) {move(event); finish(false);} });
        overlay.addEventListener('pointercancel', () => finish(true));
        overlay.addEventListener('lostpointercapture', () => finish(true));
        document.addEventListener('keydown', event => {if(event.key==='Escape') {event.preventDefault(); if(gesture) finish(true); else select('');}});
        window.addEventListener('blur', () => finish(true));
        window.addEventListener('resize', () => {finish(true);render();});
        overlay.addEventListener('pointerdown', event => { if (event.target === overlay) select(''); });
        stage.addEventListener('pointerdown', event => { if (!event.target.closest('.canvas-object')) select(''); });
        return {render,select,selection:()=>selected,bounds:kind=>rects.get(kind),setGeometry(kind,property,value,commit=true) {
            options.pause(); render();
            const rect = rects.get(kind); if (!rect) return;
            const before = core.clone(options.effect().elements);
            let next;
            if (property === 'x' || property === 'y') next = core.translateElement(before,kind,property==='x'?value-rect.x:0,property==='y'?value-rect.y:0);
            else next = core.transformElement(before,kind,property==='width'?value-rect.width:0,property==='height'?value-rect.height:0,property==='width'?'e':'s',rect);
            options.update(next); if (commit) options.commit(before); render();
        }};
    }
    scope.FrameStudioCanvas = {create};
})(window);
