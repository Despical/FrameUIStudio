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
    const data = typeof module !== 'undefined' && module.exports ? require('./font-data.js') : scope.FrameStudioFontData;
    const sheets = [];
    const glyph = character => data.glyphs[character] || data.glyphs['\ufffd'] || data.glyphs['?'];
    function measure(text) {
        let width = 0, top = 0, bottom = 8;
        for (const character of text) {
            const item = glyph(character); width += item[5];
            if (item[0] >= 0) { top = Math.min(top,item[6]); bottom = Math.max(bottom,item[6]+item[4]*item[7]); }
        }
        return {width,top,bottom,height:bottom-top};
    }
    async function load() {
        await Promise.all(data.sheets.map(async (url,index) => {
            const image = new Image(); image.src = url; await image.decode(); sheets[index] = image;
        }));
    }
    function render(node,text,color,size) {
        const metrics = measure(text), unit = size / 10;
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1,Math.ceil(metrics.width)); canvas.height = Math.ceil(metrics.height);
        const ctx = canvas.getContext('2d'); ctx.imageSmoothingEnabled = false;
        let x = 0;
        for (const character of text) {
            const item = glyph(character);
            if (item[0] >= 0) ctx.drawImage(sheets[item[0]],item[1],item[2],item[3],item[4],
                x,item[6]-metrics.top,item[3]*item[7],item[4]*item[7]);
            x += item[5];
        }
        ctx.globalCompositeOperation = 'source-in'; ctx.fillStyle = color; ctx.fillRect(0,0,canvas.width,canvas.height);
        canvas.style.width = metrics.width*unit+'px'; canvas.style.height = metrics.height*unit+'px';
        canvas.style.position = 'absolute'; canvas.style.top = metrics.top*unit+'px'; canvas.style.left = '0';
        canvas.style.imageRendering = unit < 1 ? 'auto' : 'pixelated'; canvas.setAttribute('aria-hidden','true');
        node.replaceChildren(canvas); node.setAttribute('aria-label',text);
        node.style.width = metrics.width*unit+'px'; node.style.height = '0';
        node.hidden = !text; node.dataset.caption = text;
    }
    const api = {measure,load,render};
    if (typeof module !== 'undefined' && module.exports) module.exports = api; else scope.FrameStudioFont = api;
})(typeof window !== 'undefined' ? window : globalThis);
