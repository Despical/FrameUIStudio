/* FrameUI Studio - Copyright (C) 2026 Berke Akçen
 * SPDX-License-Identifier: GPL-3.0-only */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {randomBytes} = require('node:crypto');
const {createRelay,encode,decode,BASE} = require('../backend/relay.cjs');
const token = () => randomBytes(32).toString('base64url');
async function fixture(t, options = {}) {
    const server = createRelay({pollMs:100,requestMs:1000,...options});
    await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
    t.after(()=>server.stopRelay());
    const root = 'http://127.0.0.1:'+server.address().port+BASE;
    const id = token(), secret = token(), bearer = token();
    const headers = {Authorization:'Bearer '+secret};
    const channel = (path='',options={})=>fetch(root+'channels/'+id+path,{...options,headers:{...headers,...options.headers}});
    assert.equal((await channel('',{method:'POST'})).status,200);
    return {root,id,secret,bearer,channel,request:(path='session',options={})=>fetch(root+'servers/'+id+'/studio/api/'+path,
        {...options,headers:{Authorization:'Bearer '+bearer,Origin:'https://frameui.despical.dev',...options.headers}})};
}
test('relay preserves binary ZIP, bearer and revision headers without persisting content',async t=>{
    const f=await fixture(t); const zip=Buffer.from([80,75,3,4,255]);
    const pending=f.request('import',{method:'POST',headers:{'Content-Type':'application/zip','If-Match':'"'+'a'.repeat(64)+'"'},body:zip});
    const poll=await f.channel('/poll'); assert.equal(poll.status,200);
    const [method,path,auth,type,match,none,body]=decode(Buffer.from(await poll.arrayBuffer()),6,9*1024*1024);
    assert.equal(method,'POST'); assert.equal(path,'/studio/api/import'); assert.equal(auth,'Bearer '+f.bearer);
    assert.equal(type,'application/zip'); assert.equal(match,'"'+'a'.repeat(64)+'"'); assert.equal(none,''); assert.deepEqual(body,zip);
    const result=await f.channel('/result/'+poll.headers.get('X-Relay-Request'),{method:'POST',body:encode(['200','application/json; charset=utf-8',''],Buffer.from('{"id":"test"}'))});
    assert.equal(result.status,204); const response=await pending;assert.equal(response.status,200);assert.deepEqual(await response.json(),{id:'test'});
    assert.equal(response.headers.get('Access-Control-Allow-Origin'),'https://frameui.despical.dev');
});
test('pack downloads and effect bundles retain bytes and ETags',async t=>{
    const f=await fixture(t), bytes=Buffer.from([80,75,255,42]), etag='"'+'b'.repeat(64)+'"';
    for (const url of [f.root+'servers/'+f.id+'/frameui.zip?frameui=hash',f.root+'servers/'+f.id+'/studio/api/effects/test']) {
        const pending=fetch(url,{headers:{Authorization:'Bearer '+f.bearer}});
        const poll=await f.channel('/poll');
        assert.equal((await f.channel('/result/'+poll.headers.get('X-Relay-Request'),{method:'POST',body:encode(['200','application/zip',etag],bytes)})).status,204);
        const response=await pending; assert.equal(response.headers.get('ETag'),etag);assert.deepEqual(Buffer.from(await response.arrayBuffer()),bytes);
    }
});
test('channel secrets isolate servers and result IDs cannot cross channels',async t=>{
    const f=await fixture(t), other=await fixture(t);
    assert.equal((await f.channel('/poll',{headers:{Authorization:'Bearer '+token()}})).status,403);
    const pending=f.request();const poll=await f.channel('/poll');
    assert.equal((await other.channel('/result/'+poll.headers.get('X-Relay-Request'),{method:'POST',body:encode(['200','application/json; charset=utf-8',''])})).status,410);
    await f.channel('/result/'+poll.headers.get('X-Relay-Request'),{method:'POST',body:encode(['403','application/json; charset=utf-8',''],Buffer.from('{"error":"Permission revoked"}'))});
    assert.equal((await pending).status,403);
});
test('simultaneous players share a versioned pack transfer and its bounded memory cache',async t=>{
    const f=await fixture(t), hash='d'.repeat(40), bytes=Buffer.from([80,75,5,6]);
    const url=f.root+'servers/'+f.id+'/frameui.zip?frameui='+hash;
    const players=Array.from({length:12},()=>fetch(url));
    const poll=await f.channel('/poll');
    await new Promise(resolve=>setTimeout(resolve,30));
    assert.equal((await f.channel('/result/'+poll.headers.get('X-Relay-Request'),{method:'POST',body:encode(['200','application/zip','"'+hash+'"'],bytes)})).status,204);
    for(const pending of players) { const response=await pending;assert.equal(response.status,200);assert.deepEqual(Buffer.from(await response.arrayBuffer()),bytes); }
    const cached=await fetch(url);assert.equal(cached.status,200);assert.deepEqual(Buffer.from(await cached.arrayBuffer()),bytes);
    assert.equal((await f.channel('/poll')).status,204);
});
test('browser origins, credentials, unsupported paths and preflights are bounded',async t=>{
    const f=await fixture(t);
    assert.equal((await f.request('session',{headers:{Origin:'https://evil.example'}})).status,403);
    assert.equal((await f.request('session',{headers:{Authorization:''}})).status,401);
    assert.equal((await f.request('config')).status,405);
    assert.equal((await f.request('import',{method:'DELETE'})).status,405);
    const options={method:'OPTIONS',headers:{Origin:'https://frameui.despical.dev','Access-Control-Request-Method':'POST','Access-Control-Request-Headers':'authorization, content-type, if-none-match'}};
    assert.equal((await f.request('import',options)).status,204);
    options.headers['Access-Control-Request-Headers']='cookie';assert.equal((await f.request('import',options)).status,403);
    assert.equal((await fetch(f.root+'servers/'+token()+'/studio/api/session',{headers:{Authorization:'Bearer '+token()}})).status,503);
});
test('oversize uploads, truncated frames and unsupported response types are rejected',async t=>{
    const f=await fixture(t);
    assert.throws(()=>decode(Buffer.from([0,0,1,0]),3));
    const large=await f.request('import',{method:'POST',body:Buffer.alloc(9*1024*1024+1)});assert.equal(large.status,413);
    const pending=f.request(); const poll=await f.channel('/poll');
    assert.equal((await f.channel('/result/'+poll.headers.get('X-Relay-Request'),{method:'POST',body:encode(['200','text/html',''],Buffer.from('<script>'))})).status,400);
    await f.channel('',{method:'DELETE'});assert.equal((await pending).status,503);
});
test('idle polls, browser timeouts and disconnect cleanup do not hang',async t=>{
    const f=await fixture(t,{requestMs:120});
    assert.equal((await f.channel('/poll')).status,204);
    const pending=f.request();const poll=await f.channel('/poll');
    assert.equal((await pending).status,504);
    assert.equal((await f.channel('/result/'+poll.headers.get('X-Relay-Request'),{method:'POST',body:encode(['200','application/json; charset=utf-8',''])})).status,410);
    assert.equal((await f.channel('',{method:'DELETE'})).status,204);
    assert.equal((await f.request()).status,503);
});
test('capacity limits reject excess registration and concurrent polls',async t=>{
    const f=await fixture(t,{maxChannels:1,pollMs:300});
    assert.equal((await fetch(f.root+'channels/'+token(),{method:'POST',headers:{Authorization:'Bearer '+token()}})).status,429);
    const poll=f.channel('/poll'); await new Promise(resolve=>setTimeout(resolve,30));
    assert.equal((await f.channel('/poll')).status,409);await poll;
});
