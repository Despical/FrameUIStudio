const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function fixture({url='https://frameui-studio.berkeakcen.chatgpt.site/?lang=tr',consent,blockedStorage=false}={}) {
    const elements = {}, scripts = [], writes = [], listeners = {}, cookies = [];
    const ids = ['cookie-banner','cookie-dialog','cookie-settings','cookie-customize','cookie-close','cookie-accept','cookie-reject','cookie-dialog-reject','cookie-dialog-accept'];
    for (const id of ids) elements[id] = {hidden:true,checked:false,open:false,events:{},
        addEventListener(type,callback){this.events[type]=callback;},showModal(){this.open=true;},close(){this.open=false;}};
    let stored = consent === undefined ? null : JSON.stringify(consent);
    const document = {getElementById:id=>elements[id],createElement:()=>({}),head:{appendChild:script=>scripts.push(script)}};
    Object.defineProperty(document,'cookie',{get:()=> '_ga=old; _ga_TEST=old; drafts=keep',set:value=>cookies.push(value)});
    const window = {addEventListener:(event,callback)=>listeners[event]=callback};
    const context={window,document,location:new URL(url),Date,localStorage:{
        getItem:()=>{if(blockedStorage)throw Error('blocked');return stored;},
        setItem:(key,value)=>{if(blockedStorage)throw Error('blocked');stored=value;writes.push({key,value:JSON.parse(value)});}}};
    vm.runInNewContext(fs.readFileSync(require.resolve('../dist/cookies.js'),'utf8'),context);
    return {window,elements,scripts,writes,cookies,listeners,click:id=>elements[id].events.click(),setStored:value=>stored=JSON.stringify(value)};
}
const accepted=()=>({version:1,analytics:true,updatedAt:Date.now()});

test('analytics waits for consent, uses canonical public URL, and never sends private links',()=>{
    const f=fixture();
    assert.equal(f.scripts.length,0); assert.equal(f.elements['cookie-banner'].hidden,false);
    f.click('cookie-accept'); assert.equal(f.scripts.length,1);
    const config=f.window.dataLayer.find(args=>args[0]==='config');
    assert.match(config[1],/^G-[A-Z0-9]+$/);
    assert.equal(config[2].page_location,'https://frameui-studio.berkeakcen.chatgpt.site/');
    assert.equal(config[2].page_referrer,''); assert.equal(config[2].allow_google_signals,false);
    assert.equal(f.scripts[0].referrerPolicy,'no-referrer');
    f.click('cookie-accept'); assert.equal(f.scripts.length,1);
    for(const url of ['http://localhost:5179/','http://server.example/studio/#server=secret',
        'https://frameui-studio.berkeakcen.chatgpt.site/#server=secret']) {
        const privateEditor=fixture({url,consent:accepted()});
        privateEditor.click('cookie-accept'); assert.equal(privateEditor.scripts.length,0,url);
    }
});
test('GitHub Pages analytics stays confined to the canonical public project path',()=>{
    const f=fixture({url:'https://despical.github.io/FrameUIStudio/?lang=tr',consent:accepted()});
    const config=f.window.dataLayer.find(args=>args[0]==='config');
    assert.equal(config[2].page_location,'https://despical.github.io/FrameUIStudio/');
    for(const url of ['https://despical.github.io/another-project/','https://despical.github.io/FrameUIStudio/#server=private'])
        assert.equal(fixture({url,consent:accepted()}).scripts.length,0,url);
});

test('rejection and revocation stop analytics and preserve authored storage',()=>{
    const f=fixture(); f.click('cookie-reject');
    assert.equal(f.scripts.length,0); assert.equal(f.writes.at(-1).value.analytics,false);
    f.click('cookie-settings'); assert.equal(f.elements['cookie-dialog'].open,true);
    f.click('cookie-dialog-accept');
    assert.equal(f.scripts.length,1);
    f.click('cookie-settings'); f.click('cookie-dialog-reject');
    const id=f.window.dataLayer.find(args=>args[0]==='config')[1];
    assert.equal(f.window['ga-disable-'+id],true);
    assert.equal(f.window.dataLayer.at(-1)[2].analytics_storage,'denied');
    assert.ok(f.cookies.some(cookie=>cookie.startsWith('_ga=; Max-Age=0')));
    assert.ok(f.cookies.every(cookie=>!cookie.startsWith('drafts=')));
    assert.ok(f.writes.every(write=>write.key==='frameui-studio-cookie-consent'));
});
test('expired or malformed consent is rejected; cross-tab changes take effect immediately',()=>{
    for(const consent of [{...accepted(),updatedAt:0},{...accepted(),version:0},{...accepted(),analytics:'true'},
        {...accepted(),updatedAt:Date.now()+1000000}]) assert.equal(fixture({consent}).scripts.length,0);
    const f=fixture({consent:accepted()}); assert.equal(f.scripts.length,1);
    f.setStored({...accepted(),analytics:false}); f.listeners.storage({key:'frameui-studio-cookie-consent'});
    const id=f.window.dataLayer.find(args=>args[0]==='config')[1]; assert.equal(f.window['ga-disable-'+id],true);
    const blocked=fixture({blockedStorage:true}); blocked.click('cookie-reject');
    assert.equal(blocked.elements['cookie-banner'].hidden,true); assert.equal(blocked.scripts.length,0);
});
