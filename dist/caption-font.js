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
    // Explicit dimensions stay fixed; automatic dimensions follow the lettering.
    function layout(text,style={},backgroundOpacity=0) {
        const metrics=measure(text);
        const size=(style['font-size']??100)/100, padding=style.padding??2;
        // Preserve legacy transparent captions, whose glyphs had no padding.
        const inset=backgroundOpacity>0 || style['box-width'] || style['box-height'] || padding!==2 ? padding : 0;
        // Reserve horizontal room and half a line-height of vertical room.
        // Dimensions and anchor depend on the text and size, never on alignment.
        const alignmentSpace=metrics.height*size*2;
        const box={width:style['box-width']||Math.max(1,metrics.width*size+inset*2+alignmentSpace),height:style['box-height']||metrics.height*size*1.5+inset*2,top:metrics.top-(style['box-height']?(backgroundOpacity>0?2:0):inset)};
        const alignX=({left:0,center:.5,right:1})[style['align-x']||'center'];
        const alignY=({top:0,middle:.5,bottom:1})[style['align-y']||'top'];
        box.left=-box.width/2;
        const spaceX=box.width-inset*2-metrics.width*size, spaceY=box.height-inset*2-metrics.height*size;
        // Keep the selected edge anchored even when the text exceeds the box.
        // The viewport clips overflow; clamping the available space would disable alignment.
        return {metrics,box,size,x:inset+spaceX*alignX,
            y:box.top+inset+spaceY*alignY};
    }
    function render(node,text,color,size,background='#081221',backgroundOpacity=0,style={}) {
        const placed=layout(text,style,backgroundOpacity), {metrics,box}=placed, unit=size/10;
        const source=document.createElement('canvas');
        source.width=Math.max(1,Math.ceil(metrics.width)); source.height=Math.ceil(metrics.height);
        const ctx=source.getContext('2d'); ctx.imageSmoothingEnabled=false;
        let x=0;
        for (const character of text) {
            const item=glyph(character);
            if (item[0]>=0) ctx.drawImage(sheets[item[0]],item[1],item[2],item[3],item[4],x,item[6]-metrics.top,item[3]*item[7],item[4]*item[7]);
            x+=item[5];
        }
        const stroke=style['outline-width']||0, shadow=style.shadow?(style['shadow-offset']??1):0, margin=Math.ceil(Math.max(stroke,shadow));
        const canvas=document.createElement('canvas'); canvas.width=source.width+margin*2; canvas.height=source.height+margin*2;
        const painted=canvas.getContext('2d'); painted.imageSmoothingEnabled=false;
        function tint(color) {ctx.globalCompositeOperation='source-in';ctx.fillStyle=color;ctx.fillRect(0,0,source.width,source.height);}
        if (style.shadow) {tint(style['shadow-color']||'#000000');painted.drawImage(source,margin+shadow,margin+shadow);}
        if (stroke>0) {
            tint(style['outline-color']||'#000000');
            for (let y=-Math.ceil(stroke);y<=Math.ceil(stroke);y++) for (let x=-Math.ceil(stroke);x<=Math.ceil(stroke);x++) {
                if ((x||y) && Math.max(Math.abs(x),Math.abs(y))<=stroke) painted.drawImage(source,margin+x,margin+y);
            }
        }
        tint(color); painted.drawImage(source,margin,margin);
        const glyphUnit=unit*placed.size;
        canvas.style.width=canvas.width*glyphUnit+'px'; canvas.style.height=canvas.height*glyphUnit+'px';
        canvas.style.position='absolute'; canvas.style.left=(placed.x*unit-margin*glyphUnit)+'px'; canvas.style.top=((placed.y-box.top)*unit-margin*glyphUnit)+'px';
        canvas.style.opacity=String(style.opacity??1);canvas.style.imageRendering='pixelated';canvas.setAttribute('aria-hidden','true');
        const viewport=document.createElement('span');
        const boxLeft=(box.left+box.width/2)*unit+'px';
        Object.assign(viewport.style,{position:'absolute',left:boxLeft,top:box.top*unit+'px',width:box.width*unit+'px',height:box.height*unit+'px',overflow:'hidden'});
        viewport.className='text-viewport'; viewport.append(canvas);
        if (backgroundOpacity>0 && text.trim()) {
            const backdrop=document.createElement('span');backdrop.className='text-backdrop';
            Object.assign(backdrop.style,{position:'absolute',left:boxLeft,top:box.top*unit+'px',width:box.width*unit+'px',height:box.height*unit+'px',backgroundColor:background,opacity:String(backgroundOpacity)});
            node.replaceChildren(backdrop,viewport);
        } else node.replaceChildren(viewport);
        node.setAttribute('aria-label',text);node.style.width=box.width*unit+'px';node.style.height='0';
        node.hidden=!text;node.dataset.caption=text;
    }
    const api = {measure,layout,load,render};
    if (typeof module !== 'undefined' && module.exports) module.exports = api; else scope.FrameStudioFont = api;
})(typeof window !== 'undefined' ? window : globalThis);
