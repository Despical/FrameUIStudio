/*
 * FrameUI Studio - Copyright (C) 2026 Berke Akçen
 * SPDX-License-Identifier: GPL-3.0-only
 */
'use strict';
const http = require('node:http');
const {randomBytes, createHash, timingSafeEqual} = require('node:crypto');
const TOKEN = /^[A-Za-z0-9_-]{43}$/;
const UPLOAD = 9 * 1024 * 1024, RESPONSE = 32 * 1024 * 1024;
const BASE = '/frameui-relay/v1/';
function encode(fields, body = Buffer.alloc(0)) {
    const chunks = [];
    for (const value of [...fields, body]) {
        const bytes = Buffer.isBuffer(value) ? value : Buffer.from(value);
        const length = Buffer.alloc(4); length.writeUInt32BE(bytes.length); chunks.push(length, bytes);
    }
    return Buffer.concat(chunks);
}
function decode(bytes, count, limit = RESPONSE) {
    let offset = 0; const fields = [];
    for (let i = 0; i <= count; i++) {
        if (offset + 4 > bytes.length) throw Error('Truncated frame');
        const size = bytes.readUInt32BE(offset); offset += 4;
        if (size > (i === count ? limit : 8192) || offset + size > bytes.length) throw Error('Invalid frame');
        fields.push(i === count ? bytes.subarray(offset, offset + size) : bytes.toString('utf8', offset, offset + size)); offset += size;
    }
    if (offset !== bytes.length) throw Error('Trailing frame data');
    return fields;
}
async function read(req, limit) {
    if (Number(req.headers['content-length'] || 0) > limit) throw Object.assign(Error('Request too large'), {status:413});
    const chunks = []; let size = 0;
    for await (const chunk of req) {
        size += chunk.length;
        if (size > limit) throw Object.assign(Error('Request too large'), {status:413});
        chunks.push(chunk);
    }
    return Buffer.concat(chunks);
}
const digest = text => createHash('sha256').update(text).digest();
function createRelay({origin = 'https://frameui.despical.dev', pollMs = 25000, requestMs = 45000,
    channelMs = 180000, maxChannels = 1000, trustProxy = false} = {}) {
    const channels = new Map(), rates = new Map(), packs = new Map();
    let pendingCount = 0, buffered = 0, cachedBytes = 0, responseReaders = 0, uploadReaders = 0;
    function reply(res, status, body, type = 'application/json; charset=utf-8') {
        if (res.destroyed || res.writableEnded) return;
        res.writeHead(status, {'Content-Type':type}); res.end(Buffer.isBuffer(body) ? body : JSON.stringify(body));
    }
    function rate(ip, kind, limit, window) {
        const key = ip + ':' + kind, now = Date.now(); let entry = rates.get(key);
        if (!entry || entry.until < now) {
            if (rates.size > 10000) return false;
            rates.set(key, entry = {count:0, until:now + window});
        }
        return ++entry.count <= limit;
    }
    function finish(channel, id, status, body, type, etag) {
        const item = channel.pending.get(id); if (!item) return;
        channel.pending.delete(id); channel.queue = channel.queue.filter(key => key !== id);
        pendingCount--; buffered -= item.bytes.length; clearTimeout(item.timer);
        if (etag && /^"(?:[a-f0-9]{40}|[a-f0-9]{64})"$/.test(etag)) item.res.setHeader('ETag', etag);
        if (item.packKey) {
            if (status === 200 && type === 'application/zip' && Buffer.isBuffer(body)
                && item.packKey.endsWith(':' + etag.replaceAll('"',''))) {
                while (packs.size && cachedBytes + body.length > 64*1024*1024) {
                    const first = packs.keys().next().value; cachedBytes -= packs.get(first).body.length; packs.delete(first);
                }
                packs.set(item.packKey,{body,etag,until:Date.now()+60000}); cachedBytes += body.length;
            }
            for (const waiter of item.waiters) {
                if (etag) waiter.setHeader('ETag',etag);
                reply(waiter,status,body,type);
            }
        }
        reply(item.res, status, body, type);
    }
    function deliver(channel) {
        if (!channel.poll || !channel.queue.length) return;
        const poll = channel.poll; channel.poll = null; clearTimeout(poll.timer);
        const id = channel.queue.shift(), item = channel.pending.get(id);
        poll.res.setHeader('X-Relay-Request', id);
        reply(poll.res, 200, item.bytes, 'application/octet-stream');
    }
    function remove(id, channel) {
        if (channel.poll) { clearTimeout(channel.poll.timer); reply(channel.poll.res, 410, {error:'Server disconnected.'}); }
        for (const key of [...channel.pending.keys()]) finish(channel, key, 503, {error:'Server disconnected. Run /frameui editor again.'});
        channels.delete(id);
        for (const [key, entry] of packs) if (key.startsWith(id + ':')) { cachedBytes -= entry.body.length; packs.delete(key); }
    }
    const sweep = setInterval(() => {
        const now = Date.now();
        for (const [id, channel] of channels) if (now - channel.seen > channelMs) remove(id, channel);
        for (const [key, entry] of rates) if (entry.until < now) rates.delete(key);
        for (const [key, entry] of packs) if (entry.until < now) { cachedBytes -= entry.body.length; packs.delete(key); }
    }, 10000); sweep.unref();
    const server = http.createServer({maxHeaderSize:16384, requestTimeout:60000}, async (req, res) => {
        res.setHeader('Cache-Control','no-store'); res.setHeader('X-Content-Type-Options','nosniff');
        res.setHeader('Referrer-Policy','no-referrer');
        const requestOrigin = req.headers.origin;
        if (requestOrigin && requestOrigin !== origin) return reply(res,403,{error:'Open your personal link in FrameUI Studio.'});
        if (requestOrigin) {
            res.setHeader('Access-Control-Allow-Origin',origin); res.setHeader('Vary','Origin');
            res.setHeader('Access-Control-Expose-Headers','ETag');
        }
        const path = req.url.split('?')[0];
        if (path === BASE + 'health' && req.method === 'GET') return reply(res,200,{status:'ok',protocol:1});
        const match = path.match(/^\/frameui-relay\/v1\/(channels|servers)\/([A-Za-z0-9_-]{43})(.*)$/);
        if (!match) return reply(res,404,{error:'Not found'});
        const [, kind, id, tail] = match;
        const isApi = /^\/studio\/api\/(session|effects(?:\/[a-z0-9][a-z0-9_-]{0,63})?|import)$/.test(tail);
        const isPack = tail === '/pack' || tail === '/frameui.zip';
        const allowed = isApi && (req.method === 'GET' && tail !== '/studio/api/import'
            || req.method === 'POST' && tail === '/studio/api/import'
            || req.method === 'DELETE' && /^\/studio\/api\/effects\//.test(tail));
        if (req.method === 'OPTIONS' && kind === 'servers' && isApi) {
            const method = req.headers['access-control-request-method'];
            const headers = String(req.headers['access-control-request-headers'] || '').toLowerCase().split(',').map(h=>h.trim()).filter(Boolean);
            if (!requestOrigin || !['GET','POST','DELETE'].includes(method) || headers.some(h=>!['authorization','content-type','if-match','if-none-match'].includes(h))) return reply(res,403,{error:'Invalid preflight'});
            res.setHeader('Access-Control-Allow-Methods','GET, POST, DELETE, OPTIONS');
            res.setHeader('Access-Control-Allow-Headers','Authorization, Content-Type, If-Match, If-None-Match');
            res.setHeader('Access-Control-Max-Age','300'); res.writeHead(204); return res.end();
        }
        const ip = trustProxy ? String(req.headers['x-relay-ip'] || req.socket.remoteAddress) : req.socket.remoteAddress;
        let channel = channels.get(id);
        try {
            if (kind === 'channels') {
                const secret = String(req.headers.authorization || '').replace(/^Bearer /,'');
                if (!TOKEN.test(secret)) return reply(res,401,{error:'Invalid channel credentials'});
                if (channel && !timingSafeEqual(channel.secret,digest(secret))) return reply(res,403,{error:'Invalid channel credentials'});
                if (req.method === 'POST' && tail === '') {
                    if (!channel) {
                        if (!rate(ip,'register',30,3600000) || channels.size >= maxChannels
                            || [...channels.values()].filter(c=>c.ip===ip).length >= 32) return reply(res,429,{error:'Relay registration limit reached'});
                        channel = {secret:digest(secret),ip,seen:Date.now(),queue:[],pending:new Map(),poll:null}; channels.set(id,channel);
                    }
                    channel.seen = Date.now(); return reply(res,200,{protocol:1});
                }
                if (!channel) return reply(res,404,{error:'Channel expired'});
                channel.seen = Date.now();
                if (req.method === 'DELETE' && tail === '') { remove(id,channel); res.writeHead(204); return res.end(); }
                if (req.method === 'GET' && tail === '/poll') {
                    if (channel.poll) return reply(res,409,{error:'Another poll is active'});
                    const poll = {res,timer:setTimeout(()=>{ if(channel.poll===poll) channel.poll=null; res.writeHead(204); res.end(); },pollMs)};
                    channel.poll = poll;
                    res.on('close',()=>{ if(channel.poll===poll) {channel.poll=null;clearTimeout(poll.timer);} });
                    deliver(channel); return;
                }
                if (req.method === 'POST' && /^\/result\/[A-Za-z0-9_-]{22}$/.test(tail)) {
                    const key = tail.slice('/result/'.length);
                    if (!channel.pending.has(key)) return reply(res,410,{error:'Request expired'});
                    if (responseReaders >= 2) return reply(res,429,{error:'Relay is busy'});
                    responseReaders++;
                    let frame;
                    try { frame = await read(req, RESPONSE + 32768); } finally { responseReaders--; }
                    const [status,type,etag,body] = decode(frame,3);
                    if (!/^[2345]\d\d$/.test(status) || !['application/zip','application/json; charset=utf-8'].includes(type)
                        || etag && !/^"(?:[a-f0-9]{40}|[a-f0-9]{64})"$/.test(etag)) throw Error('Invalid response');
                    finish(channel,key,Number(status),body,type,etag); res.writeHead(204); return res.end();
                }
                return reply(res,404,{error:'Not found'});
            }
            if (!(allowed || isPack && ['GET','HEAD'].includes(req.method))) return reply(res,405,{error:'Unsupported Studio request'});
            if (!channel || Date.now() - channel.seen > channelMs) return reply(res,503,{error:'Cannot reach your server. Check that it is running, then try again.'});
            if (isApi && !/^Bearer [A-Za-z0-9_-]{43}$/.test(req.headers.authorization || '')) return reply(res,401,{error:'Run /frameui editor to open your personal server connection.'});
            if (!rate(ip,'request',180,60000)) return reply(res,429,{error:'Studio is busy. Try again in a moment.'});
            let packKey = null;
            if (isPack && req.method === 'GET') {
                const version = new URL(req.url,'http://relay').searchParams.get('frameui');
                if (/^[a-f0-9]{40}$/.test(version || '')) {
                    packKey = id + ':' + version;
                    const cached = packs.get(packKey);
                    if (cached && cached.until > Date.now()) {
                        if (cached.etag) res.setHeader('ETag',cached.etag);
                        return reply(res,200,cached.body,'application/zip');
                    }
                    const inFlight = [...channel.pending.values()].find(item=>item.packKey===packKey);
                    if (inFlight) {
                        if (inFlight.waiters.size >= 128) return reply(res,429,{error:'Pack download busy'});
                        inFlight.waiters.add(res); res.on('close',()=>inFlight.waiters.delete(res)); return;
                    }
                }
            }
            if (channel.pending.size >= 4 || pendingCount >= 32 || buffered >= 32*1024*1024
                || req.method === 'POST' && uploadReaders >= 4) return reply(res,429,{error:'Studio is busy. Try again in a moment.'});
            // Reserve capacity before reading bodies so parallel slow uploads cannot bypass limits.
            const key = randomBytes(16).toString('base64url');
            const item = {res,bytes:Buffer.alloc(0),timer:null,packKey,waiters:new Set()};
            channel.pending.set(key,item); pendingCount++;
            item.timer = setTimeout(()=>finish(channel,key,504,{error:'The server took too long to respond. Try again.'}),requestMs);
            res.on('close',()=>{ if (!res.writableEnded) finish(channel,key,499,{error:'Browser disconnected'}); });
            try {
                let body;
                if (req.method === 'POST') uploadReaders++;
                try { body = await read(req, req.method === 'POST' ? UPLOAD : 0); }
                finally { if (req.method === 'POST') uploadReaders--; }
                if (!channel.pending.has(key)) return;
                item.bytes = encode([req.method,isPack ? '/frameui.zip' : tail,req.headers.authorization || '',req.headers['content-type'] || '',req.headers['if-match'] || '',req.headers['if-none-match'] || ''],body);
                if (buffered + item.bytes.length > 48*1024*1024) { item.bytes=Buffer.alloc(0); return finish(channel,key,429,{error:'Studio is busy. Try again in a moment.'}); }
                buffered += item.bytes.length; channel.queue.push(key); deliver(channel);
            } catch (error) { finish(channel,key,error.status || 400,{error:'Invalid request body'}); }
        } catch (error) { reply(res,error.status || 400,{error:'Invalid relay request'}); }
    });
    server.keepAliveTimeout = 5000;
    server.on('close',()=>{ clearInterval(sweep); for(const [id,channel] of channels) remove(id,channel); });
    server.stopRelay = () => { for(const [id,channel] of channels) remove(id,channel); server.close(); server.closeAllConnections(); };
    return server;
}
if (require.main === module) {
    const server = createRelay({trustProxy:process.env.TRUST_PROXY === '1'});
    server.listen(Number(process.env.PORT || 8094), '0.0.0.0',()=>console.log('FrameUI relay listening'));
    for(const signal of ['SIGINT','SIGTERM']) process.on(signal,()=>server.stopRelay());
}
module.exports = {createRelay,encode,decode,BASE};
