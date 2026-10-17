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
const fs = require('node:fs');
const vm = require('node:vm');
function fixture(responses, connected = true, address) {
    const calls = [], context = { window: {}, location: new URL(address || (connected ? 'http://localhost/studio/#server='+'a'.repeat(43) : 'https://studio.example/')),
        document: {querySelectorAll: () => []}, URL, URLSearchParams, Uint8Array,
        fetch: async (url, options) => { calls.push({url:String(url),...options}); return responses.shift(); } };
    vm.runInNewContext(fs.readFileSync(require.resolve('../dist/server-link.js'),'utf8'),context);
    return {api:context.window.FrameStudioServer,calls};
}
const response = (json,status=200) => ({ok:status===200,status,json:async()=>json});

test('hosted Studio connects directly to the server endpoint using fragment-only credentials', async () => {
    const address='https://frameui.despical.dev/?lang=tr#server='+'a'.repeat(43)+'&endpoint='+encodeURIComponent('https://mc.example:8443/studio/');
    const {api,calls}=fixture([response({player:'Admin'})],true,address);
    assert.equal(api.available,true); await api.connect();
    assert.equal(calls[0].url,'https://mc.example:8443/studio/api/session');
    assert.equal(calls[0].headers.Authorization,'Bearer '+'a'.repeat(43));
    assert.equal(calls[0].referrerPolicy,'no-referrer'); assert.equal(calls[0].mode,'cors');
    assert.equal(calls[0].credentials,'omit'); assert.equal(calls[0].redirect,'error');
});

test('hosted Studio rejects malformed and insecure public endpoints before sending credentials', async () => {
    for(const endpoint of ['http://public.example/studio/','https://user:password@mc.example/studio/',
        'https://mc.example/studio/?token=secret','https://mc.example/other/','file:///studio/']) {
        const {api,calls}=fixture([],true,'https://frameui.despical.dev/#server='+'a'.repeat(43)+'&endpoint='+encodeURIComponent(endpoint));
        await assert.rejects(api.connect(),/HTTPS|Invalid server/); assert.equal(calls.length,0,endpoint);
    }
    const {api,calls}=fixture([response({player:'Admin'})],true,'https://frameui.despical.dev/#server='+'a'.repeat(43)+'&endpoint='+encodeURIComponent('http://127.0.0.1:25645/studio/'));
    await api.connect(); assert.equal(calls[0].targetAddressSpace,'loopback');
});
test('connected library requests keep bearer capabilities out of URLs and bind saves to revisions', async () => {
    const {api,calls}=fixture([response({player:'Admin'}),response({effects:[{id:'custom'}]}),response({revision:'next'}),response({revision:'created'})]);
    await api.connect(); assert.equal((await api.listEffects())[0].id,'custom');
    const bytes=new Uint8Array([1,2]); await api.importEffect(bytes,'b'.repeat(64)); await api.importEffect(bytes);
    assert.equal(calls[1].method,'GET'); assert.equal(calls[1].url,'http://localhost/studio/api/effects');
    assert.equal(calls[2].headers['If-Match'],'"'+'b'.repeat(64)+'"');
    assert.equal(calls[3].headers['If-None-Match'],'*');
    assert.ok(calls.every(call=>!call.url.includes('server=')&&call.headers.Authorization==='Bearer '+'a'.repeat(43)));
});
test('server record downloads retain PNG bundle bytes and revision metadata', async () => {
    const {api,calls}=fixture([{ok:true,status:200,arrayBuffer:async()=>new Uint8Array([80,75,3,4]).buffer,headers:{get:()=> '"'+'c'.repeat(64)+'"'}}]);
    const result=await api.loadEffect('custom');assert.deepEqual([...result.bytes],[80,75,3,4]);assert.equal(result.revision,'c'.repeat(64));
    assert.equal(calls[0].url,'http://localhost/studio/api/effects/custom');
});
test('revision conflicts retain the session while revoked permissions clear it', async () => {
    const {api}=fixture([response({player:'Admin'}),response({error:'Changed on server'},409),response({error:'Permission revoked'},403)]);
    await api.connect();await assert.rejects(api.importEffect(new Uint8Array([1]),'a'.repeat(64)),e=>e.status===409);assert.ok(api.session);
    await assert.rejects(api.listEffects(),e=>e.status===403);assert.equal(api.session,null);
});
test('standalone Studio never contacts a server without a personal connection', async () => {
    const {api,calls}=fixture([],false);assert.equal(api.available,false);await assert.rejects(api.listEffects(),/frameui editor/);assert.equal(calls.length,0);
});

test('permanent server deletion binds the selected effect revision without uploading replacements', async () => {
    const {api,calls}=fixture([response({id:'custom'})]);
    await api.deleteEffect('custom','b'.repeat(64));
    assert.equal(calls[0].method,'DELETE');assert.equal(calls[0].url,'http://localhost/studio/api/effects/custom');
    assert.equal(calls[0].headers['If-Match'],'"'+'b'.repeat(64)+'"');assert.equal(calls[0].body,null);
    assert.equal(api.listTrash,undefined);assert.equal(api.restoreEffect,undefined);
});
