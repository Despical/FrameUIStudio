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
const loop = require('../dist/preview-loop.js');
function harness() {
    let now=0,id=0,playing=false,visible=true;
    const jobs=new Map(),frames=[];
    const schedule=(callback,time)=>{jobs.set(++id,{callback,time});return id;};
    const clock={performance:{now:()=>now},requestAnimationFrame:callback=>schedule(callback,(Math.floor((now+.001)/(1000/60))+1)*(1000/60)),
        cancelAnimationFrame:id=>jobs.delete(id),setTimeout:(callback,delay)=>schedule(callback,now+delay),clearTimeout:id=>jobs.delete(id)};
    const preview=loop.create({fps:30,playing:()=>playing,visible:()=>visible,render:(...args)=>frames.push(args)},clock);
    function advance(ms) {
        const target=now+ms;let count=0;
        while(jobs.size) {
            const [id,job]=[...jobs].sort((a,b)=>a[1].time-b[1].time)[0];
            if(job.time>target)break;
            assert.ok(++count<10000,'scheduler must not spin');jobs.delete(id);now=job.time;job.callback(now);
        }
        now=target;
    }
    return {preview,advance,frames,jobs,setPlaying:value=>playing=value,setVisible:value=>visible=value};
}
test('paused preview draws once per edit and has no idle timers or animation frames',()=>{
    const h=harness();h.preview.invalidate();h.preview.invalidate();h.advance(1000);
    assert.equal(h.frames.length,1);assert.equal(h.jobs.size,0);
    h.advance(60000);assert.equal(h.frames.length,1);
    h.preview.invalidate();h.advance(100);assert.equal(h.frames.length,2);assert.equal(h.jobs.size,0);
});
test('playing preview stays at 30 FPS and stops immediately when hidden',()=>{
    const h=harness();h.setPlaying(true);h.preview.invalidate();h.advance(1000);
    assert.ok(h.frames.length>=29 && h.frames.length<=31,String(h.frames.length));
    const count=h.frames.length;h.setVisible(false);h.preview.suspend();h.advance(60000);
    assert.equal(h.frames.length,count);assert.equal(h.jobs.size,0);
    h.setVisible(true);h.preview.invalidate();h.advance(20);
    assert.equal(h.frames.at(-1)[1],0,'resume must not fast-forward the effect');
});
test('pausing and editing never loses a queued redraw and stops the continuous loop',()=>{
    const h=harness();h.setPlaying(true);h.preview.invalidate();h.advance(250);
    h.setPlaying(false);h.preview.invalidate();h.advance(100);const count=h.frames.length;
    h.advance(1000);assert.equal(h.frames.length,count);assert.equal(h.jobs.size,0);
    assert.equal(h.frames.at(-1)[2],true);
});
